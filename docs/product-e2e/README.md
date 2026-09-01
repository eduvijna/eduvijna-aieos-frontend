# TOS-DEV06-I05 Product E2E

Real-stack Playwright lane proving the Assignment product journey against live HTTP — **no `/api` Playwright mocks**.

## Governed pins

| Artifact | SHA |
|----------|-----|
| Frontend base | `e8d5776e9b51c4f19eaa2d0aafe4e7aa80315fcc` |
| Backend read-only pin | `06e05277e73e0c71172cae4904efb37d771c3fad` |
| OpenAPI authority | `CCD233062672B36A4DB6C6B60E7413AF8EEC6FDAAE9550270C6879E4C4A06D7C` |
| Migration head | `tosd060002` |

## Non-production boundary

- Uses `build_development_teacher_os_app` (development adapters only)
- Synthetic tenant/principal (`71b5fb49-…` / `f85329ab-…`)
- `FakeStructuredModelGateway` for any AI path (no OpenAI key)
- Disposable PostgreSQL **18** only — never production/staging/cloud DB

## Prerequisites (local)

1. **Node 24** + **pnpm 11** (frontend)
2. **Python 3.14** + **uv** (backend locked env)
3. **Docker** (local disposable PostgreSQL 18 container)
4. Backend checkout at pin SHA beside or referenced by `AIEOS_BACKEND_ROOT`

## Run locally

```powershell
# From eduvijna-aieos-frontend
$env:AIEOS_BACKEND_ROOT = "C:\path\to\eduvijna-aieos-backend"

pnpm install --frozen-lockfile
pnpm exec playwright install chromium

pnpm test:e2e:product
```

Optional env overrides:

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIEOS_BACKEND_ROOT` | *(required)* | Backend repo path |
| `PLAYWRIGHT_PORT` | `5181` | Vite dev server port |
| `PRODUCT_E2E_BACKEND_PORT` | `8000` | Development API port |
| `AIEOS_TEST_PG_PORT` | `55433` | Host port for PG18 Docker |
| `PRODUCT_E2E_SKIP_BOOTSTRAP` | unset | Set `1` to reuse existing DB/fixture |

Fast mocked regression remains separate:

```powershell
pnpm test:e2e
```

## Architecture

```text
Chromium → Vite dev (5181) → /api proxy → uvicorn development app (8000)
                                              ↓
                                    PostgreSQL 18 (disposable)
```

Precondition seed (before browser tests): create TeachingWork → generate worksheet (fake model) → approve — **not publish**.

## CI

The `product-e2e` workflow job checks out the pinned Backend SHA, provisions PostgreSQL 18, migrates to `tosd060002`, starts the development app, and runs `pnpm test:e2e:product`.
