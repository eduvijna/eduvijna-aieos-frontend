export type DevSession = {
  apiOrigin: string;
  tenantId: string;
  bearerToken: string;
};

type Listener = () => void;

/**
 * Memory-only session connector for NON_PRODUCTION local development.
 * Never persists to localStorage, sessionStorage, files, or env token vars.
 * Production builds must not import/use this connector (gated via import.meta.env.PROD).
 */
class DevSessionConnectorImpl {
  #session: DevSession | null = null;
  #listeners = new Set<Listener>();

  getSession(): DevSession | null {
    return this.#session;
  }

  isConnected(): boolean {
    return this.#session !== null;
  }

  connect(session: DevSession): void {
    this.#session = {
      apiOrigin: session.apiOrigin.trim(),
      tenantId: session.tenantId.trim(),
      bearerToken: session.bearerToken.trim(),
    };
    this.#emit();
  }

  disconnect(): void {
    this.#session = null;
    this.#emit();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export type DevSessionConnector = DevSessionConnectorImpl;

export function createDevSessionConnector(): DevSessionConnectorImpl {
  return new DevSessionConnectorImpl();
}

/** Singleton used only when not PROD. */
export const devSessionConnector: DevSessionConnectorImpl | null =
  import.meta.env.PROD ? null : createDevSessionConnector();
