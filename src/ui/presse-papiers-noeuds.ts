// ui/presse-papiers-noeuds.ts — Ce qu'un copier de nœuds écrit dans le presse-papiers du système.
//
// ═══ LE PRESSE-PAPIERS ÉTAIT UNE VARIABLE DE LA FENÊTRE ═══
//
// Mesuré le 2026-10-29, deux fenêtres ouvertes : Ctrl+C sur un nœud laissait le presse-papiers du
// système intact (mêmes formats, même contenu), et Ctrl+V dans l'autre fenêtre n'ajoutait rien —
// alors qu'il collait dans la première. Les nœuds copiés vivaient dans un `useRef` de l'atelier.
//
// ═══ LA FORME : UN JSON SIGNÉ ═══
//
// Il porte son format et sa version, et un collage n'accepte que lui : un texte quelconque copié
// ailleurs ne devient pas un nœud. Il porte aussi un JETON, tiré à chaque copie. La fenêtre qui a
// copié le garde avec ses nœuds intacts ; si le presse-papiers porte encore ce jeton, c'est d'elle
// que viennent les nœuds collés, médias compris. Ailleurs, seul le JSON passe.
//
// ═══ CE QUI NE TRAVERSE PAS, DÉCIDÉ PAR FABIEN ═══
//
// Un `File`, un `Blob`, un `AudioBuffer` ne traversent pas un JSON, et une adresse `blob:` ne vaut
// que dans la page qui l'a créée. Couper dans une fenêtre et coller dans une autre n'emporte donc que
// les chemins : le média se relit depuis le disque, comme à l'ouverture d'un projet.

import { identifiantAuHasard } from "./fenetre";

export const FORMAT_PRESSE_PAPIERS = "attic/noeuds";
export const VERSION_PRESSE_PAPIERS = 1;

/** Un nœud copié, placé par rapport au coin haut-gauche de la sélection. */
export interface ElementCopie {
  ficheId: string;
  parametres: Record<string, number | string>;
  width: number;
  height: number;
  data: Record<string, unknown>;
  dx: number;
  dy: number;
}

/** Ce qu'un collage lit. `coupe` : les originaux ont été retirés, les médias sont à relire. */
export interface ContenuCopie { jeton: string; coupe: boolean; elements: ElementCopie[] }

/** Vrai pour ce qui ne survit pas à JSON ou ne vaut que dans cette page. */
function horsJson(v: unknown): boolean {
  if (typeof v === "function") return true;
  if (typeof v === "string") return v.startsWith("blob:");
  if (typeof v !== "object" || v === null) return false;
  if (typeof Blob !== "undefined" && v instanceof Blob) return true;
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return true;
  if (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer) return true;
  return false;
}

export const nouveauJeton = identifiantAuHasard;

/** Le texte écrit dans le presse-papiers du système. */
export function serialiserCopie(c: ContenuCopie): string {
  return JSON.stringify({
    format: FORMAT_PRESSE_PAPIERS, version: VERSION_PRESSE_PAPIERS,
    jeton: c.jeton, coupe: c.coupe, elements: c.elements,
  }, (_cle, v) => (horsJson(v) ? undefined : v));
}

/** Ce que porte le presse-papiers, ou `null` si ce n'est pas une copie de nœuds. */
export function lireCopie(texte: string | null | undefined): ContenuCopie | null {
  if (!texte || texte[0] !== "{") return null;
  let brut: any;
  try { brut = JSON.parse(texte); } catch { return null; }
  if (brut?.format !== FORMAT_PRESSE_PAPIERS || brut.version !== VERSION_PRESSE_PAPIERS) return null;
  if (typeof brut.jeton !== "string" || !Array.isArray(brut.elements)) return null;
  const elements = (brut.elements as any[]).filter((e) => typeof e?.ficheId === "string").map((e) => ({
    ficheId: e.ficheId,
    parametres: typeof e.parametres === "object" && e.parametres ? e.parametres : {},
    width: Number(e.width) || 230, height: Number(e.height) || 200,
    data: typeof e.data === "object" && e.data ? e.data : {},
    dx: Number(e.dx) || 0, dy: Number(e.dy) || 0,
  }));
  return { jeton: brut.jeton, coupe: brut.coupe === true, elements };
}

/** Écrit dans le presse-papiers du système. Rend faux si l'écriture est refusée. */
export async function ecrireDansLePressePapiers(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch (e) {
    console.warn("[attic] Copie de nœuds : presse-papiers du système refusé", e);
    return false;
  }
}

/**
 * Lit le presse-papiers du système. Rend `null` si la lecture est refusée — ce qui n'est pas la même
 * chose qu'un presse-papiers qui porte autre chose, et l'appelant les distingue.
 */
export async function lireLePressePapiers(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    console.warn("[attic] Collage de nœuds : presse-papiers du système illisible", e);
    return null;
  }
}
