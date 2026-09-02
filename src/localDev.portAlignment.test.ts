import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDevSessionConnector } from "@/services/session/DevSessionConnector";
import { renderApp } from "@/test/test-utils";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("local F5 Backend port alignment (8080)", () => {
  it("sets ordinary Vite development proxy default to 127.0.0.1:8080", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain(
      'env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8080"',
    );
    expect(vite).not.toMatch(
      /VITE_DEV_API_PROXY_TARGET \|\| "http:\/\/127\.0\.0\.1:8000"/,
    );
  });

  it("preserves explicit VITE_DEV_API_PROXY_TARGET override in Vite config", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain("env.VITE_DEV_API_PROXY_TARGET");
    expect(vite).toMatch(/proxy:\s*\{[\s\S]*"\/api"/);
  });

  it("sets DevSessionPanel informational default to 127.0.0.1:8080", () => {
    const panel = read("src/features/teacher-os/shell/DevSessionPanel.tsx");
    expect(panel).toContain('"http://127.0.0.1:8080"');
    expect(panel).not.toContain('"http://127.0.0.1:8000"');
    expect(panel).toMatch(/Vite `\/api`\s*proxy/i);
  });

  it("documents .env.example ordinary local default as 8080", () => {
    const example = read(".env.example");
    expect(example).toContain(
      "VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:8080",
    );
    expect(example).toMatch(/Product E2E/i);
    expect(example).not.toMatch(
      /VITE_DEV_API_PROXY_TARGET=http:\/\/127\.0\.0\.1:8000/,
    );
  });

  it("preserves Product E2E isolated backend port 8000", () => {
    const constants = read("scripts/product-e2e/constants.mjs");
    expect(constants).toContain("DEFAULT_BACKEND_PORT = 8000");

    const playwrightProduct = read("playwright.product.config.ts");
    expect(playwrightProduct).toContain(
      "process.env.PRODUCT_E2E_BACKEND_PORT || 8000",
    );
    expect(playwrightProduct).toContain(
      "VITE_DEV_API_PROXY_TARGET: BACKEND_URL",
    );

    const serveDev = read("scripts/product-e2e/serve_development_app.py");
    expect(serveDev).toContain(
      'os.environ.get("PRODUCT_E2E_BACKEND_PORT", "8000")',
    );
  });

  it("keeps bearer token memory-only (never VITE_* / storage)", () => {
    const panel = read("src/features/teacher-os/shell/DevSessionPanel.tsx");
    expect(panel).toMatch(/Memory-only connector/i);
    expect(panel).not.toMatch(/VITE_.*BEARER|import\.meta\.env\.VITE_/);

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const connector = createDevSessionConnector();
    connector.connect({
      apiOrigin: "http://127.0.0.1:8080",
      tenantId: "72cd9fb4-eb58-5c2d-ac13-43f8cd76e18d",
      bearerToken: "aieos-local-dev",
    });
    expect(connector.getSession()?.bearerToken).toBe("aieos-local-dev");
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    connector.disconnect();
    setItem.mockRestore();
  });

  it("renders DevSessionPanel with 8080 informational default", () => {
    renderApp("/teacher-os/today", null);
    const apiOrigin = screen.getByLabelText(/API origin/i) as HTMLInputElement;
    expect(apiOrigin.value).toBe("http://127.0.0.1:8080");
  });
});
