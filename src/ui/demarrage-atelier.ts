// ui/demarrage-atelier.ts — Ce que l'atelier fait une fois, avant sa première image.
//
// IL VIVAIT AU CHARGEMENT DU MODULE `App.tsx`, et il en est sorti le 2026-11-13 : le catalogue se
// charge désormais par catégories (voir `plugins/index.ts`), si bien qu'à l'évaluation d'`App.tsx`
// le registre est encore vide. Relire les méta-composants sur un registre vide les aurait tous
// déclarés « non restaurés ». `main.tsx` appelle donc `demarrerAtelier()` une fois `domainePret`
// tenue, puis peint ; l'atelier lit ce que le démarrage a relevé par `demarrageAtelier()`.
import { chargerNodesInstalles } from "../core";
import { installerMetasExemples } from "../plugins/meta-exemples";
import { chargerMetasLocaux } from "./metasLocaux";
import { registreUI } from "./registre-actif";

export interface Demarrage {
  /**
   * Métas dont un sous-nœud référence un plugin introuvable (renommé/supprimé) : non réinjectés
   * dans le catalogue par chargerMetasLocaux (qui les garde en stockage), mais signalés après le
   * premier rendu (cf. le useEffect d'`App.tsx`) — sinon ils disparaissent de la palette sans
   * qu'aucune trace n'explique pourquoi.
   */
  metasNonRestaures: ReturnType<typeof chargerMetasLocaux>;
  /** Diagnostic : le nombre de plugins au registre une fois le démarrage fait. */
  nbPlugins: number;
}

let demarrage: Demarrage | null = null;

/** Restaure, relit et installe, une seule fois. Le registre doit être rempli : voir `main.tsx`. */
export function demarrerAtelier(): void {
  if (demarrage) return;
  const tousLesPlugins = () => registreUI().tousLesPlugins();
  // Restaure les données de backup si on vient d'une mise à jour (synchrone)
  const api0 = (window as any).api;
  if (api0?.majRestaurerBackupSync) {
    const backup = api0.majRestaurerBackupSync();
    if (backup) {
      console.log("[attic] Restauration backup post-mise-à-jour");
      if (backup.metas) localStorage.setItem("attic-metas", backup.metas);
      if (backup.encours) localStorage.setItem("attic-encours", backup.encours);
      if (backup.lang) localStorage.setItem("attic-lang", backup.lang);
      if (backup.nodesInstalles) localStorage.setItem("attic-nodes-installes", backup.nodesInstalles);
    }
  }
  console.log(`[attic] Plugins avant chargerMetasLocaux: ${tousLesPlugins().length}`);
  const metasNonRestaures = chargerMetasLocaux();
  installerMetasExemples();
  // Restaure les nodes installés dynamiquement (.zip) avant le premier rendu. Leur CODE, lui, ne
  // s'évalue qu'au premier run, dans le cadre isolé que pose `./bac-a-sable-noeud`, importé par
  // `App.tsx`.
  chargerNodesInstalles();

  // Diagnostic : vérifier que les plugins sont bien chargés
  const nbPlugins = tousLesPlugins().length; console.log("[attic] Plugins charg�s:", nbPlugins);
  demarrage = { metasNonRestaures, nbPlugins };
}

/** Ce que le démarrage a relevé. LÈVE s'il n'a pas eu lieu : peindre avant serait peindre à vide. */
export function demarrageAtelier(): Demarrage {
  if (!demarrage) throw new Error("L'atelier est peint avant son démarrage : voir main.tsx.");
  return demarrage;
}
