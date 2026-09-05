"""Seed TeachingWork + approved worksheet precondition for product E2E.

Uses build_development_teacher_os_app HTTP contracts only:
  create work → generate (fake model) → approve (NOT publish)

Writes fixture JSON for Playwright Assignment + TeachingExecution +
ClassroomAssessment journeys.
NON_PRODUCTION only. Governed Backend pin / migration head: see fixture fields.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path


SCENARIO_MARKER = (
    "[TOS-DEV08-I04:product-e2e] ClassroomAssessment real-stack product journey"
)
SCENARIO_ID = "tos-dev08-i04-classroom-assessment-product-e2e"
BACKEND_PIN_SHA = "62733e3ad0d48887f3cd1e1a4486839170a5d651"
EXPECTED_MIGRATION_HEAD = "tosd090002"


def _backend_root() -> Path:
    root = os.environ.get("AIEOS_BACKEND_ROOT")
    if not root:
        raise SystemExit("AIEOS_BACKEND_ROOT is required")
    path = Path(root).resolve()
    if not (path / "src" / "aieos" / "development" / "app_factory.py").is_file():
        raise SystemExit(f"Invalid AIEOS_BACKEND_ROOT: {path}")
    return path


def _headers(
    tenant_id: str,
    *,
    idempotency_key: str | None = None,
    if_match: str | None = None,
) -> dict[str, str]:
    out = {"X-AIEOS-Tenant-ID": tenant_id}
    if idempotency_key is not None:
        out["Idempotency-Key"] = idempotency_key
    if if_match is not None:
        out["If-Match"] = if_match
    return out


def main() -> int:
    backend = _backend_root()
    sys.path.insert(0, str(backend / "src"))
    sys.path.insert(0, str(backend))

    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine, text

    from aieos.development.app_factory import build_development_teacher_os_app
    from aieos.development.teacher_os_review_scenario import (
        SYNTHETIC_PRINCIPAL_ID,
        SYNTHETIC_TENANT_ID,
    )
    from aieos.platform.ai.fake import FakeStructuredModelGateway
    from tests.domains.teaching.worksheet_fixtures import valid_worksheet_model

    runtime_url = os.environ.get("PRODUCT_E2E_RUNTIME_DATABASE_URL")
    if not runtime_url:
        db_report = Path(
            os.environ.get(
                "PRODUCT_E2E_DB_REPORT",
                Path(__file__).resolve().parents[2] / "tmp" / "product-e2e-db.json",
            )
        )
        if not db_report.is_file():
            raise SystemExit(
                "PRODUCT_E2E_RUNTIME_DATABASE_URL or PRODUCT_E2E_DB_REPORT required"
            )
        runtime_url = json.loads(db_report.read_text(encoding="utf-8"))[
            "runtime_database_url"
        ]

    fixture_path = Path(
        os.environ.get(
            "PRODUCT_E2E_FIXTURE_PATH",
            Path(__file__).resolve().parents[2] / "tmp" / "product-e2e-fixture.json",
        )
    )

    tenant_id = SYNTHETIC_TENANT_ID
    principal_id = SYNTHETIC_PRINCIPAL_ID
    engine = create_engine(runtime_url)
    gateway = FakeStructuredModelGateway(
        result_factory=lambda _request: valid_worksheet_model(),
        provider_id="fake",
        model_id="fake-model",
    )
    app = build_development_teacher_os_app(
        engine,
        tenant_id=tenant_id,
        principal_id=principal_id,
        model_gateway=gateway,
        ai_provider_id="fake",
        ai_model_id="fake-model",
    )

    scenario_date = date.fromisoformat(
        os.environ.get("PRODUCT_E2E_SCENARIO_DATE", "2026-09-01")
    )
    target_date = scenario_date + timedelta(days=1)

    with TestClient(app, raise_server_exceptions=False) as client:
        works = client.get(
            "/api/v1/teaching/works",
            params={"limit": 100},
            headers=_headers(str(tenant_id)),
        )
        if works.status_code != 200:
            raise RuntimeError(f"works list failed: {works.status_code} {works.text}")

        work_id = None
        work_etag = None
        for item in works.json()["items"]:
            if item.get("goal_text") == SCENARIO_MARKER:
                work_id = item["work_id"]
                work_etag = f'"r{item["aggregate_revision"]}"'
                break

        if work_id is None:
            created = client.post(
                "/api/v1/teaching/works",
                json={
                    "intent_type": "prepare_tomorrow",
                    "goal_text": SCENARIO_MARKER,
                    "target_date": target_date.isoformat(),
                    "locale": "en-IN",
                    "class_label": "Grade 5A",
                    "subject": "Mathematics",
                    "topic": "Comparing fractions",
                },
                headers=_headers(
                    str(tenant_id),
                    idempotency_key=f"{SCENARIO_ID}:create-work",
                ),
            )
            if created.status_code not in (200, 201):
                raise RuntimeError(f"work create failed: {created.text}")
            work_id = created.json()["work_id"]
            work_etag = created.headers["ETag"]

        generated = client.post(
            f"/api/v1/teaching/works/{work_id}/actions/generate",
            headers=_headers(
                str(tenant_id),
                idempotency_key=f"{SCENARIO_ID}:generate",
                if_match=work_etag,
            ),
        )
        if generated.status_code not in (200, 409):
            raise RuntimeError(f"generate failed: {generated.status_code} {generated.text}")
        if generated.status_code == 409:
            artifacts = client.get(
                f"/api/v1/teaching/works/{work_id}/artifacts",
                headers=_headers(str(tenant_id)),
            )
            if artifacts.status_code != 200 or not artifacts.json()["items"]:
                raise RuntimeError("generate already exists but no artifacts found")
            artifact = artifacts.json()["items"][0]
            content_id = artifact["content_id"]
            version_id = artifact["version_id"]
        else:
            body = generated.json()
            content_id = body["artifact"]["content_id"]
            version_id = body["artifact"]["version_id"]

        content_get = client.get(
            f"/api/v1/contents/{content_id}",
            headers=_headers(str(tenant_id)),
        )
        if content_get.status_code != 200:
            raise RuntimeError(f"content get failed: {content_get.text}")
        content = content_get.json()
        published_version_id_before = content.get("published_version_id")

        if content.get("stewardship_state") == "IN_REVIEW":
            detail = client.get(
                f"/api/v1/teacher-os/review-queue/{content_id}/versions/{version_id}",
                headers=_headers(str(tenant_id)),
            )
            if detail.status_code != 200:
                raise RuntimeError(f"review detail failed: {detail.text}")
            approved = client.post(
                f"/api/v1/contents/{content_id}/versions/{version_id}/actions/approve",
                json={},
                headers={
                    **_headers(
                        str(tenant_id),
                        idempotency_key=f"{SCENARIO_ID}:approve",
                    ),
                    "If-Match": detail.headers["ETag"],
                },
            )
            if approved.status_code != 200:
                raise RuntimeError(f"approve failed: {approved.text}")

        content_after = client.get(
            f"/api/v1/contents/{content_id}",
            headers=_headers(str(tenant_id)),
        )
        if content_after.status_code != 200:
            raise RuntimeError(f"content reload failed: {content_after.text}")
        final_content = content_after.json()
        if final_content["stewardship_state"] != "APPROVED":
            raise RuntimeError(
                f"expected APPROVED stewardship; got {final_content['stewardship_state']}"
            )
        if final_content["published_version_id"] is not None:
            raise RuntimeError("precondition requires unpublished content head")
        if final_content["current_version_id"] != version_id:
            raise RuntimeError("precondition requires current_version_id === version_id")
        if final_content["content_type"] != "worksheet":
            raise RuntimeError(f"expected worksheet; got {final_content['content_type']}")

    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT version_num FROM alembic_version
                """
            )
        ).scalar_one()
        if row != EXPECTED_MIGRATION_HEAD:
            raise RuntimeError(f"unexpected migration head {row}")

    fixture = {
        "scenario_id": SCENARIO_ID,
        "backend_pin_sha": BACKEND_PIN_SHA,
        "migration_head": EXPECTED_MIGRATION_HEAD,
        "tenant_id": str(tenant_id),
        "principal_id": str(principal_id),
        "bearer_token": "product-e2e-dev",
        "work_id": work_id,
        "content_id": content_id,
        "version_id": version_id,
        "content_type": "worksheet",
        "stewardship_state": "APPROVED",
        "published_version_id_before": published_version_id_before,
        "current_version_id": version_id,
        "scenario_marker": SCENARIO_MARKER,
        "seeded_at": datetime.now(UTC).isoformat(),
        "fake_model_calls": len(gateway.calls),
    }
    fixture_path.parent.mkdir(parents=True, exist_ok=True)
    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(fixture))
    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
