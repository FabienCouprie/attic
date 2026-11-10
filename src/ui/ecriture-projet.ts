// ui/ecriture-projet.ts — Où un projet s'écrit : la cascade des dialogues et des écritures par le pont,
// et le téléchargement du mode web.
//
// SORTI DE `ui/hooks/usePersistance.ts` le 2026-11-09, quatrième et dernière pièce de son découpage
// (lot 2 de la revue d'architecture du 2026-10-31). C'est le corps de `sauvegarder` qui choisit où
// écrire, recopié ligne pour ligne : le dialogue sans fichier courant ou pour « enregistrer sous »,
// l'écriture directe, le dialogue prérempli quand le pont la refuse, l'alerte si on l'annule, le
// repli sans écriture directe, et le téléchargement sans pont. Deux retouches, et seulement deux :
// le dossier de travail arrive en argument au lieu d'`o.repertoire`, et la sortie anticipée d'un
// refus annulé rend l'abandon au lieu de sortir de `sauvegarder`.
//
// CE QUI RESTE AU CROCHET, et pourquoi : la construction du projet, la pose du fichier courant, sa
// référence, l'en-cours et le dernier contenu écrit. Ce sont des effets sur l'atelier ; ce module
// n'en a aucun. Il parle au pont qu'on lui prête, à la console et, sur un refus annulé, à `alert`.
//
// LE PONT EST PRÊTÉ, et typé aussi souplement qu'avant : `sauvegarder` lui passe `window.api`. Un
// test lui passe un pont témoin, et parcourt ainsi chaque chemin de la cascade sans Electron.

/** Ce que la cascade rend : le chemin retenu, vide si le dialogue a été fermé, ou l'abandon d'un refus. */
export type IssueEcriture = { abandon: false; chemin: string | null | undefined } | { abandon: true };

/** Ce que la cascade lit de la sauvegarde qui l'appelle. */
export interface DemandeEcriture {
  json: string;
  currentFilePath: string | null;
  forceDialog: boolean;
  defaultName: string | undefined;
  /** Le dossier de travail réglé ; vide, le pont est interrogé. */
  repertoire: string;
  t: (cle: string) => string;
}

/**
 * Écrit le projet par le pont d'Electron, `api` : directement dans le fichier courant quand il y en
 * a un et qu'on n'a pas demandé « enregistrer sous », par le dialogue d'enregistrement sinon.
 */
export async function ecrireParLePont(api: any, demande: DemandeEcriture): Promise<IssueEcriture> {
  const { json, currentFilePath, forceDialog, defaultName, repertoire, t } = demande;
  console.log("[persistance] api available, ecrireFichier=", !!api.ecrireFichier);
  let filePath = currentFilePath;
  // Si pas de fichier courant ou "Save as" demandé, on ouvre le dialogue.
  if (!filePath || forceDialog) {
    let dossier = repertoire;
    if (!dossier) dossier = await api.obtenirRepertoireTravail?.();
    const defaultPath = filePath || (dossier ? `${dossier}\\${defaultName}` : defaultName);
    filePath = await api.sauvegarderFichier({
      defaultPath,
      filters: [{ name: "Workflow Attic", extensions: ["json"] }],
      data: json,
    });
  } else if (api?.ecrireFichier) {
    // Écriture directe dans le fichier courant sans dialogue.
    //
    // UN REFUS SE DIT, ET LE CONTENU N'EST PAS TENU POUR ÉCRIT. Le retour était ignoré : un
    // disque plein, un fichier verrouillé ou un dossier hors des racines du pont laissaient
    // croire le projet enregistré, et la sauvegarde automatique, voyant le contenu marqué
    // comme écrit, ne réessayait plus. Relevé le 2026-10-27.
    //
    // ET UN REFUS OUVRE LE DIALOGUE D'ENREGISTREMENT, prérempli avec le même chemin. C'est le cas
    // d'un projet ouvert par dépôt ou par le sélecteur : son chemin ne vient d'aucun dialogue du
    // processus principal, donc d'aucune racine, et le pont refuse d'y écrire. Un appui sur
    // Entrée confirme l'emplacement ; le dialogue accorde alors la racine, et écrit. Aucun chemin
    // nommé par le rendu ne fonde de racine — c'est la règle de `electron/capacites-chemins.cjs`.
    const ecrit = await api.ecrireFichier(filePath, json);
    if (!ecrit) {
      filePath = await api.sauvegarderFichier({
        defaultPath: filePath,
        filters: [{ name: "Workflow Attic", extensions: ["json"] }],
        data: json,
      });
      if (!filePath) {
        if (typeof alert !== "undefined") alert(t("persistance.ecritureRefusee").replace("{chemin}", String(currentFilePath)));
        return { abandon: true };
      }
    }
  } else {
    // Fallback : dialogue pré-rempli avec le fichier courant.
    filePath = await api.sauvegarderFichier({
      defaultPath: filePath,
      filters: [{ name: "Workflow Attic", extensions: ["json"] }],
      data: json,
    });
  }
  return { abandon: false, chemin: filePath };
}

/**
 * Le temps laissé au navigateur pour prendre le fichier avant que son adresse soit révoquée : celui
 * que `vues-domaine/vues-collections.tsx` laisse déjà à un WAV téléchargé.
 */
export const DELAI_AVANT_REVOCATION_MS = 1000;

/**
 * Le mode web, sans pont : le projet part en téléchargement, et aucun fichier courant n'existe.
 *
 * L'ADRESSE EST RÉVOQUÉE APRÈS LE CLIC, et non au clic : certains navigateurs ne prennent le fichier
 * qu'au tour suivant. MESURÉ AVANT : elle n'était jamais révoquée, et chaque export laissait son
 * projet au navigateur jusqu'à la fermeture.
 */
export function telechargerProjet(json: string, defaultName: string | undefined): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = defaultName || "attic.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), DELAI_AVANT_REVOCATION_MS);
}
