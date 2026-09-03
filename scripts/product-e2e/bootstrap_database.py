"""Bootstrap disposable PostgreSQL 18 for TOS-DEV07-I04 product E2E.

Reuses backend tests/conftest.py identity, migration, and runtime-grant patterns.
NON_PRODUCTION only. Requires AIEOS_BACKEND_ROOT.
Governed migration head: tosd070002.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def _backend_root() -> Path:
    root = os.environ.get("AIEOS_BACKEND_ROOT")
    if not root:
        raise SystemExit("AIEOS_BACKEND_ROOT is required")
    path = Path(root).resolve()
    if not (path / "tests" / "conftest.py").is_file():
        raise SystemExit(f"Invalid AIEOS_BACKEND_ROOT: {path}")
    return path


def main() -> int:
    backend = _backend_root()
    sys.path.insert(0, str(backend / "src"))
    sys.path.insert(0, str(backend))

    from alembic import command
    from sqlalchemy import text

    from tests.conftest import (  # noqa: E402
        alembic_config,
        bootstrap_url,
        migrator_url,
        provision_identities,
        provision_runtime_grants,
        runtime_url,
        start_postgres,
        wait_for_engine,
    )

    port = os.environ.get("AIEOS_TEST_PG_PORT", "55433")
    report_path = Path(
        os.environ.get(
            "PRODUCT_E2E_DB_REPORT",
            Path(__file__).resolve().parents[2] / "tmp" / "product-e2e-db.json",
        )
    )

    external = os.environ.get("AIEOS_TEST_DATABASE_URL")
    started_container = False
    if external:
        b_url = os.environ.get("AIEOS_TEST_BOOTSTRAP_DATABASE_URL", external)
        m_url = external
        r_url = os.environ.get("AIEOS_TEST_RUNTIME_DATABASE_URL", external)
    else:
        import tests.conftest as conftest  # noqa: E402

        conftest.CONTAINER_NAME = os.environ.get(
            "PRODUCT_E2E_PG_CONTAINER", "aieos-product-e2e-pg"
        )
        conftest.HOST_PORT = port
        port = start_postgres()
        started_container = True
        b_url = bootstrap_url(port)
        m_url = migrator_url(port)
        r_url = runtime_url(port)

    bootstrap = wait_for_engine(b_url)
    with bootstrap.connect() as conn:
        version = conn.execute(text("SHOW server_version")).scalar_one()
        if not str(version).startswith("18."):
            raise RuntimeError(f"PostgreSQL 18 required; got {version}")

    provision_identities(bootstrap)
    os.environ["AIEOS_DATABASE_URL"] = m_url
    cfg = alembic_config(m_url)
    command.upgrade(cfg, "head")
    head = None
    with bootstrap.connect() as conn:
        head = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()
    if head != "tosd070002":
        raise RuntimeError(f"Expected migration head tosd070002; got {head}")
    provision_runtime_grants(bootstrap)

    report = {
        "postgres_major": 18,
        "migration_head": head,
        "runtime_database_url": r_url,
        "started_container": started_container,
        "container_name": os.environ.get("PRODUCT_E2E_PG_CONTAINER", "aieos-product-e2e-pg")
        if started_container
        else None,
        "port": port,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    bootstrap.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
