// plugins/pochette-entree.ts — Ce que « Sortie audio » fait de l'image reçue sur son entrée « Pochette ».
//
// JPEG ET PNG PASSENT TELS QUELS, le reste devient un PNG. Les deux premiers sont ceux qu'une trame
// APIC doit porter (voir `audio/pochette.ts`) ; les autres valeurs d'image que le graphe fait
// circuler sont surtout des SVG, celui du Générateur de pochette en tête, qui le rend par défaut, et
// ceux des portées gravées. Un lecteur de musique n'affiche pas un SVG en couverture.
//
// LA CONVERSION PASSE PAR UN <img> ET UN <canvas>, À LA TAILLE PROPRE DE L'IMAGE. Elle n'existe donc
// que dans le navigateur : hors de lui, la pochette est écartée et le nœud le dit, plutôt que
// d'inscrire des octets qu'aucun lecteur ne saurait afficher. Une image sans taille propre, un SVG
// qui ne déclare que sa boîte de vue, est rendue en 512 × 512, la taille par défaut de la pochette.

import { estTexteSvg, nomDuFormatImage, typePochetteDesOctets, type Pochette } from "../audio/pochette";
import { traduire } from "../i18n";
import type { AffichagePochette } from "./formes-des-canaux";

/** Le côté d'une image qui n'a pas de taille propre. */
const COTE_PAR_DEFAUT = 512;

/** Pourquoi une valeur reçue ne devient pas une pochette. */
export type RaisonEcartee = "pas-une-image" | "illisible" | "hors-navigateur";

/** Ce que la préparation rend : la pochette, et le format d'origine si elle a été convertie. */
export type PochettePreparee =
  | { pochette: Pochette; convertieDepuis?: string }
  | { raison: RaisonEcartee };

/** Les octets d'une valeur d'image : un fichier, ou le texte d'un SVG. */
async function octetsDe(v: unknown): Promise<Uint8Array | undefined> {
  if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
  if (typeof v === "string") {
    const o = new TextEncoder().encode(v);
    return estTexteSvg(o) ? o : undefined;
  }
  return undefined;
}

/** Une image quelconque, rendue en PNG à sa taille propre par le canevas du navigateur. */
async function rasteriserEnPng(octets: Uint8Array, svg: boolean): Promise<Uint8Array> {
  // LE TYPE DU BLOB COMPTE POUR LE SVG, et pour lui seul : le navigateur reconnaît une image matricielle
  // à ses octets, mais ne lit un SVG que déclaré comme tel.
  const blob = new Blob([octets as BlobPart], svg ? { type: "image/svg+xml" } : {});
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resoudre, rejeter) => {
      img.onload = () => resoudre();
      img.onerror = () => rejeter(new Error("image illisible"));
      img.src = url;
    });
    const largeur = img.naturalWidth || COTE_PAR_DEFAUT;
    const hauteur = img.naturalHeight || COTE_PAR_DEFAUT;
    const canevas = document.createElement("canvas");
    canevas.width = largeur;
    canevas.height = hauteur;
    const c = canevas.getContext("2d");
    if (!c) throw new Error("contexte 2D indisponible");
    c.drawImage(img, 0, 0, largeur, hauteur);
    const png = await new Promise<Blob | null>((r) => canevas.toBlob(r, "image/png"));
    if (!png) throw new Error("encodage PNG échoué");
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * La pochette à inscrire d'après la valeur reçue, ou la raison pour laquelle il n'y en a pas.
 *
 * Le type inscrit se lit sur les octets rendus, jamais sur l'étiquette de la valeur reçue.
 */
export async function preparerPochette(v: unknown): Promise<PochettePreparee> {
  const octets = await octetsDe(v);
  if (!octets || octets.length === 0) return { raison: "pas-une-image" };
  const mime = typePochetteDesOctets(octets);
  if (mime) return { pochette: { mime, octets } };
  if (typeof document === "undefined" || typeof Image === "undefined") return { raison: "hors-navigateur" };
  const nom = nomDuFormatImage(octets);
  try {
    const png = await rasteriserEnPng(octets, nom === "SVG");
    // Le canevas rend un PNG, et c'est ce que ses octets doivent dire : on ne le présume pas.
    if (typePochetteDesOctets(png) !== "image/png") return { raison: "illisible" };
    const annonce = v instanceof Blob && v.type ? v.type.replace(/^image\//, "").toUpperCase() : undefined;
    return { pochette: { mime: "image/png", octets: png }, convertieDepuis: nom ?? annonce ?? "?" };
  } catch {
    return { raison: "illisible" };
  }
}

/** Le message de chaque raison, en clés écrites en toutes lettres pour que le dictionnaire les voie. */
const MESSAGE_ECARTEE: Record<RaisonEcartee, string> = {
  "pas-une-image": "msg.sortie_audio.pochette_pas_image",
  "illisible": "msg.sortie_audio.pochette_illisible",
  "hors-navigateur": "msg.sortie_audio.pochette_hors_navigateur",
};

/**
 * Ce que le run de « Sortie audio » rend pour une valeur branchée sur « Pochette » : le canal
 * d'affichage qui la porte jusqu'au fichier, et le message qui dit ce qui sera inscrit.
 *
 * UNE POCHETTE ÉCARTÉE N'EST PAS UN ÉCHEC DU NŒUD : le son est là et le fichier s'écrit, sans
 * bloc « id3 ». Le message le dit, et rien d'autre ne change.
 */
export async function pochetteDuRun(v: unknown): Promise<{ affichage?: AffichagePochette; message: string }> {
  const r = await preparerPochette(v);
  if ("raison" in r) return { message: traduire(MESSAGE_ECARTEE[r.raison]) };
  const taille = r.pochette.octets.length.toLocaleString();
  const message = r.convertieDepuis
    ? traduire("msg.sortie_audio.pochette_convertie", r.convertieDepuis, taille)
    : traduire("msg.sortie_audio.pochette", r.pochette.mime === "image/jpeg" ? "JPEG" : "PNG", taille);
  return { affichage: { pochette: r.pochette } satisfies AffichagePochette, message };
}
