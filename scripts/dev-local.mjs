/**
 * Deterministic Founder/local Vite start against Backend F5 (port 8080).
 * Ordinary `pnpm run dev` also defaults to 8080; this script sets the
 * override explicitly so the proxy target cannot drift.
 */
import { spawn } from "node:child_process";

process.env.VITE_DEV_API_PROXY_TARGET = "http://127.0.0.1:8080";

const child = spawn("pnpm", ["exec", "vite", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
