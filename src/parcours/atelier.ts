// parcours/atelier.ts — Une photographie du graphe, en clair, pour qu'un exercice puisse le lire.
//
// POURQUOI UNE PHOTOGRAPHIE PLUTÔT QUE LE GRAPHE LUI-MÊME. Ce que React Flow tient est un tableau
// de nœuds portant un `data` où se mêlent des tampons audio, des objets `File`, une vingtaine de
// rappels de l'application et des champs d'affichage. Faire lire cela à une règle d'exercice
// reviendrait à river le parcours à la forme interne de l'interface : le jour où un champ change
// de nom, les exercices cesseraient de se valider en silence, et personne ne saurait pourquoi.
//
// L'instantané ne retient que ce qu'un exercice peut légitimement observer : quel nœud, de quelle
// famille, avec quels réglages, a-t-il rendu quelque chose, et qui est relié à qui. Trois
// champs et deux listes. C'est aussi ce qui rend les règles éprouvables sans interface : les tests
// construisent un atelier à la main, en six lignes.
//
// « A RENDU QUELQUE CHOSE » SE LIT DE DEUX ENDROITS, et il le faut. Le statut d'exécution vit hors
// du graphe, dans un magasin à part (`ui/statuts.ts`) que la vue peut consulter ; mais il est
// volatil — il ne survit pas à un rechargement, alors que le résultat, lui, reste affiché sous le
// nœud. Un élève qui rouvre son projet et reprend son exercice doit retrouver ses points cochés.
// L'instantané accepte donc les deux sources et se contente de l'une ou de l'autre.

/** Ce qu'un exercice peut observer d'un nœud. */
export interface NoeudVu {
  id: string;
  ficheId: string;
  univers: string;
  famille: string;
  parametres: Record<string, string | number>;
  /** Il a produit un résultat : il a été lancé, et il a abouti. */
  rendu: boolean;
}

/** Une arête, réduite à ce qu'elle dit : le son va d'ici à là. */
export interface Lien {
  de: string;
  vers: string;
}

/** L'atelier tel qu'un exercice le voit. */
export interface Atelier {
  noeuds: NoeudVu[];
  liens: Lien[];
}

/** Ce que le registre sait d'une fiche, et qui ne se lit pas sur le nœud. */
export interface InfoFiche {
  univers: string;
  famille: string;
}

/** Un nœud de React Flow, réduit à ce dont on a besoin. */
export interface NoeudBrut {
  id: string;
  data?: Record<string, unknown> | null;
}

/** Une arête de React Flow, réduite de même. */
export interface LienBrut {
  source?: string | null;
  target?: string | null;
}

/**
 * Les champs d'affichage qui prouvent qu'un nœud a rendu quelque chose.
 *
 * Aucun n'est universel : un nœud de texte n'a pas de tampon audio, un visualiseur n'a pas de
 * message. C'est leur réunion qui couvre le catalogue, et c'est pour cela que la liste est écrite
 * ici plutôt que devinée nœud par nœud.
 */
const CHAMPS_RESULTAT = [
  "audioResultatBuffer", "audioResultatUrl", "audioResultatMessage",
  "imageResultatUrl", "imageResultatFile", "scriptGenere", "midiFichierSortie",
];

const ATTENDU = new Set(["", null, undefined]);

/** Vrai si l'un des champs de résultat porte quelque chose. */
function porteUnResultat(data: Record<string, unknown>): boolean {
  return CHAMPS_RESULTAT.some((c) => !ATTENDU.has(data[c] as never) && data[c] !== false);
}

/**
 * La photographie du graphe.
 *
 * `info` vient du registre vivant — le parcours ne connaît pas les familles par cœur, il les
 * demande, exactement comme le thème « Catalogue » du quiz. Un nœud dont la fiche est inconnue
 * (méta-composant, commentaire, cadre) est gardé avec des rubriques vides : il existe, il peut être
 * relié, mais aucun critère de famille ne le retiendra.
 */
export function instantane(
  noeuds: readonly NoeudBrut[],
  liens: readonly LienBrut[],
  info: (ficheId: string) => InfoFiche | undefined,
  statut?: (id: string) => string,
): Atelier {
  const vus: NoeudVu[] = [];
  for (const n of noeuds ?? []) {
    if (!n || typeof n.id !== "string") continue;
    const data = (n.data ?? {}) as Record<string, unknown>;
    const ficheId = typeof data.ficheId === "string" ? data.ficheId : "";
    const f = info(ficheId);
    const p = data.parametres;
    vus.push({
      id: n.id,
      ficheId,
      univers: f?.univers ?? "",
      famille: f?.famille ?? "",
      parametres: (p && typeof p === "object" ? p : {}) as Record<string, string | number>,
      rendu: porteUnResultat(data) || statut?.(n.id) === "termine",
    });
  }
  const connus = new Set(vus.map((n) => n.id));
  const liensVus: Lien[] = [];
  for (const l of liens ?? []) {
    const de = l?.source, vers = l?.target;
    if (typeof de !== "string" || typeof vers !== "string") continue;
    if (!connus.has(de) || !connus.has(vers)) continue;
    liensVus.push({ de, vers });
  }
  return { noeuds: vus, liens: liensVus };
}

/** L'atelier vide — ce que voit un exercice quand rien n'est encore posé. */
export const ATELIER_VIDE: Atelier = { noeuds: [], liens: [] };

/** Les nœuds qui alimentent directement celui-ci. */
export function amontDirect(a: Atelier, id: string): NoeudVu[] {
  const ids = new Set(a.liens.filter((l) => l.vers === id).map((l) => l.de));
  return a.noeuds.filter((n) => ids.has(n.id));
}

/**
 * Le son va-t-il d'ici à là ?
 *
 * Un parcours en largeur, et non une comparaison d'arête : ce qui se demande à un élève est que
 * son générateur PARVIENNE à la sortie, pas qu'il y soit collé. Entre les deux il aura mis ce
 * qu'il voulait, et c'est très bien ainsi — un exercice qui interdirait d'ajouter un nœud de plus
 * serait un exercice qui interdit d'essayer.
 */
export function mene(a: Atelier, de: string, vers: string): boolean {
  if (de === vers) return true;
  const sortants = new Map<string, string[]>();
  for (const l of a.liens) {
    const liste = sortants.get(l.de);
    if (liste) liste.push(l.vers); else sortants.set(l.de, [l.vers]);
  }
  const vus = new Set([de]);
  const file = [de];
  while (file.length > 0) {
    for (const suivant of sortants.get(file.shift()!) ?? []) {
      if (suivant === vers) return true;
      if (vus.has(suivant)) continue;
      vus.add(suivant);
      file.push(suivant);
    }
  }
  return false;
}

/** Y a-t-il une arête, celle-là même, de l'un à l'autre ? */
export const relieDirect = (a: Atelier, de: string, vers: string): boolean =>
  a.liens.some((l) => l.de === de && l.vers === vers);
