import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { devSessionConnector } from "@/services/session/DevSessionConnector";

afterEach(() => {
  cleanup();
  devSessionConnector?.disconnect();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
