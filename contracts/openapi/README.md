# Consumer OpenAPI snapshot (NON-AUTHORITATIVE)

This directory holds a **consumer snapshot** of the AIEOS HTTP contract for frontend development and type generation.

## Authority

- **Authoritative OpenAPI** lives in the backend repository:
  - Repo: `eduvijna-aieos-backend`
  - Path: `contracts/openapi/aieos-v1.json`
- The file `aieos-v1.consumer-snapshot.json` in this frontend repo is **NON-AUTHORITATIVE**.
  It must not be treated as the source of truth for API behaviour.

## Snapshot provenance (TOS-DEV02 Lane A)

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source branch | `tos-dev02-lane-b-teaching-work-mission` |
| Source path | `contracts/openapi/aieos-v1.json` |
| Source SHA | `f62da1f461957cb443ee422d3a343d15c9ca6640` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `ad58ad462cb21222d03188dcf1ab5dd86bf7d648dec4955b45660f3219e00488` |

Operations consumed by this frontend at this SHA:

| Operation ID | Method | Path |
|--------------|--------|------|
| `teacher_os_today_mission` | GET | `/api/v1/teacher-os/today/mission` |
| `teaching_work_create` | POST | `/api/v1/teaching/works` |
| `teaching_work_get` | GET | `/api/v1/teaching/works/{work_id}` |
| `teaching_work_refine` | PATCH | `/api/v1/teaching/works/{work_id}` |
| `teacher_os_review_queue_list` | GET | `/api/v1/teacher-os/review-queue` |
| `teacher_os_review_queue_get` | GET | `/api/v1/teacher-os/review-queue/{content_id}/versions/{version_id}` |

### Previous snapshots

| Slice | Source SHA |
|-------|------------|
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
AIEOS_BACKEND_OPENAPI_SHA=f62da1f461957cb443ee422d3a343d15c9ca6640 \
  pnpm sync:openapi
```

See `scripts/sync-openapi-snapshot.mjs` for how to refresh from a known backend checkout/SHA.
Then regenerate types:

```bash
pnpm generate:api-types
```
