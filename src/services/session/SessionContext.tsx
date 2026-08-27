import {
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  type DevSession,
  type DevSessionConnector,
  devSessionConnector,
} from "./DevSessionConnector";
import {
  SessionContext,
  type SessionContextValue,
} from "./sessionContextValue";

export type { SessionContextValue };

function useConnectorStore(connector: DevSessionConnector | null) {
  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      if (!connector) return () => undefined;
      return connector.subscribe(onStoreChange);
    },
    [connector],
  );
  const getSnapshot = () => connector?.getSession() ?? null;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const isProduction = import.meta.env.PROD;
  const connector = isProduction ? null : devSessionConnector;
  const session = useConnectorStore(connector);

  const value = useMemo<SessionContextValue>(
    () => ({
      isProduction,
      session,
      isConnected: session !== null,
      connect: (next: DevSession) => {
        connector?.connect(next);
      },
      disconnect: () => {
        connector?.disconnect();
      },
      connector,
    }),
    [connector, isProduction, session],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
