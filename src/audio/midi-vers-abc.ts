// audio/midi-vers-abc.ts — Écriture d'un fichier MIDI en notation ABC.
//
// L'inverse d'audio/abc.ts, et nettement plus difficile : le MIDI dit QUAND
// sonnent les notes, pas comment les écrire. Quatre décisions ne se lisent pas
// dans le fichier.
//
// LA MÉTRIQUE. Tous les écrivains de MIDI d'Attic inscrivent « 4/4 » en dur, et
// aucun n'écrit la tonalité : la métrique d'un fichier ne dit donc rien. Elle
// est lue dans le fichier par défaut, et se choisit à la main. Il n'y a PAS de
// détection automatique : elle se tromperait sans le dire, et des barres mal
// placées rendent une partition illisible tout en restant « valide ».
//
// LA GRILLE. Une note de 470 ticks est-elle une noire jouée un peu court ? La
// grille la plus grossière qui tombe EXACTEMENT sur tous les débuts et fins est
// cherchée d'abord : sur du matériau généré, rien ne bouge. À défaut — jeu
// capturé, humanisé, transcrit —, la grille choisie s'applique, et le nombre de
// notes déplacées est rendu.
//
// LES VOIX. Une voix ABC est une suite de notes et d'accords. Des notes qui
// commencent et finissent ensemble forment un accord ; une basse tenue sous une
// mélodie qui bouge ne tient pas dans une seule voix, et en crée une seconde.
//
// L'ORTHOGRAPHE. Un do dièse et un ré bémol sont la même touche. L'armure en
// décide : les notes de la gamme prennent son orthographe, les autres des dièses
// en tonalité à dièses et des bémols en tonalité à bémols.

import { parseMidi } from "midi-file";
import { traduire } from "../i18n";
import { lireTonalite, type Armure } from "./abc";
import { tonaliteDepuisChroma } from "./accords";

// ── Lecture du MIDI ─────────────────────────────────────────────────────

export type NoteBrute = { canal: number; hauteur: number; debut: number; fin: number };

export type MidiLu = {
  notes: NoteBrute[];
  ppq: number;
  tempo: number | null;
  temposDistincts: number;
  metrique: { numerateur: number; denominateur: number } | null;
  programmes: Map<number, number>;
  titre: string;
};

export function lireNotesMidi(octets: Uint8Array): MidiLu {
  const midi = parseMidi(octets);
  const ppq = midi.header.ticksPerBeat || 480;
  const notes: NoteBrute[] = [];
  const tempos = new Set<number>();
  let tempo: number | null = null, metrique: MidiLu["metrique"] = null, titre = "";
  const programmes = new Map<number, number>();

  for (const piste of midi.tracks) {
    let t = 0;
    const ouvertes = new Map<string, number[]>();
    for (const e of piste as any[]) {
      t += e.deltaTime;
      if (e.type === "setTempo") {
        const bpm = 60_000_000 / e.microsecondsPerBeat;
        tempos.add(Math.round(bpm * 1000) / 1000);
        if (tempo === null) tempo = bpm;
      } else if (e.type === "timeSignature" && !metrique) {
        metrique = { numerateur: e.numerator, denominateur: e.denominator };
      } else if (e.type === "trackName" && !titre && e.text) {
        titre = String(e.text).trim();
      } else if (e.type === "programChange" && !programmes.has(e.channel)) {
        programmes.set(e.channel, e.programNumber);
      } else if (e.type === "noteOn" && e.velocity > 0) {
        const cle = `${e.channel}:${e.noteNumber}`;
        (ouvertes.get(cle) ?? ouvertes.set(cle, []).get(cle)!).push(t);
      } else if (e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) {
        const pile = ouvertes.get(`${e.channel}:${e.noteNumber}`);
        const debut = pile?.shift();
        if (debut !== undefined) notes.push({ canal: e.channel, hauteur: e.noteNumber, debut, fin: t });
      }
    }
    // Notes jamais relâchées : closes à la fin de leur piste.
    for (const [cle, debuts] of ouvertes) {
      const [canal, hauteur] = cle.split(":").map(Number);
      for (const debut of debuts) notes.push({ canal, hauteur, debut, fin: Math.max(debut + 1, t) });
    }
  }
  return { notes, ppq, tempo, temposDistincts: tempos.size, metrique, programmes, titre };
}

// ── Grille ──────────────────────────────────────────────────────────────

/** Subdivisions de la noire essayées, de la plus grossière à la plus fine. */
const GRILLES = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/**
 * La grille la plus grossière sur laquelle TOUS les débuts et fins tombent, à
 * un tick près — l'arrondi des écrivains de MIDI. null si aucune.
 */
export function grilleExacte(notes: NoteBrute[], ppq: number): number | null {
  for (const s of GRILLES) {
    const pas = ppq / s;
    if (notes.every((n) => [n.debut, n.fin].every((t) => Math.abs(t - Math.round(t / pas) * pas) <= 1))) return s;
  }
  return null;
}

// ── Orthographe ────────────────────────────────────────────────────────

const NATUREL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const LETTRES = "CDEFGAB";

/** Lettre et altération d'une hauteur, selon l'armure. */
export function epeler(hauteur: number, armure: Armure): { lettre: string; alteration: number } {
  const pc = ((hauteur % 12) + 12) % 12;
  for (const L of LETTRES) {
    if ((((NATUREL[L] + (armure.alterations[L] ?? 0)) % 12) + 12) % 12 === pc) return { lettre: L, alteration: armure.alterations[L] ?? 0 };
  }
  for (const L of LETTRES) if (NATUREL[L] === pc) return { lettre: L, alteration: 0 };
  if (armure.quintes >= 0) {
    for (const L of LETTRES) if (NATUREL[L] === (pc + 11) % 12) return { lettre: L, alteration: 1 };
  }
  for (const L of LETTRES) if (NATUREL[L] === (pc + 1) % 12) return { lettre: L, alteration: -1 };
  return { lettre: "C", alteration: 0 }; // inatteignable : toute classe a un voisin naturel
}

const SIGNE: Record<number, string> = { 2: "^^", 1: "^", 0: "=", [-1]: "_", [-2]: "__" };

/** Texte ABC d'une hauteur, avec l'altération seulement si l'armure et la mesure en cours ne la donnent pas déjà. */
function ecrireHauteur(hauteur: number, armure: Armure, barre: Map<string, number>): string {
  const { lettre, alteration } = epeler(hauteur, armure);
  const octave = Math.floor((hauteur - alteration - NATUREL[lettre]) / 12) - 5;
  const cle = `${lettre}${octave}`;
  const courante = barre.has(cle) ? barre.get(cle)! : (armure.alterations[lettre] ?? 0);
  let texte = "";
  if (alteration !== courante) {
    texte = SIGNE[alteration];
    barre.set(cle, alteration);
  }
  return texte + (octave >= 1 ? lettre.toLowerCase() + "'".repeat(octave - 1) : lettre + ",".repeat(-octave));
}

// ── Durées ─────────────────────────────────────────────────────────────

const pgcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : pgcd(b, a % b));

/** Une durée en unités L = 1/8, écrite « 2 », « / », « 3/2 »… */
function ecrireDuree(n: number, d: number): string {
  const g = pgcd(n, d) || 1;
  n /= g; d /= g;
  if (d === 1) return n === 1 ? "" : String(n);
  if (n === 1) return d === 2 ? "/" : `/${d}`;
  return `${n}/${d}`;
}

// ── Écriture ───────────────────────────────────────────────────────────

type Evenement = { debut: number; fin: number; hauteurs: number[] };
type Morceau = { debut: number; duree: number; hauteurs: number[]; lie: boolean };

export type OptionsMidiVersAbc = {
  /** « fichier » ou « n/d ». */
  metrique: string;
  /** « auto » ou un champ K: (« G », « Am », « Ddor »…). */
  tonalite: string;
  /** « auto » ou un nombre de subdivisions de la noire. */
  grille: "auto" | number;
  titre: string;
  /**
   * « voix » : un chevauchement crée une voix de plus, et l'aller-retour reste
   * exact. « raccourcir » : une note est coupée à l'attaque de la suivante, pour
   * garder une mélodie legato sur une seule ligne.
   */
  chevauchements?: "voix" | "raccourcir";
  /** Accords chiffrés à poser sur la première voix : instant en noires et symbole. */
  accords?: { debut: number; symbole: string }[];
};

export type ResultatMidiVersAbc = {
  abc: string;
  cle: string;
  tonaliteNom: string;
  tonaliteAuto: { confiance: number; marge: number } | null;
  metrique: string;
  subdivisions: number;
  grilleExacte: boolean;
  notesDeplacees: number;
  notesEcrites: number;
  /** Notes coupées à l'attaque de la suivante (mode « raccourcir »). */
  notesRaccourcies: number;
  voix: number;
  batterieIgnoree: number;
  /** Moins d'un quart des notes attaquées avec une autre : la tonalité déduite n'est pas fiable. */
  ligneSeule: boolean;
  avertissements: string[];
};

const NOMS_MAJEUR = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const NOMS_MINEUR = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

export function midiVersAbc(octets: Uint8Array, o: OptionsMidiVersAbc): ResultatMidiVersAbc {
  const avertissements = new Set<string>();
  const lu = lireNotesMidi(octets);
  const batterie = lu.notes.filter((n) => n.canal === 9);
  const notes = lu.notes.filter((n) => n.canal !== 9);
  if (batterie.length > 0) avertissements.add(traduire("msg.midi_abc.ecriture.batterie_var_0", batterie.length));
  if (lu.temposDistincts > 1) avertissements.add(traduire("msg.midi_abc.ecriture.tempos"));

  // Métrique.
  let metrique = lu.metrique ?? { numerateur: 4, denominateur: 4 };
  if (o.metrique !== "fichier") {
    const m = /^(\d+)\/(\d+)$/.exec(o.metrique);
    if (m) metrique = { numerateur: parseInt(m[1], 10), denominateur: parseInt(m[2], 10) };
  }

  // Grille : exacte si possible, sinon celle demandée (1/16 par défaut).
  const exacte = grilleExacte(notes, lu.ppq);
  let s = o.grille === "auto" ? (exacte ?? 4) : o.grille;
  // Un accord posé à mi-mesure doit tomber sur la grille, même quand les notes,
  // elles, se contentaient d'une grille plus grossière.
  while (s < 48 && (o.accords ?? []).some((a) => Math.abs(a.debut * s - Math.round(a.debut * s)) > 1e-6)) s *= 2;
  // La mesure doit tomber sur la grille : 3/8 fait une noire et demie, qu'une
  // grille en triolets (3 par noire) ne sait pas couper.
  // Le temps aussi : en 6/8, une noire pointée sur une grille d'une subdivision
  // par noire tomberait entre deux cases.
  const compose = metrique.denominateur === 8 && metrique.numerateur % 3 === 0 && metrique.numerateur > 3;
  const tempsPour = (x: number) => (compose ? (3 * x) / 2 : (4 * x) / metrique.denominateur);
  while ((metrique.numerateur * 4 * s) % metrique.denominateur !== 0 || !Number.isInteger(tempsPour(s))) s *= 2;
  const pas = lu.ppq / s;
  const mesure = (metrique.numerateur * 4 * s) / metrique.denominateur;
  const temps = tempsPour(s);

  let deplacees = 0;
  const quantifiees = notes.map((n) => {
    const debut = Math.round(n.debut / pas);
    const fin = Math.max(debut + 1, Math.round(n.fin / pas));
    if (Math.abs(n.debut - debut * pas) > 1 || Math.abs(n.fin - fin * pas) > 1) deplacees++;
    return { ...n, debut, fin };
  });

  // Tonalité.
  //
  // FIABLE SUR DE L'HARMONIE, PAS SUR UNE LIGNE SEULE — mesuré sur le Groove
  // Box, huit tonalités et trois graines : la partie d'accords donne la bonne
  // tonalité 24 fois sur 24, la basse seule 0 fois sur 24 (ré mineur lu sol
  // mineur, systématiquement), la mélodie seule 4 fois sur 24. Et rien ne permet
  // de le voir au score : une basse fausse obtient 0,79 de confiance et un écart
  // au second candidat plus grand que certaines parties d'accords justes. Aucun
  // seuil ne peut donc servir d'alerte. Ce qui le permet, c'est la texture :
  // une entrée dont les notes ne sont presque jamais ATTAQUÉES ensemble est
  // signalée, et l'avertissement demande d'imposer la tonalité.
  //
  // Attaquées ensemble, et non « sonnant ensemble » : un premier critère, la
  // part du temps à plusieurs notes, classait la mélodie du Groove Box comme de
  // l'harmonie — ses notes se chevauchent en legato, 10 à 16 % du temps. Mesuré
  // sur seize configurations, la part d'attaques simultanées vaut 0,00 sur la
  // basse et la mélodie seules, 1,00 sur les accords, 0,70 à 0,73 sur le fichier
  // complet : le seuil de 0,25 tombe au milieu de l'écart.
  let cle: string, tonaliteAuto: ResultatMidiVersAbc["tonaliteAuto"] = null;
  const ligneSeule = partAttaquesSimultanees(quantifiees) < 0.25;
  if (o.tonalite === "auto") {
    const chroma = new Array(12).fill(0);
    for (const n of quantifiees) chroma[n.hauteur % 12] += n.fin - n.debut;
    const t = tonaliteDepuisChroma(chroma);
    cle = t.type === "major" ? NOMS_MAJEUR[t.tonique] : NOMS_MINEUR[t.tonique];
    tonaliteAuto = { confiance: t.confiance, marge: t.marge };
    if (ligneSeule && quantifiees.length > 0) {
      avertissements.add(traduire("msg.midi_abc.ecriture.ligne_seule"));
    }
  } else {
    cle = o.tonalite.trim();
  }
  const armure = lireTonalite(cle, (m) => avertissements.add(m));

  // Voix : par canal, puis séparation des chevauchements.
  const voix: { canal: number; evenements: Evenement[] }[] = [];
  const canaux = [...new Set(quantifiees.map((n) => n.canal))].sort((a, b) => a - b);
  let raccourcies = 0;
  for (const canal of canaux) {
    const duCanal = quantifiees.filter((x) => x.canal === canal);
    if (o.chevauchements === "raccourcir") {
      // Chaque note s'arrête au plus tard à la PROCHAINE attaque distincte de la
      // sienne. Les notes attaquées ensemble — un accord — ne se coupent pas
      // entre elles.
      const attaques = [...new Set(duCanal.map((n) => n.debut))].sort((a, b) => a - b);
      for (const n of duCanal) {
        const suivante = attaques.find((t) => t > n.debut);
        if (suivante !== undefined && suivante < n.fin) { n.fin = suivante; raccourcies++; }
      }
    }
    const groupes = new Map<string, Evenement>();
    for (const n of duCanal) {
      const k = `${n.debut}:${n.fin}`;
      const g = groupes.get(k) ?? groupes.set(k, { debut: n.debut, fin: n.fin, hauteurs: [] }).get(k)!;
      if (!g.hauteurs.includes(n.hauteur)) g.hauteurs.push(n.hauteur);
    }
    const evenements = [...groupes.values()]
      .map((e) => ({ ...e, hauteurs: e.hauteurs.sort((a, b) => a - b) }))
      .sort((a, b) => a.debut - b.debut || Math.max(...b.hauteurs) - Math.max(...a.hauteurs));
    const lignes: { fin: number; haut: number; evenements: Evenement[] }[] = [];
    for (const e of evenements) {
      const haut = Math.max(...e.hauteurs);
      // Parmi les voix libres, celle dont la dernière note est la plus proche :
      // une ligne mélodique reste une ligne.
      const libres = lignes.filter((l) => l.fin <= e.debut);
      const choisie = libres.sort((a, b) => Math.abs(a.haut - haut) - Math.abs(b.haut - haut))[0];
      if (choisie) { choisie.evenements.push(e); choisie.fin = e.fin; choisie.haut = haut; }
      else lignes.push({ fin: e.fin, haut, evenements: [e] });
    }
    for (const l of lignes) voix.push({ canal, evenements: l.evenements });
  }

  // Toutes les voix sont complétées jusqu'à la même dernière barre.
  const finGlobale = Math.max(0, ...quantifiees.map((n) => n.fin));
  const totalMesures = Math.max(1, Math.ceil(finGlobale / mesure));

  // Accords chiffrés, posés sur la première voix, en cases de grille.
  const accordsGrille = new Map<number, string>();
  for (const a of o.accords ?? []) {
    const g = a.debut * s;
    if (Math.abs(g - Math.round(g)) > 1e-6) avertissements.add(traduire("msg.midi_abc.ecriture.accord_grille_var_0", a.symbole));
    accordsGrille.set(Math.round(g), a.symbole);
  }
  const coupuresAccords = [...accordsGrille.keys()].sort((a, b) => a - b);
  const symboleAccord = (indexVoix: number, debut: number) =>
    indexVoix === 0 && accordsGrille.has(debut) ? `"${accordsGrille.get(debut)}"` : "";

  const corps = voix.map((v, indexVoix) => {
    // Silences et notes, coupés aux barres, les notes coupées liées.
    const morceaux: Morceau[] = [];
    let curseur = 0;
    const pousser = (debut: number, duree: number, hauteurs: number[]) => {
      let d = debut, reste = duree;
      while (reste > 0) {
        const finMesure = (Math.floor(d / mesure) + 1) * mesure;
        let part = Math.min(reste, finMesure - d);
        // Un accord qui change pendant une note la coupe, liée : le symbole doit
        // se poser sur l'instant exact où il sonne.
        if (indexVoix === 0) {
          const prochainAccord = coupuresAccords.find((g) => g > d);
          if (prochainAccord !== undefined && prochainAccord < d + part) part = prochainAccord - d;
        }
        // Un silence se coupe aux temps, comme on l'écrit : « z/ z4 z » et non
        // « z11/2 ». D'abord jusqu'au prochain temps, puis les temps entiers d'un
        // bloc, puis le reste. Les notes, elles, ne sont coupées qu'aux barres.
        if (hauteurs.length === 0) {
          const auTemps = (temps - (d % temps)) % temps;
          if (auTemps > 0 && part > auTemps) part = auTemps;
          else if (auTemps === 0 && part > temps && part % temps !== 0) part -= part % temps;
        }
        reste -= part;
        morceaux.push({ debut: d, duree: part, hauteurs, lie: hauteurs.length > 0 && reste > 0 });
        d += part;
      }
    };
    for (const e of v.evenements) {
      if (e.debut > curseur) pousser(curseur, e.debut - curseur, []);
      pousser(e.debut, e.fin - e.debut, e.hauteurs);
      curseur = e.fin;
    }
    if (curseur < totalMesures * mesure) pousser(curseur, totalMesures * mesure - curseur, []);

    // Mise en texte, mesure par mesure.
    const mesures: string[] = [];
    for (let k = 0; k < totalMesures; k++) {
      const barre = new Map<string, number>();
      const dans = morceaux.filter((m) => m.debut >= k * mesure && m.debut < (k + 1) * mesure);
      let texte = "", tempsPrecedent = -1;
      for (let i = 0; i < dans.length; i++) {
        const m = dans[i];
        // Durée en unités L = 1/8 : (duree / s) noires = 2·duree/s croches.
        let n = 2 * m.duree, d = s;
        let prefixe = "";
        // Triolet : trois éléments égaux dont la durée n'est pas binaire.
        if (d / pgcd(n, d) % 3 === 0) {
          const suivants = dans.slice(i, i + 3);
          if (suivants.length === 3 && suivants.every((x) => x.duree === m.duree)) {
            for (let j = 0; j < 3; j++) {
              const x = dans[i + j];
              const tx = Math.floor((x.debut - k * mesure) / temps);
              const sep = j === 0 && texte && tx !== tempsPrecedent ? " " : "";
              texte += sep + (j === 0 ? "(3" : "") + symboleAccord(indexVoix, x.debut) + ecrireElement(x, 3 * 2 * x.duree, 2 * s, armure, barre);
              tempsPrecedent = tx;
            }
            i += 2;
            continue;
          }
          avertissements.add(traduire("msg.midi_abc.ecriture.duree_fraction"));
        }
        const t = Math.floor((m.debut - k * mesure) / temps);
        // Espace à chaque nouveau temps : les notes d'un même temps restent
        // groupées, comme on les ligature.
        if (texte && (t !== tempsPrecedent || m.duree >= temps)) prefixe = " ";
        texte += prefixe + symboleAccord(indexVoix, m.debut) + ecrireElement(m, n, d, armure, barre);
        tempsPrecedent = t;
      }
      mesures.push(texte);
    }
    const lignes: string[] = [];
    for (let k = 0; k < mesures.length; k += 4) {
      const fin = k + 4 >= mesures.length ? " |]" : " |";
      lignes.push(mesures.slice(k, k + 4).join(" | ") + fin);
    }
    return lignes.join("\n");
  });

  const tempo = lu.tempo ?? 120;
  if (lu.tempo === null) avertissements.add(traduire("msg.midi_abc.ecriture.tempo_absent"));
  const titre = o.titre.trim() || lu.titre || "Sans titre";
  const entete = [
    "X:1",
    `T:${titre}`,
    "% Converti depuis MIDI par Attic",
    ...voix.map((v, k) => `% voix ${k + 1} : canal ${v.canal + 1}, programme ${lu.programmes.get(v.canal) ?? 0}`),
    `M:${metrique.numerateur}/${metrique.denominateur}`,
    "L:1/8",
    `Q:1/4=${Number.isInteger(Math.round(tempo * 100) / 100) ? Math.round(tempo) : (Math.round(tempo * 100) / 100)}`,
    `K:${cle}`,
  ];
  const texteCorps = voix.length <= 1
    ? corps.join("\n")
    : corps.map((c, k) => `V:${k + 1}\n${c}`).join("\n");

  return {
    abc: `${entete.join("\n")}\n${texteCorps}\n`,
    cle,
    tonaliteNom: armure.nom,
    tonaliteAuto,
    metrique: `${metrique.numerateur}/${metrique.denominateur}`,
    subdivisions: s,
    grilleExacte: exacte !== null && o.grille === "auto",
    notesDeplacees: deplacees,
    notesEcrites: quantifiees.length,
    notesRaccourcies: raccourcies,
    voix: voix.length,
    batterieIgnoree: batterie.length,
    ligneSeule,
    avertissements: [...avertissements],
  };
}

/** Part des notes dont l'attaque coïncide avec celle d'une autre note. */
function partAttaquesSimultanees(notes: { debut: number }[]): number {
  const compte = new Map<number, number>();
  for (const n of notes) compte.set(n.debut, (compte.get(n.debut) ?? 0) + 1);
  return notes.length > 0 ? notes.filter((n) => compte.get(n.debut)! > 1).length / notes.length : 0;
}

function ecrireElement(m: Morceau, n: number, d: number, armure: Armure, barre: Map<string, number>): string {
  const duree = ecrireDuree(n, d);
  if (m.hauteurs.length === 0) return `z${duree}`;
  const notes = m.hauteurs.map((h) => ecrireHauteur(h, armure, barre));
  const corps = notes.length === 1 ? notes[0] : `[${notes.join("")}]`;
  return corps + duree + (m.lie ? "-" : "");
}
