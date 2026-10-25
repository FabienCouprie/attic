// docs/comparaison-familles.ts — Ce qui sépare des composants qui couvrent le même besoin.
//
// POURQUOI CETTE COUCHE EXISTE, ET POURQUOI ELLE SE MESURE PLUTÔT QU'ELLE NE S'ÉCRIT.
//
// Le dépôt sait déjà DÉCRIRE un composant — `décrire` le projette depuis le registre — et le
// MESURER — `mesurer` le passe au banc. Il ne savait pas répondre à la seule question qu'on pose
// vraiment devant huit réverbérations : **laquelle, et pourquoi pas une autre ?** Fabien a écrit
// cette comparaison trois fois à la main, un domaine à chaque fois.
//
// ELLE NE SE DÉDUIT D'AUCUN FICHIER. Le registre dit le nom, les ports, les réglages ; il ne dit pas
// que l'une allonge le son trois fois et l'autre pas du tout. C'est donc le seul des trois verbes
// dont la vérité n'est pas déjà quelque part dans la source — et c'est précisément ce qui rendait
// tentant de l'ÉCRIRE, c'est-à-dire de poser à côté du dépôt une seconde description qui vieillirait
// sans que rien ne le dise. La base d'empreintes l'a fait. Les deux chemins de construction d'une
// banque de clavier l'ont fait quatre fois.
//
// LA SORTIE EST DONC UNE MESURE REJOUÉE, jamais un document tenu à la main : le même son d'essai
// déterministe pour tous, les réglages par défaut de chacun, et le banc avec ses cinq précautions.
//
// CE FICHIER EST LA PART PURE, celle qui ne touche ni au navigateur ni au domaine : des lignes de
// mesure entrent, un classement des écarts sort. C'est elle qui porte le jugement « cet axe sépare,
// celui-là non », et c'est pour cela qu'elle est ici, tenable par des cas, plutôt que noyée dans un
// spec qu'aucun garde ne relit.

/**
 * Un axe de comparaison chiffré.
 *
 * LE SEUIL EST LA PIÈCE QUI FAIT SENS, et sans lui cette couche ne serait qu'un tas de nombres. Un
 * axe ne « sépare » que si l'écart dépasse ce que l'oreille ou l'instrument distinguent : deux
 * composants à 0,3 dB l'un de l'autre rendent le même niveau, et l'annoncer comme une différence
 * serait un bruit présenté comme un signal. Le seuil est donc déclaré par axe, en unité de l'axe, et
 * se justifie ligne à ligne.
 */
export interface AxeChiffre {
  cle: string;
  libelle: string;
  unite: string;
  /** En deçà de cet écart entre le plus bas et le plus haut, l'axe ne sépare pas. */
  seuil: number;
  /** Décimales à l'affichage. */
  decimales?: number;
}

/** Une ligne de mesure : un composant, et ce que le banc en a relevé. */
export interface LigneMesure {
  id: string;
  erreur?: string | null;
  /** Les valeurs chiffrées, par clé d'axe. Une clé absente ou non finie est un trou, pas un zéro. */
  valeurs: Record<string, number | null | undefined>;
  /** Les valeurs nommées : masse schaefferienne, forme dynamique… */
  especes?: Record<string, string | null | undefined>;
}

/** Ce qu'un axe chiffré a donné sur une famille. */
export interface EcartChiffre {
  axe: AxeChiffre;
  bas: { id: string; valeur: number };
  haut: { id: string; valeur: number };
  etendue: number;
  /** L'étendue rapportée au seuil. Au-dessus de 1, l'axe sépare. */
  force: number;
  /** Combien de composants ont pu être mesurés sur cet axe. */
  mesures: number;
}

/** Ce qu'un axe nommé a donné : qui porte quelle espèce. */
export interface PartageEspece {
  cle: string;
  libelle: string;
  /** Une entrée par espèce rencontrée, la plus portée en premier. */
  groupes: { espece: string; ids: string[] }[];
}

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Le classement des axes chiffrés, du plus franc au plus ténu.
 *
 * UN AXE MESURÉ SUR UN SEUL COMPOSANT NE SÉPARE RIEN et n'est pas rendu : son étendue vaudrait zéro,
 * ce qui le ferait passer pour un axe où tout le monde se ressemble — l'inverse de la vérité, qui
 * est qu'on n'en sait rien.
 */
export function ecartsChiffres(lignes: readonly LigneMesure[], axes: readonly AxeChiffre[]): EcartChiffre[] {
  const out: EcartChiffre[] = [];
  for (const axe of axes) {
    const points = lignes
      .filter((l) => !l.erreur)
      .map((l) => ({ id: l.id, valeur: l.valeurs[axe.cle] }))
      .filter((p): p is { id: string; valeur: number } => fini(p.valeur));
    if (points.length < 2) continue;
    let bas = points[0], haut = points[0];
    for (const p of points) {
      if (p.valeur < bas.valeur) bas = p;
      if (p.valeur > haut.valeur) haut = p;
    }
    const etendue = haut.valeur - bas.valeur;
    out.push({
      axe, bas, haut, etendue,
      force: axe.seuil > 0 ? etendue / axe.seuil : 0,
      mesures: points.length,
    });
  }
  // À force égale, l'ordre des axes déclarés tranche : un classement instable se relirait mal d'une
  // passe à l'autre, et c'est une sortie faite pour être comparée à elle-même.
  return out.sort((a, b) => b.force - a.force || axes.indexOf(a.axe) - axes.indexOf(b.axe));
}

/** Les axes qui séparent vraiment, et ceux qui ne séparent pas. */
export const separent = (e: readonly EcartChiffre[]): EcartChiffre[] => e.filter((x) => x.force >= 1);
export const neSeparentPas = (e: readonly EcartChiffre[]): EcartChiffre[] => e.filter((x) => x.force < 1);

/**
 * Le partage d'une famille selon une espèce nommée.
 *
 * Une espèce portée par TOUS ne sépare personne, et le dire est utile : c'est ce que la famille a
 * en commun. Le groupe le plus nombreux vient en premier ; à nombre égal, l'ordre alphabétique,
 * pour la même raison de stabilité que ci-dessus.
 */
export function partageEspece(
  lignes: readonly LigneMesure[], cle: string, libelle: string,
): PartageEspece | null {
  const par = new Map<string, string[]>();
  for (const l of lignes) {
    if (l.erreur) continue;
    const e = l.especes?.[cle];
    if (typeof e !== "string" || e === "") continue;
    const liste = par.get(e) ?? [];
    liste.push(l.id);
    par.set(e, liste);
  }
  if (par.size === 0) return null;
  const groupes = [...par.entries()]
    .map(([espece, ids]) => ({ espece, ids: [...ids].sort() }))
    .sort((a, b) => b.ids.length - a.ids.length || a.espece.localeCompare(b.espece));
  return { cle, libelle, groupes };
}

/** Un nombre, écrit comme la sortie le veut : sans exposant, décimales déclarées. */
export function nombre(v: number, decimales = 1): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(decimales);
}

/** Une colonne du tableau : son titre, et comment lire une ligne. */
export interface Colonne {
  titre: string;
  lire: (l: LigneMesure) => string;
}

/**
 * Le tableau, en colonnes alignées.
 *
 * LA LARGEUR SE MESURE SUR LE CONTENU, titres compris, et non sur une constante : un identifiant de
 * composant va de six à vingt-huit caractères dans ce dépôt, et une largeur fixe couperait les uns
 * ou noierait les autres. Les colonnes chiffrées s'alignent à DROITE, parce qu'on les compare du
 * regard, colonne par colonne — c'est tout l'objet de cette sortie.
 */
export function tableau(lignes: readonly LigneMesure[], colonnes: readonly Colonne[]): string[] {
  const cellules = lignes.map((l) => colonnes.map((c) => c.lire(l)));
  const largeurs = colonnes.map((c, i) => Math.max(
    c.titre.length,
    ...cellules.map((r) => r[i].length),
  ));
  const ligne = (champs: string[], gaucheDAbord: boolean) => champs
    .map((v, i) => (gaucheDAbord && i === 0 ? v.padEnd(largeurs[i]) : v.padStart(largeurs[i])))
    .join("  ");
  return [
    ligne(colonnes.map((c) => c.titre), true),
    ...cellules.map((r) => ligne(r, true)),
  ];
}

/**
 * Le rapport entier, prêt à lire sur une console.
 *
 * L'ORDRE DIT LE PROPOS : d'abord ce qui sépare, puisque c'est la question posée ; le tableau
 * ensuite, qui le justifie ; et en dernier ce que la famille a en commun, qui est une réponse aussi
 * — « ces huit-là rendent le même niveau » ferme une question au lieu de la laisser ouverte.
 */
export function rapport(o: {
  titre: string;
  entete: string;
  lignes: readonly LigneMesure[];
  axes: readonly AxeChiffre[];
  colonnes: readonly Colonne[];
  especes: readonly { cle: string; libelle: string }[];
}): string {
  const vivantes = o.lignes.filter((l) => !l.erreur);
  const mortes = o.lignes.filter((l) => l.erreur);
  const e = ecartsChiffres(o.lignes, o.axes);
  const out: string[] = [o.titre, o.entete, ""];

  const francs = separent(e);
  out.push(francs.length > 0 ? "CE QUI LES SEPARE, du plus franc au plus tenu" : "RIEN NE LES SEPARE");
  for (const x of francs) {
    const d = x.axe.decimales ?? 1;
    out.push(`  ${x.axe.libelle} : ${nombre(x.bas.valeur, d)} → ${nombre(x.haut.valeur, d)} ${x.axe.unite}`
      + `  (${nombre(x.etendue, d)} ${x.axe.unite}, soit ${nombre(x.force, 1)} fois le seuil)`);
    out.push(`      le plus bas : ${x.bas.id}   ·   le plus haut : ${x.haut.id}`);
  }

  out.push("", ...tableau(vivantes, o.colonnes));

  const communs = neSeparentPas(e);
  const partages = o.especes
    .map((s) => partageEspece(o.lignes, s.cle, s.libelle))
    .filter((p): p is PartageEspece => p !== null);
  if (communs.length > 0 || partages.length > 0) {
    out.push("", "CE QU'ILS ONT EN COMMUN, ou qui les partage sans les separer");
    for (const x of communs) {
      const d = x.axe.decimales ?? 1;
      out.push(`  ${x.axe.libelle} : ${nombre(x.etendue, d)} ${x.axe.unite} d'ecart sur ${x.mesures}`
        + `, sous le seuil de ${nombre(x.axe.seuil, d)} ${x.axe.unite}`);
    }
    for (const p of partages) {
      const texte = p.groupes.map((g) => `${g.espece} (${g.ids.join(", ")})`).join(" · ");
      out.push(`  ${p.libelle} : ${texte}`);
    }
  }

  if (mortes.length > 0) {
    out.push("", "NON MESURES");
    for (const l of mortes) out.push(`  ${l.id} : ${l.erreur}`);
  }
  return out.join("\n");
}
