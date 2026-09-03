# TOS-DEV07-I04 Product E2E

Real-stack Playwright lane proving Assignment regression and TeachingExecution
product journeys against live HTTP — **no `/api` Playwright mocks**.

## Governed pins

| Artifact | SHA |
|----------|-----|
| Frontend base | `7902e59d32af0a8b4670acce831cdf622c520bbc` |
| Backend read-only pin | `551e46e004233421746e4df2789c07367702528b` |
| OpenAPI authority | `7D7D0E7C7115667757A31CFEB5474F7498ECC7198FB812DE5EF14A0E9F2D289A` |
| Migration head | `tosd070002` |

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
| `AIEOS_BACKEND_ROOT` | *(required)* | Backend repo path (must be at pin SHA) |
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

Precondition seed (before browser tests): create TeachingWork → generate worksheet
(fake model) → approve — **not publish** on a fresh database. Assignment Phase A
(and TeachingExecution prerequisites) publish the exact fixture version when needed.

Scenario marker:

`[TOS-DEV07-I04:product-e2e] TeachingExecution real-stack product journey`

## Specs

| Spec | Proves |
|------|--------|
| `e2e-product/teacher-os-assignment.product.spec.ts` | DEV06 Assignment regression on current Backend |
| `e2e-product/teacher-os-execution.product.spec.ts` | TeachingExecution real-stack journey |

## CI

The `product-e2e` workflow job checks out Backend `551e46e0…`, provisions PostgreSQL 18,
migrates to `tosd070002`, starts the development app, and runs `pnpm test:e2e:product`
(both Assignment and TeachingExecution product specs).
