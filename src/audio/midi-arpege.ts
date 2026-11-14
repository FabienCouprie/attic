// audio/midi-arpege.ts — L'arpégiateur.
//
// Il groupe les notes qui commencent ensemble en accords, déroule chaque accord en une suite de
// hauteurs (direction, octaves, motif), et la rejoue pas à pas tant que l'accord tient.
//
// LE PAS SE COMPTE EN NOIRES DU FICHIER, et c'est la réparation du 2026-11-14. Il se calculait par
// `60 / (divisions * 2)`, « à 120 BPM de référence » : la double croche y valait 7,5 s au lieu de
// 0,125 s, soixante fois trop lente, et le tempo du fichier n'y entrait pas. Mesuré avant la
// réparation : un accord tenu une seconde devenait un arpège de vingt et une secondes, à 60 BPM comme
// à 120. Le fichier rendu garde désormais les changements de tempo et la métrique de l'entrée, et
// ses notes tombent sur la grille de ses temps.
//
// LA DIRECTION S'APPLIQUE À L'ARPÈGE ENTIER, octaves comprises : il se jouait octave par octave, de
// sorte que « Descendant » sur deux octaves descendait dans chaque octave en montant d'une octave à
// l'autre. LE MOTIF GLISSE SUR L'ARPÈGE, décision de Fabien du même jour : il ne prenait que les
// trois premières notes, et « Octaves » n'agissait plus dès qu'un motif était choisi. Sur un accord
// de trois notes et une octave, les cinq directions d'avant et les motifs rendent les mêmes hauteurs
// qu'avant.

import { parseMidi, writeMidi } from "midi-file";
import { resoudreRecouvrements } from "./midi-recouvrement";
import { analyserMidi } from "./midi";

/**
 * La longueur d'un pas en noires, pour chaque valeur de note offerte.
 *
 * CE NOMBRE EST PROPRE À CE CALCUL, et non à la table commune (`valeurs-note.ts` dit pourquoi) :
 * ici c'est la noire du fichier qu'on mesure. Les deux écritures du triolet qu'un projet ancien
 * porte y sont lues aussi.
 */
export const NOIRES_PAR_PAS: Record<string, number> = {
  "1/1": 4, "1/2": 2,
  "1/4.": 1.5, "1/4": 1, "1/4t": 2 / 3,
  "1/8.": 0.75, "1/8": 0.5, "1/8t": 1 / 3,
  "1/16.": 0.375, "1/16": 0.25, "1/16t": 1 / 6,
  "1/32": 0.125, "1/32t": 1 / 12,
  "1/8 triplet": 1 / 3, "1/16 triplet": 1 / 6,
};

/** Les directions, sous les identifiants du dépôt pour le sens d'un arpège. */
export const DIRECTIONS = ["montant", "descendant", "aller-retour", "retour-aller", "aleatoire", "ordre-de-jeu", "convergent", "divergent"] as const;

/** Mélange uniforme (Fisher-Yates), sans modifier le tableau d'origine. */
function melangerUniformement(arr: number[], hasard: () => number): number[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** L'arpège déroulé d'un accord : ses notes dans l'ordre de la direction, sur toutes les octaves. */
export function deroulerArpege(jouees: number[], direction: string, octaves: number, hasard: () => number = Math.random): number[] {
  // Chaque octave rejoue l'accord douze demi-tons plus haut, à la suite de la précédente.
  const etendre = (notes: number[]) => Array.from({ length: Math.max(1, octaves) }, (_, o) => notes.map((n) => n + 12 * o)).flat();
  const montant = etendre([...jouees].sort((a, b) => a - b));
  const descendant = [...montant].reverse();
  // Des bords vers le milieu : la plus grave, la plus aiguë, la deuxième plus grave…
  const convergent = montant.map((_, i) => montant[i % 2 === 0 ? i / 2 : montant.length - 1 - (i - 1) / 2]);
  switch (direction) {
    case "descendant": return descendant;
    case "aller-retour": return [...montant, ...descendant.slice(1, -1)];
    case "retour-aller": return [...descendant, ...montant.slice(1, -1)];
    // Fisher-Yates, et non `sort(() => hasard() - 0.5)` : un comparateur incohérent ne rend pas une
    // permutation uniforme, et le défaut était invisible parce qu'un arpège aléatoire a toujours
    // l'air aléatoire.
    case "aleatoire": return melangerUniformement(montant, hasard);
    case "ordre-de-jeu": return etendre(jouees);
    case "convergent": return convergent;
    case "divergent": return [...convergent].reverse();
    default: return montant;
  }
}

/**
 * Le motif posé sur l'arpège déroulé : il se rejoue décalé d'une note à chaque fois, jusqu'au bout.
 * « 1232 » sur do mi sol do' rend do mi sol mi, puis mi sol do' sol. Un arpège plus court que le
 * motif n'en garde que les notes qui existent.
 */
export function appliquerMotif(arpege: number[], motif: string): number[] {
  if (!motif || motif === "Droit") return arpege;
  const rangs = motif.split("").map((c) => parseInt(c, 10) - 1).filter((r) => r >= 0);
  if (rangs.length === 0) return arpege;
  const portee = Math.max(...rangs) + 1;
  if (arpege.length < portee) {
    const gardees = rangs.filter((r) => r < arpege.length).map((r) => arpege[r]);
    return gardees.length > 0 ? gardees : arpege;
  }
  const out: number[] = [];
  for (let k = 0; k + portee <= arpege.length; k++) for (const r of rangs) out.push(arpege[k + r]);
  return out;
}

type ChangementTempo = { tick: number; usParNoire: number; sec: number };

/** Les changements de tempo d'un fichier, avec l'instant où chacun tombe, comme `analyserMidi` les lit. */
function carteDesTempos(midi: ReturnType<typeof parseMidi>): { tpm: number; tempos: ChangementTempo[] } {
  const tpm = midi.header.ticksPerBeat ?? 480;
  const bruts: { tick: number; us: number }[] = [{ tick: 0, us: 500000 }];
  for (const piste of midi.tracks) {
    let tick = 0;
    for (const e of piste) { tick += e.deltaTime; if (e.type === "setTempo") bruts.push({ tick, us: e.microsecondsPerBeat }); }
  }
  bruts.sort((a, b) => a.tick - b.tick);
  const tempos: ChangementTempo[] = [];
  let sec = 0;
  bruts.forEach((b, i) => {
    if (i > 0) sec += ((b.tick - bruts[i - 1].tick) / tpm) * (bruts[i - 1].us / 1e6);
    tempos.push({ tick: b.tick, usParNoire: b.us, sec });
  });
  return { tpm, tempos };
}

/** Un instant en secondes, rendu en noires depuis le début du fichier. */
function secondesEnNoires(c: { tpm: number; tempos: ChangementTempo[] }, s: number): number {
  let t = c.tempos[0];
  for (const x of c.tempos) { if (x.sec <= s + 1e-9) t = x; else break; }
  return t.tick / c.tpm + ((s - t.sec) * 1e6) / t.usParNoire;
}

export async function arpegerMidi(
  fichier: File,
  motif: string,
  direction: string,
  vitesseNom: string,
  octaves: number,
  dureeNotePct: number,
  hasard: () => number = Math.random,
): Promise<File> {
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  const midi = parseMidi(bytes);
  const { notes } = analyserMidi(midi);
  if (notes.length === 0) return fichier;
  const carte = carteDesTempos(midi);

  // Deux notes sont dans le même accord quand elles commencent à moins de 30 ms l'une de l'autre.
  // L'ordre d'arrivée des notes est gardé, pour la direction « ordre de jeu ».
  const tol = 0.03;
  const accords: { temps: number; jouees: number[]; velocite: number; fin: number }[] = [];
  for (const n of [...notes].sort((a, b) => a.debut - b.debut)) {
    const dernier = accords[accords.length - 1];
    if (dernier && Math.abs(n.debut - dernier.temps) < tol) {
      dernier.jouees.push(n.note);
      dernier.velocite = Math.max(dernier.velocite, n.velocite);
      dernier.fin = Math.max(dernier.fin, n.fin);
    } else {
      accords.push({ temps: n.debut, jouees: [n.note], velocite: n.velocite, fin: n.fin });
    }
  }

  // Le pas, et la durée de chaque note arpégée, en noires.
  const pas = NOIRES_PAR_PAS[vitesseNom] ?? NOIRES_PAR_PAS["1/16"];
  const dureeNote = pas * (dureeNotePct / 100);

  const lignes: { tick: number; type: string; [key: string]: any }[] = [];
  for (const accord of accords) {
    const suite = appliquerMotif(deroulerArpege(accord.jouees, direction, octaves, hasard), motif);
    if (suite.length === 0) continue;
    const debut = secondesEnNoires(carte, accord.temps);
    // L'arpège dure ce que dure l'accord, en cycles entiers de la suite, et un cycle au moins.
    const dureeAccord = Math.max(secondesEnNoires(carte, accord.fin) - debut, suite.length * pas);
    const nbCycles = Math.max(1, Math.floor(dureeAccord / (suite.length * pas) + 1e-9));
    const velocity = Math.max(1, Math.min(127, Math.round(accord.velocite * 0.9)));
    for (let c = 0; c < nbCycles; c++) {
      suite.forEach((hauteur, i) => {
        const t = debut + (c * suite.length + i) * pas;
        const tickDebut = Math.round(t * carte.tpm);
        const noteNumber = Math.max(0, Math.min(127, hauteur));
        lignes.push({ tick: tickDebut, type: "noteOn", channel: 0, noteNumber, velocity });
        lignes.push({ tick: Math.max(tickDebut + 1, Math.round((t + dureeNote) * carte.tpm)), type: "noteOff", channel: 0, noteNumber, velocity: 0 });
      });
    }
  }

  // LA DURÉE DE NOTE PEUT DÉPASSER LE PAS DE L'ARPÈGE, et un motif qui revient sur la même hauteur
  // la rejouait alors avant de l'avoir relâchée. Voir `midi-recouvrement.ts`.
  const ordonnees = resoudreRecouvrements(lignes);
  // Les tempos et la métrique de l'entrée, à leur place : ce sont eux qui donnent aux notes rendues
  // la grille de leurs temps. Le tempo par défaut ne s'écrit que si l'entrée n'en pose aucun au début.
  const metas: { tick: number; type: string; [key: string]: any }[] = carte.tempos
    .filter((_, i) => i > 0 || !carte.tempos.slice(1).some((x) => x.tick === 0))
    .map((t) => ({ tick: t.tick, type: "setTempo", microsecondsPerBeat: t.usParNoire }));
  const signature = midi.tracks.flat().find((e) => e.type === "timeSignature");
  metas.push({
    tick: 0, type: "timeSignature",
    numerator: signature?.type === "timeSignature" ? signature.numerator : 4,
    denominator: signature?.type === "timeSignature" ? signature.denominator : 4,
  });
  let tickCourant = 0;
  const events: { deltaTime: number; type: string; [key: string]: any }[] = [];
  for (const l of [...metas, ...ordonnees].sort((a, b) => a.tick - b.tick)) {
    const { tick, ...rest } = l;
    events.push({ deltaTime: tick - tickCourant, ...rest });
    tickCourant = tick;
  }
  events.push({ deltaTime: 0, type: "endOfTrack" });

  const nouvMidi = { header: { format: 1 as const, numTracks: 1, ticksPerBeat: carte.tpm }, tracks: [events] };
  const nouvBytes = new Uint8Array(writeMidi(nouvMidi as any));
  const nomBase = fichier.name.replace(/\.mid$/i, "");
  return new File([nouvBytes], `${nomBase}_arp.mid`, { type: "audio/midi" });
}
