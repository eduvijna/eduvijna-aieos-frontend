# TOS-DEV08-I04 Product E2E

Real-stack Playwright lane proving Assignment regression, TeachingExecution
regression, and ClassroomAssessment product journeys against live HTTP —
**no `/api` Playwright mocks**.

## Governed pins

| Artifact | SHA |
|----------|-----|
| Frontend base | `398710f168c81cf6fb1f6aebe2b667a1a0bfc575` |
| Backend read-only pin | `1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d` |
| OpenAPI authority | `824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D` |
| Migration head | `tosd080002` |

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
(fake model) → approve — **not publish** on a fresh database. Assignment,
TeachingExecution, and ClassroomAssessment prerequisites publish the exact
fixture version when needed.

Scenario marker:

`[TOS-DEV08-I04:product-e2e] ClassroomAssessment real-stack product journey`

## Specs

| Spec | Proves |
|------|--------|
| `e2e-product/teacher-os-assignment.product.spec.ts` | DEV06 Assignment regression on current Backend |
| `e2e-product/teacher-os-execution.product.spec.ts` | TeachingExecution real-stack journey |
| `e2e-product/teacher-os-classroom-assessment.product.spec.ts` | ClassroomAssessment CASE A journey + I03R1 stale VOID concurrency |

Assessment journey (CASE A):

Published worksheet → TeachingExecution COMPLETED → **zero auto-Assessment** →
Assess this class → RECORD → reload → CORRECT → reload → stale VOID abort
(zero `/actions/void` POST) → deliberate VOID → VOIDED history persists.

## CI

The `product-e2e` workflow job checks out Backend `1fe28f4f…`, verifies the pin
SHA, provisions PostgreSQL 18, migrates to `tosd080002`, starts the development
app, and runs `pnpm test:e2e:product` (Assignment + TeachingExecution +
ClassroomAssessment product specs).
