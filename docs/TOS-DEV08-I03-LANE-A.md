# TOS-DEV08-I03 — Teacher OS Assess UX (Lane A)

Implementation notes for the frontend vertical slice on branch
`tos-dev08-i03-teacher-os-assess-ux`.

## Scope delivered

- **Assess page** (`/teacher-os/assess`): real ClassroomAssessment UX replacing
  `PlaceholderPage`. Primary flow is ADR-AIEOS-055 **Case A** from a COMPLETED
  TeachingExecution.
- **Teach → Assess**: COMPLETED execution detail offers **Assess this class**
  navigation only (`?execution_id=`). Completing a lesson never creates an
  Assessment.
- Eligible bindings only: `quiz` / `worksheet` / `homework`. Never
  `lesson_plan` / `answer_key` / `teacher_notes`. Exact immutable
  `content_id` + `content_version_id` from the execution binding.
- Class results: exact wire values `DEMONSTRATED` / `MIXED` /
  `NOT_YET_DEMONSTRATED` with optional `class_result_note` (max 4096) and
  learner-identifying-data reminder.
- RECORD / LIST / GET / CORRECT / VOID against canonical I02 Assessment HTTP.
- Idempotency-Key association for RECORD/CORRECT/VOID; CORRECT/VOID use fresh
  `If-Match`. Stale 412 reloads server truth and does not auto-resubmit.
- Semantics in copy: **Assigned ≠ Taught ≠ Assessed ≠ Mastered**.

## OpenAPI consumer snapshot

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source SHA | `1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D` |
| Authority | **NON-AUTHORITATIVE** — backend OpenAPI remains canonical |

## Contract notes

| Operation ID | Method | Path |
|--------------|--------|------|
| `assessment_classroom_record` | POST | `/api/v1/assessment/classroom-assessments` |
| `assessment_classroom_list` | GET | `/api/v1/assessment/classroom-assessments` |
| `assessment_classroom_get` | GET | `/api/v1/assessment/classroom-assessments/{assessment_id}` |
| `assessment_classroom_correct` | POST | `.../actions/correct` |
| `assessment_classroom_void` | POST | `.../actions/void` |

- Body never sends `tenant_id` / `teacher_principal_id` / learner identity.
- Backend `ETag` is `"r{n}"`. Send `If-Match` exactly as received.
- One `Idempotency-Key` per deliberate logical attempt; mint when material
  changes; clear after success / conflict invalidate.

## Failure handling

| Problem code / status | Teacher-facing behaviour |
| --- | --- |
| 401 | Authentication required |
| 403 / `assessment_capability_forbidden` / ClassRef deny | Fail closed; not treated as success |
| 409 / `idempotency_key_reused` | Clear key guidance; reload |
| 412 | Reload current Assessment; require new deliberate action |
| 503 / `authorization_unavailable` / `school_context_unavailable` | Temporary; no mutation assumed |

## Tests

| File | Covers |
| --- | --- |
| `assess/assess.page.test.tsx` | Placeholder replacement, eligible kinds, RECORD/CORRECT/VOID, idempotency, 403/412, privacy note |
| `assess/assess.navigation.test.tsx` | Teach → Assess navigation-only CTA |
| `assess/assessment.helpers.test.ts` | Result enum + binding filter + key retention |
| `teach/assignment.contract.test.ts` | Consumer SHA + Assessment operationIds |

```bash
pnpm exec vitest run src/features/teacher-os/assess
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Correction — TOS-DEV08-I03R1

- CORRECT/VOID use the teacher-reviewed aggregate revision as command basis.
- Preflight GET validates only; same revision preserves unsent correction draft.
- Stale preflight aborts with zero mutation POST and requires a new deliberate action.
- HTTP 409: only `idempotency_key_reused` gets key-reuse UX; `classroom_assessment_not_recorded` reloads lifecycle state.

## Explicit non-goals (this slice)

- Learner rows / roster / attempts / submissions / grades
- Mastery / Improve / AI grading
- Cases B/C manual UUID entry UX
- Backend OpenAPI or migration changes
- DEV08-I04
