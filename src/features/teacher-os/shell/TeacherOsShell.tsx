import { NavLink, Outlet } from "react-router-dom";
import { DevSessionPanel } from "./DevSessionPanel";
import "./shell.css";

const NAV_ITEMS = [
  { to: "/teacher-os/today", label: "Today" },
  { to: "/teacher-os/prepare", label: "Prepare" },
  { to: "/teacher-os/teach", label: "Teach" },
  { to: "/teacher-os/assess", label: "Assess" },
  { to: "/teacher-os/improve", label: "Improve" },
  { to: "/teacher-os/library", label: "Library" },
  { to: "/teacher-os/ai-assistant", label: "AI Assistant" },
  { to: "/teacher-os/settings", label: "Settings" },
] as const;

export function TeacherOsShell() {
  return (
    <div className="tos-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="tos-nav" aria-label="Teacher OS">
        <div className="tos-brand">
          <p className="tos-brand-kicker">EduVijna</p>
          <p className="tos-brand-title">Teacher OS</p>
        </div>
        <nav aria-label="Primary">
          <ul className="tos-nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "tos-nav-link is-active" : "tos-nav-link"
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="tos-nav-note muted">
          Review Queue is reached from Today&apos;s Mission.
        </p>
      </aside>
      <div className="tos-main-column">
        <DevSessionPanel />
        <main id="main-content" className="tos-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
