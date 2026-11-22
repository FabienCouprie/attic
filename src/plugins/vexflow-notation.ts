// plugins/vexflow-notation.ts — De la notation vers une portee, une tablature, une grille.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.

import { Chord } from "tonal";
import { accordsDepuisRomains, estProgressionRomaine, modeDepuisTonalite, toniqueDepuisTonalite } from "../audio/theorie-romains";
import {
  barreDeDuree, easyScoreDe, jetonsDe, lireHauteur, lireNotationVexflow, longueurDe, mettreEnMesures,
  type ElementGrave, type Evenement, type FauteGravure, type Hauteur, type NoteTab,
} from "../audio/notation-vexflow";
import { Renderer, Factory, TabStave, TabNote, Voice, Formatter } from "vexflow";

/**
 * Accords d'une progression écrite pour une partition.
 *
 * Le champ « Tonalité » est du texte libre : il reçoit aussi bien « A » que
 * « A minor (90%) », ce dernier venant de la sortie d'« Analyse harmonique ». Il
 * faut donc en extraire la tonique — Tonal ne sait rien faire de la chaîne
 * entière et rendait une grille vide — et en lire le mode s'il y figure, le
 * réglage « Gamme » ne servant que lorsqu'il n'y figure pas.
 */
export function accordsPourPartition(tonalite: string, gammeReglee: string, tokens: string[]): string[] {
  const tonique = toniqueDepuisTonalite(tonalite) ?? "C";
  const mode = modeDepuisTonalite(tonalite) ?? (gammeReglee === "mineur" ? "mineur" : "majeur");
  return accordsDepuisRomains(tonique, tokens, mode);
}

// `barreDeDuree` VIVAIT ICI et habite `audio/notation-vexflow.ts`, avec le lecteur de la notation :
// deux lecteurs du même jeton ne doivent pas se répondre différemment, celui qui l'analyse, et celui
// qui dit si le texte est bien dans cette notation.

/**
 * Les jetons qui NE PORTENT PAS LEUR DURÉE, et qui disent donc que ce texte n'est pas cette notation.
 *
 * POURQUOI UN RELEVÉ DE JETONS PLUTÔT QU'UN OUI OU NON. Un jeton sans barre reçoit une noire par
 * défaut, juste en dessous : un texte étranger traverse donc l'analyse en se changeant en notes
 * plausibles, et c'est la bibliothèque qui s'arrête ensuite, sur une voix incomplète dont le message
 * ne dit rien à personne. MESURÉ : les quatre sorties nommées « Notation » du catalogue écrivent
 * toutes le format de « Texte → MIDI », où la durée est un jeton À PART — « Tempo 90 »,
 * « C4+E4+G4 2.000 ». Nommer les jetons fautifs dit à la fois que le format n'est pas le bon, et
 * lequel il est.
 */
export function jetonsSansDuree(texte: string): string[] {
  return jetonsDe(texte).filter((t) => barreDeDuree(t) === -1);
}

/**
 * Les jetons de tablature dont la corde ou la frette n'est PAS UN NOMBRE.
 *
 * LA MÊME FAUTE QUE CI-DESSUS, dans l'autre notation. `genererTab` découpait « corde-fret » et
 * passait les deux morceaux à `parseInt` sans jamais regarder le résultat : « Tempo » donnait une
 * corde NaN et une frette NaN, et la note était dessinée telle quelle. MESURÉ dans l'application sur
 * le format de « Texte → MIDI » : le nœud annonçait « Terminé » et gravait QUATRE « NaN » sur la
 * portée. Le garde qui comptait les notes ne pouvait rien voir, un jeton produisant toujours une
 * note — valide ou non.
 *
 * LA DURÉE N'EST PAS EXIGÉE ICI, à la différence de la portée : un jeton de tablature sans barre
 * vaut une noire par défaut. La notice ne le disait pas, contrairement à ce que ce commentaire
 * affirmait ; elle le dit depuis la revue des notations en texte du 2026-11-22.
 */
export function jetonsSansCordeFret(texte: string): string[] {
  return texte.split(/\s+/).filter(Boolean).filter((tok) => {
    const [corde, fret] = tok.split("/")[0].split("-");
    return !Number.isInteger(Number.parseInt(corde, 10)) || !Number.isInteger(Number.parseInt(fret, 10));
  });
}

// `accordsInconnus` VIVAIT ICI et habite désormais `audio/theorie-romains.ts` : trois composants de
// théorie posaient la même question, et deux lecteurs d'un même symbole ne doivent pas se répondre
// différemment. La gravure l'importe de là plutôt que d'en garder une copie.

function creerRenderer(width: number, height: number): { renderer: InstanceType<typeof Renderer>; div: HTMLDivElement } {
  const div = document.createElement("div");
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(width, height);
  return { renderer, div };
}

function extraireSvgRendu(div: HTMLDivElement): string {
  // VexFlow produit parfois un premier SVG vide (contexte) avant le SVG réel.
  // On ne garde que les SVG contenant du contenu, ce qui évite un rectangle blanc vide.
  const svgs = Array.from(div.querySelectorAll("svg")).filter((svg) => svg.childElementCount > 0);
  return svgs.map((svg) => svg.outerHTML).join("");
}

// ── MIDI → notation VexFlow ──

const NOMS_NOTES: string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DUREES_VEX: { q: number; v: string }[] = [
  { q: 0.125, v: "32" },
  { q: 0.25, v: "16" },
  { q: 0.5, v: "8" },
  { q: 1, v: "q" },
  { q: 2, v: "h" },
  { q: 4, v: "w" },
];

/**
 * Les grilles de la partition, en noires. CE SONT LES DURÉES QU'ELLE SAIT ÉCRIRE, `DUREES_VEX`, et
 * aucune autre : sans point ni triolet, une attaque posée sur une grille pointée ou de triolet
 * tomberait entre deux durées écrites, et la partition comblerait l'écart de silences.
 */
export const GRILLES_NOTATION: Record<string, number> = {
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/32": 0.125,
  "1/1": 4,
  "1/2": 2,
};

function dureeStandardVex(quarts: number): string {
  const clamped = Math.max(0.125, Math.min(4, quarts));
  let meilleur = DUREES_VEX[0];
  let best = Infinity;
  for (const d of DUREES_VEX) {
    const diff = Math.abs(clamped - d.q);
    if (diff < best) {
      best = diff;
      meilleur = d;
    }
  }
  return meilleur.v;
}

/**
 * Le nom VexFlow d'une hauteur, arrondie au demi-ton.
 *
 * LA HAUTEUR EST ARRONDIE, ET IL FAUT QU'ELLE LE SOIT. Une hauteur peut ne pas tomber sur un
 * demi-ton, la conversion en fréquence étant continue. `NOMS_NOTES[note % 12]` cherchait alors une
 * case qui n'existe pas et rendait `undefined` : le jeton devenait « undefined4/q », que le dessin
 * refuse, et la partition disparaissait sans un mot. La notation employée ici n'a pas de signe pour
 * le quart de ton ; l'arrondi est donc sa limite, et non un oubli.
 */
function noteMidiEnNom(note: number): string {
  const proche = Math.round(note);
  const nom = NOMS_NOTES[((proche % 12) + 12) % 12];
  const octave = Math.floor(proche / 12) - 1;
  return `${nom}${octave}`;
}

function quantifier(quarts: number, grille: number): number {
  return Math.max(0, Math.round(quarts / grille) * grille);
}

export function midiVersNotationEasyScore(
  notes: { note: number; debut: number; fin: number; canal?: number }[],
  bpm: number,
  grilleQuarts: number,
): string {
  if (notes.length === 0) return "";
  const secEnQuarts = (sec: number) => (sec * bpm) / 60;

  // Rassembler les notes par instant de début quantifié pour former des accords
  const groupes = new Map<number, { notes: number[]; fin: number }>();
  for (const n of notes) {
    const debut = quantifier(secEnQuarts(n.debut), grilleQuarts);
    const fin = quantifier(secEnQuarts(n.fin), grilleQuarts);
    if (fin <= debut) continue;
    const g = groupes.get(debut);
    if (g) {
      g.notes.push(n.note);
      g.fin = Math.min(g.fin, fin); // accord = durée la plus courte
    } else {
      groupes.set(debut, { notes: [n.note], fin });
    }
  }

  const sorted = Array.from(groupes.entries()).sort((a, b) => a[0] - b[0]);
  let position = 0;
  const parts: string[] = [];

  for (const [debut, groupe] of sorted) {
    if (debut > position) {
      const reste = quantifier(debut - position, grilleQuarts);
      if (reste > 0) {
        const duree = dureeStandardVex(reste);
        parts.push(`B4/${duree}/r`);
        position += DUREES_VEX.find((d) => d.v === duree)?.q ?? reste;
      }
    }
    const dureeQuarts = quantifier(groupe.fin - debut, grilleQuarts);
    if (dureeQuarts <= 0) continue;
    const duree = dureeStandardVex(dureeQuarts);
    const noms = Array.from(new Set(groupe.notes)).sort((a, b) => a - b).map(noteMidiEnNom);
    const token = noms.length > 1 ? `(${noms.join(" ")})/${duree}` : `${noms[0]}/${duree}`;
    parts.push(token);
    position = debut + (DUREES_VEX.find((d) => d.v === duree)?.q ?? dureeQuarts);
  }

  return parts.join(" ");
}

/**
 * Grave des mesures sur une portée : une barre entre deux mesures, une liaison entre deux éléments
 * liés, et seules les altérations que la mise en mesures dit de dessiner.
 *
 * LE RENDU EST ENVELOPPÉ, ET LE RETRAIT DU DIV GARANTI. VexFlow lève sur ce qu'il refuse, et cette
 * erreur remontait telle quelle jusqu'au statut du nœud, « [RuntimeError] IncompleteVoice », qui ne
 * dit ni ce qui était attendu, ni quoi brancher. La notation est lue avant d'arriver ici, et ses
 * fautes nommées ; ce qui lève encore vaut une portée vide, et la cause reste dans la console.
 */
export function genererPortee(mesures: ElementGrave[][], clef: string, largeur: number, hauteur: number): string {
  const { div } = creerRenderer(largeur, hauteur);
  div.id = "vex-" + Math.random().toString(36).slice(2);
  document.body.appendChild(div);
  try {
    const vf = new Factory({ renderer: { elementId: div.id, width: largeur, height: hauteur } });
    const score = vf.EasyScore();
    const elements = mesures.flat();
    if (elements.length === 0) return "";
    const notes = elements.map((e) => score.notes(easyScoreDe(e), { stem: "up" })[0]);
    const tickables: Parameters<InstanceType<typeof Voice>["addTickables"]>[0] = [];
    let i = 0;
    mesures.forEach((m, k) => {
      if (k > 0) tickables.push(vf.BarNote());
      for (let j = 0; j < m.length; j++) tickables.push(notes[i++]);
    });
    const voix = vf.Voice({ time: `${mesures.length * 4}/4` }).addTickables(tickables);
    elements.forEach((e, k) => {
      if (!e.lie || !notes[k + 1]) return;
      const indices = e.hauteurs.map((_, j) => j);
      vf.StaveTie({ from: notes[k], to: notes[k + 1], first_indices: indices, last_indices: indices });
    });
    vf.System().addStave({ voices: [voix] }).addClef(clef).addTimeSignature("4/4");
    vf.draw();
    return extraireSvgRendu(div);
  } catch (e) {
    console.warn("[vexflow] notation refusée par la bibliothèque :", e);
    return "";
  } finally {
    div.remove();
  }
}

/** Lit une notation et la grave en mesures ; une notation fautive rend ses fautes, et rien de gravé. */
export function graverNotation(notation: string, clef: string, largeur: number, hauteur: number): { svg: string; fautes: FauteGravure[] } {
  const { evenements, fautes } = lireNotationVexflow(notation);
  if (fautes.length > 0 || evenements.length === 0) return { svg: "", fautes };
  return { svg: genererPortee(mettreEnMesures(evenements), clef, largeur, hauteur), fautes };
}

/**
 * Grave une tablature lue, sur autant de lignes que l'instrument a de cordes : mesuré avant, le
 * ukulélé et la basse se dessinaient sur six. La voix compte exactement ses temps : sous quatre,
 * VexFlow levait « IncompleteVoice », et l'erreur brute arrivait au message.
 */
export function genererTab(notes: readonly NoteTab[], titre: string, cordes: number, largeur: number, hauteur: number): string {
  if (notes.length === 0) return "";
  const { renderer, div } = creerRenderer(largeur, hauteur);
  const ctx = renderer.getContext();
  const stave = new TabStave(10, 20, largeur - 20, { num_lines: cordes });
  stave.setText(titre, 2);
  stave.setContext(ctx).draw();
  const tabNotes = notes.map((n) => new TabNote({ positions: [{ str: n.corde, fret: n.frette }], duration: n.duree, dots: n.points }));
  const temps = notes.reduce((s, n) => s + longueurDe(n.duree, n.points), 0);
  const voice = new Voice({ num_beats: temps, beat_value: 4 });
  voice.addTickables(tabNotes);
  new Formatter().joinVoices([voice]).format([voice], largeur - 40);
  voice.draw(ctx, stave);
  return extraireSvgRendu(div);
}

export function genererGrille(accords: string[], mesuresParLigne: number, largeur: number, hauteur: number): string {
  const { div } = creerRenderer(largeur, hauteur);
  div.id = "vex-" + Math.random().toString(36).slice(2);
  document.body.appendChild(div);
  const vf = new Factory({ renderer: { elementId: div.id, width: largeur, height: hauteur } });
  const staveWidth = (largeur - 20) / mesuresParLigne - 10;
  const lineHeight = hauteur / Math.max(1, Math.ceil(accords.length / mesuresParLigne));
  for (let i = 0; i < accords.length; i++) {
    const col = i % mesuresParLigne;
    const row = Math.floor(i / mesuresParLigne);
    const x = 10 + col * (staveWidth + 10);
    const y = 20 + row * lineHeight;
    const stave = vf.Stave({ x, y, width: staveWidth });
    stave.setContext(vf.getContext()).draw();
    const sym = Chord.get(accords[i]).symbol ?? accords[i];
    const textNote = vf.TextNote({ text: sym, duration: "w" });
    const voice = vf.Voice({ time: "4/4" }).addTickables([textNote]);
    vf.Formatter().joinVoices([voice]).format([voice], staveWidth - 20);
    voice.draw(vf.getContext(), stave);
  }
  // PAS DE `vf.draw()` ICI : chaque portée et chaque voix sont dessinées juste au-dessus, et le
  // dessin de la fabrique les redessinait. Mesuré le 2026-11-22 : huit textes dans le SVG pour quatre
  // accords, l'un sur l'autre, invisibles à l'écran mais doublés dans le fichier exporté.
  const svg = extraireSvgRendu(div);
  div.remove();
  return svg;
}

/** Les accords d'une progression écrite, en chiffres romains ou en symboles. */
export function accordsDeProgression(progression: string, tonic: string, gamme: string): string[] {
  const tokens = progression.split(/\s+/).filter(Boolean);
  const romains = estProgressionRomaine(tokens);
  // `accordsPourPartition` et non Tonal brut : appelé directement, il rendait un
  // accord MAJEUR pour un degré en minuscules (« vi » → La majeur) et résolvait
  // les degrés d'un mode mineur sur la gamme majeure. La partition imprimait
  // donc d'autres accords que ceux joués par les nœuds audio, qui passent tous
  // par la fonction partagée.
  return romains ? accordsPourPartition(tonic, gamme, tokens) : tokens;
}

/** Grave des accords reconnus, une noire chacun, leurs notes posées à l'octave 4. */
export function genererPartition(accords: string[], clef: string, largeur: number, hauteur: number): string {
  const evenements: Evenement[] = accords.map((a, k) => ({
    debut: k, longueur: 1, silence: false,
    hauteurs: Chord.get(a).notes.map((n) => lireHauteur(`${n}4`)).filter((h): h is Hauteur => h !== null),
  }));
  return genererPortee(mettreEnMesures(evenements), clef, largeur, hauteur);
}

