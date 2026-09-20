// core/instrument-graphe.ts — Faire d'un sous-graphe un instrument, rejoué touche par touche.
//
// L'AUTRE FAÇON D'ÉTALER UN SON SUR 88 TOUCHES. « Étaler sur le clavier » prend un son enregistré et
// le TRANSPOSE vers chaque zone : c'est ce que font les échantillonneurs, et cela porte leurs
// limites — un son transposé de quatre octaves reste un son transposé de quatre octaves. Ici, on ne
// transpose rien : la RECETTE est rejouée à chaque hauteur. Un oscillateur suivi d'un filtre et
// d'une réverbération, rendu à La0 puis à Do8, donne deux sons justes, chacun calculé pour sa note.
// Aucun artefact de transposition, au prix d'un rendu par touche.
//
// COMMENT. Le moteur d'Attic exécute un graphe acyclique, chaque nœud une fois. Pour rejouer une
// chaîne à dix-huit hauteurs, on la RECOPIE dix-huit fois avant l'exécution, en injectant dans
// chaque copie la note qu'elle doit rendre. C'est le même procédé que le dépliage des boucles
// (`boucle-graphe.ts`) et que l'aplatissement des méta-composants : le graphe exécuté n'est pas
// celui qu'on voit, et cela reste sans conséquence puisque les statuts remontent aux nœuds visibles.
//
// CE QUI DIFFÈRE D'UNE BOUCLE. Une boucle CHAÎNE ses copies — chaque tour part du résultat du
// précédent. Un instrument ne chaîne rien : les copies sont indépendantes, et ce qui les distingue
// est la note injectée dans leur nœud « Note ». Ce nœud est donc recopié lui aussi, ce que le début
// de boucle n'était pas.
import { ancetres, descendants } from "./graphe";
import type { AreteG, NoeudG } from "./meta";

export const FICHE_NOTE = "frontiere-note";
export const FICHE_FIN = "instrument-fin";

/** La0 et Do8 : les bornes d'un piano de 88 touches. */
export const NOTE_MIN = 21;
export const NOTE_MAX = 108;

/** Au-delà, on ne déplie pas : dix-huit copies d'une chaîne, c'est déjà dix-huit rendus. */
export const ZONES_MAX = 64;

export type ProblemeInstrument =
  /** Une fin d'instrument sans nœud « Note » en amont. */
  | "fin-sans-note"
  /** Deux nœuds « Note » en amont d'une même fin : on ne saurait lequel porter. */
  | "notes-multiples"
  /** Rien entre la note et la fin : il n'y a pas d'instrument. */
  | "instrument-vide"
  /** Plus de zones que la borne. */
  | "trop-de-zones";

export interface ResultatInstrument {
  noeuds: NoeudG[];
  aretes: AreteG[];
  /** Copie → nœud d'origine, pour que les statuts remontent au nœud visible. */
  origines: Map<string, string>;
  problemes: { noeudId: string; code: ProblemeInstrument }[];
}

const nombre = (n: NoeudG, nom: string, defaut: number): number => {
  const brut = Number((n.data.parametres as Record<string, unknown> | undefined)?.[nom]);
  return Number.isFinite(brut) ? brut : defaut;
};

/**
 * Les notes auxquelles la chaîne sera rendue.
 *
 * La grille est ancrée sur `noteBasse + largeur`, de sorte que toutes les racines tombent DANS le
 * clavier — chaque note rendue est une note qu'on peut jouer — et que la couverture commence
 * exactement à la note la plus grave. À ±2 demi-tons sur 88 touches, cela donne dix-huit racines.
 */
export function racinesInstrument(noeudFin: NoeudG): number[] {
  const largeur = Math.max(0, Math.round(nombre(noeudFin, "Largeur de zone", 2)));
  const basse = Math.max(NOTE_MIN, Math.min(NOTE_MAX, Math.round(nombre(noeudFin, "Note basse", NOTE_MIN))));
  const haute = Math.max(basse, Math.min(NOTE_MAX, Math.round(nombre(noeudFin, "Note haute", NOTE_MAX))));
  const pas = 2 * largeur + 1;
  const racines: number[] = [];
  for (let r = basse + largeur; racines.length < ZONES_MAX + 1; r += pas) {
    racines.push(Math.min(r, haute));
    if (r >= haute) break;
  }
  // Une seule note demandée : une seule racine, et pas de doublon si la borne haute est atteinte.
  return racines.filter((r, i) => i === 0 || r !== racines[i - 1]);
}

/**
 * Déplie tous les instruments d'un graphe.
 *
 * Les graphes sans nœud d'instrument ressortent INCHANGÉS — c'est le cas courant, et il ne doit
 * rien coûter.
 */
export interface Appariement<T> {
  /** Un rendu par racine, dans l'ordre des notes. */
  paires: { racine: number; valeur: T }[];
  /** Racines dont aucune copie n'a livré de rendu. */
  manquantes: number[];
  /** Combien d'entrées par note : 1 normalement, n si n nœuds de la chaîne nourrissent la fin. */
  parCopie: number;
  /**
   * Vrai quand le nombre d'entrées ne correspond PAS au dépliage.
   *
   * C'est le signe qu'aucun dépliage n'a eu lieu — pas de « Note d'instrument » en amont, deux
   * notes en amont, ou rien entre la note et la fin —, ou qu'un nœud étranger à la chaîne nourrit
   * la fin. Dans les deux cas l'appariement note ↔ rendu est faux, et il vaut mieux le dire que
   * rendre une banque désaccordée.
   */
  nonDeplie: boolean;
}

/**
 * Apparie les rendus reçus par la fin d'instrument avec les notes auxquelles ils appartiennent.
 *
 * POURQUOI CE N'EST PAS UNE SIMPLE LISTE FILTRÉE. Le moteur livre une entrée PAR ARÊTE, dans
 * l'ordre des copies, et une copie qui a échoué livre `null`. Filtrer les nulls puis prendre les
 * `n` premières racines — ce que faisait ce nœud — décale toutes les notes suivantes dès qu'une
 * copie du MILIEU échoue : la banque sort alors juste dans son nombre de zones et fausse dans ses
 * hauteurs, ce qui ne se voit dans aucun message. L'indice de l'entrée est la seule chose qui dit à
 * quelle note un rendu appartient ; on le garde donc.
 */
export function apparierRendus<T>(
  entrees: readonly unknown[], racines: readonly number[], estRendu: (v: unknown) => v is T,
): Appariement<T> {
  if (racines.length === 0) return { paires: [], manquantes: [], parCopie: 0, nonDeplie: false };
  const parCopie = entrees.length / racines.length;
  if (!Number.isInteger(parCopie) || parCopie < 1) {
    return { paires: [], manquantes: [...racines], parCopie, nonDeplie: true };
  }
  const paires: { racine: number; valeur: T }[] = [];
  const manquantes: number[] = [];
  racines.forEach((racine, k) => {
    // Plusieurs nœuds de la chaîne peuvent aboutir à la fin ; une note n'a qu'un échantillon, on
    // garde donc le premier rendu du groupe — celui de la première arête, donc de la même branche
    // pour toutes les notes.
    let trouve: T | null = null;
    for (let j = 0; j < parCopie && trouve === null; j++) {
      const v = entrees[k * parCopie + j];
      if (estRendu(v)) trouve = v;
    }
    if (trouve === null) manquantes.push(racine);
    else paires.push({ racine, valeur: trouve });
  });
  return { paires, manquantes, parCopie, nonDeplie: false };
}

export function deplierInstruments(noeuds: NoeudG[], aretes: AreteG[]): ResultatInstrument {
  const fins = noeuds.filter((n) => n.data.ficheId === FICHE_FIN);
  const notes = noeuds.filter((n) => n.data.ficheId === FICHE_NOTE);
  if (fins.length === 0 && notes.length === 0) {
    return { noeuds, aretes, origines: new Map(), problemes: [] };
  }

  let courantN = noeuds.map((n) => ({ ...n }));
  let courantE = aretes.map((a) => ({ ...a }));
  const origines = new Map<string, string>();
  const problemes: { noeudId: string; code: ProblemeInstrument }[] = [];
  const notesTraitees = new Set<string>();

  for (const fin of fins) {
    const enAmont = ancetres(fin.id, courantE);
    const notesAmont = [...enAmont].filter(
      (id) => courantN.find((n) => n.id === id)?.data.ficheId === FICHE_NOTE && !notesTraitees.has(id),
    );
    if (notesAmont.length === 0) { problemes.push({ noeudId: fin.id, code: "fin-sans-note" }); continue; }
    if (notesAmont.length > 1) { problemes.push({ noeudId: fin.id, code: "notes-multiples" }); continue; }

    const noteId = notesAmont[0];
    const note = courantN.find((n) => n.id === noteId)!;
    const enAval = descendants(noteId, courantE);
    const interieur = [...enAval].filter((id) => id !== fin.id && enAmont.has(id));
    if (interieur.length === 0) { problemes.push({ noeudId: noteId, code: "instrument-vide" }); continue; }

    const racines = racinesInstrument(fin);
    if (racines.length > ZONES_MAX) { problemes.push({ noeudId: fin.id, code: "trop-de-zones" }); continue; }

    notesTraitees.add(noteId);
    const r = deplierUn(courantN, courantE, note, fin, interieur, racines, origines);
    courantN = r.noeuds;
    courantE = r.aretes;
  }

  for (const n of notes) {
    if (!notesTraitees.has(n.id) && !problemes.some((p) => p.noeudId === n.id)) {
      // Un nœud « Note » sans fin en aval reste tel quel : il rend alors sa note de réglage, ce qui
      // permet d'écouter l'instrument à une seule hauteur avant de le décliner.
      continue;
    }
  }
  return { noeuds: courantN, aretes: courantE, origines, problemes };
}

function deplierUn(
  noeuds: NoeudG[],
  aretes: AreteG[],
  note: NoeudG,
  fin: NoeudG,
  interieur: string[],
  racines: number[],
  origines: Map<string, string>,
): { noeuds: NoeudG[]; aretes: AreteG[] } {
  const dedans = new Set([note.id, ...interieur]);
  const parId = new Map(noeuds.map((n) => [n.id, n]));

  const versLaFin = aretes.filter((a) => a.target === fin.id && dedans.has(a.source));
  const interneInterne = aretes.filter((a) => dedans.has(a.source) && dedans.has(a.target));
  const dehorsVersInterieur = aretes.filter((a) => dedans.has(a.target) && !dedans.has(a.source));
  const interieurVersDehors = aretes.filter((a) => dedans.has(a.source) && !dedans.has(a.target) && a.target !== fin.id);

  const idCopie = (k: number, id: string) => `${fin.id}@${k}::${id}`;
  const nouveauxN: NoeudG[] = [];
  const nouvellesA: AreteG[] = [];

  racines.forEach((racine, k) => {
    for (const id of [note.id, ...interieur]) {
      const original = parId.get(id)!;
      const copie: NoeudG = { ...original, id: idCopie(k, id) };
      if (original.position) copie.position = { x: original.position.x, y: original.position.y + k * 30 };
      // C'EST ICI QUE L'INSTRUMENT DEVIENT UN INSTRUMENT : la note est injectée dans la copie du
      // nœud « Note ». Les autres nœuds sont recopiés tels quels — leurs réglages sont ceux que
      // l'utilisateur a posés, et c'est bien la même recette qu'on rejoue à chaque hauteur.
      if (original.data.ficheId === FICHE_NOTE) {
        copie.data = {
          ...original.data,
          parametres: { ...(original.data.parametres as Record<string, unknown>), Note: racine },
        } as NoeudG["data"];
      }
      nouveauxN.push(copie);
      origines.set(copie.id, origines.get(id) ?? id);
    }
    for (const a of interneInterne) {
      nouvellesA.push({ ...a, id: `${a.id}@${k}`, source: idCopie(k, a.source), target: idCopie(k, a.target) });
    }
    for (const a of dehorsVersInterieur) {
      // Une entrée venue de l'extérieur alimente CHAQUE copie à l'identique : c'est un réglage ou
      // une source commune, pas ce qui distingue les notes.
      nouvellesA.push({ ...a, id: `${a.id}@${k}`, target: idCopie(k, a.target) });
    }
    for (const a of versLaFin) {
      // Chaque copie dépose son rendu sur la fin, DANS L'ORDRE DES RACINES : c'est cet ordre que la
      // fin lit pour construire la banque, et il doit correspondre à celui de `racinesInstrument`.
      nouvellesA.push({ ...a, id: `${a.id}@${k}`, source: idCopie(k, a.source) });
    }
    if (k === 0) {
      for (const a of interieurVersDehors) {
        // Ce qui sort de l'instrument ailleurs que par la fin ne sort qu'une fois, depuis la copie
        // de la note la plus GRAVE : sinon un même nœud extérieur recevrait dix-huit valeurs sans
        // savoir laquelle est la bonne. La plus grave plutôt que la dernière, parce que c'est la
        // première de la grille et que le choix doit être prévisible.
        nouvellesA.push({ ...a, id: `${a.id}@${k}`, source: idCopie(k, a.source) });
      }
    }
  });

  const aSupprimer = new Set([note.id, ...interieur]);
  return {
    noeuds: [...noeuds.filter((n) => !aSupprimer.has(n.id)), ...nouveauxN],
    aretes: [...aretes.filter((a) => !aSupprimer.has(a.source) && !aSupprimer.has(a.target)), ...nouvellesA],
  };
}
