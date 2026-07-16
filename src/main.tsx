import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { ErreurBoundary } from "./ui/ErreurBoundary";
import App from "./ui/App";

// Demande le stockage persistant : empêche l'éviction (sous pression disque) du
// cache de modèles IA — les fichiers HuggingFace stockés en Cache Storage. Ainsi
// un modèle n'est téléchargé qu'une fois ; les runs suivants relisent le disque.
// En Electron, la permission est généralement accordée sans invite utilisateur.
if (navigator.storage?.persist) {
  navigator.storage.persist()
    .then((accorde) => console.log(`[attic] Stockage persistant : ${accorde ? "accordé" : "refusé"}`))
    .catch(() => { /* API indisponible : on ignore, le cache reste best-effort */ });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><I18nProvider><ErreurBoundary><App /></ErreurBoundary></I18nProvider></StrictMode>
);
