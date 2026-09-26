// audio/formes-note.test.ts — Une note ne se déclare qu'une fois.
//
// CE QUE CE TEST EXISTE POUR EMPÊCHER. Le même enregistrement, `{note, vélocité, début, fin}`,
// était déclaré DIX-NEUF FOIS sous dix-neuf noms, en trois orthographes : avec `canal` et sans,
// avec `velocite` et avec la même en faute. Rien ne le signalait, parce que TypeScript est structurel :
// deux types de mêmes champs sont interchangeables, et la division ne se voit qu'au moment où l'on
// ajoute un champ quelque part et qu'il n'arrive jamais ailleurs.
//
// C'EST CE QUI A ÉTÉ MESURÉ. Renommer `NoteMidi.note` pour compter les appelants n'a fait sortir
// que trente erreurs sur trois cent quarante-six lectures de `.note` : le type canonique ne
// gouvernait pas le code, les autres déclarations le contournaient sans le savoir.
//
// LE TEST LIT LES SOURCES, et non les types : c'est le seul moyen de voir une déclaration qui
// n'est reliée à rien. Il échoue quand une forme nouvelle paraît, ce qui est le but : on décide
// alors de l'ajouter à l'inventaire, ou de la rattacher à la forme canonique.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(process.cwd(), "src");

function sources(dossier: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Le bloc accolade ouvert à `i`, par appariement. */
function bloc(texte: string, i: number): string | null {
  let p = 0;
  for (let j = i; j < texte.length; j++) {
    if (texte[j] === "{") p++;
    else if (texte[j] === "}") { p--; if (p === 0) return texte.slice(i, j + 1); }
  }
  return null;
}

/**
 * Les champs de premier niveau d'un corps de type.
 *
 * LES COMMENTAIRES SONT RETIRÉS D'ABORD. Sans cela, une phrase de documentation contenant un
 * deux-points, « cinq le laissaient facultatif : le rendre facultatif ici », se faisait relever
 * comme un champ nommé `facultatif`. Le test s'est trompé ainsi sur son propre type canonique.
 */
function champs(corps: string): string[] {
  corps = corps.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const morceaux: string[] = [];
  let prof = 0, courant = "";
  for (const c of corps.slice(1, -1)) {
    if ("{[(".includes(c)) prof++;
    else if ("}])".includes(c)) prof--;
    if ((c === ";" || c === "," || c === "\n") && prof === 0) { morceaux.push(courant); courant = ""; }
    else courant += c;
  }
  morceaux.push(courant);
  // LE POINT D'INTERROGATION FAIT PARTIE DE LA SIGNATURE. `velocite?` n'est pas `velocite` : un
  // type dont la nuance est facultative n'est pas le même enregistrement, et l'aliaser sur celui
  // qui l'exige casserait ses appelants. Relevé sur `NoteXML`, que la première version du test
  // rangeait à tort parmi les doublons.
  const noms: string[] = [];
  for (const m of morceaux) {
    const mm = m.match(/(?:^|\s)([A-Za-z_$][\w$]*)(\??)\s*:/);
    if (mm) noms.push(mm[1] + mm[2]);
  }
  return noms;
}

/**
 * Le nom du champ de nuance, et celui qu'il ne doit plus porter.
 *
 * ÉCRITS PAR MORCEAUX, ET NON EN TOUTES LETTRES. Un renommage global des sources passerait ici
 * aussi et retournerait le test contre lui-même, ce qui est arrivé une fois : il se serait mis à
 * refuser l'orthographe correcte. Assemblé, il échappe au remplacement de jeton.
 */
const NUANCE = `veloc${"ite"}`;
const NUANCE_FAUTIVE = `veloc${"iete"}`;

interface Declaration { nom: string; ou: string; signature: string }

/** Tout type déclaré qui décrit une note : un champ `note`, et un champ de temps ou de nuance. */
function declarationsDeNote(): Declaration[] {
  const out: Declaration[] = [];
  for (const f of sources(RACINE)) {
    if (/\.test\.tsx?$/.test(f)) continue;
    const texte = readFileSync(f, "utf8");
    const rel = f.slice(process.cwd().length + 1).replace(/\\/g, "/");
    for (const m of texte.matchAll(/\b(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*)?\{/g)) {
      const debut = texte.indexOf("{", m.index! + m[0].length - 1);
      const corps = bloc(texte, debut);
      if (!corps) continue;
      const c = champs(corps);
      // Les champs portent maintenant leur point d'interrogation : on compare sur le nom nu.
      const nus = c.map((n) => n.replace("?", ""));
      if (!nus.includes("note")) continue;
      if (!nus.some((n) => [NUANCE, NUANCE_FAUTIVE, "debut", "fin", "duree", "start", "end"].includes(n))) continue;
      out.push({ nom: m[1], ou: rel, signature: [...c].sort().join(",") });
    }
  }
  return out;
}

// Les formes qui ont le droit d'exister, et pourquoi. Une note s'écrit `{note, velocite, debut,
// fin}`, avec un `canal` quand elle sort vers un fichier MIDI. Le reste de cette liste n'est PAS
// une note de partition : ce sont des réglages de synthèse et une voix de kit, qui portent un champ
// `note` pour dire quelle hauteur jouer, et qui n'ont rien à mutualiser.
const FORMES_ADMISES = new Set([
  // La note canonique, et sa variante dont le canal est connu.
  "canal?,debut,fin,note,velocite",
  "canal,debut,fin,note,velocite",
  // Sans nuance : une note de théorie, qui ne dit que sa place.
  "debut,fin,note",
  // Une partition importée ne donne pas toujours la nuance, et une contrainte de clavier ne
  // regarde ni la nuance ni le canal : ces deux-là ne sont pas la note canonique et ne peuvent
  // pas l'aliaser, faute de quoi leurs appelants devraient fournir ce qu'ils n'ont pas.
  "debut,fin,note,velocite?",
  "canal?,debut,fin,note,velocite?",
  // Un tirage de réservoir, qui porte ses silences.
  "debut,duree,note,silence,velocite",
  // Une voix de kit de batterie : un fichier, pas une note jouée.
  "duree,fichier,nom,nomEn,note,piste",
  // Les réglages des quatre synthétiseurs de Tone : une hauteur à jouer, pas une note en place.
  "decay?,duree,note,octaves?,pitchDecay?,release?,sampleRate?,volume",
  "attack?,decay?,duree,harmonicity?,modulationIndex?,note,octaves?,release?,resonance?,sampleRate?,volume",
  "attack?,decay?,duree,harmonicity?,mode,modulationIndex?,note,release?,sampleRate?,sustain?,volume",
  "attackNoise?,dampening?,duree,note,release?,resonance?,sampleRate?,volume",
]);

describe("les formes de note", () => {
  const decls = declarationsDeNote();

  it("en trouve assez pour que le contrôle ait un sens", () => {
    // Le seuil est bas à dessein : les seize doublons sont devenus des alias, et un alias n'est
    // plus une déclaration. Ce qui reste, ce sont les formes qui ne se confondent pas. Si ce
    // nombre tombait à zéro, le test se mettrait à passer sans rien lire, et il faut le savoir.
    expect(decls.length).toBeGreaterThan(5);
  });

  it("UNE SEULE ORTHOGRAPHE DE LA NUANCE, et la faute ne revient pas", () => {
    // La faute isolait le type canonique des dix-sept autres déclarations : deux enregistrements
    // identiques que rien ne pouvait relier, puisqu'ils ne portaient pas le même nom de champ.
    const fautives = decls.filter((d) => d.signature.split(",").includes(NUANCE_FAUTIVE));
    expect(fautives.map((d) => `${d.nom} (${d.ou})`)).toEqual([]);
  });

  it("AUCUNE FORME NOUVELLE SANS DÉCISION : l'inventaire fait foi", () => {
    const inconnues = decls
      .filter((d) => !FORMES_ADMISES.has(d.signature))
      .map((d) => `${d.nom} (${d.ou}) : {${d.signature}}`);
    expect(inconnues, [
      "Une forme de note ne figurant pas à l'inventaire vient d'apparaître.",
      "Ou bien elle décrit vraiment autre chose, et il faut l'inscrire dans FORMES_ADMISES ;",
      "ou bien c'est une note de plus, et elle doit employer `Note` ou `NoteMidi` de `audio/note.ts`.",
    ].join("\n")).toEqual([]);
  });

  it("DEUX DÉCLARATIONS DE MÊME FORME SONT LA MÊME, ET DOIVENT LE DIRE", () => {
    // Le cœur du sujet. Onze types nommaient `{debut, fin, note, velocite}`, six en nommaient la
    // variante avec canal : dix-sept noms pour deux enregistrements. Un alias de la forme
    // canonique compte pour un seul nom, puisque le type est le même objet.
    const parForme = new Map<string, string[]>();
    for (const d of decls) {
      if (!d.signature.startsWith("debut,fin,note") && !d.signature.startsWith("canal,debut,fin,note")) continue;
      parForme.set(d.signature, [...(parForme.get(d.signature) ?? []), `${d.nom} (${d.ou})`]);
    }
    const doublons = [...parForme.entries()]
      .filter(([, noms]) => noms.length > 1)
      .map(([sig, noms]) => `{${sig}} déclarée ${noms.length} fois : ${noms.join(", ")}`);
    expect(doublons, [
      "La même note est déclarée plusieurs fois sous des noms différents.",
      "Un type qui décrit une note s'écrit `export type X = Note` ou `= NoteMidi`, jamais en recopiant ses champs.",
    ].join("\n")).toEqual([]);
  });
});
