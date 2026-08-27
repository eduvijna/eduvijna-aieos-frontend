# TOS-DEV01 Lane A — Teacher OS shell + Review Queue

Implementation notes for the frontend vertical slice on branch
`tos-dev01-lane-a-teacher-os-shell-review`.

## Scope delivered

- Vite 8 + React 19 + TypeScript 6 Teacher OS shell with outcome-first navigation.
- Today's Mission with **real** Review Queue pending count from
  `GET /api/v1/teacher-os/review-queue` (first page `limit=100`; shows `n` or `n+` when `next_cursor` is present).
- Review Queue list (cursor pagination) and artifact detail with safe JSON payload rendering.
- Mutations: approve / request-changes / reject with retained `ETag` → `If-Match` and fresh `Idempotency-Key` (`crypto.randomUUID()`).
- Memory-only `DevSessionConnector` for NON_PRODUCTION local use (`import.meta.env.PROD` excludes it).
- Vitest unit/integration tests (HTTP mocked at `fetch`) and Playwright route-mocked e2e smoke.

## OpenAPI consumer snapshot

| Field | Value |
|-------|--------|
| Source repo | `eduvijna-aieos-backend` |
| Source SHA | `bcfd5eb054ef07c30219cfae0ca9ccd7279ea8c0` |
| Consumer file | `contracts/openapi/aieos-v1.consumer-snapshot.json` |
| Authority | **NON-AUTHORITATIVE** — backend OpenAPI remains canonical |

Sync: `pnpm sync:openapi` then `pnpm generate:api-types`.

Focused Review Queue / decision types live in
`src/services/api/generated/reviewTypes.ts`. Full `openapi-typescript` output
can be generated into `src/services/api/generated/aieos-v1.ts`.

## Local development

1. Node 24.x, pnpm 11.x (`packageManager` field / `.nvmrc`).
2. `pnpm install`
3. Run backend on `127.0.0.1:8000` (or set `VITE_DEV_API_PROXY_TARGET`).
4. `pnpm dev` — Vite proxies `/api` → backend.
5. Open Teacher OS → expand **DEV session** → enter tenant id + bearer token (memory only).

Do **not** put tokens in `VITE_*` env vars, localStorage, or files.

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Playwright uses the Vite **dev** server (not production preview) so `DevSessionConnector` remains available (`import.meta.env.PROD` is false). Default port: `5180`.

## Explicit non-goals (Lane A)

- Production auth / IdP integration
- Direct LLM / MCP / agent calls from the frontend
- Fake class / attendance / assessment business data on placeholders
- Merging or changing architecture / product / backend repositories
