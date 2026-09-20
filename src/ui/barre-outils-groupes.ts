// ui/barre-outils-groupes.ts — Familles et étiquettes de la barre d'outils.
//
// La barre était une rangée d'icônes sans étiquette, rangées dans l'ordre où elles
// avaient été ajoutées, et deux d'entre elles étaient des disques qu'on confondait —
// le thème et la mise à jour. Les survols ne se ressemblaient pas davantage : « Thème »
// et « Dossier » sont des noms, « Sauvegarder l'en-cours » une phrase, et le SoundFont
// affichait « SF2: » suivi d'un nom de fichier, jamais traduit.
//
// Cette table dit à quelle famille chaque outil appartient et sous quelle forme il
// s'annonce. Elle vit hors du composant : la suite de tests ne couvre pas les `.tsx`, et
// c'est ici qu'on peut vérifier qu'aucun outil n'est orphelin ni muet dans une langue.

/** Les familles, dans leur ordre d'apparition de gauche à droite. */
export const FAMILLES = ["fichier", "edition", "ressources", "affichage", "application", "execution"] as const;
export type FamilleBarre = (typeof FAMILLES)[number];

export interface OutilBarre {
  id: string;
  famille: FamilleBarre;
  /** Clé du dictionnaire : un verbe et son objet, pour que tous se lisent pareil. */
  cle: string;
  /**
   * Raccourci clavier, affiché entre parenthèses à la fin de l'étiquette. Les touches
   * s'écrivent sous leur nom anglais — `Ctrl+Shift+S`, `Space` — et sont traduites à
   * l'affichage : une étiquette anglaise annonçait « Ctrl+Maj+S » et « Espace ».
   */
  raccourci?: string;
}

/** Touches dont le nom change d'une langue à l'autre. Les autres s'écrivent pareil. */
const TOUCHES: Record<string, string> = {
  Shift: "touche.maj",
  Space: "touche.espace",
};

/**
 * « édition » ne figurait pas dans les quatre familles demandées — fichier, ressources,
 * affichage, exécution —, mais la note et le cadre n'appartiennent à aucune des quatre :
 * ils ajoutent au canevas, ils ne l'affichent pas. Les ranger sous « affichage » aurait
 * été commode et faux.
 */
export const OUTILS: OutilBarre[] = [
  { id: "sauvegarder", famille: "fichier", cle: "barre.sauvegarder", raccourci: "Ctrl+S" },
  { id: "exporter", famille: "fichier", cle: "barre.exporter", raccourci: "Ctrl+Shift+S" },
  { id: "importer", famille: "fichier", cle: "barre.importer", raccourci: "Ctrl+O" },
  // Deux entrées pour un seul bouton, comme lancer/arrêter : l'étiquette dit ce que le
  // clic va faire, et non l'état dans lequel on se trouve.
  { id: "sauvegardeAutoActiver", famille: "fichier", cle: "barre.sauvegardeAutoActiver" },
  { id: "sauvegardeAutoCouper", famille: "fichier", cle: "barre.sauvegardeAutoCouper" },
  { id: "economieMemoireActiver", famille: "fichier", cle: "barre.economieMemoireActiver" },
  { id: "economieMemoireCouper", famille: "fichier", cle: "barre.economieMemoireCouper" },

  { id: "commentaire", famille: "edition", cle: "barre.commentaire" },
  { id: "cadre", famille: "edition", cle: "barre.cadre" },

  { id: "dossier", famille: "ressources", cle: "barre.dossier" },
  { id: "soundfont", famille: "ressources", cle: "barre.soundfont" },
  { id: "favoris", famille: "ressources", cle: "barre.favoris" },

  { id: "theme", famille: "affichage", cle: "barre.theme" },
  { id: "langue", famille: "affichage", cle: "barre.langue" },
  { id: "fenetre", famille: "affichage", cle: "barre.fenetre" },

  { id: "doc", famille: "application", cle: "barre.doc" },
  { id: "maj", famille: "application", cle: "barre.maj" },
  { id: "modeles", famille: "application", cle: "barre.modeles" },

  { id: "audio", famille: "execution", cle: "barre.audio" },
  { id: "reinitialiser", famille: "execution", cle: "barre.reinitialiser" },
  { id: "lancer", famille: "execution", cle: "barre.lancer", raccourci: "Space" },
  { id: "arreter", famille: "execution", cle: "barre.arreter", raccourci: "Space" },
];

const PAR_ID = new Map(OUTILS.map((o) => [o.id, o]));

export function outil(id: string): OutilBarre {
  const o = PAR_ID.get(id);
  if (!o) throw new Error(`Outil de barre inconnu : ${id}`);
  return o;
}

/** Les outils d'une famille, dans l'ordre de la table. */
export function outilsDe(famille: FamilleBarre): OutilBarre[] {
  return OUTILS.filter((o) => o.famille === famille);
}

/**
 * L'étiquette de survol, toujours bâtie pareil :
 *
 *     Verbe et objet — précision (Raccourci)
 *
 * La précision est l'état du moment quand il en existe un — le SoundFont chargé, la
 * langue vers laquelle on bascule — et non une seconde phrase.
 */
export function etiquetteOutil(
  id: string,
  t: (cle: string) => string,
  precision?: string,
): string {
  const o = outil(id);
  const base = t(o.cle);
  const raccourci = o.raccourci
    ? ` (${o.raccourci.split("+").map((k) => (TOUCHES[k] ? t(TOUCHES[k]) : k)).join("+")})`
    : "";
  return `${base}${precision ? ` — ${precision}` : ""}${raccourci}`;
}

/** Le libellé d'une famille, pour le regroupement lu par les lecteurs d'écran. */
export function etiquetteFamille(famille: FamilleBarre, t: (cle: string) => string): string {
  return t(`barre.groupe.${famille}`);
}
