// CET IMPORT EST LE PREMIER, ET L'ORDRE EST LA CONDITION DE DÉMARRAGE. Il branche le domaine sur le
// shell, et lance le chargement du catalogue. Le registre, les vues et les services doivent avoir
// été déposés avant que le moindre module les réclame. Les imports étant évalués dans l'ordre du
// source, celui-ci passe en tête. `src/docs/composition.test.ts` le tient, un commentaire ne
// survivant pas au premier trieur d'imports.
import { domainePret } from "./composition";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./i18n";
import { ErreurBoundary } from "./ui/ErreurBoundary";
import App from "./ui/App";
import { demarrerAtelier } from "./ui/demarrage-atelier";

import { enMo } from "./core/octets";
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
      const mo = (n?: number) => n == null ? "?" : `${Math.round(enMo(n))} Mo`;
      console.log(`[attic] Stockage persistant : ${accorde ? "accordé" : "refusé"} (persisted=${persiste}) — usage ${mo(est?.usage)} / quota ${mo(est?.quota)}`);
    })
    .catch(() => { /* API indisponible : on ignore, le cache reste best-effort */ });
}

// L'ATELIER NE DÉMARRE ET NE SE PEINT QU'UNE FOIS LE CATALOGUE CHARGÉ : le démarrage relit les
// méta-composants contre le registre, et la palette le montre dès la première image. Un catalogue
// qui ne se charge pas laisse la page vide, comme le faisait un plugin qui levait à l'import quand le
// catalogue s'importait d'un bloc ; la cause est dite dans la console.
domainePret.then(() => {
  demarrerAtelier();
  createRoot(document.getElementById("root")!).render(
    <StrictMode><I18nProvider><ErreurBoundary><App /></ErreurBoundary></I18nProvider></StrictMode>
  );
}).catch((e) => console.error("[attic] Le catalogue n'a pas pu se charger :", e));
