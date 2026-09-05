# Changelog

All notable changes to the EduVijna AIEOS Frontend repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this repository follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- TOS-DEV09-I03: Teacher OS Improve UX replacing `/teacher-os/improve`
  PlaceholderPage; RECORDED ClassroomAssessment hub → teacher-confirmed
  remediation goal → `POST /api/v1/teaching/works/from-classroom-assessment` →
  existing Work page; Assess “Improve this class” handoff; Backend OpenAPI
  consumer pin `62733e3ad0d48887f3cd1e1a4486839170a5d651`, OpenAPI
  `B4326D43A213D7831F2AAD8E77A2CEC6BA70B800B4C62EFC52D5B8DFC07CB4D9`, product
  E2E Backend pin/migration `tosd090002` (Improve product E2E remains I04).
- TOS-DEV08-I04: ClassroomAssessment real-stack Product E2E on the existing
  product harness; Backend pin `1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d`,
  OpenAPI `824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D`,
  migration head `tosd080002`; CASE A RECORD/CORRECT/VOID plus I03R1 stale VOID
  concurrency; preserves Assignment and TeachingExecution product regressions.
- TOS-DEV08-I03R1: Assess CORRECT/VOID concurrency basis + 409 problem-code
  semantics on PR #11 — teacher-reviewed revision remains command basis;
  preflight GET validates without transferring drafts onto newer revisions;
  `idempotency_key_reused` vs `classroom_assessment_not_recorded` distinguished.
- TOS-DEV08-I03: Teacher OS Assess UX replacing `/teacher-os/assess`
  PlaceholderPage; Case A flow from COMPLETED TeachingExecution; ClassroomAssessment
  RECORD/LIST/GET/CORRECT/VOID against Backend pin
  `1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d`, OpenAPI
  `824B389D6D4EDB2EA5D8ED3A9E5411087B566DFDCA09C2AB0CD4FDED51C4D89D`, migration
  head `tosd080002`. Teach → Assess is navigation only.
- TOS-DEV07-I04: TeachingExecution real-stack Product E2E on the existing product harness; Backend pin `551e46e004233421746e4df2789c07367702528b`, OpenAPI `7D7D0E7C…289A`, migration head `tosd070002`; preserves Assignment product regression.
- TOS-DEV06-I05: real-stack Assignment Product E2E lane (`pnpm test:e2e:product`) using Chromium, Vite `/api` proxy, `build_development_teacher_os_app`, disposable PostgreSQL 18, and zero Playwright `/api` route mocks; separate CI `product-e2e` job with Backend pin `06e05277e73e0c71172cae4904efb37d771c3fad`.
- TOS-DEV02 Lane A: Mission-first Today screen reading `GET /api/v1/teacher-os/today/mission` for the browser's local calendar date, with hero actions derived from the projection (`review`, `continue_work`, `prepare_tomorrow`) and no invented timetable, attendance, or school metrics.
- TOS-DEV02 Lane A: outcome-first Teaching Intent flow at `/teacher-os/prepare` (outcome → context → confirm) creating a durable Teaching Work via `POST /api/v1/teaching/works` with a reused `Idempotency-Key`, replacing the DEV01 Prepare placeholder.
- TOS-DEV02 Lane A: Teaching Work detail and refinement at `/teacher-os/work/:workId` using retained `ETag` → `If-Match` with true partial `PATCH` semantics, 412 refresh, and a truthful "ready for generation" next step instead of a non-functional Generate button.
- TOS-DEV02 Lane A: `missionApi` / `teachingWorkApi` modules, focused `teachingTypes` contract types, local calendar-date helpers, feature-scoped CSS on the existing tokens, Vitest coverage for mission/intent/work/accessibility, and a Playwright journey from Today through Work and back.
- TOS-DEV01 Lane A: Teacher OS shell bootstrap (Vite + React 19 + TypeScript), outcome-first navigation, Today's Mission, and Review Queue list/detail with approve / request-changes / reject mutations.
- Non-authoritative OpenAPI consumer snapshot pinned to backend SHA `bcfd5eb054ef07c30219cfae0ca9ccd7279ea8c0`, type generation, Vite `/api` proxy, Vitest + Playwright coverage, and CI workflow (Node 24 / pnpm 11).
- Memory-only `DevSessionConnector` for non-production local API access (disabled in production builds).

### Changed

- Non-authoritative OpenAPI consumer snapshot repinned to backend SHA
  `62733e3ad0d48887f3cd1e1a4486839170a5d651` (TOS-DEV09-I02 remediation create),
  adding `teaching_work_from_classroom_assessment_create`, and regenerated API
  types. Product-E2E Backend pin and CI checkout updated to the same authority
  / migration head `tosd090002`.
- Non-authoritative OpenAPI consumer snapshot repinned to backend SHA
  `1fe28f4fd1a2a2070aa69d67daa49cd53ba5820d` (TOS-DEV08-I02 merge), adding
  ClassroomAssessment operations, and regenerated API types.
- Non-authoritative OpenAPI consumer snapshot repinned to backend SHA `f62da1f461957cb443ee422d3a343d15c9ca6640` (`tos-dev02-lane-b-teaching-work-mission`), adding the Teaching Work and Today's Mission operations, and regenerated API types.
- Today's Mission is now one composition driven by the Mission projection rather than a Review Queue count card; the Review Queue is reached from the Mission review hero.
- Policy test widened: the frontend must speak only to `/api/v1`, may not import model, agent, memory, or PostgreSQL clients, and may not use browser storage.
- CI now also runs on `tos-dev02-*` branches.
- API error copy is domain-neutral so it reads truthfully outside the Review Queue.

### Deprecated

- Nothing yet.

### Removed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Nothing yet.

## [0.1.0] - 2026-08-13

### Added

- Repository foundation: README, CONTRIBUTING, CODEOWNERS, LICENSE (Apache-2.0), VERSION, changelog, and GitHub issue/PR templates aligned with `eduvijna-architecture` and `eduvijna-product`.
