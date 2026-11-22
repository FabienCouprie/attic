// audio/verovio.ts — Ce qu'on donne à Verovio, et ce qu'on en retient.
//
// Verovio grave une partition : on lui donne une notation en texte — ABC, MusicXML ou MEI — et il
// rend une page en SVG, avec les règles de gravure d'un éditeur (espacement proportionnel, hampes,
// ligatures, altérations accidentelles). Le moteur est un WebAssembly de 7 Mo chargé à la demande :
// rien n'est téléchargé, rien n'est à installer.
//
// Ce fichier est la partie PURE : reconnaître le format d'un texte, fabriquer les options, et
// remettre au SVG rendu la taille qu'on lui demande. Le chargement du module et le rendu, qui
// demandent un navigateur, sont dans le nœud (`plugins/verovio.ts`).

export type FormatNotation = "abc" | "musicxml" | "mei" | "humdrum";

/**
 * Le format d'un texte de notation, reconnu à sa forme. `null` si rien ne correspond : mieux vaut
 * le dire que laisser Verovio rendre une page blanche.
 *
 * ABC se reconnaît à ses champs d'en-tête en tête de ligne (`X:`, `K:`, `M:`) ; MusicXML et MEI
 * sont des documents XML, que distingue leur élément racine — `score-partwise` ou `score-timewise`
 * pour l'un, `mei` pour l'autre ; Humdrum à sa première ligne de données, dont chaque colonne
 * commence par `**`, comme `**kern`.
 *
 * LE HUMDRUM SE RECONNAÎT À SA PREMIÈRE LIGNE, ET NON À « **kern » N'IMPORTE OÙ. Revue des notations
 * en texte, 2026-11-22 : un ABC titré « T:Etude **kern » était refusé comme Humdrum.
 *
 * UN XML QUI N'EST NI MUSICXML NI MEI N'EST RIEN. Il était tenté en MusicXML, et Verovio gravait en
 * vert une page vide pour un SVG ou pour un opus MusicXML, qui ne fait que citer des partitions.
 * `racineXml` en donne l'élément, pour que le refus le nomme.
 */
export function detecterFormat(texte: string): FormatNotation | null {
  const t = texte.trim();
  if (!t) return null;
  const donnees = t.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("!"));
  if (donnees && donnees.split("\t").every((c) => c.startsWith("**"))) return "humdrum";
  if (t.startsWith("<")) {
    const racine = racineXml(t);
    if (racine === "score-partwise" || racine === "score-timewise") return "musicxml";
    if (racine === "mei" || /xmlns\s*=\s*["']http:\/\/www\.music-encoding\.org/i.test(t)) return "mei";
    return null;
  }
  if (/^\s*[A-Za-z]:/m.test(t)) return "abc";
  return null;
}

/**
 * Le nom de l'élément racine d'un document XML, sans préfixe d'espace de noms ; null s'il n'y en a pas.
 *
 * LU EN AVANÇANT, ET NON EN RETIRANT. La déclaration `<?…?>`, les commentaires `<!--…-->` et le DOCTYPE
 * sont sautés l'un après l'autre, jusqu'au premier élément. Un retrait par expression régulière,
 * relevé par CodeQL le 2026-11-22, laissait derrière lui ce qu'il ne savait pas refermer : un
 * commentaire jamais fermé cachait alors une racine qu'il fallait refuser.
 */
export function racineXml(texte: string): string | null {
  let i = 0;
  for (;;) {
    const debut = texte.indexOf("<", i);
    if (debut < 0) return null;
    const fermeture = texte.startsWith("<?", debut) ? "?>" : texte.startsWith("<!--", debut) ? "-->" : texte.startsWith("<!", debut) ? ">" : null;
    if (fermeture === null) {
      const m = /^<\s*([\w.:-]+)/.exec(texte.slice(debut));
      return m ? m[1].replace(/^.*:/, "") : null;
    }
    const fin = texte.indexOf(fermeture, debut + 2);
    if (fin < 0) return null;
    i = fin + fermeture.length;
  }
}

/** Ce que Verovio attend dans `setOptions` pour `inputFrom`. */
export function entreeVerovio(format: FormatNotation): string {
  return format === "musicxml" ? "musicxml" : format;
}

export interface OptionsGravure {
  /** Largeur de la page, en dixièmes de millimètre (l'unité de Verovio). */
  largeur: number;
  /** Échelle du rendu, en pour cent. */
  echelle: number;
  /** Marge autour du système, en dixièmes de millimètre. */
  marge: number;
  /** Une seule portée continue au lieu de pages : la partition se déroule sur une ligne. */
  deroule: boolean;
}

/**
 * Les options de Verovio, telles qu'il les attend.
 *
 * `adjustPageHeight` coupe le bas de page vide : sans lui, une portée de trois mesures rendait une
 * page A4 entière, et le nœud affichait un timbre-poste au milieu de blanc.
 */
export function optionsGravure(o: OptionsGravure): Record<string, unknown> {
  const base: Record<string, unknown> = {
    pageWidth: Math.max(600, Math.round(o.largeur)),
    scale: Math.max(10, Math.min(200, Math.round(o.echelle))),
    pageMarginLeft: o.marge, pageMarginRight: o.marge,
    pageMarginTop: o.marge, pageMarginBottom: o.marge,
    adjustPageHeight: true,
    footer: "none",
    header: "none",
    svgViewBox: true,
  };
  // « Déroulé » : une page aussi large qu'il faut, pour que tout tienne sur un seul système.
  if (o.deroule) { base.breaks = "none"; base.pageWidth = 60000; }
  return base;
}

/** Le nombre de pages à rendre, borné par ce que Verovio a produit. */
export function pageDemandee(demande: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.min(total, Math.round(demande)));
}
