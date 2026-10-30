// plugins/moss-mise-en-page.ts — Une description en mots devient une mise en page MOSS-Image, en JSON.
//
// LA MÉTHODE EST CELLE D'OPENMOSS, et elle tient en deux moitiés qui ne se mélangent pas. Leur outil
// de réécriture (`skills/moss-image-prompt-enhancer`, dépôt OpenMOSS/MOSS-Image, Apache-2.0, lu au
// commit 2b46b1e) fait rédiger par un modèle de langue un BROUILLON en pixels comptés depuis le coin
// haut-gauche, `abs` et `xyxy` ; puis un compilateur sans modèle, `compile_prompt.py`, fait toute
// l'arithmétique : il vérifie chaque champ, enferme les bords fractionnaires dans des pixels entiers,
// soustrait le centre et range les boîtes en `yxyx`, la forme `abs_centralized` que MOSS lit. Leur
// règle est écrite : « le modèle ne doit jamais calculer ces valeurs lui-même ». `compilerMiseEnPage`
// en est un portage, et son cas de test reprend l'exemple chiffré de leur référence.
//
// LE MODÈLE DE LANGUE EST SERVI PAR OLLAMA, comme pour « LLM Ollama » et « Prompt → graphe ». Mesuré
// le 2026-10-30 sur la machine de Fabien, même demande, toile de 512 :
//   · `gemma4:12b`, 127 s chargement compris : le gramophone au centre, le grenier sur toute la toile,
//     le titre en haut et le sous-titre en bas, chacun avec sa légende ;
//   · `qwen3:4b`, 18 s : valide une fois le champ `text` exigé par le schéma, mais tout tient dans
//     les 150 premiers pixels du coin haut-gauche, et le sous-titre n'est pas en bas.
// D'où le défaut. Le schéma passe par `format` : la grammaire de génération, et non une consigne,
// empêche le modèle de répondre autre chose qu'un brouillon (voir `ollama.ts`).
//
// LE MODÈLE EST DÉCHARGÉ DÈS LA RÉDACTION FINIE, `keepAlive: 0`. Ollama le garde sinon cinq minutes
// en mémoire graphique, et MOSS a besoin de la carte juste après : un calcul MOSS lancé pendant
// qu'un autre programme tenait la RTX 2060 a échoué le 2026-10-29 (« diffusion model compute
// failed »). Relevé après une rédaction : 218 Mio occupés sur la carte, aucun modèle chargé.

/** Le modèle de langue par défaut : voir l'en-tête pour la mesure qui l'a fait choisir. */
export const MODELE_MISE_EN_PAGE = "gemma4:12b";

/** Deux essais : le second reçoit la raison du refus du premier, comme le prévoit la méthode. */
const ESSAIS = 2;

const boite = { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 };

/**
 * Ce que le modèle a le droit de répondre. LE CHAMP `text` EST EXIGÉ D'UN ÉLÉMENT TEXTE PAR LE SCHÉMA
 * LUI-MÊME, et non par la consigne : sans cela `qwen3:4b` rendait ses deux titres sans les mots à
 * écrire, et le compilateur rejetait le brouillon.
 */
export const SCHEMA_BROUILLON = {
  type: "object", required: ["summary", "items"],
  properties: {
    summary: { type: "object", required: ["caption"], properties: { caption: { type: "string" } } },
    items: {
      type: "array", minItems: 1,
      items: {
        anyOf: [
          {
            type: "object", required: ["label", "caption", "text", "bbox"],
            properties: { label: { type: "string", enum: ["text"] }, caption: { type: "string" }, text: { type: "string" }, bbox: boite },
          },
          {
            type: "object", required: ["label", "caption", "bbox"],
            properties: { label: { type: "string", enum: ["object", "character"] }, caption: { type: "string" }, bbox: boite },
          },
        ],
      },
    },
  },
};

/** La consigne remise au modèle de langue. Elle est en anglais, la langue des légendes que MOSS a apprises. */
export function consigneMiseEnPage(demande: string, largeur: number, hauteur: number, refus?: string): string {
  return [
    "You turn an image request into a MOSS-Image Layout draft, written as one JSON object.",
    `The canvas is ${largeur} pixels wide and ${hauteur} pixels high.`,
    "",
    "summary.caption: one or two English sentences describing the whole image: subject, setting, framing, medium, lighting, palette and mood.",
    "items: a flat list of the visible units worth placing. Each item has:",
    "- label: \"object\", \"character\" or \"text\";",
    "- caption: an English description of its visible appearance (for text: typography, colour, surface);",
    "- text: only for text items, the exact visible characters, verbatim in their original language;",
    `- bbox: [x_min, y_min, x_max, y_max] in pixels from the top-left corner, with 0 <= x_min < x_max <= ${largeur} and 0 <= y_min < y_max <= ${hauteur}.`,
    "",
    "Keep the requested subjects, counts, relationships, style and wording. Add a text item only for words the request asks to show. Boxes may overlap where the image does. Give text boxes enough room for their letters.",
    ...(refus ? ["", `Your previous draft was rejected: ${refus}. Write a corrected draft.`] : []),
    "Answer with the JSON object only.",
    "",
    `Request: ${demande}`,
  ].join("\n");
}

function exiger(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function champs(v: unknown, permis: string[], requis: string[], lieu: string): asserts v is Record<string, unknown> {
  exiger(estObjet(v), `${lieu} must be an object`);
  const inconnus = Object.keys(v).filter((k) => !permis.includes(k)).sort();
  const manquants = requis.filter((k) => !(k in v)).sort();
  exiger(inconnus.length === 0, `${lieu}: unknown fields ${JSON.stringify(inconnus)}`);
  exiger(manquants.length === 0, `${lieu}: missing fields ${JSON.stringify(manquants)}`);
}

function texte(v: unknown, lieu: string): void {
  exiger(typeof v === "string" && v.trim() !== "", `${lieu} must be nonempty text`);
}

function chaines(v: unknown, lieu: string): void {
  exiger(Array.isArray(v), `${lieu} must be an array`);
  v.forEach((x, i) => texte(x, `${lieu}[${i}]`));
}

/** `round(v, 9)` du compilateur : un bord à 1e-10 d'un entier n'est pas enfermé dans le pixel voisin. */
const arrondi9 = (v: number) => Math.round(v * 1e9) / 1e9;

/** Une boîte `xyxy` en pixels depuis le coin haut-gauche, rendue en `yxyx` depuis le centre. */
function boiteCentree(b: unknown, largeur: number, hauteur: number, lieu: string): number[] {
  exiger(Array.isArray(b) && b.length === 4, `${lieu} must be [x1,y1,x2,y2]`);
  exiger(b.every((v) => typeof v === "number" && Number.isFinite(v)), `${lieu} must contain four finite numbers`);
  const [x1, y1, x2, y2] = b as number[];
  exiger(x1 < x2 && y1 < y2, `${lieu} must have positive width and height`);
  exiger(0 <= x1 && x2 <= largeur && 0 <= y1 && y2 <= hauteur, `${lieu} exceeds the ${largeur}x${hauteur} canvas`);
  // LES BORDS SONT ENFERMÉS AVANT DE CENTRER : plancher en haut et à gauche, plafond en bas et à droite.
  const r = [
    Math.floor(arrondi9(y1)) - hauteur / 2, Math.floor(arrondi9(x1)) - largeur / 2,
    Math.ceil(arrondi9(y2)) - hauteur / 2, Math.ceil(arrondi9(x2)) - largeur / 2,
  ];
  exiger(r[0] < r[2] && r[1] < r[3], `${lieu} is too small at export precision`);
  return r;
}

/**
 * Compile un brouillon en la ligne de JSON que MOSS lit, ou lève la raison du refus.
 *
 * UNE BOÎTE HORS DE LA TOILE EST REFUSÉE, ET NON RABOTÉE, comme dans le compilateur d'origine : une
 * boîte rabotée placerait autre chose que ce que le modèle a voulu, sans que personne ne le sache.
 */
export function compilerMiseEnPage(brouillon: unknown, largeur: number, hauteur: number): string {
  exiger(Number.isInteger(largeur) && largeur > 0 && largeur % 16 === 0, "width must be a positive integer multiple of 16");
  exiger(Number.isInteger(hauteur) && hauteur > 0 && hauteur % 16 === 0, "height must be a positive integer multiple of 16");
  champs(brouillon, ["summary", "items"], ["summary", "items"], "Layout draft");
  const summary = brouillon.summary;
  champs(summary, ["caption", "meta", "canvas", "palette"], ["caption"], "summary");
  texte(summary.caption, "summary.caption");
  if ("canvas" in summary) {
    exiger(["single", "multi_panel", "collage"].includes(summary.canvas as string), "summary.canvas must be single, multi_panel or collage");
  }
  for (const cle of ["meta", "palette"]) if (cle in summary) chaines(summary[cle], `summary.${cle}`);
  const items = brouillon.items;
  exiger(Array.isArray(items) && items.length > 0, "items must be a nonempty flat array");
  const compiles = items.map((item: unknown, i: number) => {
    const lieu = `items[${i}]`;
    champs(item, ["label", "caption", "bbox", "text", "tags", "palette"], ["label", "caption", "bbox"], lieu);
    exiger(["object", "character", "text"].includes(item.label as string), `${lieu}.label must be object, character or text`);
    texte(item.caption, `${lieu}.caption`);
    if (item.label === "text") exiger("text" in item, `${lieu}: text items require literal text`);
    if ("text" in item) texte(item.text, `${lieu}.text`);
    for (const cle of ["tags", "palette"]) if (cle in item) chaines(item[cle], `${lieu}.${cle}`);
    return Object.fromEntries(Object.entries(item).map(([cle, valeur]) =>
      [cle, cle === "bbox" ? boiteCentree(valeur, largeur, hauteur, `${lieu}.bbox`) : valeur]));
  });
  return JSON.stringify({ summary, items: compiles, bbox_coord_space: "abs_centralized", bbox_format: "yxyx" });
}

/**
 * Le prompt est-il déjà une mise en page ? Un JSON qui est un objet passe tel quel : le réécrire
 * jetterait des boîtes posées à la main.
 */
export function estMiseEnPage(prompt: string): boolean {
  const t = prompt.trim();
  if (!t.startsWith("{")) return false;
  try { return estObjet(JSON.parse(t)); } catch { return false; }
}

/** Ce que l'appel à Ollama doit savoir faire : la signature de `ollamaGenerer`, réduite à l'usage. */
export type Generer = (o: {
  model: string; prompt: string; format: Record<string, unknown>; keepAlive: number;
  options: Record<string, unknown>; timeout: number;
}) => Promise<{ reponse?: string; erreur?: string }>;

export type Redaction = { ok: true; json: string; elements: number } | { ok: false; raison: "ollama" | "refus"; detail: string };

/**
 * Fait rédiger la mise en page, puis la compile. Un brouillon refusé est redemandé une fois, avec la
 * raison du refus ; un serveur injoignable ne l'est pas, rien ne changerait au second appel.
 */
export async function redigerMiseEnPage(o: {
  demande: string; largeur: number; hauteur: number; modele: string; graine: number; generer: Generer;
}): Promise<Redaction> {
  let refus: string | undefined;
  for (let essai = 0; essai < ESSAIS; essai++) {
    const r = await o.generer({
      model: o.modele, prompt: consigneMiseEnPage(o.demande, o.largeur, o.hauteur, refus),
      format: SCHEMA_BROUILLON, keepAlive: 0,
      // LA GRAINE DE L'IMAGE TIENT AUSSI LA RÉDACTION : même graine, même mise en page, même image.
      options: { temperature: 0.2, num_predict: 2000, seed: o.graine },
      // Le premier appel charge le modèle : deux minutes pour `gemma4:12b`, mesuré.
      timeout: 600_000,
    });
    if (r.erreur) return { ok: false, raison: "ollama", detail: r.erreur };
    try {
      const json = compilerMiseEnPage(JSON.parse(r.reponse ?? ""), o.largeur, o.hauteur);
      return { ok: true, json, elements: (JSON.parse(json) as { items: unknown[] }).items.length };
    } catch (e) {
      refus = e instanceof SyntaxError ? "the answer is not JSON" : (e as Error).message;
    }
  }
  return { ok: false, raison: "refus", detail: refus ?? "" };
}
