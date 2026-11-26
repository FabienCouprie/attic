// plugins/corpus-dossier.ts — Les fichiers MIDI d'un dossier, une pièce par passe de la boucle qui
// fabrique un corpus.
//
// LES FICHIERS SONT TOUS LUS À LA PREMIÈRE PASSE, ET NON UN PAR PASSE. Un fichier illisible ou sans
// note lu à sa passe ne pourrait rendre qu'une séquence vide : le composant suivant tomberait en
// erreur, le moteur propagerait l'erreur jusqu'à la fin, et une fin sautée à la dernière passe ne
// rendrait jamais le corpus entier. Un seul fichier abîmé, le dernier dans l'ordre des noms, ferait
// perdre tous les autres. Lus d'avance, les fichiers refusés sont écartés avant que la boucle compte
// ses passes, et chaque passe rend une pièce qui a des notes. Un fichier MIDI pèse quelques
// kilo-octets : en lire cinquante d'un coup ne coûte presque rien.
//
// LES PIÈCES SONT LES MORCEAUX DE LA BOUCLE (`boucleSequencesGlobal.ts`). C'est par eux que la fin
// sait qu'elle referme une boucle sur un dossier, sous quel nom ranger la pièce, et dans quel dossier
// elle ne doit pas écrire.

import { langueCourante } from "../i18n";
import { Respiration } from "../core/respirer";
import type { ValeurAudio } from "../audio/types-domaine";
import { lecteurDe, type ContexteQuiDeclare } from "./fiche";
import type { Sequence } from "../audio/sequence";
import { sequenceDepuisMidiParPiste } from "../audio/corpus-midi";
import { octetsLus } from "./partition-source";
import { boucleDuDebut, decouvrirPour, type BoucleCourante } from "./boucleSequencesGlobal";
import { assainirNomFichier } from "./lotGlobal";

const en = () => langueCourante() === "en";

/** L'identifiant de l'option « Dossier » du réglage « Source ». */
export const SOURCE_DOSSIER = "dossier";

/** Une pièce lue dans le dossier : son fichier, et sa séquence, une voix par piste. */
export interface PieceDuDossier { nom: string; chemin: string; sequence: Sequence }

export const estPieceDuDossier = (m: unknown): m is PieceDuDossier =>
  typeof m === "object" && m !== null
  && typeof (m as PieceDuDossier).nom === "string" && typeof (m as PieceDuDossier).chemin === "string";

const EXTENSIONS_MIDI = ["mid", "midi"];
const extension = (nom: string) => /\.([^.\\/]+)$/.exec(nom)?.[1]?.toLowerCase() ?? "";

/**
 * Les fichiers MIDI d'une liste de dossier, dans l'ordre alphabétique de leur nom.
 *
 * L'ORDRE EST TRIÉ ICI, ET EN FRANÇAIS, quel que soit celui que rend le pont : un tri à la langue du
 * système rangerait les noms accentués autrement d'une machine à l'autre, et deux corpus du même
 * dossier n'auraient pas la même empreinte.
 */
export function fichiersMidi(liste: readonly { nom: string; chemin: string }[] | null | undefined): { nom: string; chemin: string }[] {
  return (liste ?? [])
    .filter((f) => EXTENSIONS_MIDI.includes(extension(f.nom)))
    .map((f) => ({ nom: f.nom, chemin: f.chemin }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Lit un fichier MIDI une voix par piste, ou dit pourquoi il est écarté. */
export async function lirePieceMidi(api: any, f: { nom: string; chemin: string }): Promise<PieceDuDossier | { refus: string }> {
  const octets = octetsLus(await api.lireBinaire(f.chemin));
  if (!octets) return { refus: en() ? "unreadable" : "illisible" };
  try {
    const { sequence } = sequenceDepuisMidiParPiste(octets);
    if (sequence.notes.length === 0) return { refus: en() ? "no note" : "aucune note" };
    return { nom: f.nom, chemin: f.chemin, sequence: { ...sequence, titre: f.nom } };
  } catch (e: any) {
    return { refus: `${en() ? "unreadable" : "illisible"} : ${e?.message ?? String(e)}` };
  }
}

/** Ce que la lecture d'un dossier rend : les pièces gardées, et les fichiers écartés avec leur raison. */
export interface DossierLu { pieces: PieceDuDossier[]; ecartes: string[] }

/** Lit tous les fichiers MIDI d'un dossier, en rendant la main au fil de la lecture. */
export async function lireDossierMidi(api: any, dossier: string, progres?: (nom: string) => void): Promise<DossierLu | { erreur: string }> {
  const liste = await api.lireDossier(dossier);
  if (!Array.isArray(liste)) return { erreur: `${en() ? "Folder unreadable" : "Dossier illisible"} : ${dossier}` };
  const pieces: PieceDuDossier[] = [];
  const ecartes: string[] = [];
  const souffle = new Respiration();
  for (const f of fichiersMidi(liste)) {
    progres?.(f.nom);
    const lue = await lirePieceMidi(api, f);
    if ("refus" in lue) ecartes.push(`${f.nom} · ${lue.refus}`);
    else pieces.push(lue);
    await souffle.tour();
  }
  return { pieces, ecartes };
}

/**
 * Ce que la première passe a écarté, pour le redire à chaque passe.
 *
 * RANGÉ SOUS L'ÉTAT DE LA BOUCLE, ET NON SOUS LE NŒUD : il vit le temps de la boucle et disparaît
 * avec elle, si bien qu'un second lancement relit le dossier et redit ce qu'il trouve.
 */
const ecartesDe = new WeakMap<BoucleCourante, string[]>();

/** La pièce de la passe en cours quand la boucle lit un dossier, ou null. */
export function pieceDeLaPasse(b: BoucleCourante | null): PieceDuDossier | null {
  const m = b ? b.morceaux[b.index] : undefined;
  return estPieceDuDossier(m) ? m : null;
}

/** Le dossier qui contient un chemin. */
export const dossierDe = (chemin: string): string =>
  chemin.slice(0, Math.max(chemin.lastIndexOf("\\"), chemin.lastIndexOf("/")));

/** Deux dossiers sont-ils le même ? La casse, le sens des séparateurs et le séparateur final ne comptent pas. */
export function memeDossier(a: string, b: string): boolean {
  const norme = (x: string) => x.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return norme(a) === norme(b);
}

/** Le nom d'une pièce lue : celui de son fichier sans extension, après le préfixe et un tiret s'il y en a un. */
export function nomDePieceLue(piece: PieceDuDossier, prefixe: string): string {
  const base = assainirNomFichier(piece.nom.replace(/\.[^.]+$/, "")) || "piece";
  return prefixe ? `${prefixe}-${base}` : base;
}

/** Le pont de l'application de bureau, absent dans un navigateur et sous un banc de node. */
const apiDeBureau = (): any => (typeof window !== "undefined" ? (window as any).api : undefined);

/** Ce que rend le début de la boucle quand « Source » vaut « Dossier » : le rang, la séquence, le nom. */
export async function passeDuDossier<N extends string>(
  ctx: ContexteQuiDeclare<N, "Dossier">,
): Promise<{ valeurs: ValeurAudio[]; message: string; erreur?: boolean }> {
  const refus = (message: string) => ({ valeurs: [null, null, null], erreur: true, message });
  const dossier = lecteurDe<"Dossier">(ctx).paramTexte("Dossier", "").trim();
  if (!dossier) return refus(en() ? "No folder chosen." : "Aucun dossier choisi.");
  const api = apiDeBureau();
  if (!api?.lireDossier || !api?.lireBinaire) {
    return refus(en() ? "Reading a folder requires the desktop application." : "Lire un dossier demande l'application de bureau.");
  }

  const b = boucleDuDebut(ctx.noeud.id);
  let pieces: readonly unknown[];
  let ecartes: string[];
  if (b && b.morceaux.length > 0) {
    pieces = b.morceaux;
    ecartes = ecartesDe.get(b) ?? [];
  } else {
    // LA DÉCOUVERTE : le pilote lance une passe et lit le compte, qui est celui des pièces gardées.
    const lu = await lireDossierMidi(api, dossier, (nom) => ctx.onProgress?.(nom));
    if ("erreur" in lu) return refus(lu.erreur);
    decouvrirPour(ctx.noeud.id, lu.pieces);
    if (b) ecartesDe.set(b, lu.ecartes);
    pieces = lu.pieces;
    ecartes = lu.ecartes;
  }

  const n = ecartes.length;
  const ligneEcartes = n === 0 ? "" : `\n${n} ${en() ? (n > 1 ? "files left out" : "file left out") : (n > 1 ? "fichiers écartés" : "fichier écarté")} : ${ecartes.join(", ")}`;
  const index = b?.index ?? 0;
  const piece = pieces[index];
  if (!estPieceDuDossier(piece)) {
    return refus(`${en() ? "No readable MIDI file in this folder." : "Aucun fichier MIDI lisible dans ce dossier."}${ligneEcartes}`);
  }
  return {
    valeurs: [String(index + 1), piece.sequence, piece.nom],
    message: `${en() ? "piece" : "pièce"} ${index + 1}/${pieces.length} · ${piece.nom}${ligneEcartes}`,
  };
}
