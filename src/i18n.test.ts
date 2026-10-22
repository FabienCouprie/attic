// i18n.test.ts — Garde-fou : toute clé de traduction citée dans le code doit
// exister dans le dictionnaire.
//
// Motivation concrète : le bouton × de l'onglet appelait `t("workflow.nouveauTitre")`
// alors qu'AUCUNE clé `workflow.*` n'existait. `traduire` retombe sur la clé
// elle-même, donc l'infobulle affichait la chaîne brute « workflow.nouveauTitre ».
// Rien ne le signalait : ni TypeScript (la signature est `(cle: string)`), ni
// l'exécution (pas d'exception), ni les tests. Seule une lecture attentive de
// l'interface pouvait le révéler.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CLES_CONNUES, traduireDans } from "./i18n";

function fichiersSource(racine: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) { out.push(...fichiersSource(chemin)); continue; }
    if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) out.push(chemin);
  }
  return out;
}

// On ne relève QUE les clés littérales : `t(\`famille.${x}\`)` ou `traduire(cle)`
// sont construits à l'exécution et ne peuvent pas être vérifiés statiquement.
// Le `\b` évite d'attraper `format(`, `useEffect(` et consorts : le caractère qui
// précède le `t` y est un caractère de mot, donc la limite ne s'y applique pas.
//
// LE NOM DE LA FONCTION EST CAPTURÉ, ET IL COMPTE : `traduire` remplace les marqueurs,
// `t` ne remplace RIEN — sa signature est `(cle: string) => string`. Une même clé n'a donc
// pas le droit à la même forme selon celle qui l'appelle.
const APPELS = /\b(t|traduire)\(\s*"([^"]+)"/g;

describe("couverture i18n", () => {
  const fichiers = fichiersSource(join(__dirname));

  it("trouve bien des appels à traduire (le relevé n'est pas vide)", () => {
    const total = fichiers.reduce((n, f) => n + [...readFileSync(f, "utf8").matchAll(APPELS)].length, 0);
    expect(total).toBeGreaterThan(100);
  });

  it("toute clé littérale citée dans le code existe dans le dictionnaire", () => {
    const manquantes: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, "utf8");
      for (const m of source.matchAll(APPELS)) {
        const cle = m[2];
        if (!CLES_CONNUES.has(cle)) manquantes.push(`${cle}  (${fichier.replace(__dirname, "src")})`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

// LES MARQUEURS DE SUBSTITUTION, ET LES TROIS FAÇONS DE LES ÉCRIRE DE TRAVERS.
//
// `traduire` ne remplace QU'UNE SEULE FORME, `{__VAR_N__}` : c'est écrit dans son corps, et rien
// d'autre n'y est touché. Un message écrit avec `{0}`, forme employée par la plupart des
// bibliothèques de traduction, s'affiche donc tel quel chez l'utilisateur.
//
// CE N'EST PAS UNE HYPOTHÈSE. Le 2026-10-22, « Extraire une zone » a été livré avec un message en
// `{0}` et `{1}` ; l'utilisateur lisait « Début à {0} s ». La faute a été trouvée en exécutant le
// nœud dans l'application, et six messages d'un composant neuf la portaient le même jour. Cinq
// autres, déjà livrés depuis des mois, l'ont portée jusqu'ici : Songsee, l'attracteur, Piper TTS,
// l'export d'image et l'export SVG.
//
// AUCUN CAS NE POUVAIT L'ATTRAPER, et c'est la vraie leçon : la suite appelle les exécuteurs mais
// ne rend jamais leurs textes, de sorte qu'un message fautif traverse huit mille cas sans gêner
// personne. Le garde ne regarde donc pas les exécuteurs, il regarde le DICTIONNAIRE et les APPELS.
//
// TROIS FORMES, ET CHACUNE A SON CAS :
//   1. une valeur du dictionnaire porte une accolade suivie d'un chiffre — jamais remplacée ;
//   2. un appel à `traduire` ne s'accorde pas avec les marqueurs de sa clé — un argument jeté en
//      silence, ou un marqueur laissé à l'écran ;
//   3. une clé à marqueurs est appelée par `t`, qui ne remplace rien du tout.
//
// LE GARDE CHERCHE LA FORME, JAMAIS UN NOM : aucune des cinq clés fautives n'est citée ici, et
// c'est ce qui le rend valable pour la prochaine.

/** L'index juste après la chaîne littérale qui commence à `debut`. */
function finDeChaine(source: string, debut: number): number {
  const guillemet = source[debut];
  let i = debut + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") { i += 2; continue; }
    if (c === guillemet) return i + 1;
    // Une interpolation de gabarit peut contenir n'importe quoi, accolades et virgules comprises.
    if (guillemet === "`" && c === "$" && source[i + 1] === "{") {
      i = finDInterpolation(source, i + 2);
      continue;
    }
    i++;
  }
  return source.length;
}

/** L'index juste après l'interpolation `${…}` dont le contenu commence à `debut`. */
function finDInterpolation(source: string, debut: number): number {
  let i = debut;
  let profondeur = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") { i = finDeChaine(source, i); continue; }
    if (c === "{") profondeur++;
    else if (c === "}") { if (profondeur === 0) return i + 1; profondeur--; }
    i++;
  }
  return source.length;
}

/** Ce qu'un appel passe après sa clé, et où il se termine. */
export type Appel = {
  /** Le nombre d'arguments passés après la clé. */
  nombre: number;
  /** Vrai si l'un d'eux est un étalement : le compte réel est alors inconnaissable. */
  etalement: boolean;
  /** L'index juste après la parenthèse fermante de l'appel. */
  fin: number;
};

/**
 * Ce que l'appel dont la clé finit à `depart` passe après elle.
 *
 * Les virgules sont comptées au premier niveau seulement : celles d'un objet, d'un tableau, d'un
 * appel imbriqué ou d'une interpolation appartiennent à un argument, pas à l'appel.
 */
export function argumentsApres(source: string, depart: number): Appel {
  const morceaux: string[] = [];
  let courant = "";
  let profondeur = 0;
  let i = depart;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const fin = finDeChaine(source, i);
      courant += source.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      const fin = source.indexOf("\n", i);
      i = fin < 0 ? source.length : fin + 1;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const fin = source.indexOf("*/", i);
      i = fin < 0 ? source.length : fin + 2;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profondeur++;
    else if (c === "]" || c === "}") profondeur--;
    else if (c === ")") {
      if (profondeur === 0) { morceaux.push(courant); i++; break; }
      profondeur--;
    } else if (c === "," && profondeur === 0) {
      morceaux.push(courant);
      courant = "";
      i++;
      continue;
    }
    courant += c;
    i++;
  }
  // Le premier morceau est ce qui reste de la clé ; une virgule finale laisse un morceau vide.
  const apres = morceaux.slice(1).map((m) => m.trim()).filter((m) => m !== "");
  return {
    nombre: apres.length,
    etalement: apres.some((m) => m.startsWith("...")),
    fin: i,
  };
}

/** Les rangs des marqueurs `{__VAR_N__}` d'un texte, dans l'ordre et sans doublon. */
function rangsDesMarqueurs(texte: string): number[] {
  const vus = new Set<number>();
  for (const m of texte.matchAll(/\{__VAR_(\d+)__\}/g)) vus.add(Number(m[1]));
  return [...vus].sort((a, b) => a - b);
}

/** Les gabarits qu'un appel sans argument a le droit de prendre, et à qui il les remet. */
const GABARITS_REMIS: Record<string, string> = {
  "progress.kokoro.load_model": "remis au worker Kokoro, qui substitue lui-même",
  "progress.kokoro.download": "remis au worker Kokoro, qui substitue lui-même",
  "progress.kokoro.chunk": "remis au worker Kokoro, qui substitue lui-même",
  "progress.textgen.load_model": "remis au worker de génération de texte, qui substitue lui-même",
  "progress.textgen.download": "remis au worker de génération de texte, qui substitue lui-même",
  "progress.textgen.generate_pct": "remis au worker de génération de texte, qui substitue lui-même",
};

describe("le compte des arguments d'un appel", () => {
  // CE COMPTEUR EST LA PIÈCE SUR LAQUELLE LES GARDES SUIVANTS REPOSENT : s'il se trompe, ils
  // accusent ou absolvent au hasard. Il s'est d'ailleurs trompé à la première écriture, d'un
  // caractère, et accusait quarante clés saines. D'où ces cas, qui portent tous une virgule
  // piégeuse.
  const apres = (appel: string) => argumentsApres(appel, appel.indexOf('"', appel.indexOf('"') + 1) + 1);

  it("compte zéro, un et deux arguments simples", () => {
    expect(apres('traduire("k")').nombre).toBe(0);
    expect(apres('traduire("k", a)').nombre).toBe(1);
    expect(apres('traduire("k", a, b)').nombre).toBe(2);
  });

  it("ne compte pas les virgules d'un appel imbriqué, d'un tableau ni d'un objet", () => {
    expect(apres('traduire("k", f(a, b))').nombre).toBe(1);
    expect(apres('traduire("k", [a, b, c])').nombre).toBe(1);
    expect(apres('traduire("k", { a: 1, b: 2 }, z)').nombre).toBe(2);
  });

  it("ne compte pas les virgules d'une chaîne ni d'un gabarit interpolé", () => {
    expect(apres('traduire("k", "a, b")').nombre).toBe(1);
    expect(apres("traduire(\"k\", `${f(a, b)} , ${c}`)").nombre).toBe(1);
    expect(apres("traduire(\"k\", `x`, `y, z`)").nombre).toBe(2);
  });

  it("ignore une virgule finale, qui n'ajoute pas d'argument", () => {
    expect(apres('traduire("k", a,)').nombre).toBe(1);
  });

  it("signale un étalement, dont le compte réel ne se lit pas ici", () => {
    expect(apres('traduire("k", ...compte)').etalement).toBe(true);
    expect(apres('traduire("k", ...compte, nom)').etalement).toBe(true);
    expect(apres('traduire("k", a, b)').etalement).toBe(false);
  });

  it("dit où l'appel se termine, pour lire ce qui le suit", () => {
    const appel = 'traduire("k").replace("x", "y")';
    expect(appel.slice(apres(appel).fin)).toBe('.replace("x", "y")');
  });
});

describe("les marqueurs de substitution", () => {
  const fichiers = fichiersSource(join(__dirname));

  it("AUCUNE VALEUR DU DICTIONNAIRE NE PORTE D'ACCOLADE SUIVIE D'UN CHIFFRE", () => {
    // `traduire` ne remplace que `{__VAR_N__}` : tout le reste arrive à l'écran tel quel.
    const fautives: string[] = [];
    for (const cle of CLES_CONNUES) {
      for (const langue of ["fr", "en"] as const) {
        const texte = traduireDans(langue, cle);
        if (/\{\s*\d/.test(texte)) fautives.push(`${cle} [${langue}] : ${texte.slice(0, 80)}`);
      }
    }
    expect(fautives, "« {0} » n'est jamais remplacé : l'utilisateur lit les accolades").toEqual([]);
  });

  /** Chaque appel littéral du dépôt, avec ce qu'il passe et ce qui le suit. */
  const appels = fichiers.flatMap((fichier) => {
    const source = readFileSync(fichier, "utf8");
    return [...source.matchAll(APPELS)]
      .filter((m) => CLES_CONNUES.has(m[2]))
      .map((m) => {
        // `m[0]` finit SUR le guillemet fermant de la clé : la lecture reprend juste après, sans
        // décalage. Un « + 1 » de plus sautait la première virgule et comptait un argument de
        // moins, ce qui faisait accuser quarante clés saines d'un marqueur en trop.
        const appel = argumentsApres(source, m.index! + m[0].length);
        return {
          fonction: m[1], cle: m[2], ...appel,
          ou: fichier.replace(__dirname, "src"),
          // CE QUI SUIT L'APPEL DIT S'IL REMET SON GABARIT : un `.replace` immédiat substitue à la
          // main, et c'est le motif de l'inspecteur, qui pose le nom du port dans sa phrase.
          suivi: source.slice(appel.fin, appel.fin + 40).trimStart(),
        };
      });
  });

  it("le relevé des appels n'est pas vide : sans quoi les deux gardes suivants ne diraient rien", () => {
    expect(appels.length).toBeGreaterThan(100);
    expect(appels.some((a) => a.nombre > 0)).toBe(true);
  });

  it("CHAQUE APPEL QUI PASSE DES ARGUMENTS S'ACCORDE AVEC LES MARQUEURS DE SA CLÉ", () => {
    // UN ÉTALEMENT EST LAISSÉ DE CÔTÉ, et il faut le dire : `traduire(cle, ...compte, nom)` passe
    // autant d'arguments que le tableau en porte, ce qui ne se lit pas dans la source. Deux clés
    // de « Sous-titres » sont dans ce cas, et les compter aurait fait accuser deux clés justes.
    const desaccords: string[] = [];
    for (const a of appels) {
      if (a.nombre === 0 || a.etalement) continue;
      for (const langue of ["fr", "en"] as const) {
        const rangs = rangsDesMarqueurs(traduireDans(langue, a.cle));
        const attendus = [...Array(a.nombre).keys()];
        if (rangs.join(",") !== attendus.join(",")) {
          desaccords.push(`${a.cle} [${langue}] : appelée avec ${a.nombre} argument(s), `
            + `marqueurs ${rangs.length ? rangs.join(" ") : "aucun"}  (${a.ou})`);
        }
      }
    }
    expect([...new Set(desaccords)], [
      "Un argument sans marqueur est jeté en silence : l'utilisateur ne voit jamais le nombre.",
      "Un marqueur sans argument reste à l'écran sous ses accolades.",
    ].join("\n")).toEqual([]);
  });

  it("UN APPEL SANS ARGUMENT NE PREND PAS UNE CLÉ À MARQUEURS, SAUF POUR LA REMETTRE", () => {
    // `t` a pour signature `(cle: string) => string` et ne substitue RIEN ; `traduire` sans
    // argument ne substitue rien non plus. Dans les deux cas la valeur brute part telle quelle,
    // donc une clé à marqueurs ne s'y prend que pour être remise à qui les posera.
    const fautifs: string[] = [];
    for (const a of appels) {
      if (a.nombre > 0) continue;
      const marqueurs = (["fr", "en"] as const)
        .some((langue) => rangsDesMarqueurs(traduireDans(langue, a.cle)).length > 0);
      if (!marqueurs) continue;
      if (a.suivi.startsWith(".replace(")) continue;
      if (GABARITS_REMIS[a.cle]) continue;
      fautifs.push(`${a.cle} prise par ${a.fonction}() sans argument  (${a.ou})`);
    }
    expect([...new Set(fautifs)],
      "sans substitution, « {__VAR_0__} » arrive à l'écran tel quel").toEqual([]);
  });

  it("chaque gabarit déclaré remis porte encore des marqueurs, sinon son entrée doit partir", () => {
    // Une tolérance qui ne sert plus est un mensonge qui dort. Celle-ci nomme six gabarits que des
    // workers substituent eux-mêmes ; le jour où l'un d'eux cesse d'en porter, son entrée tombe.
    const inutiles = Object.keys(GABARITS_REMIS).filter((cle) =>
      !CLES_CONNUES.has(cle)
      || rangsDesMarqueurs(traduireDans("fr", cle)).length === 0
      || !appels.some((a) => a.cle === cle && a.nombre === 0));
    expect(inutiles, "ces entrées ne tolèrent plus rien").toEqual([]);
  });
});

// UN MODÈLE ABSENT NE S'OBTIENT PLUS EN RÉINSTALLANT, et deux messages le disaient encore.
//
// L'installeur ne porte plus aucun modèle depuis le 2026-10-08 : réinstaller l'application ne
// rapporte donc rien, et ce conseil envoyait télécharger quatre cents méga-octets d'installeur
// pour revenir au même état. Deux messages l'ont porté des mois — le débruitage et le score
// esthétique —, chacun écrit au moment où son nœud arrivait, sans que rien ne les relie.
//
// LE GARDE CHERCHE LA FORME, ET NON LES DEUX NOMS : tout message qui annonce un modèle absent,
// présent ou futur, doit dire par où le prendre et ne pas renvoyer à une réinstallation.
describe("les messages d'un modèle absent", () => {
  const FORME_FR = /Modèle\b[^.:]*\b(absent|introuvable)/i;
  const ICONE_FR = "Récupérer les modèles IA";
  const ICONE_EN = "Fetch the AI models";

  const concernes = [...CLES_CONNUES].filter((cle) => FORME_FR.test(traduireDans("fr", cle)));

  it("le relevé n'est pas vide : sans quoi ce garde ne dirait rien", () => {
    expect(concernes.length).toBeGreaterThanOrEqual(4);
  });

  it("AUCUN NE DIT DE RÉINSTALLER L'APPLICATION, qui n'embarque plus de modèle", () => {
    const fautifs = concernes.filter((cle) =>
      /réinstall/i.test(traduireDans("fr", cle)) || /reinstall/i.test(traduireDans("en", cle)));
    expect(fautifs, "réinstaller ne rapporte aucun modèle : l'installeur n'en porte plus").toEqual([]);
  });

  it("et chacun renvoie à l'icône qui les prend, dans les deux langues", () => {
    const muets = concernes.filter((cle) =>
      !traduireDans("fr", cle).includes(ICONE_FR) || !traduireDans("en", cle).includes(ICONE_EN));
    expect(muets, "un modèle absent sans chemin indiqué laisse le nœud muet sans recours").toEqual([]);
  });
});
