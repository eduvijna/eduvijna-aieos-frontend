# AIEOS Frontend — Local Development

LOCAL DEVELOPMENT ONLY.

## FOUNDER LOCAL UI (Backend F5)

1. Start Backend F5 in Cursor (`AIEOS API — Local Development`) so the API is on:

   - Backend: http://127.0.0.1:8080

2. In this Frontend repo:

   ```powershell
   pnpm install
   pnpm run dev
   ```

   No `VITE_DEV_API_PROXY_TARGET` is required for ordinary local use. The Vite
   `/api` proxy defaults to `http://127.0.0.1:8080`.

   Optional deterministic start:

   ```powershell
   pnpm run dev:local
   ```

3. Open:

   - Frontend: http://localhost:5173

4. Connect the DEV session panel (memory-only):

   | Field | Value |
   |-------|-------|
   | API origin | `http://127.0.0.1:8080` |
   | Tenant | `72cd9fb4-eb58-5c2d-ac13-43f8cd76e18d` |
   | Bearer | `aieos-local-dev` |

   All three values are **LOCAL DEVELOPMENT ONLY**.

   The bearer token must never be placed in `VITE_*` environment variables. It
   stays memory-only through the DEV-session connector.

5. Browser requests for `/api/...` go through the Vite proxy to Backend F5 on
   port **8080** (not Product E2E’s isolated port 8000).

## Product E2E isolation

Product Playwright E2E continues to pass an explicit
`VITE_DEV_API_PROXY_TARGET` for its isolated backend. Default Product E2E
backend port remains **8000** (`PRODUCT_E2E_BACKEND_PORT`). Do not conflate
ordinary Founder/local F5 development with Product E2E.
