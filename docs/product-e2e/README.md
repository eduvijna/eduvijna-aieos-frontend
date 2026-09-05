# Product E2E

Real-stack Playwright lane proving Assignment regression, TeachingExecution
regression, ClassroomAssessment, and Improve (remediation create) product
journeys against live HTTP — **no `/api` Playwright mocks**.

## Governed pins (TOS-DEV09 Backend authority)

| Artifact | SHA |
|----------|-----|
| Frontend base | `30c94f3e0403b9a5a2e955c706766035490598f9` |
| Backend read-only pin | `62733e3ad0d48887f3cd1e1a4486839170a5d651` |
| OpenAPI authority | `B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9` |
| Migration head | `tosd090002` |

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

Scenario markers:

`[TOS-DEV08-I04:product-e2e] ClassroomAssessment real-stack product journey`

`[TOS-DEV09-I04:product-e2e] Improve real-stack product journey`

## Specs

| Spec | Proves |
|------|--------|
| `e2e-product/teacher-os-assignment.product.spec.ts` | DEV06 Assignment regression on current Backend |
| `e2e-product/teacher-os-execution.product.spec.ts` | TeachingExecution real-stack journey |
| `e2e-product/teacher-os-classroom-assessment.product.spec.ts` | ClassroomAssessment CASE A journey + I03R1 stale VOID concurrency |
| `e2e-product/teacher-os-improve.product.spec.ts` | DEV09 Improve Assess→Improve→remediation Work (TOS-DEV09-I04) |

Assessment journey (CASE A):

Published worksheet → TeachingExecution COMPLETED → **zero auto-Assessment** →
Assess this class → RECORD → reload → CORRECT → reload → stale VOID abort
(zero `/actions/void` POST) → deliberate VOID → VOIDED history persists.

Improve journey (TOS-DEV09-I04):

Published worksheet → TeachingExecution COMPLETED → RECORD ClassroomAssessment →
Assess “Improve this class” → Improve goal/context/confirm → real
`POST /api/v1/teaching/works/from-classroom-assessment` → Work page
(`intent_type=remediate_class`) with **zero** automatic Generate / Publish /
Assign / Teach.

## CI

The `product-e2e` workflow job checks out Backend `62733e3a…`, verifies the pin
SHA, provisions PostgreSQL 18, migrates to `tosd090002`, starts the development
app, and runs `pnpm test:e2e:product` (Assignment + TeachingExecution +
ClassroomAssessment + Improve product specs).
