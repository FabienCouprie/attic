// audio/gamme-banc-hauteurs.ts — Les hauteurs qu'un nœud a rendues, sortie par sortie.
//
// LES SORTIES SE LISENT PAR LEUR TYPE DE PORT, JAMAIS PAR LE NOM DU NŒUD : un nœud à gamme ajouté
// demain est lu sans qu'on touche à ce fichier, dès qu'il rend du MIDI, une séquence ou un cercle. Les
// ports texte, seuls, se distinguent par ce qu'ils portent : une notation passe par le nœud
// « Texte → MIDI », qui en est le vrai lecteur dans un graphe, plutôt que par une copie de son analyse.
//
// CE QUI N'EST PAS LU EST COMPTÉ, avec sa raison : un son, une image, un texte libre. Un relevé qui
// tairait ses sorties non lues laisserait croire qu'il les a vérifiées.

import { notesDuMidi } from "./midi";
import { estSequence } from "./sequence";
import { hauteursAccord } from "./abc";

/** Une hauteur rendue : en demi-tons, fractions comprises, temps en secondes ou en rang. */
export interface HauteurRendue { note: number; debut: number; fin: number }

/** Une sortie lue : un port, un canal MIDI s'il y en a, et ses hauteurs dans l'ordre du temps. */
export interface SortieLue {
  port: string;
  rang: number;
  canal?: number;
  nature: "midi" | "sequence" | "cercle" | "nombres" | "accords" | "notation";
  hauteurs: HauteurRendue[];
}

/** Une sortie que le banc ne lit pas, et pourquoi. */
export interface SortieNonLue { port: string; rang: number; raison: string }

/** Un port de sortie déclaré par une fiche. */
export interface PortDeSortie { nom: string; type: string; sousType?: string }

/** Le canal de la batterie General MIDI, le dixième : ses notes sont des instruments, pas des hauteurs. */
const CANAL_BATTERIE = 9;

const parDebut = (a: HauteurRendue, b: HauteurRendue) => a.debut - b.debut || a.note - b.note;

/** Les accords chiffrés d'un texte, un par mot, posés à leur rang. */
function accordsChiffres(texte: string): HauteurRendue[] | null {
  const symboles = texte.split(/\s+/).filter(Boolean);
  const hauteurs: HauteurRendue[] = [];
  for (const [i, s] of symboles.entries()) {
    const notes = hauteursAccord(s);
    if (notes === null) return null;
    for (const n of notes) hauteurs.push({ note: n, debut: i, fin: i + 1 });
  }
  return hauteurs;
}

/** Des nombres séparés par des blancs, posés à leur rang. */
function nombres(texte: string): HauteurRendue[] | null {
  const mots = texte.split(/\s+/).filter(Boolean);
  const valeurs = mots.map(Number);
  return valeurs.every(Number.isFinite) ? valeurs.map((note, i) => ({ note, debut: i, fin: i + 1 })) : null;
}

/**
 * Lit les hauteurs de chaque sortie d'un lancer.
 *
 * LE MIDI SE LIT CANAL PAR CANAL, et la batterie est laissée de côté. UN TEXTE SE LIT SELON CE QU'IL
 * PORTE : une notation par `lireNotation`, des « Hauteurs » en nombres, des « Accords » en symboles
 * chiffrés. Tout autre texte reste non lu.
 */
export async function lireSorties(
  ports: readonly PortDeSortie[],
  valeurs: readonly unknown[],
  lireNotation?: (texte: string) => Promise<unknown>,
): Promise<{ lues: SortieLue[]; nonLues: SortieNonLue[] }> {
  const lues: SortieLue[] = [];
  const nonLues: SortieNonLue[] = [];
  for (const [rang, port] of ports.entries()) {
    const v = valeurs[rang];
    const nonLue = (raison: string) => nonLues.push({ port: port.nom, rang, raison });
    if (v == null) { nonLue("rien rendu"); continue; }
    if (port.type === "midi" || (port.type === "texte" && port.sousType === "notation")) {
      const fichier = port.type === "midi" ? v : typeof v === "string" && lireNotation ? await lireNotation(v) : null;
      const notes = await notesDuMidi(fichier);
      if (!notes) { nonLue(port.type === "midi" ? "le port MIDI n'a pas rendu de fichier" : "notation non lue"); continue; }
      const canaux = [...new Set(notes.map((n) => n.canal))].filter((c) => c !== CANAL_BATTERIE).sort((a, b) => a - b);
      for (const canal of canaux) {
        const hauteurs = notes.filter((n) => n.canal === canal).map((n) => ({ note: n.note, debut: n.debut, fin: n.fin })).sort(parDebut);
        lues.push({ port: port.nom, rang, canal, nature: port.type === "midi" ? "midi" : "notation", hauteurs });
      }
      continue;
    }
    if (port.type === "sequence") {
      if (!estSequence(v)) { nonLue("valeur qui n'est pas une séquence"); continue; }
      lues.push({ port: port.nom, rang, nature: "sequence", hauteurs: v.notes.map((n) => ({ note: n.note, debut: n.debut, fin: n.fin })).sort(parDebut) });
      continue;
    }
    if (port.type === "cercle") {
      const c = v as { sorte?: string; sommets?: { position: number; valeur: number }[] };
      if (c.sorte !== "hauteur" || !Array.isArray(c.sommets)) { nonLue("cercle de percussion, sans hauteur"); continue; }
      lues.push({ port: port.nom, rang, nature: "cercle", hauteurs: c.sommets.map((s) => ({ note: s.valeur, debut: s.position, fin: s.position + 1 })) });
      continue;
    }
    if (port.type === "texte" && typeof v === "string") {
      const h = port.nom === "Hauteurs" ? nombres(v) : port.nom === "Accords" ? accordsChiffres(v) : undefined;
      if (h === undefined) { nonLue("texte libre, sans hauteur à lire"); continue; }
      if (h === null) { nonLue(`texte « ${port.nom} » illisible : ${v.slice(0, 60)}`); continue; }
      lues.push({ port: port.nom, rang, nature: port.nom === "Hauteurs" ? "nombres" : "accords", hauteurs: h });
      continue;
    }
    nonLue(port.type === "audio" ? "son : lu par la passe profonde" : `type « ${port.type} » sans hauteur à lire`);
  }
  return { lues, nonLues };
}
