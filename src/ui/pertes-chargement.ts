// ui/pertes-chargement.ts — Ce qu'un fichier de projet perd en s'ouvrant.
//
// ═══ POURQUOI UN MODULE, ET NON QUINZE LIGNES DANS LE HOOK ═══
//
// CE CALCUL EST LA PARTIE QUI PEUT SE TROMPER. Reconnaître qu'une fiche manque demande de savoir
// qu'un méta du fichier vient d'être enregistré, qu'une bulle repliée n'a pas de fiche au registre,
// et qu'une note n'en a jamais eu : trois exemptions, donc trois occasions de déclarer perdu ce qui
// ne l'est pas. Un faux rapport est pire que pas de rapport — il envoie chercher une panne qui
// n'existe pas.
//
// Écrit dans le hook, ce calcul n'aurait pu être éprouvé que par un rendu React. Ici, il se mesure
// directement, avec un registre que le cas fournit.
import type { PerteAuChargement } from "../core";

/** Ce qu'il faut savoir d'une fiche pour dire si un réglage enregistré est encore lu. */
export interface FicheMinimale { parametres: { nom: string }[] }

export interface NoeudCharge {
  id: string;
  data?: { ficheId?: string; parametres?: Record<string, unknown> };
}

/**
 * Les fiches introuvables et les réglages orphelins d'un graphe qui vient d'être chargé.
 *
 * `metasDuFichier` sont les identifiants des métas que le fichier porte lui-même : ils viennent
 * d'être enregistrés, et les tenir pour inconnus signalerait une perte qui n'a pas eu lieu.
 */
export function pertesDesNoeuds(
  noeuds: NoeudCharge[],
  trouverFiche: (ficheId: string) => FicheMinimale | undefined,
  metasDuFichier: Set<string>,
): Pick<PerteAuChargement, "fiches" | "reglages"> {
  const fiches: string[] = [];
  const reglages: string[] = [];
  for (const n of noeuds) {
    const ficheId = String(n.data?.ficheId ?? "");
    if (!ficheId || sansFiche(ficheId)) continue;
    const def = trouverFiche(ficheId);
    if (!def) {
      if (!metasDuFichier.has(ficheId)) fiches.push(`${n.id} (${ficheId})`);
      continue;
    }
    const declares = new Set(def.parametres.map((p) => p.nom));
    for (const cle of Object.keys(n.data?.parametres ?? {})) {
      if (!declares.has(cle)) reglages.push(`${n.id} (${ficheId}) · ${cle}`);
    }
  }
  return { fiches, reglages };
}

/**
 * Les nœuds qui n'ont pas de fiche au registre, et c'est normal.
 *
 * Une note et un cadre sont des annotations posées sur le canevas ; une bulle repliée a une fiche
 * fabriquée pour elle seule, à partir des ports de ses membres. Aucun des trois n'est une perte.
 */
function sansFiche(ficheId: string): boolean {
  return ficheId === "comment" || ficheId === "frame" || ficheId.startsWith("bulle::");
}
