// plugins/parole-vers-sequence.ts — Nœud « Parole vers séquence » : un mot, une note.
//
// Vosk rend chaque mot avec son instant de début et son instant de fin. Ce composant met une note
// sur chaque mot : la durée du mot donne la durée de la note, la hauteur de la voix sur cet empan
// donne sa hauteur, et le niveau du mot donne sa nuance. Une phrase dite devient une mélodie qui a
// le rythme de la parole.
//
// POURQUOI LA RECONNAISSANCE EST REFAITE ICI, et non reçue d'un nœud « Vosk » en amont. Les mots
// datés sont un TABLEAU D'ENREGISTREMENTS, et rien de tel ne circule sur une arête : `ValeurAudio`
// n'admet qu'un tampon, un tableau de flottants, un fichier, un texte et une zone. Les faire
// circuler demanderait un membre de plus à l'union du domaine, un type de port, une couleur, et une
// ligne dans chacune des tables engendrées — pour un seul couple de nœuds. Le texte du tableau des
// mots aurait été l'autre voie, et elle est pire : elle couple deux composants par un format
// d'affichage, qu'on ne peut plus toucher ensuite. Le prix du choix est mesuré et modeste : la
// reconnaissance de trois secondes de parole prend 3,3 s, et le modèle est en cache au niveau du
// module de `vosk-asr.ts` — un graphe qui porte les deux nœuds ne le charge qu'une fois.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { MODELES, chargerModele, transcrire, versMono, vers16k, type MotVosk } from "./vosk-asr";
import { suivreVoie, type OptionsVoieHauteur, type SuiviHauteur } from "../audio/hauteur";
import { parCanal } from "./hors-fil";
import { degrePlusProche } from "../audio/correction-hauteur";
import { GAMMES_ACCORDS, degresGammeAccords } from "../audio/generation";
import { LIBELLES_HERITES_GAMMES } from "../audio/gammes";
import { PARAMETRE_CLE, demiTonDeCle } from "../audio/cles";
import { noteMidiDeFrequence } from "../audio/commun";
import { notesVersFichierMidi } from "../audio/midi-ecriture";
import type { Note } from "../audio/note";

/**
 * Les réglages du suivi de hauteur, taillés pour la parole et mesurés sur elle.
 *
 * LA PLAGE EST CELLE D'UNE VOIX QUI PARLE, 70 à 400 Hz, et non les 55 à 1760 Hz du suiveur de
 * hauteur : une voix qui parle tient dans deux octaves et demie, et la fenêtre d'analyse couvrant
 * deux périodes de la plus grave, la resserrer raccourcit le calcul sans rien perdre. Relevé sur la
 * même phrase, les deux plages rendent les mêmes hauteurs à moins d'un hertz près — 229,0 contre
 * 227,6 sur le premier mot — pour 113 ms contre 204 ms.
 *
 * LA PROBABILITÉ DE BASCULE EST VINGT FOIS CELLE DU SUIVEUR, et c'est le réglage qui décide si ce
 * composant marche. pYIN tient un état voisé/non voisé et décide du chemin le plus probable sur
 * tout le son ; `pBascule` dit ce que coûte un changement d'état. À 0,01, la valeur par défaut, la
 * durée d'un état vaut cent trames, soit une seconde — bien plus qu'une syllabe. Mesuré sur une
 * phrase de treize mots : trois d'entre eux ressortaient à confiance EXACTEMENT NULLE sur toute
 * leur durée, c'est-à-dire sans aucune note, alors que le témoin YIN donnait les mêmes trames
 * voisées à 0,86 et 0,95 avec un contour de hauteur net. Aucun seuil ne les rattrape, la confiance
 * étant mise à zéro quand le chemin dit « non voisé ». À 0,2, deux des trois reviennent, sur les
 * hauteurs mêmes que le témoin donnait, et le calcul ne coûte pas un millième de plus.
 */
export const PAROLE: Readonly<{ fMin: number; fMax: number; cadence: number; pBascule: number }> = {
  fMin: 70, fMax: 400, cadence: 100, pBascule: 0.2,
};

/** En deçà de cette confiance, la trame ne compte pas pour la hauteur du mot. */
const CONFIANCE_MIN = 0.5;

/**
 * L'étendue de nuance, en décibels sous le mot le plus fort.
 *
 * LA NUANCE EST RELATIVE, ET ELLE DOIT L'ÊTRE. Le niveau absolu d'un enregistrement ne dit rien :
 * la même phrase dite deux fois, une fois près du micro et une fois loin, donnerait deux séquences
 * différentes alors que la parole est la même. On rapporte donc chaque mot au plus fort de la
 * phrase, et c'est l'écart qui fait la nuance.
 */
const ETENDUE_DB = 24;

export interface ReglagesParole {
  /** Les classes de hauteur permises. Les douze pour la chromatique, qui ne déplace rien. */
  degres: readonly number[];
  /** Transposition appliquée après la mise sur la gamme, en demi-tons. */
  transposition: number;
}

export interface SequenceParlee {
  notes: Note[];
  /** Les mots dont aucune trame n'était voisée : ils n'ont pas de note, et on les nomme. */
  muets: string[];
}

/** Le suivi de hauteur d'un signal de parole, aux réglages mesurés ci-dessus. */
export function suiviDeParole(mono: Float32Array, frequence: number): SuiviHauteur {
  return suivreVoie(mono, { sampleRate: frequence, ...PAROLE });
}

/**
 * La hauteur d'un mot : la médiane des trames voisées de son empan, en hertz, ou zéro.
 *
 * LA MÉDIANE, ET NON LA MOYENNE : une trame fautive au bord d'un mot — l'attaque d'une consonne,
 * la fin d'une voyelle qui se détimbre — déplacerait une moyenne et ne déplace pas une médiane.
 *
 * LE SUIVI EST LU, ET NON RECALCULÉ SUR L'EMPAN. Découper le signal mot par mot avant de suivre la
 * hauteur casse justement ce que pYIN apporte : le chemin est décodé sur TOUT le son, et une trame
 * ambiguë est tranchée par ses voisines. Mesuré, le découpage perdait un mot de plus que la passe
 * unique — « sur » ressortait muet découpé, à 192,8 Hz lu dans la passe entière — et il coûtait
 * treize transformées de plus par mot.
 */
export function hauteurDuMot(mot: MotVosk, suivi: SuiviHauteur): number {
  const premiere = Math.max(0, Math.floor(mot.start * suivi.cadence));
  const derniere = Math.min(suivi.hauteurs.length, Math.ceil(mot.end * suivi.cadence));
  const voisees: number[] = [];
  for (let t = premiere; t < derniere; t++) {
    if (suivi.hauteurs[t] > 0 && suivi.confiances[t] > CONFIANCE_MIN) voisees.push(suivi.hauteurs[t]);
  }
  if (voisees.length === 0) return 0;
  voisees.sort((a, b) => a - b);
  return voisees[voisees.length >> 1];
}

/** Le niveau efficace d'un mot, sur son empan du signal. */
export function niveauDuMot(mot: MotVosk, mono: Float32Array, frequence: number): number {
  const premier = Math.max(0, Math.floor(mot.start * frequence));
  const dernier = Math.min(mono.length, Math.ceil(mot.end * frequence));
  if (dernier <= premier) return 0;
  let somme = 0;
  for (let i = premier; i < dernier; i++) somme += mono[i] * mono[i];
  return Math.sqrt(somme / (dernier - premier));
}

/** La nuance d'un niveau, rapportée au plus fort de la phrase. */
export function nuanceDuNiveau(niveau: number, plusFort: number): number {
  if (plusFort <= 0 || niveau <= 0) return 64;
  const db = 20 * Math.log10(niveau / plusFort);
  const part = 1 - Math.min(1, Math.max(0, -db / ETENDUE_DB));
  return Math.round(40 + 87 * part);
}

/**
 * Une note par mot, et la liste de ceux qui n'en ont pas eu.
 *
 * UN MOT SANS HAUTEUR NE DONNE PAS DE NOTE, et on le dit. La tentation était de lui poser la
 * hauteur du mot voisin, ou la médiane de la phrase : ce serait inventer une note que rien n'a
 * mesurée, et le composant mentirait d'autant plus qu'il a l'air de marcher. Mesuré sur une phrase
 * de treize mots, un seul reste muet aux réglages retenus — « fa », dont le milieu est un bruit de
 * friction et dont le témoin YIN lui-même s'embrouille, en donnant 70 Hz puis 381 Hz sur quatre
 * trames voisines.
 */
export function sequenceParlee(
  mots: readonly MotVosk[], suivi: SuiviHauteur, mono: Float32Array, frequence: number,
  reglages: ReglagesParole,
): SequenceParlee {
  const niveaux = mots.map((m) => niveauDuMot(m, mono, frequence));
  const plusFort = niveaux.length > 0 ? Math.max(...niveaux) : 0;
  const notes: Note[] = [];
  const muets: string[] = [];
  mots.forEach((mot, i) => {
    const hz = hauteurDuMot(mot, suivi);
    if (hz <= 0) { muets.push(mot.word); return; }
    const brute = Math.round(noteMidiDeFrequence(hz));
    const surLaGamme = degrePlusProche(brute, reglages.degres);
    const note = Math.round(surLaGamme + reglages.transposition);
    // Une note hors du clavier MIDI n'a pas de place dans un fichier : la transposition est bornée
    // ici plutôt que rejetée, pour qu'un mot grave et une transposition basse ne perdent pas la
    // note mais la posent à la limite.
    notes.push({
      note: Math.max(0, Math.min(127, note)),
      velocite: nuanceDuNiveau(niveaux[i], plusFort),
      debut: mot.start,
      fin: Math.max(mot.start + 0.01, mot.end),
      canal: 0,
    });
  });
  return { notes, muets };
}

/** Le tableau que la sortie « Notes » rend : une ligne par mot, muets compris. */
export function tableauDeSequence(
  mots: readonly MotVosk[], suivi: SuiviHauteur, notes: readonly Note[], en: boolean,
): string {
  const parDebut = new Map(notes.map((n) => [n.debut, n]));
  const lignes = [
    en ? "start     dur.    Hz    note   vel.   word" : "début     durée   Hz    note   nuance mot",
    ...mots.map((m) => {
      const hz = hauteurDuMot(m, suivi);
      const n = parDebut.get(m.start);
      const place = n ? String(n.note).padStart(4) : (en ? "   —" : "   —");
      const nuance = n ? String(n.velocite).padStart(5) : (en ? "    —" : "    —");
      return `${m.start.toFixed(2).padStart(6)}  ${(m.end - m.start).toFixed(2).padStart(6)}  `
        + `${hz.toFixed(0).padStart(4)}  ${place}  ${nuance}   ${m.word}`;
    }),
  ];
  return lignes.join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "parole-vers-sequence", nom: "Parole vers séquence", nomEn: "Speech to Sequence",
    univers: "Traitement", famille: "Conversion",
    resume: "Met une note sur chaque mot dit : la durée du mot, la hauteur de la voix, le niveau en nuance.",
    resumeEn: "Puts a note on each spoken word: the word's duration, the voice's pitch, the level as dynamics.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Texte", nomEn: "Text", type: "texte" },
      { nom: "Notes", nomEn: "Notes", type: "texte" },
      { nom: "Audio", nomEn: "Audio", type: "audio" },
    ],
    // Une phrase dont aucun mot n'est voisé est un résultat, et non une panne : le nœud a tourné.
    sortieNullePermise: true,
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: ["Français", "Anglais"], optionsEn: ["French", "English"],
        optionIds: ["fr", "en"], defaut: "Français", defautEn: "French",
        doc: "Le modèle de reconnaissance employé. Chaque langue a le sien, dédié.",
        docEn: "The recognition model used. Each language has its own, dedicated." },
      { nom: "Vocabulaire", nomEn: "Vocabulary", type: "texte", defaut: "", defautEn: "",
        placeholder: "do ré mi fa sol", placeholderEn: "do re mi fa sol",
        doc: "Liste de mots séparés par des espaces ou des virgules. Donnée, elle restreint ce que le moteur peut reconnaître à ces seuls mots, ce qui relève beaucoup la justesse sur un lexique fermé et resserre du même coup le découpage du temps. Laissée vide, le vocabulaire entier du modèle est employé.",
        docEn: "Words separated by spaces or commas. When given, it restricts what the engine may recognise to those words alone, which greatly raises accuracy on a closed lexicon and tightens the timing with it. Left empty, the model's whole vocabulary is used." },
      { ...PARAMETRE_CLE, nom: "Tonique", nomEn: "Root",
        doc: "La tonique de la gamme. Sans effet en chromatique, qui contient toutes les notes.",
        docEn: "The scale's root. Without effect in chromatic, which contains every note." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_ACCORDS.map((g) => g.fr), optionsEn: GAMMES_ACCORDS.map((g) => g.en),
        optionIds: GAMMES_ACCORDS.map((g) => g.id), defaut: "Chromatique", defautEn: "Chromatic",
        optionsHeritees: LIBELLES_HERITES_GAMMES,
        doc: "Les degrés permis. Une voix qui parle parcourt un intervalle étroit, de l'ordre de cinq demi-tons sur une phrase : une gamme à peu de degrés y ramène plusieurs mots sur la même note, la chromatique garde chaque hauteur relevée.",
        docEn: "The allowed degrees. A speaking voice covers a narrow interval, of the order of five semitones over a phrase: a scale with few degrees brings several words onto the same note, chromatic keeps every pitch as found." },
      { nom: "Transposition", nomEn: "Transpose", type: "curseur", plage: [-48, 24], pas: 1, defaut: -12,
        unite: "demi-tons", uniteEn: "semitones",
        doc: "Déplacement appliqué après la mise sur la gamme. Une voix qui parle se tient entre 70 et 400 Hz, c'est-à-dire autour du do central ; la valeur par défaut descend d'une octave, dans le registre de basse.",
        docEn: "Shift applied after the scale is imposed. A speaking voice sits between 70 and 400 Hz, that is around middle C; the default value drops one octave, into the bass register." },
      { nom: "Tempo du fichier MIDI", nomEn: "MIDI tempo", type: "curseur", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Le tempo écrit dans le fichier. Les notes gardent les instants de la parole : le tempo ne les déplace pas, il décide seulement de la grille de mesures sur laquelle un séquenceur les affichera.",
        docEn: "The tempo written into the file. The notes keep the instants of the speech: the tempo does not move them, it only decides the bar grid a sequencer will show them on." },
    ],
    async executer(ctx: any) {
      const en = (await import("../i18n")).langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null, null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const langue = ctx.paramTexte("Langue", "fr");
      const choisi = MODELES[langue] ?? MODELES.fr;
      await annoncerModele(ctx, "parole-vers-sequence", traduire("progress.vosk.chargement"));
      const modele = await chargerModele(choisi.fichier);
      const mono = versMono(audio);
      const seize = await vers16k(mono, audio.sampleRate);
      const vocabulaire = String(ctx.paramTexte("Vocabulaire", ""))
        .split(/[\s,]+/).map((m: string) => m.trim().toLowerCase()).filter(Boolean);
      const { texte, mots } = await transcrire(modele, seize, {
        grammaire: vocabulaire,
        surPartiel: (p) => ctx.onProgress?.(p),
      });
      if (mots.length === 0) {
        return { valeurs: [null, texte, null, audio], message: traduire("msg.parole.aucunMot") };
      }

      ctx.onProgress?.(traduire("progress.parole.hauteur"));
      // LE SUIVI PORTE SUR LE SIGNAL D'ORIGINE, et non sur les seize kilohertz de la
      // reconnaissance : les instants des mots sont en secondes, donc ils se lisent sur l'un comme
      // sur l'autre, et la fréquence la plus haute est celle où la période se mesure le mieux.
      const [suivi] = await parCanal<OptionsVoieHauteur, SuiviHauteur>(
        [mono],
        { sampleRate: audio.sampleRate, ...PAROLE },
        {
          creerWorker: () => new Worker(new URL("../workers/hauteur-worker.ts", import.meta.url), { type: "module" }),
          calcul: suivreVoie,
        },
      );

      const tonique = demiTonDeCle(ctx.paramTexte("Tonique", "C")) ?? 0;
      const { notes, muets } = sequenceParlee(mots, suivi, mono, audio.sampleRate, {
        degres: degresGammeAccords(ctx.paramTexte("Gamme", "chromatique"))
          .map((d) => (((d + tonique) % 12) + 12) % 12),
        transposition: Math.round(ctx.paramNombre("Transposition", -12)),
      });
      const tableau = tableauDeSequence(mots, suivi, notes, en);
      if (notes.length === 0) {
        return {
          valeurs: [null, texte, tableau, audio],
          message: traduire("msg.parole.aucuneHauteur", String(mots.length)),
        };
      }
      const fichier = notesVersFichierMidi(notes, ctx.paramNombre("Tempo du fichier MIDI", 120));
      return {
        valeurs: [fichier, texte, tableau, audio],
        message: traduire("msg.parole.sequence",
          String(notes.length), String(mots.length), String(muets.length), texte.slice(0, 40)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
