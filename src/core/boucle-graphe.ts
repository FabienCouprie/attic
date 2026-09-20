// core/boucle-graphe.ts — Déplier une boucle de graphe en une chaîne.
//
// Le moteur d'Attic exécute un graphe ACYCLIQUE : chaque nœud une fois, dans l'ordre
// topologique. Une boucle est un cycle, et un cycle n'a pas d'ordre topologique. Plutôt
// que d'apprendre au moteur à revenir en arrière — ce qui demanderait de casser le cache,
// les statuts et l'annulation —, on déplie : les nœuds entre le début et la fin de boucle
// sont recopiés n fois, chaque copie recevant le résultat de la précédente.
//
// C'est exactement la sémantique demandée. Si la chaîne interne transpose d'un demi-ton,
// la deuxième copie transpose le résultat déjà transposé : au deuxième tour, deux
// demi-tons. Et les n résultats arrivent tous sur le nœud de fin, qui en fait ce que sa
// variante annonce — bout à bout (A), le dernier seul (B), ou empilés (C).
//
// Le même procédé sert déjà aux méta-composants (`aplatirGraphe`) : le graphe exécuté
// n'est pas celui qu'on voit, et c'est sans conséquence puisque les statuts remontent aux
// nœuds visibles.
import { ancetres, descendants } from "./graphe";
import type { AreteG, NoeudG } from "./meta";

export const FICHE_DEBUT = "boucle-graphe-debut";

// Trois fins de boucle, et UN SEUL dépliage. Ce qui les sépare n'est pas la façon de
// répéter la chaîne — elle est identique — mais ce que chacune fait des n résultats une
// fois qu'ils sont là : A les met bout à bout, B ne garde que le dernier, C les empile.
// Le dépliage n'a donc pas à les distinguer : il lui suffit de savoir qu'un nœud referme
// une boucle, d'où l'ensemble plutôt que la comparaison à une constante.
//
// L'identifiant de A reste `boucle-graphe-fin`, sans suffixe : les graphes déjà enregistrés
// le portent, et un renommage d'identifiant les casserait. Un alias `boucle-graphe-fin-a`
// est déclaré dans le registre pour qui l'écrirait de la façon attendue.
export const FICHE_FIN = "boucle-graphe-fin";
export const FICHE_FIN_B = "boucle-graphe-fin-b";
export const FICHE_FIN_C = "boucle-graphe-fin-c";

export const FICHES_FIN: readonly string[] = [FICHE_FIN, FICHE_FIN_B, FICHE_FIN_C];

const FINS = new Set(FICHES_FIN);

/** Ce nœud referme-t-il une boucle, quelle que soit sa façon de rassembler les tours ? */
export const estFinDeBoucle = (ficheId: string | undefined): boolean => FINS.has(ficheId ?? "");

const TOURS_MIN = 1;
export const TOURS_MAX = 32;

export type ProblemeBoucle =
  /** Une fin de boucle sans début en amont. */
  | "fin-sans-debut"
  /** Un début de boucle sans fin en aval. */
  | "debut-sans-fin"
  /** Deux débuts en amont d'une même fin : on ne sait pas lequel referme la boucle. */
  | "debuts-multiples"
  /** Une boucle dans une boucle : non pris en charge. */
  | "boucle-imbriquee"
  /** Rien entre le début et la fin : il n'y a rien à répéter. */
  | "boucle-vide";

export interface ResultatDepliage {
  noeuds: NoeudG[];
  aretes: AreteG[];
  /** Copie → nœud d'origine, pour que les statuts remontent au nœud visible. */
  origines: Map<string, string>;
  /** Ce qui empêche une boucle de se déplier, à signaler sur le nœud concerné. */
  problemes: { noeudId: string; code: ProblemeBoucle }[];
}

const nombreDeTours = (n: NoeudG): number => {
  const brut = Number((n.data.parametres as Record<string, unknown> | undefined)?.["Tours"] ?? 3);
  if (!Number.isFinite(brut)) return 3;
  return Math.max(TOURS_MIN, Math.min(TOURS_MAX, Math.round(brut)));
};

/**
 * Déplie toutes les boucles d'un graphe.
 *
 * Les graphes sans nœud de boucle ressortent inchangés — c'est le cas courant, et il ne
 * doit rien coûter.
 */
export function deplierBoucles(noeuds: NoeudG[], aretes: AreteG[]): ResultatDepliage {
  const fins = noeuds.filter((n) => estFinDeBoucle(n.data.ficheId));
  const debuts = noeuds.filter((n) => n.data.ficheId === FICHE_DEBUT);
  if (fins.length === 0 && debuts.length === 0) {
    return { noeuds, aretes, origines: new Map(), problemes: [] };
  }

  let courantN = noeuds.map((n) => ({ ...n }));
  let courantE = aretes.map((a) => ({ ...a }));
  const origines = new Map<string, string>();
  const problemes: { noeudId: string; code: ProblemeBoucle }[] = [];
  const debutsTraites = new Set<string>();

  for (const fin of fins) {
    const enAmont = ancetres(fin.id, courantE);
    const debutsAmont = [...enAmont].filter(
      (id) => courantN.find((n) => n.id === id)?.data.ficheId === FICHE_DEBUT && !debutsTraites.has(id),
    );
    if (debutsAmont.length === 0) { problemes.push({ noeudId: fin.id, code: "fin-sans-debut" }); continue; }
    if (debutsAmont.length > 1) { problemes.push({ noeudId: fin.id, code: "debuts-multiples" }); continue; }

    const debutId = debutsAmont[0];
    const debut = courantN.find((n) => n.id === debutId)!;
    const enAval = descendants(debutId, courantE);
    const interieur = [...enAval].filter((id) => id !== fin.id && enAmont.has(id));

    if (interieur.some((id) => {
      const f = courantN.find((n) => n.id === id)?.data.ficheId;
      return f === FICHE_DEBUT || estFinDeBoucle(f);
    })) {
      problemes.push({ noeudId: debutId, code: "boucle-imbriquee" });
      continue;
    }
    if (interieur.length === 0) { problemes.push({ noeudId: debutId, code: "boucle-vide" }); continue; }

    debutsTraites.add(debutId);
    const { noeuds: nn, aretes: ne } = deplierUne(courantN, courantE, debut, fin, interieur, origines);
    courantN = nn;
    courantE = ne;
  }

  for (const d of debuts) {
    if (!debutsTraites.has(d.id) && !problemes.some((p) => p.noeudId === d.id)) {
      problemes.push({ noeudId: d.id, code: "debut-sans-fin" });
    }
  }

  return { noeuds: courantN, aretes: courantE, origines, problemes };
}

function deplierUne(
  noeuds: NoeudG[],
  aretes: AreteG[],
  debut: NoeudG,
  fin: NoeudG,
  interieur: string[],
  origines: Map<string, string>,
): { noeuds: NoeudG[]; aretes: AreteG[] } {
  const tours = nombreDeTours(debut);
  const dedans = new Set(interieur);
  const parId = new Map(noeuds.map((n) => [n.id, n]));

  const entreesDuDebut = aretes.filter((a) => a.target === debut.id);
  const duDebutVersInterieur = aretes.filter((a) => a.source === debut.id && dedans.has(a.target));
  const versLaFin = aretes.filter((a) => a.target === fin.id && dedans.has(a.source));
  const interneInterne = aretes.filter((a) => dedans.has(a.source) && dedans.has(a.target));
  const dehorsVersInterieur = aretes.filter((a) => dedans.has(a.target) && !dedans.has(a.source) && a.source !== debut.id);
  const interieurVersDehors = aretes.filter((a) => dedans.has(a.source) && !dedans.has(a.target) && a.target !== fin.id);

  const idCopie = (k: number, id: string) => `${debut.id}#${k}::${id}`;
  const nouveauxN: NoeudG[] = [];
  const nouvellesA: AreteG[] = [];

  for (let k = 0; k < tours; k++) {
    for (const id of interieur) {
      const original = parId.get(id)!;
      const copie = { ...original, id: idCopie(k, id) };
      // Les copies ne sont pas affichées : leur position n'a pas d'importance, mais on
      // la décale pour qu'un graphe exporté reste lisible si quelqu'un l'ouvre.
      if (original.position) copie.position = { x: original.position.x, y: original.position.y + k * 40 };
      nouveauxN.push(copie);
      origines.set(copie.id, origines.get(id) ?? id);
    }
    for (const a of interneInterne) {
      nouvellesA.push({ ...a, id: `${a.id}#${k}`, source: idCopie(k, a.source), target: idCopie(k, a.target) });
    }
    for (const a of dehorsVersInterieur) {
      // Une entrée venue de l'extérieur alimente CHAQUE tour à l'identique : c'est un
      // réglage ou une source constante, pas ce qui circule dans la boucle.
      nouvellesA.push({ ...a, id: `${a.id}#${k}`, target: idCopie(k, a.target) });
    }
    for (const a of duDebutVersInterieur) {
      if (k === 0) {
        // Premier tour : ce qui entrait dans le début de boucle entre dans la chaîne.
        for (const e of entreesDuDebut) {
          nouvellesA.push({
            ...a,
            id: `${a.id}#0<${e.id}`,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: idCopie(0, a.target),
          });
        }
      } else {
        // Tours suivants : le résultat du tour précédent revient au début.
        for (const r of versLaFin) {
          nouvellesA.push({
            ...a,
            id: `${a.id}#${k}<${r.id}`,
            source: idCopie(k - 1, r.source),
            sourceHandle: r.sourceHandle,
            target: idCopie(k, a.target),
          });
        }
      }
    }
    for (const a of versLaFin) {
      // Chaque tour dépose son résultat sur le nœud de fin, dans l'ordre : c'est cet
      // ordre d'arêtes que la fin de boucle lit pour mettre les tours bout à bout.
      nouvellesA.push({ ...a, id: `${a.id}#${k}`, source: idCopie(k, a.source) });
    }
    if (k === tours - 1) {
      for (const a of interieurVersDehors) {
        // Ce qui sort de la boucle ailleurs que par la fin ne sort qu'une fois, au
        // dernier tour : sinon un même nœud extérieur recevrait n valeurs sans savoir
        // laquelle est la bonne.
        nouvellesA.push({ ...a, id: `${a.id}#${k}`, source: idCopie(k, a.source) });
      }
    }
  }

  const aSupprimer = new Set([debut.id, ...interieur]);
  return {
    noeuds: [...noeuds.filter((n) => !aSupprimer.has(n.id)), ...nouveauxN],
    aretes: [...aretes.filter((a) => !aSupprimer.has(a.source) && !aSupprimer.has(a.target)), ...nouvellesA],
  };
}
