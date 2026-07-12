import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { ErreurBoundary } from "./ui/ErreurBoundary";
import App from "./ui/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode><I18nProvider><ErreurBoundary><App /></ErreurBoundary></I18nProvider></StrictMode>
);
