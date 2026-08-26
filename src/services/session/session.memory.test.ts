import { describe, expect, it, vi } from "vitest";
import {
  createDevSessionConnector,
  devSessionConnector,
} from "@/services/session/DevSessionConnector";
import { DEV_SESSION } from "@/test/test-utils";

describe("J. Token not persisted (session memory only)", () => {
  it("keeps session in memory and never writes storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const connector = createDevSessionConnector();
    connector.connect(DEV_SESSION);
    expect(connector.getSession()?.bearerToken).toBe(DEV_SESSION.bearerToken);
    connector.disconnect();
    expect(connector.getSession()).toBeNull();
    expect(setItem).not.toHaveBeenCalled();

    // Singleton path used by the app
    devSessionConnector?.connect(DEV_SESSION);
    expect(devSessionConnector?.isConnected()).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
