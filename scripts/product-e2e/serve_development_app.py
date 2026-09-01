"""Serve NON_PRODUCTION development Teacher OS API for product E2E."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _backend_root() -> Path:
    root = os.environ.get("AIEOS_BACKEND_ROOT")
    if not root:
        raise SystemExit("AIEOS_BACKEND_ROOT is required")
    return Path(root).resolve()


def main() -> int:
    backend = _backend_root()
    sys.path.insert(0, str(backend / "src"))
    sys.path.insert(0, str(backend))

    import uvicorn
    from sqlalchemy import create_engine

    from aieos.development.app_factory import build_development_teacher_os_app
    from aieos.development.teacher_os_review_scenario import (
        SYNTHETIC_PRINCIPAL_ID,
        SYNTHETIC_TENANT_ID,
    )
    from aieos.platform.ai.fake import FakeStructuredModelGateway
    from tests.domains.teaching.worksheet_fixtures import valid_worksheet_model

    runtime_url = os.environ.get("PRODUCT_E2E_RUNTIME_DATABASE_URL")
    if not runtime_url:
        raise SystemExit("PRODUCT_E2E_RUNTIME_DATABASE_URL is required")

    port = int(os.environ.get("PRODUCT_E2E_BACKEND_PORT", "8000"))
    host = os.environ.get("PRODUCT_E2E_BACKEND_HOST", "127.0.0.1")

    engine = create_engine(runtime_url)
    gateway = FakeStructuredModelGateway(
        result_factory=lambda _request: valid_worksheet_model(),
        provider_id="fake",
        model_id="fake-model",
    )
    app = build_development_teacher_os_app(
        engine,
        tenant_id=SYNTHETIC_TENANT_ID,
        principal_id=SYNTHETIC_PRINCIPAL_ID,
        model_gateway=gateway,
        ai_provider_id="fake",
        ai_model_id="fake-model",
    )

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        workers=1,
        loop="asyncio",
        http="h11",
        proxy_headers=False,
        server_header=False,
        reload=False,
        lifespan="on",
    )
    server = uvicorn.Server(config)
    server.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
