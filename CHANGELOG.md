# Changelog

All notable changes to the EduVijna AIEOS Frontend repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this repository follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- TOS-DEV02 Lane A: Mission-first Today screen reading `GET /api/v1/teacher-os/today/mission` for the browser's local calendar date, with hero actions derived from the projection (`review`, `continue_work`, `prepare_tomorrow`) and no invented timetable, attendance, or school metrics.
- TOS-DEV02 Lane A: outcome-first Teaching Intent flow at `/teacher-os/prepare` (outcome → context → confirm) creating a durable Teaching Work via `POST /api/v1/teaching/works` with a reused `Idempotency-Key`, replacing the DEV01 Prepare placeholder.
- TOS-DEV02 Lane A: Teaching Work detail and refinement at `/teacher-os/work/:workId` using retained `ETag` → `If-Match` with true partial `PATCH` semantics, 412 refresh, and a truthful "ready for generation" next step instead of a non-functional Generate button.
- TOS-DEV02 Lane A: `missionApi` / `teachingWorkApi` modules, focused `teachingTypes` contract types, local calendar-date helpers, feature-scoped CSS on the existing tokens, Vitest coverage for mission/intent/work/accessibility, and a Playwright journey from Today through Work and back.
- TOS-DEV01 Lane A: Teacher OS shell bootstrap (Vite + React 19 + TypeScript), outcome-first navigation, Today's Mission, and Review Queue list/detail with approve / request-changes / reject mutations.
- Non-authoritative OpenAPI consumer snapshot pinned to backend SHA `bcfd5eb054ef07c30219cfae0ca9ccd7279ea8c0`, type generation, Vite `/api` proxy, Vitest + Playwright coverage, and CI workflow (Node 24 / pnpm 11).
- Memory-only `DevSessionConnector` for non-production local API access (disabled in production builds).

### Changed

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
