// ui/ligne-temps-calcul.ts — Ce que la ligne de temps calcule, hors de ce qu'elle dessine.
//
// POURQUOI CE MODULE EXISTE. La ligne de temps du Montage tenait en un seul composant, et rien ne
// l'éprouvait : le dépôt n'a aucune bibliothèque de test de rendu, et `vite.config.ts` ne ramasse
// que les fichiers `.test.ts`, de sorte qu'un test en `.test.tsx` ne serait jamais exécuté. Tout ce
// qui n'est pas du dessin est donc sorti ici, où un test ordinaire l'atteint sans rien installer.
//
// CE QUI EST SORTI, ET CE QUI RESTE. Sont ici la disposition des pistes, l'échelle de la vue, le
// pas de graduation et surtout L'ARITHMÉTIQUE DU GESTE, c'est-à-dire ce qu'un déplacement de
// pointeur écrit dans quel paramètre. Reste dans le composant ce qui ne se vérifie qu'à l'œil : les
// rectangles, les triangles de fondu, les libellés.
//
// AUCUN COMPORTEMENT N'EST CHANGÉ ICI. C'est un déplacement de lignes, y compris dans ses coins :
// une valeur de paramètre vide vaut zéro et non son défaut, `Number("")` valant zéro, et le test le
// consigne tel quel plutôt que de le corriger au passage.

/** La durée d'une piste, telle que la dernière exécution l'a mesurée. */
export interface PisteMontage {
  piste: number;
  duree: number;
}

/** Une piste prête à dessiner : sa place, sa durée, ses fondus, en secondes. */
import { dureeSonnante, type Morceau } from "../audio/montage-morceaux";

export interface LigneMontage {
  k: number;
  /**
   * L'identité du MORCEAU que cette barre dessine, quand la ligne de temps en porte.
   *
   * Absente pour une ligne de temps qui ne connaît que ses ports, où une barre EST une piste. Quand
   * elle est là, plusieurs barres peuvent partager la même piste `k` : c'est ce qui distingue un
   * morceau, qu'on coupe et qu'on déplace, d'un port, qui apporte le son.
   */
  id?: string;
  /** Faux tant que le graphe n'a pas tourné : la durée affichée est alors nominale. */
  connue: boolean;
  duree: number;
  /**
   * Où cette barre commence DANS son son, en secondes. Zéro pour une barre qui le prend au début.
   *
   * L'onde dessinée dans la barre s'en sert : un morceau coupé ne montre que sa part du son, faute
   * de quoi deux morceaux issus d'une même coupe montreraient deux fois l'onde entière.
   */
  dans?: number;
  debut: number;
  gain: number;
  transposition: number;
  entree: number;
  sortie: number;
}

/** La durée montrée d'une piste dont on ne connaît pas encore la longueur. */
export const DUREE_INCONNUE = 2;

/** Ce qu'une poignée de barre règle. */
export type QuoiPoignee = "entree" | "sortie" | "duree";

/**
 * Ce qu'une barre veut dire, qui n'est pas le même selon le composant.
 *
 * LA LARGEUR EST LA SEULE VRAIE DIFFÉRENCE, et elle en entraîne toutes les autres. Au Montage, la
 * largeur d'une barre est la durée MESURÉE du son branché : elle vient de l'exécution, on ne la
 * règle pas, et les coins servent alors aux fondus. À la Maquette, la largeur EST un réglage, celui
 * qui étire le contenu de la boîte : la tirer l'écrit, et il n'y a pas de fondu à régler.
 *
 * Le reste, la règle, l'échelle, le déplacement et l'arrondi, ne dépend pas de cette différence :
 * c'est pourquoi un seul composant les porte, plutôt que deux qui finiraient par ne plus se
 * ressembler.
 */
export interface ModeleLigne {
  /** D'où vient la largeur d'une barre. */
  largeur: "mesuree" | "reglee";
  /** Les poignées portées par une barre, et ce qu'elles écrivent. */
  poignees: readonly QuoiPoignee[];
  /** Le nombre écrit dans la barre après le début, quand il n'est pas nul. */
  legende: "gain" | "transposition" | "aucune";
  /** La clé du message montré quand rien n'est branché. */
  cleVide: string;
  /** La clé du nom donné à la figure, pour qui l'écoute plutôt que de la voir. */
  cleTitre: string;
}

export const MODELE_MONTAGE: ModeleLigne = {
  largeur: "mesuree", poignees: ["entree", "sortie"], legende: "gain",
  cleVide: "montage.aucunePiste", cleTitre: "montage.ligneTemps",
};

export const MODELE_MAQUETTE: ModeleLigne = {
  largeur: "reglee", poignees: ["duree"], legende: "transposition",
  cleVide: "maquette.aucuneBoite", cleTitre: "maquette.ligneTemps",
};

/** Un pas de graduation lisible pour une étendue donnée : 1, 2, 5, 10… secondes. */
export function pasDeGraduation(etendueS: number, largeurPx: number): number {
  const brut = etendueS / Math.max(1, largeurPx / 70);
  const puissance = Math.pow(10, Math.floor(Math.log10(Math.max(brut, 1e-3))));
  for (const m of [1, 2, 5, 10]) if (m * puissance >= brut) return m * puissance;
  return 10 * puissance;
}

/** Lit un paramètre numérique du nœud, ou son défaut quand il n'est pas un nombre. */
const nombre = (params: Record<string, unknown>, nom: string, defaut: number): number => {
  const v = Number(params[nom]);
  return Number.isFinite(v) ? v : defaut;
};

/**
 * Les barres que des morceaux dessinent : une par morceau, plusieurs pouvant partager une piste.
 *
 * LA DURÉE D'UNE BARRE EST CE QUE SON MORCEAU FAIT SONNER, et non la durée du son reçu : c'est
 * précisément ce qui distingue un morceau d'un port. Tant que le graphe n'a pas tourné, la durée du
 * son est inconnue, et une barre sans durée propre retombe alors sur la durée nominale, comme une
 * piste le fait déjà.
 *
 * L'ORDRE EST CELUI DES MORCEAUX, qui est celui où ils ont été posés : un morceau collé se dessine
 * donc par-dessus les précédents, ce qui est aussi l'ordre dans lequel on le désigne au clic.
 */
export function disposerMorceaux(
  morceaux: readonly Morceau[], pistes: readonly PisteMontage[],
): LigneMontage[] {
  return morceaux.map((m) => {
    const connue = pistes.find((p) => p.piste === m.piste);
    const source = connue?.duree ?? DUREE_INCONNUE;
    return {
      k: m.piste,
      id: m.id,
      connue: !!connue,
      duree: connue ? dureeSonnante(m, source) : (m.duree > 0 ? m.duree : DUREE_INCONNUE),
      dans: m.dans,
      debut: m.debut,
      gain: m.gain,
      transposition: 0,
      entree: m.entree / 1000,
      sortie: m.sortie / 1000,
    };
  });
}

/**
 * Les pistes branchées, dans l'ordre de leur numéro et non dans celui des câbles.
 *
 * L'ORDRE EST CELUI DU NUMÉRO, et c'est la même raison que pour les réglages du nœud : l'ordre dans
 * lequel les arêtes ont été tirées ne se voit nulle part, et la piste 3 doit rester à sa place.
 */
export function disposerPistes(
  branchees: readonly number[], pistes: readonly PisteMontage[], params: Record<string, unknown>,
  modele: ModeleLigne = MODELE_MONTAGE,
): LigneMontage[] {
  return [...branchees].sort((a, b) => a - b).map((k) => {
    const connue = pistes.find((p) => p.piste === k);
    const mesuree = connue?.duree ?? DUREE_INCONNUE;
    // UNE DURÉE RÉGLÉE À ZÉRO VEUT DIRE « CELLE DU CONTENU », et c'est la mesure qui la donne. La
    // barre montre donc la largeur que la boîte a vraiment, et tirer son bord part de là plutôt
    // que de zéro, ce qui obligerait à la reconstruire à chaque fois.
    const reglee = nombre(params, `Durée ${k + 1}`, 0);
    return {
      k,
      connue: !!connue,
      duree: modele.largeur === "reglee" && reglee > 0 ? reglee : mesuree,
      debut: nombre(params, `Début ${k + 1}`, k * 2),
      gain: nombre(params, `Gain ${k + 1}`, 0),
      transposition: nombre(params, `Transposition ${k + 1}`, 0),
      entree: nombre(params, `Fondu entrée ${k + 1}`, 10) / 1000,
      sortie: nombre(params, `Fondu sortie ${k + 1}`, 10) / 1000,
    };
  });
}

/** L'étendue montrée : de quel instant à quel instant. */
export interface Vue {
  debutMin: number;
  etendue: number;
}

/**
 * L'échelle qui fait tenir toutes les pistes, avec un peu d'air à droite.
 *
 * ZÉRO EST TOUJOURS VISIBLE, même si toutes les pistes commencent plus tard : sans lui on ne
 * saurait pas de combien elles sont décalées. Une étendue plancher de quatre secondes empêche
 * qu'une seule piste très courte n'occupe toute la largeur.
 */
export function echelle(lignes: readonly LigneMontage[]): Vue {
  const debutMin = Math.min(0, ...lignes.map((l) => l.debut));
  const finMax = Math.max(...lignes.map((l) => l.debut + l.duree));
  return { debutMin, etendue: Math.max(4, (finMax - debutMin) * 1.08) };
}

/** Ce qu'on tient pendant un geste. */
export interface Geste {
  piste: number;
  quoi: "corps" | QuoiPoignee;
  /** La valeur du réglage au moment où le geste a commencé. */
  valeur0: number;
}

/** La valeur que porte une poignée au repos, c'est-à-dire ce qu'un geste va faire varier. */
export function valeurAuRepos(quoi: Geste["quoi"], ligne: LigneMontage): number {
  if (quoi === "corps") return ligne.debut;
  if (quoi === "entree") return ligne.entree;
  if (quoi === "sortie") return ligne.sortie;
  return ligne.duree;
}

/**
 * Ce qu'un geste écrit, et dans quel réglage.
 *
 * `ds` EST DÉJÀ EN SECONDES : la conversion depuis les pixels appartient à la vue, qui seule connaît
 * son échelle. La séparation tient à ce que l'arrondi et les bornes, eux, ne dépendent pas d'elle.
 *
 * LE CORPS S'ARRONDIT AU CENTIÈME DE SECONDE, assez fin pour placer et assez rond pour se relire.
 * Les fondus s'écrivent en millisecondes entières et se bornent à la durée de la piste : un fondu
 * plus long que le son n'a pas de sens, et tirer au-delà ne doit pas écrire une valeur qu'il
 * faudrait corriger ensuite.
 */
export function valeurDuGeste(
  geste: Geste, ds: number, ligne: LigneMontage,
): { nom: string; valeur: number } {
  const rang = ligne.k + 1;
  if (geste.quoi === "corps") {
    return { nom: `Début ${rang}`, valeur: Math.round((geste.valeur0 + ds) * 100) / 100 };
  }
  // LE BORD DROIT ÉCRIT LA DURÉE, en secondes et au centième comme le début : c'est un instant de
  // la même ligne de temps, et deux précisions différentes sur une même règle se verraient. Elle ne
  // descend pas sous un centième, une boîte de durée nulle n'ayant plus de bord à saisir.
  if (geste.quoi === "duree") {
    return { nom: `Durée ${rang}`, valeur: Math.max(0.01, Math.round((geste.valeur0 + ds) * 100) / 100) };
  }
  // Tirer le coin gauche vers la droite allonge le fondu d'entrée ; le coin droit vers la gauche,
  // celui de sortie.
  const v = geste.quoi === "entree" ? geste.valeur0 + ds : geste.valeur0 - ds;
  const borne = Math.max(0, Math.min(ligne.duree, v));
  return {
    nom: geste.quoi === "entree" ? `Fondu entrée ${rang}` : `Fondu sortie ${rang}`,
    valeur: Math.round(borne * 1000),
  };
}
