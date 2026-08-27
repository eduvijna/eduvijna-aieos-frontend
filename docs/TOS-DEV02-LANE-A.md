# TOS-DEV02 Lane A — Today's Mission, Teaching Intent, Teaching Work

Implementation notes for the frontend vertical slice on branch
`tos-dev02-lane-a-mission-intent-work`.

## Scope delivered

- **Today is Mission-first.** `TodayPage` reads
  `GET /api/v1/teacher-os/today/mission` and renders one composition — a single
  hero sentence, its action, and a short margin of secondary facts. It is not a
  dashboard of cards.
- **Prepare is a real Teaching Intent flow** at `/teacher-os/prepare`: outcome →
  context → confirm → create Work. It replaces the DEV01 placeholder.
- **Work detail and refinement** at `/teacher-os/work/:workId`, with `If-Match`
  optimistic concurrency and a truthful next-step statement.
- Focused Teaching types, two API modules, feature-scoped CSS on the existing
  teal/serif tokens, Vitest coverage, and a Playwright fixture-mocked journey.

## OpenAPI consumer snapshot

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source branch | `tos-dev02-lane-b-teaching-work-mission` |
| Source SHA | `f62da1f461957cb443ee422d3a343d15c9ca6640` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Consumer file SHA-256 | `ad58ad462cb21222d03188dcf1ab5dd86bf7d648dec4955b45660f3219e00488` |
| Authority | **NON-AUTHORITATIVE** — backend OpenAPI remains canonical |

Sync: `pnpm sync:openapi` then `pnpm generate:api-types`.

Focused Teaching Work / Mission types live in
`src/services/api/generated/teachingTypes.ts`, hand-maintained alongside
`reviewTypes.ts`. Full `openapi-typescript` output is regenerated into
`src/services/api/generated/aieos-v1.ts`.

## Constitutional position mirrored in the UI

| Concept | Where it lives in the frontend |
| --- | --- |
| Teaching Intent | Transient form state in `features/teacher-os/prepare`. Never cached, never stored, discarded once the Work exists. |
| Teaching Work | Server-owned. Every read is a `GET`; every change is a `PATCH`. The browser holds no authority. |
| Today's Mission | Derived read. Recomputed on each visit; nothing is memoised across visits. |

Deleting the Mission code would lose no user data. Deleting the Work code would
lose nothing either, because the Work lives in PostgreSQL behind the API. There
is no browser storage of any kind — enforced by
`src/shared/policy/noProviderUrls.test.ts`.

## Routes

| Path | Surface |
| --- | --- |
| `/teacher-os/today` | Default landing. Today's Mission. |
| `/teacher-os/prepare` | Teaching Intent flow (was a DEV01 placeholder). |
| `/teacher-os/work/:workId` | Work detail and refinement. |
| `/teacher-os/review`, `/teacher-os/review/:contentId/versions/:versionId` | DEV01 Review Queue, unchanged. |

Routes are declared in `src/app/router.tsx` and mirrored for tests in
`src/test/test-utils.tsx`.

## Mission composition and truthfulness

`GET /api/v1/teacher-os/today/mission?mission_date=YYYY-MM-DD`, where
`mission_date` is the **browser's local calendar date**. This is the temporary
TOS-DEV02 contract: the backend has no teacher time-zone System of Record yet.
`src/shared/time/calendarDate.ts` formats local calendar fields rather than UTC,
so a teacher after 18:30 IST still gets the correct local day.

Hero copy comes from `mission.hero_action.kind` and is generated in
`features/teacher-os/today/missionCopy.ts`, where every sentence is traceable to
a projection field:

| `hero_action.kind` | Hero sentence | Action |
| --- | --- | --- |
| `review` | `N items waiting for review` (singular at 1) | `/teacher-os/review` |
| `continue_work` | `Continue tomorrow's <topic> preparation` when `target_date` really is tomorrow, otherwise `Continue your <topic> preparation for <date>` | `/teacher-os/work/{work_id}` |
| `prepare_tomorrow` | `Nothing is waiting. Prepare tomorrow's lesson.` | `/teacher-os/prepare` |

Secondary lines state the review and preparation facts that the hero does not
already carry, so no count is asserted twice.

Without a DEV session the page says so plainly. A failed read shows an error
with a retry, never a fabricated mission.

### Not shown, deliberately

No timetable, no period-by-period plan, no ERP or school metrics, no attendance,
and no claim that AI has prepared anything. None of those have a System of
Record, so inventing them would be a lie in the interface. A unit test asserts
their absence from the rendered page.

## Teaching Intent flow

Three steps, outcome first:

1. **Outcome** — "What should your students understand or be able to do?"
   (`goal_text`). This is the only required field, and it is asked before any
   document type is mentioned.
2. **Context** — `class_label`, `subject`, `topic` (all optional),
   `target_date` (defaults to tomorrow in the browser's calendar, editable), and
   `locale` (defaults to `en-IN`).
3. **Confirm** — `Prepare tomorrow · class · subject · topic · date` plus the
   goal, then **Create preparation**.

`class_label` is labelled in the UI as free text the teacher types, such as
"Grade 5B", explicitly not linked to any school or ERP record — matching the
backend's non-foreign-key column.

`POST /api/v1/teaching/works` carries `Idempotency-Key`. The key is minted once
when the teacher reaches the confirmation step and reused if the request is
retried, so a failed-then-retried submission cannot create two Works. Empty
optional fields are sent as `null`, never as empty strings. On success the app
navigates to `/teacher-os/work/{work_id}`.

**There is no generator grid.** "Generate Worksheet / Quiz / Lesson Plan" tiles
are not offered as primary choices; the flagship action is
*Help me prepare tomorrow*. A unit test and an e2e assertion both guard this.

## Work refinement

`GET /api/v1/teaching/works/{work_id}` retains the `ETag`. Saving sends
`PATCH` with `If-Match` set to that ETag and a fresh
`Idempotency-Key` (`crypto.randomUUID()`).

The PATCH body honours the backend's true partial semantics: only changed keys
are sent, a cleared optional field is sent as explicit `null`, and the
non-nullable `goal_text` / `target_date` / `locale` are never sent as `null`
(`features/teacher-os/work/refine.ts`). Saving with no changes makes no request.

| Response | Behaviour |
| --- | --- |
| 200 | Form and metadata are reset from the response body; `ETag` is retained. |
| 412 | Silent re-read, then "changed elsewhere since you loaded it — review and save again". The teacher's stale values are replaced with the server's. |
| 428 | Reported as a missing precondition header (client contract error). |
| 401 / 403 | Reported as a session or access failure. |

After every save and reload the displayed values come from the server response,
never from local state — the e2e journey leaves the Work screen and returns to
prove it.

### Next step is stated, not faked

The Work page says **"Preparation is ready for generation."** and then states
plainly that generation is not part of this slice, that nothing has been
produced, and that nothing has been sent to any AI service. There is no
Generate button that looks functional.

## Design

Feature-scoped CSS (`today.css`, `prepare.css`, `work.css`) on the existing
`tokens.css` teal + Source Serif palette. Mission is a single left-ruled
composition with a large serif hero sentence; cards (`.panel`) are used only as
interaction containers for the Intent and refinement forms. No new palette was
introduced.

## Accessibility

- One `h1` per page; the Mission hero and each Intent step are `h2`.
- Every input has a real `<label>`; hints and errors are wired with
  `aria-describedby`, and invalid fields carry `aria-invalid`.
- Step forms use `noValidate` so the app's own announced messages replace native
  validation bubbles, and errors render with `role="alert"`.
- Advancing a step moves focus to the new step heading; the step list marks the
  current step with `aria-current="step"`.
- Mission and Work states announce through `aria-live` regions; save results use
  `aria-live="assertive"`.
- The whole Intent flow is completable with the keyboard alone (asserted).

## Tests

| File | Covers |
| --- | --- |
| `src/features/teacher-os/shell/shell.nav.test.tsx` | Mission-first landing, nav, Prepare no longer a placeholder, other placeholders still labelled |
| `src/features/teacher-os/today/today.mission.test.tsx` | `mission_date` from the local calendar, all three hero kinds, singular/plural, non-tomorrow dates, unavailable and error states, absence of invented metrics |
| `src/features/teacher-os/prepare/prepare.intent.test.tsx` | Outcome/context/confirm steps, defaults, validation, create contract with `Idempotency-Key`, `null` for omitted optionals, key reuse on retry, failure handling, no generator-first UX |
| `src/features/teacher-os/work/work.refine.test.tsx` | Work detail fields, changed-keys-only `PATCH` with `If-Match`, explicit `null` clearing, 412 refresh, 428, 401, no browser storage, server re-read |
| `src/features/teacher-os/tosDev02.a11y.test.tsx` | Headings, labels, focus movement, `aria-current`, live regions, keyboard-only completion |
| `src/shared/policy/noProviderUrls.test.ts` | No provider URLs, no model/agent/memory/PostgreSQL clients, only `/api/v1` requests, no browser storage |
| `e2e/teacher-os-mission-work.spec.ts` | Today → Prepare → Intent → confirm → create Work → Work → refine → back to Today → Continue Work |
| `e2e/teacher-os-review.spec.ts` | DEV01 Review Queue smoke, retained and rerouted through the Mission review hero |

```bash
pnpm test
pnpm test:e2e
```

## Local development

1. Node 24.x, pnpm 11.x.
2. `pnpm install`
3. Run backend on `127.0.0.1:8000` at the pinned SHA (or set
   `VITE_DEV_API_PROXY_TARGET`), migrated to Alembic head `tosd020001`.
4. `pnpm dev`, then expand **DEV session** and enter tenant id + bearer token
   (memory only).

Optionally seed synthetic Teaching Work with the backend loader
`tools/development/load_teacher_os_teaching_work_scenario.py` so the Mission has
a `continue_work` candidate.

## Explicit non-goals (this slice)

- AI generation, agents, and MCP — including any frontend affordance that
  implies them.
- A durable Teaching Intent object anywhere, including browser storage.
- Server-derived teacher time zones; `mission_date` stays a client-supplied
  parameter until the backend governs it.
- Archiving Work over HTTP.
- Production auth / IdP integration.
- Changes to the architecture, product, backend, or infrastructure repositories.
