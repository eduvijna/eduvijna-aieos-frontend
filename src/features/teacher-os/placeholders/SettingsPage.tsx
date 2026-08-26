import { Link } from "react-router-dom";
import { useSession } from "@/services/session/useSession";
import { PlaceholderPage } from "./PlaceholderPage";

/**
 * Settings uses the shared placeholder chrome plus DEV session guidance.
 * Production builds show the placeholder only (no session connector UI).
 */
export function SettingsPage() {
  const { isProduction } = useSession();

  return (
    <div className="stack">
      <PlaceholderPage title="Settings" slug="settings" />
      {!isProduction ? (
        <section className="panel" aria-labelledby="settings-dev-heading">
          <h2 id="settings-dev-heading">Development session</h2>
          <p className="muted">
            Use the DEV session panel above the main content (also available on
            Today) to attach a memory-only bearer token and tenant id. See{" "}
            <Link to="/teacher-os/today">Today&apos;s Mission</Link>.
          </p>
        </section>
      ) : null}
    </div>
  );
}
