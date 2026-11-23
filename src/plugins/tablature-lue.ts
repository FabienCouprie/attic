// plugins/tablature-lue.ts — Ce qu'un guitariste lit sur une tablature gravée par Verovio.
//
// NÉ AVEC « PARTITION GUITARE », 2026-11-23. Le nœud rend un SVG, et rien ne regardait ce qui y est
// dessiné. Ce module relit la tablature comme on la lit, sans rien demander au moteur qui l'a gravée :
//   - la corde à la ligne où le chiffre est posé, la première ligne du haut étant la première corde ;
//   - la case au chiffre lui-même ;
//   - le groupe, ce qui s'attaque ensemble, au `tabGrp` qui porte les chiffres ;
//   - la hampe de durée, le `tabDurSym`, que la tablature ne porte que seule.
// Le chiffre se pose juste sous sa ligne : relevé le 2026-11-23 sur Verovio 6.3.0, son texte descend
// d'un tiers d'interligne sous elle. La corde est donc la dernière ligne au-dessus du texte.
//
// Il ne sert qu'aux gardes : c'est l'instrument qui mesure la gravure.

/** Une case lue : l'identifiant de sa note dans le SVG, la corde, 1 en haut, et le chiffre. */
export type CaseLue = { id: string; corde: number; frette: number };
/** Ce qui s'attaque ensemble, dans l'ordre du dessin. */
export type GroupeLu = { id: string; cases: CaseLue[]; hampe: boolean };
export type TablatureLue = {
  groupes: GroupeLu[];
  /** Le nombre de lignes de la portée de tablature. */
  lignes: number;
  /** Le nombre de portées du premier système. */
  portees: number;
  /** Les glyphes de clé dessinés, par leur point de code SMuFL : E06D la clé TAB, E052 la clé de sol à 8 en bas. */
  cles: string[];
  /** Les textes des indications (`dir`). */
  indications: string[];
};

const classe = (e: Element) => (e.getAttribute("class") ?? "").split(" ")[0];
const glyphe = (u: Element) => (u.getAttribute("xlink:href") ?? u.getAttribute("href") ?? "").replace(/^#/, "").split("-")[0];

/** Les ordonnées des lignes d'une portée, du haut vers le bas, une fois chacune. */
function lignesDe(staff: Element): number[] {
  const ys = new Set<number>();
  for (const p of [...staff.children].filter((c) => c.localName === "path")) {
    const m = /^M(-?[\d.]+) (-?[\d.]+) L(-?[\d.]+) (-?[\d.]+)$/.exec(p.getAttribute("d") ?? "");
    if (m && m[2] === m[4]) ys.add(Number(m[2]));
  }
  return [...ys].sort((a, b) => a - b);
}

export function lireTablature(svg: string): TablatureLue {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const tout = [...doc.getElementsByTagName("g")];
  const groupes: GroupeLu[] = [];
  let lignes = 0;
  for (const staff of tout.filter((g) => classe(g) === "staff")) {
    const tabs = [...staff.getElementsByTagName("g")].filter((g) => classe(g) === "tabGrp");
    if (tabs.length === 0) continue;
    const ys = lignesDe(staff);
    lignes = Math.max(lignes, ys.length);
    for (const grp of tabs) {
      const cases: CaseLue[] = [];
      for (const note of [...grp.getElementsByTagName("g")].filter((g) => classe(g) === "note")) {
        const texte = note.getElementsByTagName("text")[0];
        if (!texte) continue;
        const y = Number(texte.getAttribute("y"));
        cases.push({ id: note.getAttribute("id") ?? "", corde: ys.filter((l) => l <= y).length, frette: Number(texte.textContent?.trim()) });
      }
      const hampe = [...grp.getElementsByTagName("g")].some((g) => classe(g) === "tabDurSym");
      groupes.push({ id: grp.getAttribute("id") ?? "", cases, hampe });
    }
  }
  const systeme = tout.find((g) => classe(g) === "system");
  const portees = systeme ? [...systeme.getElementsByTagName("g")].filter((g) => classe(g) === "staff").length
    / Math.max(1, [...systeme.getElementsByTagName("g")].filter((g) => classe(g) === "measure").length) : 0;
  const cles = tout.filter((g) => classe(g) === "clef").flatMap((g) => [...g.getElementsByTagName("use")].map(glyphe));
  const indications = tout.filter((g) => classe(g) === "dir").map((g) => (g.textContent ?? "").replace(/\s+/g, " ").trim());
  return { groupes, lignes, portees, cles, indications };
}

/** La hauteur jouée d'une case : la corde à vide sous le capodastre, plus la case. Cordes du grave à l'aigu. */
export const hauteurJouee = (c: CaseLue, cordesSonnantes: readonly number[]) =>
  cordesSonnantes[cordesSonnantes.length - c.corde] + c.frette;
