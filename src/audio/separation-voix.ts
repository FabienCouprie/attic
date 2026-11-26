// audio/separation-voix.ts — Retrouver les lignes dans un flux qui les mêle.
//
// LE PROBLÈME, ET POURQUOI IL N'EST PAS TRIVIAL. Un fichier MIDI, une improvisation enregistrée, une
// réduction de partition donnent un tas de notes datées. L'oreille y entend deux ou trois lignes ;
// rien dans les données ne dit laquelle est laquelle. C'est ce qu'OpenMusic appelle Streamsep, et le
// tableau de `COMPOSITION-ASSISTEE.md` en donnait l'obstacle pour « la représentation » : tant que
// la note ne savait pas porter sa voix, le résultat n'avait nulle part où aller.
//
// D'OÙ VIENT LA MÉTHODE. Du principe des CONTIGS publié par Elaine Chew et Xiaodan Wu, « Separating
// Voices in Polyphonic Music: A Contig Mapping Approach », CMMR 2004. Son idée tient en trois
// temps : découper la pièce là où le nombre de notes qui sonnent change, ordonner par hauteur à
// l'intérieur de chaque tranche, puis recoller les tranches en déplaçant le moins possible. Les
// tranches où le nombre de voix est maximal servent d'ancres, parce que c'est là que l'ordre par
// hauteur a le plus de chances d'être le bon.
//
// CE QUI VIENT DE LA PUBLICATION ET CE QUI EST DE NOUS. Le découpage, l'ordre par hauteur, les
// ancres et le recollement au moindre déplacement sont d'eux. Le détail du recollement quand deux
// tranches n'ont pas le même nombre de voix est de nous : un alignement qui préserve l'ordre,
// calculé par programmation dynamique, où sauter une voix coûte un forfait. Il préserve l'ordre
// parce qu'à une frontière deux voix qui se croiseraient ne s'entendraient pas comme deux voix.
//
// UNE VOIX QUI COMMENCE NE PREND PAS DE NUMÉRO NEUF. Jusqu'au 2026-11-25, chaque note que
// l'alignement ne reliait à rien en ouvrait un, si bien qu'une ligne qui se tait puis reprend en
// faisait deux ; le classement par hauteur moyenne mettait alors en tête les morceaux courts et
// aigus, et versait tout ce qui dépassait la plus grande polyphonie dans la dernière voix. Sur la
// Gnossienne 1 de Satie, 521 morceaux pour 5 voix, et 804 notes sur 832 dans la plus grave. Les
// voix sont désormais celles de la tranche d'ancrage, ni plus ni moins : chaque tranche y place ses
// notes dans l'ordre des hauteurs, une ligne qui se prolonge garde la sienne tant que l'ordre le
// permet, et une note qui commence prend la voix libre dont la dernière hauteur est la plus proche.
//
// LA FAIBLESSE EST CONNUE, ET ELLE TIENT AUX DONNÉES PLUS QU'À LA MÉTHODE. L'ordre par hauteur
// suppose que les voix ne se croisent pas ; quand elles le font, elles sont interverties, et leurs
// auteurs le signalent. Mais deux lignes qui se traversent laissent EXACTEMENT les mêmes hauteurs
// que deux lignes qui se touchent et rebroussent chemin : l'information n'est pas dans le flux, et
// aucune mesure prise sur les seules hauteurs ne saurait dire laquelle des deux a été jouée. Ce qui
// se compte et se rend est donc l'UNISSON, où l'ordre ne décide plus rien et où le doute est réel.

import type { Note } from "./note";

export interface OptionsSeparation {
  /** Le nombre de voix au plus. À zéro, celui que la pièce demande. */
  voixMax?: number;
  /** Écart en deçà duquel deux instants sont tenus pour le même, en secondes. */
  tolerance?: number;
  /**
   * Ce que coûte une voix qui commence ou s'arrête, en demi-tons.
   *
   * IL SE COMPARE À UN DÉPLACEMENT DE HAUTEUR, puisque c'est à lui qu'il s'oppose : bas, une ligne
   * se coupe en morceaux dès qu'elle fait un saut ; haut, deux lignes distinctes se soudent en une
   * plutôt que d'admettre qu'une voix s'est tue.
   */
  coutEntreeSortie?: number;
}

export interface Separation {
  /** Les mêmes notes, chacune sachant sa voix. */
  notes: Note[];
  /** Combien de voix ont été trouvées. */
  voix: number;
  /** Combien de tranches la pièce a demandées. */
  contigs: number;
  /**
   * Combien d'instants où deux voix sonnent à la même hauteur.
   *
   * C'EST LÀ QUE L'ORDRE PAR HAUTEUR NE DÉCIDE PLUS RIEN, et c'est le seul doute qui se mesure
   * vraiment. Deux voix à l'unisson peuvent se quitter dans un sens comme dans l'autre, et rien
   * dans les hauteurs ne dit lequel. Un nombre élevé annonce donc un résultat à relire.
   *
   * UN CROISEMENT, LUI, NE SE DÉTECTE PAS. Deux lignes qui se traversent laissent exactement les
   * mêmes hauteurs que deux lignes qui se touchent et rebroussent chemin ; l'information n'est pas
   * dans les données. Le procédé rend la seconde lecture, ce que ses auteurs signalent, et compter
   * les croisements « refusés » n'y changerait rien : pour deux suites triées, l'appariement qui
   * garde l'ordre minimise toujours la somme des écarts, donc aucun croisement n'est jamais moins
   * coûteux et un tel compteur annoncerait zéro sur une pièce entièrement croisée.
   */
  unissons: number;
}

/** Une tranche : les notes qui sonnent ensemble, du grave à l'aigu. */
interface Tranche {
  debut: number;
  fin: number;
  /** Les notes qui sonnent, triées du grave à l'aigu. */
  notes: Note[];
}

/** Les instants où quelque chose change : un début ou une fin de note. */
function frontieres(notes: readonly Note[], tolerance: number): number[] {
  const bruts = [...notes.map((n) => n.debut), ...notes.map((n) => n.fin)].sort((a, b) => a - b);
  const sortie: number[] = [];
  for (const t of bruts) {
    if (sortie.length === 0 || t - sortie[sortie.length - 1] > tolerance) sortie.push(t);
  }
  return sortie;
}

/**
 * Découpe la pièce en tranches sur lesquelles le même ensemble de notes sonne.
 *
 * LA TRANCHE EST LUE EN SON MILIEU, et non à son bord. Une note qui se termine exactement là où la
 * suivante commence sonnerait aux deux bords ou à aucun selon le sens des comparaisons ; au milieu
 * la question ne se pose pas.
 */
function trancher(notes: readonly Note[], tolerance: number): Tranche[] {
  const bornes = frontieres(notes, tolerance);
  const tranches: Tranche[] = [];
  for (let i = 0; i + 1 < bornes.length; i++) {
    const debut = bornes[i], fin = bornes[i + 1];
    const milieu = (debut + fin) / 2;
    const dedans = notes.filter((n) => n.debut <= milieu && n.fin > milieu)
      .sort((a, b) => a.note - b.note);
    if (dedans.length > 0) tranches.push({ debut, fin, notes: dedans });
  }
  return tranches;
}

/**
 * Regroupe les tranches voisines qui portent exactement les mêmes notes.
 *
 * Deux tranches successives ne diffèrent que par ce qui a commencé ou fini entre elles ; quand rien
 * n'a changé, elles n'en font qu'une, et le recollement a d'autant moins de frontières à traiter.
 */
function fondre(tranches: readonly Tranche[]): Tranche[] {
  const sortie: Tranche[] = [];
  for (const t of tranches) {
    const derniere = sortie[sortie.length - 1];
    const memes = derniere
      && derniere.notes.length === t.notes.length
      && derniere.notes.every((n, i) => n === t.notes[i]);
    if (memes) derniere.fin = t.fin;
    else sortie.push({ ...t, notes: [...t.notes] });
  }
  return sortie;
}

/**
 * Aligne les voix de deux tranches voisines, sans jamais les croiser.
 *
 * LE RÉSULTAT DIT, POUR CHAQUE VOIX DE DROITE, QUELLE VOIX DE GAUCHE LA PROLONGE, ou `null` quand
 * elle commence là. L'alignement préserve l'ordre du grave à l'aigu : à une frontière, deux voix
 * qui se croiseraient ne s'entendraient pas comme deux voix mais comme un échange, et aucun des
 * deux chemins n'est distinguable de l'autre par les seules hauteurs.
 *
 * C'est la programmation dynamique de l'alignement de deux suites : avancer des deux côtés coûte
 * l'écart de hauteur, n'avancer que d'un côté coûte le forfait d'une voix qui naît ou s'éteint.
 */
export function alignerVoix(
  gauche: readonly number[], droite: readonly number[], forfait: number,
): (number | null)[] {
  const n = gauche.length, m = droite.length;
  const INF = Infinity;
  const cout: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  const venu: ("diag" | "haut" | "gauche" | null)[][] =
    Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cout[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (cout[i][j] === INF) continue;
      const poser = (di: number, dj: number, ajout: number, d: "diag" | "haut" | "gauche") => {
        const c = cout[i][j] + ajout;
        if (i + di <= n && j + dj <= m && c < cout[i + di][j + dj]) {
          cout[i + di][j + dj] = c;
          venu[i + di][j + dj] = d;
        }
      };
      if (i < n && j < m) poser(1, 1, Math.abs(gauche[i] - droite[j]), "diag");
      if (i < n) poser(1, 0, forfait, "haut");
      if (j < m) poser(0, 1, forfait, "gauche");
    }
  }

  const sortie: (number | null)[] = new Array(m).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const d = venu[i][j];
    if (d === "diag") { sortie[j - 1] = i - 1; i--; j--; }
    else if (d === "haut") i--;
    else if (d === "gauche") j--;
    else break;
  }
  return sortie;
}

/**
 * Place les notes d'une tranche dans les voix de l'ancre, sans jamais les croiser.
 *
 * `hauteurs` vont du grave à l'aigu. `liees` dit, pour chaque note, la voix de la note qui la
 * prolonge dans la tranche voisine, ou -1 quand elle commence là ; `tenues` dit si c'est la même note
 * qui sonne encore. `dernieres` donne la dernière hauteur entendue dans chaque voix, et leur nombre
 * est celui des voix. Le résultat donne à chaque note sa voix, en ordre strictement croissant.
 *
 * LES TROIS EXIGENCES SONT RANGÉES, ET NON PESÉES. D'abord qu'une note tenue ne change pas de voix,
 * puis qu'une ligne qui se prolonge garde la sienne, enfin qu'une note qui commence aille au plus près
 * de ce que sa voix a chanté en dernier. Chaque rang coûte plus que tout ce que le suivant peut
 * réunir, si bien qu'aucune somme d'écarts de hauteur ne rachète une ligne coupée. Une ligne ne
 * change donc de voix que lorsque l'ordre l'y oblige : une note entre en dessous d'elle alors
 * qu'aucune voix n'est libre de ce côté.
 *
 * C'est une programmation dynamique sur les voix, en temps proportionnel aux notes par les voix.
 */
export function placerDansLesVoix(
  hauteurs: readonly number[], liees: readonly number[], tenues: readonly boolean[],
  dernieres: readonly number[],
): number[] {
  const k = hauteurs.length, v = dernieres.length;
  if (k === 0) return [];
  // Une ligne coupée coûte plus que la somme des écarts de hauteur de toute la tranche, et une note
  // tenue déplacée plus que toutes les lignes coupées réunies.
  const toutes = [...hauteurs, ...dernieres];
  const coupee = (k + 1) * (Math.max(...toutes) - Math.min(...toutes) + 1);
  const deplacee = coupee * (k + 1);
  const cout = (r: number, s: number): number => {
    if (liees[r] >= 0) return liees[r] === s ? 0 : (tenues[r] ? deplacee : coupee);
    return Math.abs(hauteurs[r] - dernieres[s]);
  };

  // `meilleur[r][s]` : le moindre coût des notes 0 à r, la note r étant dans la voix s.
  const meilleur = Array.from({ length: k }, () => new Array<number>(v).fill(Infinity));
  const precedente = Array.from({ length: k }, () => new Array<number>(v).fill(-1));
  for (let s = 0; s < v; s++) meilleur[0][s] = cout(0, s);
  for (let r = 1; r < k; r++) {
    let plusBas = Infinity, ou = -1;
    for (let s = 1; s < v; s++) {
      if (meilleur[r - 1][s - 1] < plusBas) { plusBas = meilleur[r - 1][s - 1]; ou = s - 1; }
      if (ou >= 0) { meilleur[r][s] = plusBas + cout(r, s); precedente[r][s] = ou; }
    }
  }

  const voix = new Array<number>(k).fill(0);
  let s = 0;
  for (let q = 1; q < v; q++) if (meilleur[k - 1][q] < meilleur[k - 1][s]) s = q;
  for (let r = k - 1; r >= 0; r--) { voix[r] = s; s = precedente[r][s]; }
  return voix;
}

/**
 * Les instants où deux notes d'une même tranche sont à la même hauteur.
 *
 * DEUX DIAGNOSTICS MORTS ONT PRÉCÉDÉ CELUI-CI, et c'est pourquoi le choix est expliqué. Le premier
 * comptait les numéros de voix hors d'ordre dans une tranche, qui sont dans l'ordre par
 * construction. Le second comptait les croisements « moins coûteux » que l'ordre : pour deux suites
 * triées, l'appariement qui garde l'ordre minimise toujours la somme des écarts absolus, donc il
 * n'en existe aucun. Les deux annonçaient zéro sur une pièce entièrement croisée. L'unisson, lui,
 * est un vrai doute, et il se compte.
 */
function unissonsDans(tranches: readonly Tranche[], tolerance: number): number {
  let combien = 0;
  for (const t of tranches) {
    for (let a = 0; a + 1 < t.notes.length; a++) {
      if (Math.abs(t.notes[a + 1].note - t.notes[a].note) <= tolerance) combien++;
    }
  }
  return combien;
}

/**
 * Le numéro rendu de chaque voix trouvée, du plus aigu au plus grave, au plus `plafond` voix.
 *
 * `employes` va de la voix la plus aiguë à la plus grave. Sous le plafond, chacune garde son rang.
 * AU-DELÀ, LA PLUS AIGUË ET LA PLUS GRAVE RESTENT DES LIGNES : ce sont la mélodie et la basse, celles
 * qu'une réduction ne doit pas mêler. Les voix gardées sont également espacées entre elles, et chaque
 * autre voix rejoint la voix gardée dont la hauteur moyenne est la plus proche ; ce sont donc les
 * voix intérieures qui portent les accords. Jusqu'au 2026-11-25, tout ce qui dépassait tombait dans
 * la dernière : à quatre voix, l'Ogive 1 de Satie donnait 46/52/61/381 notes, la basse en accords.
 */
function replier(employes: readonly number[], voixDe: ReadonlyMap<Note, number>, plafond: number): Map<number, number> {
  const K = employes.length;
  if (K <= plafond) return new Map(employes.map((v, i) => [v, i]));
  if (plafond <= 1) return new Map(employes.map((v) => [v, 0]));
  const somme = new Map<number, [number, number]>();
  for (const [note, v] of voixDe) {
    const s = somme.get(v) ?? [0, 0];
    somme.set(v, [s[0] + note.note, s[1] + 1]);
  }
  const moyenne = (v: number) => { const [t, c] = somme.get(v) as [number, number]; return t / c; };
  const gardees = Array.from({ length: plafond }, (_, k) => employes[Math.round((k * (K - 1)) / (plafond - 1))]);
  return new Map(employes.map((v) => {
    if (gardees.includes(v)) return [v, gardees.indexOf(v)];
    let meilleure = 0;
    for (let k = 1; k < plafond; k++) {
      if (Math.abs(moyenne(gardees[k]) - moyenne(v)) < Math.abs(moyenne(gardees[meilleure]) - moyenne(v))) meilleure = k;
    }
    return [v, meilleure];
  }));
}

/**
 * Sépare un flux de notes en voix.
 *
 * LES ANCRES SONT LES TRANCHES LES PLUS FOURNIES, et le parcours part d'elles. C'est l'apport de
 * Chew et Wu : là où toutes les voix sonnent, l'ordre par hauteur a le plus de chances d'être le
 * bon, tandis qu'une tranche à une seule note ne dit rien de la voix à laquelle elle appartient.
 * Numéroter depuis une tranche pauvre propagerait son ignorance à toute la pièce.
 */
export function separerVoix(notes: readonly Note[], o: OptionsSeparation = {}): Separation {
  const tolerance = Math.max(0, o.tolerance ?? 1e-6);
  const forfait = Math.max(0, o.coutEntreeSortie ?? 12);
  if (notes.length === 0) return { notes: [], voix: 0, contigs: 0, unissons: 0 };

  const tranches = fondre(trancher(notes, tolerance));
  if (tranches.length === 0) return { notes: notes.map((n) => ({ ...n, voix: 0 })), voix: 1, contigs: 0, unissons: 0 };

  const maxi = Math.max(...tranches.map((t) => t.notes.length));
  const plafond = o.voixMax && o.voixMax > 0 ? Math.min(o.voixMax, maxi) : maxi;

  // Le numéro de voix de chaque note d'une tranche, dans l'ordre grave vers aigu.
  const attribue: number[][] = tranches.map(() => []);
  const fait = new Array(tranches.length).fill(false);
  // La dernière hauteur entendue dans chaque voix, du côté où la vague avance.
  let dernieres: number[] = [];

  /**
   * Numérote une tranche d'ancrage : les voix y sont prises dans l'ordre des hauteurs.
   *
   * ELLE EST DES PLUS FOURNIES, donc elle tient toutes les voix de la pièce : ce sont elles, et
   * elles seules, que les autres tranches se partagent.
   */
  const ancrer = (i: number) => {
    attribue[i] = tranches[i].notes.map((_, r) => r);
    fait[i] = true;
    dernieres = tranches[i].notes.map((x) => x.note);
  };

  /** Étend la numérotation d'une tranche déjà faite à sa voisine. */
  const etendre = (depuis: number, vers: number) => {
    const source = tranches[depuis].notes.map((n) => n.note);
    const cible = tranches[vers].notes.map((n) => n.note);
    // L'alignement se lit toujours de la tranche de gauche vers celle de droite, quel que soit le
    // sens dans lequel on progresse : sans quoi le forfait ne serait pas payé du même côté.
    const versLaDroite = vers > depuis;
    const lien = versLaDroite
      ? alignerVoix(source, cible, forfait)
      : alignerVoix(cible, source, forfait);

    const liees: number[] = new Array(cible.length).fill(-1);
    if (versLaDroite) {
      lien.forEach((deGauche, r) => {
        if (deGauche !== null) liees[r] = attribue[depuis][deGauche];
      });
    } else {
      // Le lien dit, pour chaque voix de la tranche de droite (celle qui est déjà faite), d'où elle
      // vient dans celle de gauche, qui est celle qu'on numérote.
      lien.forEach((deGauche, r) => {
        if (deGauche !== null) liees[deGauche] = attribue[depuis][r];
      });
    }
    // UNE NOTE QUI SONNE ENCORE RESTE DANS SA VOIX, quoi que l'alignement en ait fait : c'est la même
    // note, et c'est sa voix qu'elle porte à la sortie.
    const tenues = tranches[vers].notes.map((note, r) => {
      const q = tranches[depuis].notes.indexOf(note);
      if (q >= 0) liees[r] = attribue[depuis][q];
      return q >= 0;
    });
    attribue[vers] = placerDansLesVoix(cible, liees, tenues, dernieres);
    attribue[vers].forEach((v, r) => { dernieres[v] = cible[r]; });
    fait[vers] = true;
  };

  // On ancre la tranche la plus fournie, puis on s'étend de proche en proche ; quand la vague
  // s'arrête, on ancre la plus fournie de ce qui reste et l'on repart.
  while (fait.some((f) => !f)) {
    let meilleure = -1;
    for (let i = 0; i < tranches.length; i++) {
      if (!fait[i] && (meilleure < 0 || tranches[i].notes.length > tranches[meilleure].notes.length)) {
        meilleure = i;
      }
    }
    ancrer(meilleure);
    const depuisLAncre = [...dernieres];
    for (let i = meilleure + 1; i < tranches.length && !fait[i]; i++) etendre(i - 1, i);
    dernieres = depuisLAncre;
    for (let i = meilleure - 1; i >= 0 && !fait[i]; i--) etendre(i + 1, i);
  }

  // UNE NOTE PREND LA VOIX DE LA PREMIÈRE TRANCHE OÙ ELLE PARAÎT. Elle traverse parfois plusieurs
  // tranches, et c'est son entrée qui décide : c'est là qu'elle a été reliée à ce qui précède.
  const voixDe = new Map<Note, number>();
  tranches.forEach((t, i) => {
    t.notes.forEach((n, r) => {
      if (!voixDe.has(n)) voixDe.set(n, attribue[i][r]);
    });
  });

  // Les numéros sont resserrés sur zéro et suivants, du plus aigu au plus grave : un trou dans la
  // numérotation donnerait des portées vides à la gravure. L'ORDRE EST CELUI DES VOIX DE L'ANCRE, et
  // non celui des hauteurs moyennes : chaque tranche y a placé ses notes du grave à l'aigu, donc la
  // voix la plus aiguë qui sonne porte le plus petit numéro. L'exception est la note tenue qu'une
  // entrée en dessous d'elle a forcée à changer de voix : elle garde à la sortie celle de son début.
  const employes = [...new Set([...voixDe.values()])].sort((a, b) => b - a);
  const rang = replier(employes, voixDe, plafond);

  return {
    notes: notes.map((n) => ({ ...n, voix: rang.get(voixDe.get(n) ?? 0) ?? 0 })),
    voix: new Set([...rang.values()]).size,
    contigs: tranches.length,
    unissons: unissonsDans(tranches, 1e-6),
  };
}
