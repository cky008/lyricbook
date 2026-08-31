import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { I18nProvider } from "./lib/i18n";
import { registerServiceWorker } from "./lib/serviceWorker";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

const printPortal = document.getElementById("print-portal");
if (!printPortal || printPortal.parentElement !== document.body) {
  throw new Error("Missing direct body child #print-portal element");
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);

registerServiceWorker();
