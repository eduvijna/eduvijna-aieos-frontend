# TOS-DEV07-I03 — Teacher OS Teach UX (Lane A)

Implementation notes for the frontend vertical slice on branch
`tos-dev07-i03-teacher-os-teach-ux`.

## Scope delivered

- **Teach workspace** (`TeachPage`): select TeachingWork + advisory ClassRef,
  load `GET /api/v1/teacher-os/teach/context`, bind zero+ artifacts, start a
  TeachingExecution, surface related assignments and executions (IN_PROGRESS
  prominent). Assignment records remain listed for due/close/cancel.
- **Execution detail** (`/teacher-os/teach/executions/:executionId`): durable
  reload, observations (`PRIVATE_EXECUTION_NOTE` / `CLASS_OBSERVATION` only),
  correct with fresh observation revision `If-Match`, complete/cancel with
  fresh execution `ETag`. Terminal states are read-only.
- Semantics in copy: **Assigned ≠ Taught ≠ Assessed ≠ Mastered**. Completion
  records teacher finished lesson — not assignment complete, learner receipt,
  attendance, assessment, or mastery.

## OpenAPI consumer snapshot

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source SHA | `551e46e004233421746e4df2789c07367702528b` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `7D7D0E7C7115667757A31CFEB5474F7498ECC7198FB812DE5EF14A0E9F2D289A` |
| Authority | **NON-AUTHORITATIVE** — backend OpenAPI remains canonical |

## Contract notes

- Backend `ETag` is `"r{n}"` (quotes included). Send `If-Match` exactly as
  received (execution GET for complete/cancel; observation revision for
  correct after fresh execution GET).
- One `Idempotency-Key` per deliberate logical attempt (`useRef`); preserve on
  transport retry; mint a new key when the material fingerprint changes or
  after success.

## Failure handling

| Problem code / status | Teacher-facing behaviour |
| --- | --- |
| `class_ref_not_assignable` / 403 | Fail closed; no silent retry as success |
| `content_version_mismatch` | Reload teach context; review bindings |
| `teaching_execution_not_in_progress` | Reload; terminal immutability |
| `resource_revision_conflict` / `teaching_execution_observation_revision_conflict` / 412 | Reload + message; no silent second mutation |
| `school_context_unavailable` / 503 | Recoverable; same Idempotency-Key retained |
| `idempotency_key_reused` | Reload / clear key guidance |
| `precondition_required` / `precondition_failed` | Reload + contract messaging |

## Tests

| File | Covers |
| --- | --- |
| `teach/execution.workspace.test.tsx` | Work/class selection, context query, start bindings + Idempotency-Key |
| `teach/execution.detail.test.tsx` | Observations, If-Match, 412, complete/cancel, terminal, 403/503 |
| `teach/execution.a11y.test.tsx` | Headings, labelled controls, live region |
| Existing `assignment.*.test.*` | Assignment detail / assign flows remain green |

```bash
pnpm exec vitest run src/features/teacher-os/teach
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Explicit non-goals (this slice)

- Learner roster / learner-specific observations
- Attendance, assessment, mastery UX
- Mission → Teach deep-link (optional later)
- Backend or OpenAPI authority changes
