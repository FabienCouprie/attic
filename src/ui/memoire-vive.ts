// ui/memoire-vive.ts — Ce que l'application occupe, affiché dans la barre.
//
// POURQUOI UN COMPTEUR, ET POURQUOI CELUI-CI. Un graphe audio dépense de la mémoire sans le dire :
// une heure de stéréo pèse 1,27 Go par nœud, plus 635 Mo d'aperçu (cf. core/memoire.ts). Rien à
// l'écran ne le montre, et l'on ne l'apprend qu'au moment où un lecteur refuse de charger. Le
// compteur rend visible ce qui, jusqu'ici, ne se découvrait qu'en tombant.
//
// CE QU'IL COMPTE, ET CE QU'IL NE COMPTE PAS. La somme des mémoires de travail de TOUS les
// processus de l'application — navigateur, onglets, GPU, utilitaires —, telle que le processus
// principal la lit. Pas le tas JavaScript : mesuré côté onglet, il annonçait 54 Mo pendant que
// l'application en occupait deux mille. Un `AudioBuffer` est alloué hors du tas, et un aperçu est
// détenu par le processus navigateur, pas par celui qui calcule. Un compteur qui lirait
// `performance.memory` montrerait donc un chiffre juste et sans rapport avec la question posée.
//
// EN MÉGAOCTETS DÉCIMAUX, ET TOUJOURS DANS LA MÊME UNITÉ. Basculer en gigaoctets au-delà de mille
// ferait joli et empêcherait de comparer d'un coup d'œil deux relevés pris à une minute
// d'intervalle. Le séparateur de milliers suffit à rendre « 2 104 Mo » lisible.
import { alerteMemoire } from "./budget-memoire";

/** Une mesure telle que le processus principal la rend. */
export interface MesureMemoire {
  /** Somme des mémoires de travail, en octets. */
  total: number;
  /** Détail par type de processus, pour l'infobulle. */
  parType: { type: string; octets: number }[];
}

/** Agrège les métriques d'Electron. Isolée ici pour être testable sans Electron. */
export function agregerMetriques(
  metriques: readonly { type?: string; memory?: { workingSetSize?: number } }[],
): MesureMemoire {
  const parType = new Map<string, number>();
  let total = 0;
  for (const m of metriques) {
    // `workingSetSize` est en KIO chez Electron, et c'est la seule unité qu'il donne.
    const octets = (m.memory?.workingSetSize ?? 0) * 1024;
    total += octets;
    const type = m.type ?? "?";
    parType.set(type, (parType.get(type) ?? 0) + octets);
  }
  return {
    total,
    parType: [...parType].map(([type, octets]) => ({ type, octets })).sort((a, b) => b.octets - a.octets),
  };
}

/** « 2 104 Mo » — mégaoctets décimaux, espace insécable étroite entre les milliers. */
export function formaterMo(octets: number): string {
  const mo = Math.round(octets / 1e6);
  return `${mo.toLocaleString("fr-FR").replace(/ | | /g, " ")} Mo`;
}

/** Le détail par processus, une ligne chacun, pour l'infobulle. */
export function detailParProcessus(mesure: MesureMemoire): string {
  return mesure.parType.map((p) => `${p.type} : ${formaterMo(p.octets)}`).join("\n");
}

/** Toutes les deux secondes : assez pour suivre un rendu, assez peu pour ne rien coûter. */
export const PERIODE_MESURE_MS = 2000;

// LA COULEUR DE L'ALERTE EST ICI ET NON DANS `atelier.css`, que la norme de taille tient en dette,
// comme la barre d'outils : ni l'un ni l'autre ne doit plus grossir (`docs/generer-compte-lignes.test.ts`).
const STYLE_ALERTE = Object.freeze({ color: "var(--arret)", borderColor: "var(--arret)" });

/**
 * Ce que l'indicateur montre d'une mesure : sa classe, sa couleur et son infobulle.
 *
 * AU-DELÀ DE LA PART UTILE DU BUDGET MÉMOIRE (pièce C2, `ui/budget-memoire.ts`), il passe en rouge,
 * et l'infobulle dit le budget avant le détail par processus. Rien n'est arrêté.
 */
export function apparenceMemoire(mesure: MesureMemoire, t: (cle: string) => string): { className: string; style?: Readonly<Record<string, string>>; title: string } {
  const alerte = alerteMemoire(mesure.total, t);
  return {
    className: alerte ? "attic-memoire attic-memoire-alerte" : "attic-memoire",
    style: alerte ? STYLE_ALERTE : undefined,
    title: [t("barre.memoire.titre"), alerte, detailParProcessus(mesure)].filter(Boolean).join("\n"),
  };
}
