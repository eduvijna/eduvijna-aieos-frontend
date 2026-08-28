# Consumer OpenAPI snapshot (NON-AUTHORITATIVE)

This directory holds a **consumer snapshot** of the AIEOS HTTP contract for frontend development and type generation.

## Authority

- **Authoritative OpenAPI** lives in the backend repository:
  - Repo: `eduvijna-aieos-backend`
  - Path: `contracts/openapi/aieos-v1.json`
- The file `aieos-v1.consumer-snapshot.json` in this frontend repo is **NON-AUTHORITATIVE**.
  It must not be treated as the source of truth for API behaviour.

## Snapshot provenance (TOS-DEV03R2 Lane A)

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source path | `contracts/openapi/aieos-v1.json` |
| Source SHA | `b4b6211bdf0f0355749555689eabaed814d25bb6` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `BBE357612BFF091F7EAF54A4C5F1065B248BB0212A3F0DDF4AFF0685C759C4C7` |

Operations consumed by this frontend at this SHA:

| Operation ID | Method | Path |
|--------------|--------|------|
| `teacher_os_today_mission` | GET | `/api/v1/teacher-os/today/mission` |
| `teaching_work_create` | POST | `/api/v1/teaching/works` |
| `teaching_work_get` | GET | `/api/v1/teaching/works/{work_id}` |
| `teaching_work_refine` | PATCH | `/api/v1/teaching/works/{work_id}` |
| `teaching_work_generate` | POST | `/api/v1/teaching/works/{work_id}/actions/generate` |
| `teaching_work_artifacts_list` | GET | `/api/v1/teaching/works/{work_id}/artifacts` |
| `teacher_os_review_queue_list` | GET | `/api/v1/teacher-os/review-queue` |
| `teacher_os_review_queue_get` | GET | `/api/v1/teacher-os/review-queue/{content_id}/versions/{version_id}` |

### Previous snapshots

| Slice | Source SHA |
|-------|------------|
| TOS-DEV02 Lane A | `f62da1f461957cb443ee422d3a343d15c9ca6640` |
| TOS-DEV03R1 Lane A | `164e49577bdddef021a2fdee24f983962b4e87b8` |
| TOS-DEV03R2 Lane A | `b4b6211bdf0f0355749555689eabaed814d25bb6` |
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
AIEOS_BACKEND_OPENAPI_SHA=b4b6211bdf0f0355749555689eabaed814d25bb6 \
  pnpm sync:openapi
```

Verify the consumer file hash after sync:

```bash
# Expected: BBE357612BFF091F7EAF54A4C5F1065B248BB0212A3F0DDF4AFF0685C759C4C7
```

See `scripts/sync-openapi-snapshot.mjs` for how to refresh from a known backend checkout/SHA.
Then regenerate types:

```bash
pnpm generate:api-types
```
