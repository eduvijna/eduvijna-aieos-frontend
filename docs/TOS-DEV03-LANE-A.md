# TOS-DEV03 Lane A — Generate preparation draft + Review handoff

Implementation notes for the frontend vertical slice on branch
`tos-dev03-lane-a-generate-review`.

## Scope delivered

- **Work generate CTA** when no artifact exists: primary button
  **Generate preparation draft** (not a Worksheet Generator marketplace).
- **POST** `/api/v1/teaching/works/{work_id}/actions/generate` with retained
  Work `ETag` → `If-Match` and a fresh `Idempotency-Key`. No request body —
  capability / model / prompt selection stays on the server.
- During generation: truthful **Creating your preparation draft…** (no fake
  percentages or agent stages).
- On success: navigate to
  `/teacher-os/review/{contentId}/versions/{versionId}`. No approve / publish /
  download from the Work surface.
- **GET** `/api/v1/teaching/works/{work_id}/artifacts` on Work load. When an
  artifact exists, show a compact **Worksheet draft** card with stewardship
  status, educational-quality checks from the API only, and **Review draft**.

## OpenAPI consumer snapshot

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source SHA | `b3f69972e6e981eaa57f1f6539467d8b1c61817e` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `BBE357612BFF091F7EAF54A4C5F1065B248BB0212A3F0DDF4AFF0685C759C4C7` |
| Authority | **NON-AUTHORITATIVE** — backend OpenAPI remains canonical |

Sync: `pnpm sync:openapi` then `pnpm generate:api-types`.

Focused generate / artifacts types live in
`src/services/api/generated/teachingTypes.ts`.

## Failure handling

| Problem code / status | Teacher-facing behaviour |
| --- | --- |
| `work_generation_revision_conflict` / 412 | Reload Work; ask teacher to generate from the latest revision |
| `work_generation_in_progress` / 409 | Truthful in-progress message |
| `work_generation_already_exists` / 409 | Reload artifacts; offer **Review draft** |
| `educational_quality_failed` | No draft created |
| `model_provider_unavailable` / `model_generation_failed` / `model_output_invalid` | Retry later |
| 401 / 403 | Existing session / access messaging |

## Tests

| File | Covers |
| --- | --- |
| `src/features/teacher-os/work/work.generate.test.tsx` | §46 generate CTA, headers, navigation, artifact card, EQ checks, failure paths |
| `src/features/teacher-os/work/work.refine.test.tsx` | Refine still green with artifacts load |
| `src/shared/policy/noProviderUrls.test.ts` | Still forbids provider URLs / browser storage |
| `e2e/teacher-os-mission-work.spec.ts` | Mission/Work refine + Generate → Review → Approve (HTTP fixtures) |
| `e2e/teacher-os-review.spec.ts` | Request Changes / Approve via Mission review hero |

```bash
pnpm test
pnpm test:e2e
```

## Explicit non-goals (this slice)

- Direct OpenAI / Anthropic / Gemini / Agent / MCP calls or keys in the frontend
- Generator-grid / marketplace UX
- localStorage for artifact state
- Approving, publishing, or downloading from the Work page
