// audio/formule-sequence.ts — Une fonction écrite, appliquée à chaque note.
//
// CE QUE CELA RÉPOND, ET CE QUE CELA NE RÉPOND PAS. `COMPOSITION-ASSISTEE.md` donne les fonctions
// d'ordre supérieur, une fonction passée comme valeur, pour ce qu'Attic n'a pas du tout. Ce module
// n'en donne pas la forme générale : la fonction n'est pas un sous-graphe câblé, c'est une
// expression ÉCRITE. Mais il en donne l'usage le plus courant, celui d'OpenMusic quand on ouvre une
// boîte lambda sur `omloop` : appliquer une même règle à chaque élément d'une suite, et ne garder
// que ceux qui répondent à une condition. Autrement dit une transformation et un filtre, dont la
// règle se change sans câbler un nœud de plus.
//
// POURQUOI UNE EXPRESSION ET NON UN SOUS-GRAPHE. Le moteur exécute un graphe acyclique en dépliant
// les boucles AVANT l'exécution, donc en lisant leur nombre de tours dans un paramètre. Une
// itération dont le compte dépend d'une valeur qui circule, comme le nombre de notes d'une
// séquence, ne peut pas emprunter ce chemin. La forme générale demande de toucher au pilote
// d'exécution ; la forme écrite ne demande rien et sert dès aujourd'hui.
//
// L'ÉVALUATEUR EST CELUI QUI SERT DÉJÀ AUX ÉCHANTILLONS, `mathjs`, compilé une fois puis évalué par
// note. Il n'exécute pas de code : c'est un évaluateur d'expressions, et ce qu'on y écrit ne peut
// ni lire ni écrire quoi que ce soit.
//
// UNE FORMULE FAUTIVE NE CASSE PAS LA SÉQUENCE. Elle est rendue avec son message et la note reste
// telle quelle : sur une pièce de trois cents notes, une erreur de frappe qui ferait disparaître le
// tout se chercherait longtemps.

import { compile } from "mathjs";
import type { Note } from "./note";

/** Les champs qu'une formule peut réécrire. */
export type ChampFormule = "note" | "debut" | "duree" | "velocite";

export const CHAMPS: readonly ChampFormule[] = ["note", "debut", "duree", "velocite"];

export interface OptionsFormule {
  /** Une formule par champ. Un champ absent ou vide n'est pas touché. */
  formules?: Partial<Record<ChampFormule, string>>;
  /** Une condition : la note n'est gardée que si elle rend vrai. */
  condition?: string;
  /** Les notes sont-elles remises dans l'ordre des départs après coup ? */
  trier?: boolean;
}

export interface ResultatFormule {
  notes: Note[];
  /** Combien de notes la condition a écartées. */
  ecartees: number;
  /** Ce qui n'a pas pu être évalué, une fois par formule fautive. */
  erreurs: string[];
}

/**
 * Ce qu'une formule peut lire.
 *
 * LES NOMS EXISTENT DANS LES DEUX LANGUES, et les deux sont toujours là. L'application est
 * bilingue partout ailleurs ; obliger qui la lit en anglais à écrire `duree` et `voix` serait le
 * seul endroit où le français s'imposerait. Les deux jeux étant des mots distincts, aucun ne cache
 * l'autre, et une formule peut même les mêler sans que cela change rien.
 *
 * `i`, `n` et `t` n'ont pas de traduction : ce sont des lettres, pas des mots.
 */
interface Portee {
  [k: string]: number;
}

/** Les variables offertes à une formule, pour une note donnée. */
function porteeDe(note: Note, i: number, n: number, total: number): Portee {
  const duree = note.fin - note.debut;
  const canal = note.canal ?? 0;
  const voix = note.voix ?? 0;
  const t = total > 0 ? note.debut / total : 0;
  return {
    note: note.note, debut: note.debut, fin: note.fin, duree,
    velocite: note.velocite, canal, voix,
    pitch: note.note, onset: note.debut, offset: note.fin, length: duree,
    velocity: note.velocite, channel: canal, voice: voix,
    i, n, t, total,
  };
}

/** Les variables lisibles, dans l'ordre où une notice les présente. */
export const VARIABLES = {
  fr: ["note", "debut", "fin", "duree", "velocite", "canal", "voix", "i", "n", "t", "total"],
  en: ["pitch", "onset", "offset", "length", "velocity", "channel", "voice", "i", "n", "t", "total"],
} as const;

/** Retire le « champ = » qu'on écrit par habitude devant une formule. */
function sansAffectation(formule: string, champ: string): string {
  const f = formule.trim();
  const m = new RegExp(`^\\s*(?:${champ}|y|out)\\s*=\\s*(.*)$`, "is").exec(f);
  return (m ? m[1] : f).trim();
}

/**
 * Applique des formules écrites à chaque note d'une suite.
 *
 * TOUTES LES FORMULES LISENT LA NOTE D'ORIGINE, non le résultat des précédentes. Sans cette règle,
 * l'ordre des champs déciderait du résultat : réécrire la durée puis la hauteur ne donnerait pas la
 * même chose que l'inverse dès que l'une lit l'autre, et rien à l'écran ne dirait dans quel ordre
 * elles sont prises.
 */
export function appliquerFormules(
  notes: readonly Note[], o: OptionsFormule = {},
): ResultatFormule {
  const erreurs: string[] = [];
  const total = notes.reduce((m, x) => Math.max(m, x.fin), 0);
  const n = notes.length;

  const compilees: { champ: ChampFormule; evaluer: (p: Portee) => unknown }[] = [];
  for (const champ of CHAMPS) {
    const brute = o.formules?.[champ];
    if (!brute || !brute.trim()) continue;
    const texte = sansAffectation(brute, champ);
    if (!texte) continue;
    try {
      const c = compile(texte);
      compilees.push({ champ, evaluer: (p) => c.evaluate(p) });
    } catch (err: any) {
      erreurs.push(`${champ} : ${String(err?.message ?? err)}`);
    }
  }

  let condition: ((p: Portee) => unknown) | null = null;
  if (o.condition && o.condition.trim()) {
    try {
      const c = compile(o.condition.trim());
      condition = (p) => c.evaluate(p);
    } catch (err: any) {
      erreurs.push(`condition : ${String(err?.message ?? err)}`);
    }
  }

  const sortie: Note[] = [];
  let ecartees = 0;
  // Les erreurs d'évaluation sont dites une fois par formule, non une fois par note : trois cents
  // notes fautives donneraient trois cents fois le même message.
  const dejaDites = new Set<string>();

  notes.forEach((note, i) => {
    const portee = porteeDe(note, i, n, total);

    if (condition) {
      try {
        if (!condition(portee)) { ecartees++; return; }
      } catch (err: any) {
        const m = `condition : ${String(err?.message ?? err)}`;
        if (!dejaDites.has(m)) { dejaDites.add(m); erreurs.push(m); }
      }
    }

    const sortante: Note = { ...note };
    for (const { champ, evaluer } of compilees) {
      let valeur: number;
      try {
        const v = evaluer(portee);
        valeur = typeof v === "number" ? v : Number(v);
      } catch (err: any) {
        const m = `${champ} : ${String(err?.message ?? err)}`;
        if (!dejaDites.has(m)) { dejaDites.add(m); erreurs.push(m); }
        continue;
      }
      if (!Number.isFinite(valeur)) continue;
      if (champ === "note") sortante.note = valeur;
      else if (champ === "velocite") sortante.velocite = Math.max(0, Math.min(127, valeur));
      else if (champ === "debut") { const d = sortante.fin - sortante.debut; sortante.debut = valeur; sortante.fin = valeur + d; }
      // LA DURÉE SE RÉÉCRIT PAR LA FIN, le début ayant pu être déplacé juste avant : la prendre
      // depuis le début d'origine donnerait une note qui commence ailleurs et finit ici.
      else if (champ === "duree") sortante.fin = sortante.debut + Math.max(0, valeur);
    }
    sortie.push(sortante);
  });

  if (o.trier !== false) sortie.sort((a, b) => a.debut - b.debut || a.note - b.note);
  return { notes: sortie, ecartees, erreurs };
}
