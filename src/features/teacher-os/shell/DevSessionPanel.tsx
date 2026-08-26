import { type FormEvent, useState } from "react";
import { useSession } from "@/services/session/useSession";

export function DevSessionPanel() {
  const { isProduction, isConnected, connect, disconnect, session } =
    useSession();
  const [apiOrigin, setApiOrigin] = useState(
    session?.apiOrigin || "http://127.0.0.1:8000",
  );
  const [tenantId, setTenantId] = useState(session?.tenantId || "");
  const [bearerToken, setBearerToken] = useState(session?.bearerToken || "");
  const [status, setStatus] = useState("");

  if (isProduction) {
    return null;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    connect({ apiOrigin, tenantId, bearerToken });
    setStatus("Connected (memory only — not persisted).");
  }

  return (
    <section className="tos-dev-session" aria-label="Development session">
      <details open>
        <summary>
          DEV session {isConnected ? "(connected)" : "(not connected)"}
        </summary>
        <form className="tos-dev-session-form" onSubmit={onSubmit}>
          <p className="muted">
            Memory-only connector for local NON_PRODUCTION use. Tokens are never
            written to storage, env, logs, or snapshots.
          </p>
          <label>
            API origin (informational; browser calls go through Vite `/api`
            proxy)
            <input
              name="apiOrigin"
              value={apiOrigin}
              onChange={(e) => setApiOrigin(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            Tenant ID
            <input
              name="tenantId"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label>
            Bearer token
            <input
              name="bearerToken"
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <div className="tos-dev-session-actions">
            <button type="submit" className="btn">
              Connect
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                disconnect();
                setStatus("Disconnected.");
              }}
            >
              Disconnect
            </button>
          </div>
          <p className="status-region muted" aria-live="polite">
            {status}
          </p>
        </form>
      </details>
    </section>
  );
}
