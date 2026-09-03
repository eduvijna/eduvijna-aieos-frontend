# Consumer OpenAPI snapshot (NON-AUTHORITATIVE)

This directory holds a **consumer snapshot** of the AIEOS HTTP contract for frontend development and type generation.

## Authority

- **Authoritative OpenAPI** lives in the backend repository:
  - Repo: `eduvijna-aieos-backend`
  - Path: `contracts/openapi/aieos-v1.json`
- The file `aieos-v1.consumer-snapshot.json` in this frontend repo is **NON-AUTHORITATIVE**.
  It must not be treated as the source of truth for API behaviour.

## Snapshot provenance (TOS-DEV07-I03)

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source path | `contracts/openapi/aieos-v1.json` |
| Source SHA | `551e46e004233421746e4df2789c07367702528b` |
| Authoritative OpenAPI SHA-256 | `7D7D0E7C7115667757A31CFEB5474F7498ECC7198FB812DE5EF14A0E9F2D289A` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `7D7D0E7C7115667757A31CFEB5474F7498ECC7198FB812DE5EF14A0E9F2D289A` |

Operations consumed by this frontend at this SHA (TeachingExecution / Teach UX additions):

| Operation ID | Method | Path |
|--------------|--------|------|
| `teacher_os_teach_context_get` | GET | `/api/v1/teacher-os/teach/context` |
| `teaching_execution_list` | GET | `/api/v1/teaching/executions` |
| `teaching_execution_start` | POST | `/api/v1/teaching/executions` |
| `teaching_execution_get` | GET | `/api/v1/teaching/executions/{execution_id}` |
| `teaching_execution_complete` | POST | `/api/v1/teaching/executions/{execution_id}/actions/complete` |
| `teaching_execution_cancel` | POST | `/api/v1/teaching/executions/{execution_id}/actions/cancel` |
| `teaching_execution_observation_create` | POST | `/api/v1/teaching/executions/{execution_id}/observations` |
| `teaching_execution_observation_correct` | PATCH | `/api/v1/teaching/executions/{execution_id}/observations/{observation_id}` |

Also retained from prior slices (Assignment UX):

| Operation ID | Method | Path |
|--------------|--------|------|
| `teacher_os_school_context_classes_list` | GET | `/api/v1/teacher-os/school-context/classes` |
| `teaching_assignment_create` | POST | `/api/v1/teaching/assignments` |
| `teaching_assignment_list` | GET | `/api/v1/teaching/assignments` |
| `teaching_assignment_get` | GET | `/api/v1/teaching/assignments/{assignment_id}` |
| `teaching_assignment_due_update` | PATCH | `/api/v1/teaching/assignments/{assignment_id}` |
| `teaching_assignment_close` | POST | `/api/v1/teaching/assignments/{assignment_id}/actions/close` |
| `teaching_assignment_cancel` | POST | `/api/v1/teaching/assignments/{assignment_id}/actions/cancel` |

Also retained from earlier slices:

| Operation ID | Method | Path |
|--------------|--------|------|
| `teacher_os_today_mission` | GET | `/api/v1/teacher-os/today/mission` |
| `teaching_work_create` | POST | `/api/v1/teaching/works` |
| `teaching_work_list` | GET | `/api/v1/teaching/works` |
| `teaching_work_get` | GET | `/api/v1/teaching/works/{work_id}` |
| `teaching_work_refine` | PATCH | `/api/v1/teaching/works/{work_id}` |
| `teaching_work_generate` | POST | `/api/v1/teaching/works/{work_id}/actions/generate` |
| `teaching_work_prepare` | POST | `/api/v1/teaching/works/{work_id}/actions/prepare` |
| `teaching_work_artifacts_list` | GET | `/api/v1/teaching/works/{work_id}/artifacts` |
| `teacher_os_review_queue_list` | GET | `/api/v1/teacher-os/review-queue` |
| `teacher_os_review_queue_get` | GET | `/api/v1/teacher-os/review-queue/{content_id}/versions/{version_id}` |

### Previous snapshots

| Slice | Source SHA |
|-------|------------|
| TOS-DEV07-I03 | `551e46e004233421746e4df2789c07367702528b` |
| TOS-DEV06-I04 | `06e05277e73e0c71172cae4904efb37d771c3fad` |
| TOS-DEV04-I09 | `a461e8ac20e556469a9517b54b6dd6d17f48ee90` |
| TOS-DEV03R4 Lane A | `3001722e400daca757e22828c8ac843aad6e962f` |
| TOS-DEV02 Lane A | `f62da1f461957cb443ee422d3a343d15c9ca6640` |
| TOS-DEV03R1 Lane A | `164e49577bdddef021a2fdee24f983962b4e87b8` |
| TOS-DEV03R2 Lane A | `b3f69972e6e981eaa57f1f6539467d8b1c61817e` |
| TOS-DEV03R3 Lane A | `e03101dde1703adf9698c5f5fb8b87137a176599` |
| TOS-DEV01 Lane A | `bcfd5eb054ef07c30219cfae0ca9ccd7279ea8c0` |

## Sync

Use:

```bash
pnpm sync:openapi
```

Point it at a sibling backend checkout and pin the expected SHA with environment
overrides when the default location or pinned SHA is not current:

```bash
AIEOS_BACKEND_ROOT=../eduvijna-aieos-backend \
AIEOS_BACKEND_OPENAPI_SHA=551e46e004233421746e4df2789c07367702528b \
  pnpm sync:openapi
```

Verify the consumer file hash after sync:

```bash
# Expected: 7D7D0E7C7115667757A31CFEB5474F7498ECC7198FB812DE5EF14A0E9F2D289A
```

See `scripts/sync-openapi-snapshot.mjs` for how to refresh from a known backend checkout/SHA.
Then regenerate types:

```bash
pnpm generate:api-types
```
