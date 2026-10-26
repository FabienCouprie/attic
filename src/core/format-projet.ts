// core/format-projet.ts — La version du format de projet, et ce qu'un chargement a perdu.
//
// ═══ POURQUOI CE MODULE, ET C'EST UN RELEVÉ DE REVUE ═══
//
// Le 2026-10-25, une revue critique du dépôt : « Le format de projet n'a ni version, ni migration,
// ni rapport de chargement. Le projet s'écrit avec quatre clés et aucun numéro de version. Toutes
// les pertes au chargement ne laissent qu'un `console.warn` : fiche inconnue, arête rejetée,
// fichier introuvable sur une autre machine. »
//
// VÉRIFIÉ, ET VRAI. Un fichier de projet portait `nodes`, `edges`, `metas`, `viewport`, et rien
// d'autre. Les deux manques qui se paient tout de suite sont ceux-là :
//
//   · UN FICHIER ÉCRIT PAR UNE VERSION PLUS RÉCENTE s'ouvrait sans un mot, en perdant tout ce que
//     la version qui le lit ne connaît pas. Un numéro n'empêche pas la perte, mais il la DIT.
//   · UNE PERTE AU CHARGEMENT ne laissait qu'une ligne de console, que personne ne lit — et sous
//     Windows la console du processus principal d'Electron n'apparaît même pas.
//
// ═══ CE QUE CE MODULE NE FAIT PAS, ET LA RAISON EST MESURÉE ═══
//
// LA REVUE DEMANDAIT AUSSI « une version et une fonction migrer(data, depuis) PAR FICHE », et des
// clés de réglage stables distinctes des libellés. Ce n'est pas fait, et ce n'est pas un oubli :
//
//   · `src/docs/contrat-cles-de-reglage.test.ts` a mesuré les 417 clés des 172 nœuds des 19 graphes
//     livrés : ZÉRO orpheline. Le seul défaut de cette famille jamais trouvé était un méta-composant
//     écrit à la main avec deux clés qui n'avaient jamais existé — réparé, et gardé.
//   · Re-clé-er le catalogue sur des identifiants stables toucherait 1983 réglages et invaliderait
//     tout projet enregistré sur le disque de quelqu'un, qui ne porte que des libellés. Le coût est
//     certain, le gain mesuré est nul pour l'instant : ce qui attrape ce défaut, c'est le garde.
//
// Quand un renommage sera NÉCESSAIRE, la version ci-dessous est l'endroit où le dire.

/**
 * La version du format que cette version d'Attic écrit.
 *
 * ELLE VAUT 1, ET NON 2 : tous les fichiers écrits jusqu'ici SONT de ce format — quatre clés, des
 * réglages indexés par libellé. Leur donner un numéro ne les change pas, cela les nomme. Le jour où
 * la forme changera vraiment, c'est ce nombre qui montera, et un fichier sans numéro restera lisible
 * comme un fichier de format 1.
 */
export const FORMAT_PROJET = 1;

/**
 * La version d'un fichier lu. Un fichier sans numéro est du format 1.
 *
 * ON NE DEVINE PAS UNE VERSION SUR LE CONTENU. Un fichier antérieur au numéro n'en portera jamais,
 * et le reconnaître à ses clés serait une heuristique qui vieillirait mal.
 */
export function versionDuProjet(json: unknown): number {
  const v = (json as { formatVersion?: unknown } | null)?.formatVersion;
  if (typeof v === "number" && Number.isFinite(v) && v >= 1) return Math.floor(v);
  return 1;
}

/** Ce fichier vient-il d'une version d'Attic plus récente que celle qui le lit ? */
export function venuDuFutur(json: unknown): boolean {
  return versionDuProjet(json) > FORMAT_PROJET;
}

/**
 * Ce qu'un chargement a perdu, par nature.
 *
 * PAR NATURE ET NON EN UNE LISTE DE PHRASES, pour que l'appelant puisse compter chaque sorte et
 * n'en montrer que ce qui tient à l'écran. Une liste de cent lignes ne se lit pas davantage qu'un
 * `console.warn`.
 */
export interface PerteAuChargement {
  /** Les arêtes écartées parce qu'elles ne mènent plus à un port existant. */
  aretes: string[];
  /** Les nœuds dont la fiche n'est connue de personne : `id (ficheId)`. */
  fiches: string[];
  /** Les réglages enregistrés que plus aucune fiche ne déclare : `id (ficheId) · clé`. */
  reglages: string[];
  /** Le format du fichier, s'il est plus récent que celui que cette version écrit. */
  formatFutur: number | null;
}

export function perteAuChargementVide(): PerteAuChargement {
  return { aretes: [], fiches: [], reglages: [], formatFutur: null };
}

export function rienDePerduAuChargement(p: PerteAuChargement): boolean {
  return p.aretes.length === 0 && p.fiches.length === 0
    && p.reglages.length === 0 && p.formatFutur === null;
}

/**
 * Le rapport, en texte, prêt pour l'écran. Les listes sont bornées : `max` éléments par nature.
 *
 * LA BORNE EST PAR NATURE ET NON SUR LE TOTAL : un graphe qui perd quarante arêtes ne doit pas
 * faire disparaître la seule fiche inconnue sous elles, qui est l'information la plus grave.
 */
export function rapportDuChargement(p: PerteAuChargement, libelles: {
  format: (v: number) => string; aretes: (n: number) => string;
  fiches: (n: number) => string; reglages: (n: number) => string;
}, max = 8): string {
  const lignes: string[] = [];
  const bloc = (titre: string, items: string[]) => {
    if (items.length === 0) return;
    lignes.push(titre);
    for (const i of items.slice(0, max)) lignes.push(`  • ${i}`);
    if (items.length > max) lignes.push(`  • … ${items.length - max}`);
  };
  if (p.formatFutur !== null) lignes.push(libelles.format(p.formatFutur));
  bloc(libelles.fiches(p.fiches.length), p.fiches);
  bloc(libelles.reglages(p.reglages.length), p.reglages);
  bloc(libelles.aretes(p.aretes.length), p.aretes);
  return lignes.join("\n");
}
