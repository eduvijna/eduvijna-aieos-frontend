import { createContext } from "react";
import type { DevSession, DevSessionConnector } from "./DevSessionConnector";

export type SessionContextValue = {
  isProduction: boolean;
  session: DevSession | null;
  isConnected: boolean;
  connect: (session: DevSession) => void;
  disconnect: () => void;
  connector: DevSessionConnector | null;
};

export const SessionContext = createContext<SessionContextValue | null>(null);
