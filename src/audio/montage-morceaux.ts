// audio/montage-morceaux.ts — Les morceaux d'un montage : ce qu'on coupe, déplace, copie et colle.
//
// POURQUOI CE MODULE EXISTE. Demandé par Fabien : « pourrait-on activer le copier coller couper sur
// le node montage », précisé en « sur les bandes de son ou sur des parties de bande de son ». Or une
// bande du montage n'était pas un morceau : c'était un PORT. Sa largeur était la durée mesurée du son
// arrivant sur son câble, et ses seuls réglages étaient son instant, son niveau et ses deux fondus.
// « Une partie de bande » n'avait donc aucune existence : rien ne disait où un son commence dans
// lui-même, ni combien on en joue, et rien ne permettait d'en poser deux sur la même bande.
//
// CE QU'UN MORCEAU AJOUTE, ET C'EST TOUT CE QU'IL AJOUTE : un endroit où il commence DANS le son
// reçu, et une durée. De ces deux nombres viennent la coupe, le copier-coller, et la possibilité
// d'en poser plusieurs sur un même port. Le port, lui, ne change pas de sens : il reste ce qui
// APPORTE le son, et plusieurs morceaux peuvent y puiser.
//
// LA DURÉE ZÉRO VEUT DIRE « JUSQU'À LA FIN DU SON », convention que la ligne de temps emploie déjà
// pour la maquette. Elle n'est pas une commodité : c'est elle qui permet à un graphe enregistré
// avant ce module de se relire sans rien perdre, le son branché pouvant changer de durée d'une
// exécution à l'autre sans que le morceau ait à être réécrit.
//
// TOUT EST PUR ICI, sans React ni Web Audio : ce sont les seules parties dont la justesse se
// démontre. Qu'une coupe conserve exactement ce qui sonnait ne se vérifie pas à l'oreille sur une
// pièce de cinquante secondes ; cela se vérifie sur des nombres.

/** Un morceau posé sur la ligne de temps du montage. */
export interface Morceau {
  /** Identité stable : la sélection, le presse-papier et le dessin la suivent d'un rendu à l'autre. */
  id: string;
  /** Le port d'où vient le son. Plusieurs morceaux peuvent puiser au même. */
  piste: number;
  /** L'instant où il commence sur la ligne de temps, en secondes. Peut être négatif. */
  debut: number;
  /** Où il commence DANS le son reçu, en secondes. Jamais négatif. */
  dans: number;
  /** Ce qu'il en joue, en secondes. Zéro veut dire « jusqu'à la fin du son ». */
  duree: number;
  /** Son niveau, en décibels. */
  gain: number;
  /** Ses fondus, en millisecondes. */
  entree: number;
  sortie: number;
}

/** Les réglages d'un montage tels qu'ils étaient écrits avant les morceaux. */
export type ParametresMontage = Record<string, unknown>;

const nombre = (params: ParametresMontage, nom: string, defaut: number): number => {
  const v = Number(params[nom]);
  return Number.isFinite(v) ? v : defaut;
};

/**
 * Ce qu'un morceau fait sonner, en secondes, une fois connue la durée du son reçu.
 *
 * ZÉRO VEUT DIRE « TOUT CE QUI RESTE », et le reste se compte depuis `dans`. Un morceau dont le
 * `dans` dépasse le son ne sonne pas du tout, ce que ce calcul rend par zéro plutôt que par un
 * nombre négatif dont chaque appelant aurait à se méfier.
 */
export function dureeSonnante(m: Morceau, dureeSource: number): number {
  const reste = Math.max(0, dureeSource - Math.max(0, m.dans));
  return m.duree > 0 ? Math.min(m.duree, reste) : reste;
}

/**
 * Les morceaux d'un montage qui n'en a pas encore : un par piste branchée, le son entier.
 *
 * C'EST LA MIGRATION, ET ELLE NE S'ÉCRIT NULLE PART. Un graphe enregistré avant ce module ne porte
 * que ses réglages ; ses morceaux se déduisent d'eux à l'ouverture, et le montage sonne exactement
 * comme avant. Rien n'est réécrit sur le disque tant que l'on ne touche à rien : un projet ancien
 * qu'on rouvre sans y toucher reste lisible par une version ancienne.
 */
export function morceauxDepuisParametres(
  branchees: readonly number[], params: ParametresMontage,
): Morceau[] {
  return [...branchees].sort((a, b) => a - b).map((k) => ({
    id: `p${k}`,
    piste: k,
    debut: nombre(params, `Début ${k + 1}`, k * 2),
    dans: 0,
    duree: 0,
    gain: nombre(params, `Gain ${k + 1}`, 0),
    entree: nombre(params, `Fondu entrée ${k + 1}`, 10),
    sortie: nombre(params, `Fondu sortie ${k + 1}`, 10),
  }));
}

/**
 * Les morceaux posés, COMPLÉTÉS d'un morceau pour chaque piste branchée qui n'en a pas.
 *
 * CE QUI SE PASSAIT SANS CELA, ET LE DÉFAUT TIENT EN UN MOT : « OU ». Les morceaux posés
 * remplaçaient les réglages au lieu de les compléter, de sorte qu'un seul morceau quelque part
 * rendait muets les réglages de TOUTES les pistes. Relevé par Fabien, en quatre symptômes qui n'en
 * faisaient qu'un :
 *
 *   — une piste branchée APRÈS un premier découpage n'apparaissait pas, n'ayant pas de morceau et
 *     ne pouvant plus s'en déduire un ;
 *   — d'où l'impression qu'il fallait réserver le bon nombre de pistes d'avance ;
 *   — les glissières de gain paraissaient mortes, y compris sur les pistes auxquelles on n'avait
 *     jamais touché ;
 *   — et les fondus semblaient obéir à deux systèmes sans rapport, celui des réglages étant
 *     simplement hors circuit.
 *
 * LA NOTICE DISAIT DÉJÀ LA BONNE RÈGLE : les quatre réglages d'une piste « décrivent l'état d'un
 * montage qu'on n'a pas encore découpé, et cessent d'agir dès qu'on y touche ». Dès qu'on touche à
 * CETTE piste-là, non dès qu'on touche à une quelconque. C'est cette règle que ce calcul applique.
 *
 * LES IDENTIFIANTS NE SE HEURTENT PAS : un morceau déduit prend un nom qu'aucun posé ne porte, la
 * sélection et le presse-papier s'y retrouvant par le nom.
 */
export function morceauxCompletes(
  poses: readonly Morceau[], branchees: readonly number[], params: ParametresMontage,
  videes: readonly number[] = [],
): Morceau[] {
  const avec = new Set(poses.map((m) => m.piste));
  const vide = new Set(videes);
  const manquantes = [...branchees]
    .filter((k) => !avec.has(k) && !vide.has(k))
    .sort((a, b) => a - b);
  if (manquantes.length === 0) return [...poses];
  const out = [...poses];
  for (const neuf of morceauxDepuisParametres(manquantes, params)) {
    out.push({ ...neuf, id: nouvelId(out, "p") });
  }
  return out.sort((a, b) => a.piste - b.piste || a.debut - b.debut);
}

/** Ce qu'un geste sur la ligne de temps laisse au nœud : son découpage, et ses pistes vidées. */
export interface EcritureMontage {
  morceaux: Morceau[];
  /** Les pistes que l'on a vidées de tous leurs morceaux, et qui ne doivent donc pas se redéduire. */
  videes: number[];
}

/** Deux morceaux font-ils entendre la même chose ? Leur nom ne compte pas, il ne sert qu'à se retrouver. */
function memeMorceau(a: Morceau, b: Morceau): boolean {
  return a.piste === b.piste && a.debut === b.debut && a.dans === b.dans && a.duree === b.duree
    && a.gain === b.gain && a.entree === b.entree && a.sortie === b.sortie;
}

/**
 * Ce qu'il faut ÉCRIRE quand la ligne de temps rend sa liste : les pistes TOUCHÉES, et elles seules.
 *
 * LE DÉFAUT QUE CECI RÉPARE, ET QUE LA COMPLÉTION SEULE LAISSAIT ENTIER. La ligne de temps travaille
 * sur la liste complétée, donc elle la REND complétée : le premier geste sur une barre, n'importe
 * laquelle, écrivait un morceau pour CHAQUE piste branchée. Toutes les pistes devenaient alors des
 * pistes découpées, et leurs quatre réglages cessaient d'agir d'un coup. **Mesuré : après un
 * déplacement sur la piste 1, la glissière « Gain 2 » portée à moins vingt laissait la piste 2 à
 * zéro, là où la même glissière donne bien moins vingt sans ce geste.**
 *
 * LA RÈGLE EST CELLE DE LA NOTICE, APPLIQUÉE À L'ÉCRITURE comme elle l'était déjà à la lecture : les
 * quatre réglages d'une piste cessent d'agir dès qu'on touche à CETTE piste-là. Une piste dont les
 * morceaux sont encore exactement ceux que ses réglages décrivent n'est donc pas écrite.
 *
 * UNE PISTE DÉBRANCHÉE S'ÉCRIT TOUJOURS : ses réglages ne la décrivent plus, puisqu'il n'y en a plus
 * pour elle, et la perdre effacerait un découpage qu'un câble rebranché doit retrouver.
 *
 * ET LES PISTES VIDÉES SE DISENT À PART, parce qu'une piste sans morceau ne peut pas se dire par un
 * morceau. Sans cette liste, supprimer le dernier morceau d'une piste la laissait absente de ce qui
 * s'écrit, c'est-à-dire exactement dans l'état d'une piste jamais touchée : elle se redéduisait de
 * ses réglages au relevé suivant, et le morceau revenait. **Mesuré : après suppression du morceau de
 * la piste 3, la relecture rendait les pistes 0, 1 et 2.**
 */
export function morceauxAEcrire(
  affiches: readonly Morceau[], branchees: readonly number[], params: ParametresMontage,
  videesAvant: readonly number[] = [],
): EcritureMontage {
  const derives = new Map(morceauxDepuisParametres(branchees, params).map((m) => [m.piste, m]));
  const parPiste = new Map<number, Morceau[]>();
  for (const m of affiches) {
    const liste = parPiste.get(m.piste);
    if (liste) liste.push(m);
    else parPiste.set(m.piste, [m]);
  }
  const out: Morceau[] = [];
  for (const [piste, liste] of parPiste) {
    const derive = derives.get(piste);
    if (derive && liste.length === 1 && memeMorceau(liste[0], derive)) continue;
    out.push(...liste);
  }
  // UNE PISTE BRANCHÉE ABSENTE DE CE QU'ON AFFICHE A ÉTÉ VIDÉE, et il n'y a pas d'autre cas : la
  // lecture donne un morceau à toute piste branchée qui n'en a pas. Une piste vidée puis débranchée
  // garde son état, sans quoi rebrancher le câble ferait revenir ce qu'on avait retiré.
  const presentes = new Set(affiches.map((m) => m.piste));
  const encore = new Set(branchees);
  const videes = [
    ...branchees.filter((k) => !presentes.has(k)),
    ...videesAvant.filter((k) => !encore.has(k)),
  ].sort((a, b) => a - b);
  return { morceaux: out.sort((a, b) => a.piste - b.piste || a.debut - b.debut), videes };
}

/** Un identifiant qu'aucun morceau ne porte encore. */
export function nouvelId(existants: readonly Morceau[], graine = "m"): string {
  const pris = new Set(existants.map((m) => m.id));
  for (let i = 1; ; i++) {
    const id = `${graine}${i}`;
    if (!pris.has(id)) return id;
  }
}

/**
 * Coupe un morceau à un instant, et rend les deux qui le remplacent.
 *
 * RIEN N'EST PERDU NI AJOUTÉ, et c'est l'invariant de l'opération : les deux morceaux se suivent
 * sans trou ni recouvrement, et la somme de ce qu'ils font sonner vaut exactement ce que l'original
 * faisait sonner. Le second commence dans le son là où le premier s'arrête, ce qui est la seule
 * façon d'obtenir une coupe qu'on n'entend pas.
 *
 * Une coupe demandée hors du morceau ne coupe rien et le rend seul : couper au bord ne produirait
 * qu'un morceau vide, qui se dessinerait comme un trait et ne s'attraperait plus.
 */
export function couperMorceau(m: Morceau, instant: number, dureeSource: number): Morceau[] {
  const longueur = dureeSonnante(m, dureeSource);
  const ou = instant - m.debut;
  if (!(ou > 0 && ou < longueur)) return [m];
  return [
    { ...m, duree: ou },
    { ...m, id: `${m.id}-b`, debut: instant, dans: Math.max(0, m.dans) + ou, duree: longueur - ou },
  ];
}

/**
 * Coupe à un instant tous les morceaux que cet instant traverse.
 *
 * C'est le geste du banc de montage : la tête de lecture est posée, et la coupe tombe sur tout ce
 * qui passe dessous. Les identifiants engendrés ne peuvent pas se heurter à ceux qui existent.
 */
export function couperA(
  morceaux: readonly Morceau[], instant: number, dureeDe: (piste: number) => number,
): Morceau[] {
  const sortie: Morceau[] = [];
  for (const m of morceaux) {
    const deux = couperMorceau(m, instant, dureeDe(m.piste));
    if (deux.length === 2) {
      deux[1] = { ...deux[1], id: nouvelId([...morceaux, ...sortie], `${m.id}-`) };
    }
    sortie.push(...deux);
  }
  return sortie;
}

/**
 * Le morceau qu'un instant traverse sur une piste donnée, ou `null`.
 *
 * LE DERNIER POSÉ L'EMPORTE quand deux se recouvrent : c'est celui qu'on voit dessus, et cliquer
 * doit prendre ce que l'on voit.
 */
export function morceauA(
  morceaux: readonly Morceau[], piste: number, instant: number, dureeDe: (piste: number) => number,
): Morceau | null {
  let trouve: Morceau | null = null;
  for (const m of morceaux) {
    if (m.piste !== piste) continue;
    const longueur = dureeSonnante(m, dureeDe(m.piste));
    if (instant >= m.debut && instant < m.debut + longueur) trouve = m;
  }
  return trouve;
}

/**
 * Colle des morceaux à un instant, en gardant leurs écarts.
 *
 * L'INSTANT REÇOIT LE PLUS PRÉCOCE, et les autres gardent leur distance à celui-là : coller un
 * groupe doit reposer le groupe, non l'empiler sur un seul point. Chaque morceau collé reçoit un
 * identifiant neuf, sans quoi la sélection désignerait deux morceaux à la fois.
 */
export function collerMorceaux(
  presse: readonly Morceau[], instant: number, existants: readonly Morceau[],
): Morceau[] {
  if (!presse.length) return [];
  const origine = Math.min(...presse.map((m) => m.debut));
  const sortie: Morceau[] = [];
  for (const m of presse) {
    sortie.push({ ...m, id: nouvelId([...existants, ...sortie]), debut: instant + (m.debut - origine) });
  }
  return sortie;
}

/** Un morceau déplacé dans le temps, sans toucher à ce qu'il joue du son. */
export function deplacerMorceau(m: Morceau, versInstant: number): Morceau {
  return { ...m, debut: versInstant };
}

/** Ce qu'un geste sur une barre règle. Les mêmes trois que la ligne de temps connaît déjà. */
export type GesteMorceau = "corps" | "entree" | "sortie";

/**
 * Le morceau qu'un geste produit, à partir de celui qu'on a saisi.
 *
 * LE GESTE PART TOUJOURS DE L'ÉTAT DU DÉBUT, et non du précédent : accumuler les petits
 * déplacements ferait dériver la barre du pointeur, d'autant plus vite que la main tremble. On
 * additionne donc un écart total à une valeur figée au moment de la prise.
 *
 * LE FONDU DE SORTIE SE TIRE À REBOURS, et c'est la seule dissymétrie : sa poignée est sur le bord
 * droit, donc tirer vers la gauche l'allonge. Les fondus ne peuvent pas être négatifs ; le début,
 * lui, le peut, un montage ayant le droit de commencer avant zéro.
 */
export function appliquerGeste(saisi: Morceau, quoi: GesteMorceau, ecartSec: number): Morceau {
  if (quoi === "corps") return { ...saisi, debut: saisi.debut + ecartSec };
  if (quoi === "entree") return { ...saisi, entree: Math.max(0, saisi.entree + ecartSec * 1000) };
  return { ...saisi, sortie: Math.max(0, saisi.sortie - ecartSec * 1000) };
}

/** Un morceau remplacé dans la liste, les autres laissés tels quels. */
export function remplacerMorceau(morceaux: readonly Morceau[], remplacant: Morceau): Morceau[] {
  return morceaux.map((m) => (m.id === remplacant.id ? remplacant : m));
}

/** La liste sans le morceau nommé. */
export function retirerMorceau(morceaux: readonly Morceau[], id: string): Morceau[] {
  return morceaux.filter((m) => m.id !== id);
}

/**
 * L'étendue qu'occupent des morceaux : du plus précoce à la fin du plus tardif.
 *
 * Un montage peut commencer avant zéro, un début négatif étant permis : l'étendue part donc du plus
 * petit début et non de zéro.
 */
export function etendueDesMorceaux(
  morceaux: readonly Morceau[], dureeDe: (piste: number) => number,
): { debut: number; fin: number } {
  if (!morceaux.length) return { debut: 0, fin: 0 };
  let debut = Infinity, fin = -Infinity;
  for (const m of morceaux) {
    debut = Math.min(debut, m.debut);
    fin = Math.max(fin, m.debut + dureeSonnante(m, dureeDe(m.piste)));
  }
  return { debut, fin };
}

/**
 * Un morceau ramené dans ce qui a un sens, une fois connue la durée de son son.
 *
 * `dans` NE PEUT PAS ÊTRE NÉGATIF : le son n'existe pas avant son début, et un `dans` négatif ferait
 * sonner du silence en tête sans que rien ne le dise. Un début négatif sur la LIGNE DE TEMPS reste
 * permis, lui, et c'est autre chose : le montage commence alors avant zéro.
 */
export function normaliserMorceau(m: Morceau, dureeSource: number): Morceau {
  const dans = Math.max(0, Math.min(m.dans, dureeSource));
  const reste = Math.max(0, dureeSource - dans);
  return {
    ...m,
    dans,
    duree: m.duree > 0 ? Math.min(m.duree, reste) : 0,
    entree: Math.max(0, m.entree),
    sortie: Math.max(0, m.sortie),
  };
}
