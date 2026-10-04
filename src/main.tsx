// CET IMPORT EST LE PREMIER, ET L'ORDRE EST LA CONDITION DE DÉMARRAGE. Il branche le domaine sur le
// shell. `ui/App.tsx` fait son propre démarrage au chargement du module — sauvegarde restaurée,
// méta-composants relus, nodes installés — et tout cela réclame le registre : il doit donc avoir été
// déposé avant que `App` soit évalué. Les imports étant évalués dans l'ordre du source, celui-ci
// passe en tête. `src/docs/composition.test.ts` le tient, un commentaire ne survivant pas au premier
// trieur d'imports.
import "./composition";

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
    .then(async (accorde) => {
      // Diagnostic complet : « accordé » au sens de la requête, état réellement
      // persisté, et poids du cache — pour savoir, à la prochaine perte de
      // modèles, si c'est une éviction de quota (cf. main.cjs, permission
      // persistent-storage) ou autre chose.
      const persiste = await navigator.storage.persisted?.().catch(() => undefined);
      const est = await navigator.storage.estimate?.().catch(() => undefined);
      const mo = (n?: number) => n == null ? "?" : `${Math.round(n / 1048576)} Mo`;
      console.log(`[attic] Stockage persistant : ${accorde ? "accordé" : "refusé"} (persisted=${persiste}) — usage ${mo(est?.usage)} / quota ${mo(est?.quota)}`);
    })
    .catch(() => { /* API indisponible : on ignore, le cache reste best-effort */ });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><I18nProvider><ErreurBoundary><App /></ErreurBoundary></I18nProvider></StrictMode>
);
