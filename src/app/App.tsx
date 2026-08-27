import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary";
import { AppRouter } from "./router";
import { SessionProvider } from "@/services/session/SessionContext";

export function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </SessionProvider>
    </ErrorBoundary>
  );
}
