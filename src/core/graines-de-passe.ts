// core/graines-de-passe.ts — Les graines d'une passe, résolues au centre : une par nœud et par réglage,
// partagée par les copies d'une boucle, et rendue à qui l'a tirée.
//
// Sorti d'`ui/hooks/useExecutionGraphe.ts` le 2026-11-02, à l'identique (sortie 3 du plan
// `work/plan-useExecutionGraphe-2026-11-01.md`) ; le tirage lui-même est injectable pour qu'un test
// compare la règle à l'ancienne fermeture sans hasard.
//
// Relevé par Fabien : « il y a un excès de décentralisation, il faut le corriger partout où
// c'est possible, le fonctionnement sur les graines doit être homogène ». Soixante-seize
// réglages de graine vivaient dans soixante-cinq fichiers, et la convention du projet n'était
// appliquée que par treize d'entre eux ; ailleurs, une graine à zéro était une graine FIXE
// valant zéro, qui rendait toujours la même chose quand la documentation annonçait le contraire.
//
// DEUX TABLES, ET ELLES NE DISENT PAS LA MÊME CHOSE. `graines` retient ce qu'un nœud a obtenu,
// pour que deux lectures du même réglage rendent la même valeur. `basesDeGraine` retient ce que
// le nœud VISIBLE a tiré, et ne sert qu'aux boucles à graines variables : tous les tours
// partagent alors la même base, que leur numéro décale, de sorte que fixer cette base rejoue la
// boucle entière à l'identique. Sans cette option, chaque copie résout pour elle-même, ce qui
// est exactement ce que les graphes enregistrés font aujourd'hui.
import { graineDuTour, resoudreGraine } from "./hasard";

export interface TablesDeDepliage {
  /** Le numéro de tour d'une copie de boucle, par identifiant de copie. */
  toursDesCopies: ReadonlyMap<string, number>;
  /** Le nœud d'origine d'une copie, de boucle ou d'instrument. */
  origines: ReadonlyMap<string, string>;
  /** Le nœud VISIBLE dont vient un nœud aplati ou copié. */
  expansions: ReadonlyMap<string, string>;
  /** Comment une graine brute devient une graine : `resoudreGraine`, sauf au banc. */
  tirer?: (brut: number) => number;
}

export interface GraineTiree { nom: string; valeur: number }

export function creerResolveurDeGraines({ toursDesCopies, origines, expansions, tirer = resoudreGraine }: TablesDeDepliage) {
  const graines = new Map<string, number>();
  const basesDeGraine = new Map<string, number>();
  /** Ce qu'un nœud a TIRÉ, par réglage : rendu dans son message, sans quoi on ne pourrait le rejouer. */
  const grainesTirees = new Map<string, GraineTiree[]>();

  const graineDuNoeud = (nodeId: string, nom: string, brut: number): number => {
    const cle = `${nodeId}|${nom}`;
    const deja = graines.get(cle);
    if (deja !== undefined) return deja;
    const tour = toursDesCopies.get(nodeId);
    const origine = origines.get(nodeId);
    let valeur: number;
    let base: number;
    if (tour === undefined && origine === undefined) {
      valeur = base = tirer(brut);
    } else {
      // LES COPIES D'UN MÊME NŒUD PARTAGENT UNE BASE, dans les deux réglages, et c'est ce qui rend
      // la boucle rejouable : une seule graine à reposer, et les trente-deux tours reviennent.
      // Sans ce partage, « Identiques » mentait dès que la graine était à zéro — chaque copie
      // tirait la sienne, et les tours différaient sous une étiquette qui promet le contraire.
      const cleBase = `${origine ?? nodeId}|${nom}`;
      const deja = basesDeGraine.get(cleBase);
      base = deja ?? tirer(brut);
      if (deja === undefined) basesDeGraine.set(cleBase, base);
      // Et c'est la CONVENTION DE GRAINE qui mêle le numéro du tour, jamais le moteur lui-même.
      valeur = tour === undefined ? base : graineDuTour(base, tour);
    }
    graines.set(cle, valeur);
    // TIRÉE veut dire que l'utilisateur n'en avait pas posé : c'est celle-là qu'il faut lui rendre,
    // SUR LE NŒUD QU'IL VOIT. Dans une boucle, celui qui tire est une COPIE, dont l'identifiant
    // n'existe pas à l'écran ; et ce qu'on lui rend est LA BASE, jamais la graine d'un tour :
    // reposer une graine de tour ne rejouerait rien, quand la base rejoue les trente-deux.
    if (!(brut > 0)) {
      const visible = expansions.get(nodeId) ?? nodeId;
      const liste = grainesTirees.get(visible) ?? [];
      if (!liste.some((g) => g.nom === nom)) liste.push({ nom, valeur: base });
      grainesTirees.set(visible, liste);
    }
    return valeur;
  };

  return { graineDuNoeud, grainesTirees };
}
