// plugins/tonal.ts — Nœuds de théorie musicale via la bibliothèque Tonal.
// Tonal : MIT licence — ajouté dans THIRD_PARTY.md.

import { fiche, lecteurDe, type ContexteQuiDeclare } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";
import { Chord, Note } from "tonal";
import { GAMMES, LIBELLES_HERITES_GAMMES } from "../audio/gammes";
import { notesDeGamme } from "../audio/gamme-epelee";
import { estimerTonalite, detecterAccords, accordsVersTexte } from "../audio/accords";
import { accordDuSymbole, estSansAccord, normaliserSymbole, symboleDesNotes } from "../audio/symboles-accords";
import { PARAMETRE_CLE } from "../audio/cles";
import { lireNomDeNote, nomAnglais, refusDeSuite } from "../audio/noms-de-notes";
import { choixFaconAccord, faconDe } from "../audio/facons-accord";
import {
  CHOIX_GAMME_ROMAINE, PROGRESSIONS_PAR_GAMME, accordsDepuisRomains, accordsInconnus, estProgressionRomaine,
  gammeDesRomains, romainsInconnus, toniqueDepuisTonalite, type ModeProgression,
} from "../audio/theorie-romains";
import { refusHorsGamme } from "./romains-hors-gamme";

function parserNotes(texte: string): string[] {
  return texte
    .split(/[\s,;]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
}

// Renvoie les notes d'un symbole d'accord Tonal réparties de manière ascendante
// à partir de l'octave de base (ex. "C3 E3 G3" pour C majeur en octave 3).
function notesAccordAscendantes(accord: string, octave: number): string[] {
  // Par le seul lecteur des symboles, revue des notations en texte du 2026-11-22.
  const c = accordDuSymbole(accord);
  if (!c) return [];
  const notes: string[] = [];
  let lastMidi = -Infinity;
  for (const n of c.notes) {
    let midi = Note.midi(`${n}${octave}`) ?? 0;
    while (midi < lastMidi) midi += 12;
    const nom = Note.fromMidi(midi);
    if (nom) notes.push(nom);
    lastMidi = midi;
  }
  return notes;
}

// Convertit un symbole d'accord en notation texte-vers-midi (ex. "C4+E4+G4+B4 1").
function accordVersNotation(accord: string, octave: number, duree: number): string {
  // « N.C. » est un accord silencieux, décision de Fabien du 2026-11-22 : il prend sa place, en silence.
  if (estSansAccord(accord)) return `rest ${duree}`;
  const notes = notesAccordAscendantes(accord, octave);
  return notes.length ? `${notes.join("+")} ${duree}` : "";
}

// Suggère une progression classique adaptée à la tonalité détectée.
function progressionSuggest(type: "major" | "minor"): string {
  if (type === "minor") return "i VI III VII";
  return "I V vi IV";
}

/**
 * Gamme dans laquelle lire les chiffres romains : le texte d'entrée d'abord,
 * le paramètre ensuite.
 *
 * L'entrée l'emporte parce qu'elle vient d'« Analyse harmonique », qui a MESURÉ
 * le mode (« A minor (90%) ») : le paramètre, lui, est un réglage par défaut que
 * personne ne pense à changer quand une tonalité arrive par un câble. Un texte
 * muet sur le mode — une simple tonique « A » — laisse le paramètre décider.
 */
function gammeDemandee<N extends string>(ctx: ContexteQuiDeclare<N, "Gamme">, entree: unknown): ModeProgression {
  return gammeDesRomains(entree, lecteurDe<"Gamme">(ctx).paramTexte("Gamme", "majeur"));
}

export const fiches: FicheAudio[] = ([
  fiche({
    id: "tonal-accord", nom: "Accord", nomEn: "Chord",
    univers: "Autres", famille: "Théorie",
    resume: "Détecte le nom d'un accord à partir de ses notes.",
    resumeEn: "Detects the chord name from its notes.",
    entrees: [{ nom: "Notes", nomEn: "Notes", type: "texte", requis: false }],
    sorties: [{ nom: "Nom", nomEn: "Name", type: "texte" }],
    parametres: [
      { nom: "Notes", nomEn: "Notes", type: "texte", defaut: "C E G",
        doc: "Notes de l'accord séparées par des espaces (ex : C E G, F A C E). Les noms se lisent en lettres ou en noms français, avec #, b, ♯ ou ♭ ; un mot illisible est refusé, et nommé.",
        docEn: "Chord notes separated by spaces (e.g. C E G, F A C E). Names are read as letters or French names, with #, b, ♯ or ♭; an unreadable word is refused and named.", defautEn: "C E G" },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const notesTexte = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Notes", "C E G");
      // LES NOMS SE LISENT PAR LE SEUL LECTEUR, français compris, et un mot illisible est refusé en
      // le nommant : revue des notations en texte du 2026-11-22.
      const refus = refusDeSuite(notesTexte);
      if (refus) return { valeurs: [null], erreur: true, message: refus };
      const notes = parserNotes(notesTexte).flatMap((n) => {
        const lu = lireNomDeNote(n);
        return lu ? [nomAnglais(lu)] : [];
      });
      // L'ÉCHEC SE DIT DANS LE STATUT, ET NON DANS LA VALEUR.
      //
      // Ce nœud émettait la chaîne « Accord inconnu » SUR SA SORTIE et annonçait « Terminé » : un
      // nœud en aval recevait ce texte comme s'il était un nom d'accord. La chaîne n'était même pas
      // traduite, puisqu'elle était écrite en dur. Le chemin voisin, « aucune note fournie »,
      // rendait lui aussi un statut vert.
      //
      // MESURÉ : nourri du format de « Texte → MIDI », le nœud affichait « Accord inconnu » en vert.
      if (notes.length === 0) {
        return { valeurs: [null], erreur: true, message: traduire("msg.aucune_note_fournie") };
      }
      // UN SYMBOLE QUE LES LECTEURS RELISENT, décision de Fabien du 2026-11-22 : le renversement par
      // barre oblique, « C/E », et le nom long dans le message seulement. Voir `symboleDesNotes`.
      const symbole = symboleDesNotes(notes);
      if (!symbole) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.tonal.accord_inconnu_var_0", notes.slice(0, 4).join(" ")) };
      }
      const nom = Chord.get(normaliserSymbole(symbole)).name;
      return { valeurs: [symbole], message: nom ? `${symbole} · ${nom}` : symbole };
   },
 }),
  fiche({
    id: "tonal-gamme", nom: "Gamme", nomEn: "Scale",
    univers: "Autres", famille: "Théorie",
    resume: "Liste les notes d'une gamme à partir d'une tonalité et d'un type.",
    resumeEn: "Lists the notes of a scale from a tonic and a scale type.",
    entrees: [{ nom: "Tonalité", nomEn: "Tonic", type: "texte", requis: false }],
    sorties: [{ nom: "Notes", nomEn: "Notes", type: "texte" }],
    parametres: [
      { ...PARAMETRE_CLE, nom: "Tonalité",
        doc: "Tonalité de départ.",
        docEn: "Starting tonic." },
      // LA TABLE COMMUNE DES GAMMES, et non les sept noms de Tonal (`major` à `locrian`) que ce réglage
      // offrait seuls jusqu'au 2026-11-23 : les anciennes valeurs se relisent par `optionsHeritees`.
      { nom: "Type", nomEn: "Type", type: "choix",
        options: GAMMES.map((g) => g.fr), optionsEn: GAMMES.map((g) => g.en),
        optionIds: GAMMES.map((g) => g.id), optionsHeritees: LIBELLES_HERITES_GAMMES,
        defaut: GAMMES[0].fr, defautEn: GAMMES[0].en,
        doc: "Gamme dont les notes sont listées, parmi les vingt-cinq gammes tempérées de la table commune, des sept modes à la chromatique.",
        docEn: "Scale whose notes are listed, among the twenty-five tempered scales of the common table, from the seven modes to the chromatic." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const tonic = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tonalité", "C");
      const notes = notesDeGamme(tonic, ctx.paramTexte("Type", GAMMES[0].id));
      if (!notes) return { valeurs: [null], message: traduire("msg.tonalit_invalide") };
      const resultat = notes.join(" ");
      return { valeurs: [resultat], message: resultat };
   },
 }),
  fiche({
    id: "tonal-transposer", nom: "Transposer", nomEn: "Transpose",
    univers: "Autres", famille: "Théorie",
    resume: "Transpose une note ou un accord d'un intervalle donné.",
    resumeEn: "Transposes a note or chord by a given interval.",
    entrees: [{ nom: "Note", type: "texte", requis: false }],
    sorties: [{ nom: "Transposé", nomEn: "Transposed", type: "texte" }],
    parametres: [
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "C4",
        doc: "Note à transposer (ex : C4, D#3, F#5). En lettres ou en noms français, avec ou sans octave ; un nom illisible est refusé, et nommé.",
        docEn: "Note to transpose (e.g. C4, D#3, F#5). As letters or French names, with or without an octave; an unreadable name is refused and named.", defautEn: "C4" },
      { nom: "Intervalle", nomEn: "Interval", type: "choix", options: ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M", "8P"], defaut: "2M",
        doc: "Intervalle de transposition (2M = ton, 3m = tierce mineure, 3M = tierce majeure, etc.).",
        docEn: "Transposition interval (2M = whole tone, 3m = minor third, 3M = major third, etc.).", optionsEn: ["1P", "2m", "2M", "3m", "3M", "4P", "4A", "5P", "6m", "6M", "7m", "7M", "8P"], defautEn: "2M" },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const note = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Note", "C4");
      const intervalle = ctx.paramTexte("Intervalle", "2M");
      // UN NOM ILLISIBLE EST REFUSÉ, ET NOMMÉ, revue des notations en texte du 2026-11-22 : le nœud
      // rendait une sortie vide sans erreur, et ne lisait pas « Ré#3 ». La classe sans octave reste lue.
      const lue = lireNomDeNote(note);
      if (!lue) return { valeurs: [null], erreur: true, message: traduire("msg.note.illisible_var_0", note.trim()) };
      const transposee = Note.transpose(nomAnglais(lue), intervalle);
      if (!transposee) return { valeurs: [null], erreur: true, message: traduire("msg.transposition_impossible") };
      return { valeurs: [transposee], message: transposee };
   },
 }),
  fiche({
    id: "tonal-progression", nom: "Progression", nomEn: "Progression",
    univers: "Autres", famille: "Théorie",
    resume: "Génère une progression d'accords à partir d'une tonalité et de chiffres romains.",
    resumeEn: "Generates a chord progression from a key and roman numerals.",
    entrees: [{ nom: "Tonalité", nomEn: "Tonic", type: "texte", requis: false }],
    sorties: [{ nom: "Accords", nomEn: "Chords", type: "texte" }],
    parametres: [
      { ...PARAMETRE_CLE, nom: "Tonalité",
        doc: "Tonique de la progression. La gamme se choisit dans « Gamme » ; l'entrée Tonalité, si elle nomme un mode (« A minor »), l'emporte sur le réglage.",
        docEn: "Root note of the progression. The scale is set in « Scale »; the Key input wins over the setting when it names a mode (« A minor »).", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", ...CHOIX_GAMME_ROMAINE,
        doc: "Gamme dans laquelle les degrés sont lus : chaque chiffre prend pour fondamentale la note de la gamme à son rang. En « Mineur naturel », III, VI et VII descendent d'un demi-ton, « i VI III VII » donnant Am F C G en la, sauf le vii diminué, bâti sur la sensible ; en « Dorien », « vi° » donne B° en ré. La casse, elle, ne décide que de la qualité de l'accord. Les gammes offertes sont celles dont chaque degré porte un accord majeur, mineur, diminué ou augmenté ; dans une gamme de six degrés, VII n'existe pas.",
        docEn: "Scale the degrees are read in: each numeral takes as its root the scale note at its rank. In « Natural minor », III, VI and VII drop a semitone, « i VI III VII » giving Am F C G in A, except the diminished vii, built on the leading tone; in « Dorian », « vi° » gives B° in D. Case only decides the chord quality. The scales offered are those whose every degree carries a major, minor, diminished or augmented chord; in a six-degree scale, VII does not exist." },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        defautSelon: { reglage: "Gamme", valeurs: PROGRESSIONS_PAR_GAMME },
        doc: "Progression en chiffres romains (ex : I V vi IV, ii7 V7 Imaj7). Majuscules = majeur, minuscules = mineur ; ° diminué, ø demi-diminué, + augmenté ; 6, 64, 7, 65, 43, 42 disent le renversement (I6 = C/E) ; V/V est la dominante de la dominante ; une altération explicite (bIII, #IV) se prend sur la gamme majeure. Quand « Gamme » change, la progression par défaut suit la gamme : « i VI III VII » en « Mineur naturel », et ailleurs les degrés I, V, VI et IV écrits dans la casse de l'accord de la gamme, « i v vi° IV » en « Dorien » ; une progression choisie n'est pas réécrite.",
        docEn: "Roman numeral progression (e.g. I V vi IV, ii7 V7 Imaj7). Uppercase = major, lowercase = minor; ° diminished, ø half-diminished, + augmented; 6, 64, 7, 65, 43, 42 give the inversion (I6 = C/E); V/V is the dominant of the dominant; an explicit accidental (bIII, #IV) is taken on the major scale. When « Scale » changes, the default progression follows the scale: « i VI III VII » in « Natural minor », and elsewhere degrees I, V, VI and IV written in the case of the scale's chord, « i v vi° IV » in « Dorian »; a chosen progression is not rewritten.", defautEn: "I V vi IV" },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const tonic = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Tonalité", "C");
      // LA TONIQUE EST LUE DANS LE LIBELLÉ, ET CONTRÔLÉE AVANT D'ÊTRE EMPLOYÉE.
      //
      // DEUX DÉFAUTS TENAIENT ICI, ET LE SECOND EST LE PLUS GÊNANT. Le premier : un texte étranger
      // donnait des fondamentales VIDES et le nœud rendait « m » entouré d'espaces, en annonçant
      // « Terminé ». Le second : même un libellé PARFAITEMENT LISIBLE, « A minor », rendait ces
      // mêmes blancs, parce que la chaîne entière partait vers Tonal, qui attend une note SEULE.
      // `toniqueDepuisTonalite` existe pour cela depuis longtemps, et sa documentation décrit mot
      // pour mot ce défaut ; ce nœud ne l'appelait pas. Le mode, lui, est déjà lu par
      // `gammeDemandee`, qui reçoit l'entrée telle quelle.
      //
      // MESURÉ : le premier défaut sur le format de « Texte → MIDI », le second sur « A minor »,
      // trouvé par le témoin positif après la réparation du premier.
      const tonique = toniqueDepuisTonalite(tonic);
      if (!tonique) {
        return { valeurs: [null], erreur: true,
          message: traduire("msg.tonal.tonique_illisible_var_0", tonic.slice(0, 40)) };
      }
      const progTexte = ctx.paramTexte("Progression", "I V vi IV");
      const numerals = progTexte.split(/\s+/).filter((n: string) => n.length > 0);
      // UN CHIFFRE QUI NE SE LIT PAS EST REFUSÉ, NOMMÉ : « I X V » rendait « C  G », sans un mot.
      const inconnus = romainsInconnus(numerals);
      if (inconnus.length > 0) {
        return { valeurs: [null], erreur: true, message: traduire("msg.tonal.romains_inconnus_var_0", inconnus.slice(0, 4).join(" » « ")) };
      }
      const gamme = gammeDemandee(ctx, entree);
      const hors = refusHorsGamme(numerals, gamme, 1);
      if (hors) return hors;
      // `accordsDepuisRomains` : sans lui, « vi » produisait un accord MAJEUR et
      // les degrés III, VI, VII d'un mode mineur gardaient la fondamentale du
      // mode majeur.
      const accords = accordsDepuisRomains(tonique, numerals, gamme);
      const resultat = accords.join(" ");
      return { valeurs: [resultat], message: resultat };
   },
 }),
  fiche({
    id: "tonal-grille", nom: "Grille d'accords", nomEn: "Chord Grid",
    univers: "Traitement", famille: "Génération",
    resume: "Génère un accompagnement complet au format texte-vers-midi.",
    resumeEn: "Generates a full accompaniment in text-to-MIDI format.",
    entrees: [{ nom: "Progression", type: "texte", requis: false }],
    sorties: [{ nom: "Notation", type: "texte", sousType: "notation" }, { nom: "Accords", nomEn: "Chords", type: "texte" }],
    parametres: [
      { ...PARAMETRE_CLE, nom: "Tonalité",
        doc: "Tonique de la grille. La gamme se choisit dans « Gamme » ; l'entrée Progression, si elle nomme une tonalité, l'emporte sur le réglage.",
        docEn: "Root note of the grid. The scale is set in « Scale »; the Progression input wins over the setting when it names a key.", defautEn: "C" },
      { nom: "Gamme", nomEn: "Scale", ...CHOIX_GAMME_ROMAINE,
        doc: "Gamme dans laquelle les degrés sont lus : chaque chiffre prend pour fondamentale la note de la gamme à son rang. En « Mineur naturel », III, VI et VII descendent d'un demi-ton, « i VI III VII » donnant Am F C G en la ; en « Dorien », « vi° » donne B° en ré. Les gammes offertes sont celles dont chaque degré porte un accord majeur, mineur, diminué ou augmenté ; dans une gamme de six degrés, VII n'existe pas. Sans effet sur une liste de symboles.",
        docEn: "Scale the degrees are read in: each numeral takes as its root the scale note at its rank. In « Natural minor », III, VI and VII drop a semitone, « i VI III VII » giving Am F C G in A; in « Dorian », « vi° » gives B° in D. The scales offered are those whose every degree carries a major, minor, diminished or augmented chord; in a six-degree scale, VII does not exist. No effect on a list of symbols." },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I V vi IV",
        defautSelon: { reglage: "Gamme", valeurs: PROGRESSIONS_PAR_GAMME },
        doc: "Progression en chiffres romains (majuscules = accord majeur, minuscules = accord mineur ; ° diminué, ø demi-diminué, + augmenté ; 6, 64, 7, 65, 43, 42 disent le renversement ; V/V est la dominante de la dominante). Accepte aussi une liste de symboles séparés par des espaces (ex : C Am F G). Quand « Gamme » change, la progression par défaut suit la gamme : « i VI III VII » en « Mineur naturel », et ailleurs les degrés I, V, VI et IV écrits dans la casse de l'accord de la gamme, « i v vi° IV » en « Dorien » ; une progression choisie n'est pas réécrite.",
        docEn: "Roman numeral progression (uppercase = major chord, lowercase = minor chord; ° diminished, ø half-diminished, + augmented; 6, 64, 7, 65, 43, 42 give the inversion; V/V is the dominant of the dominant). Also accepts a space-separated list of chord symbols (e.g. C Am F G). When « Scale » changes, the default progression follows the scale: « i VI III VII » in « Natural minor », and elsewhere degrees I, V, VI and IV written in the case of the scale's chord, « i v vi° IV » in « Dorian »; a chosen progression is not rewritten.", defautEn: "I V vi IV" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo de l'accompagnement.", docEn: "Accompaniment tempo." },
      { nom: "Durée", nomEn: "Duration", plage: [0.25, 4], pas: 0.25, defaut: 1, unite: "t", uniteEn: "beats",
        doc: "Durée de chaque accord en temps. Sans effet quand « Mode » vaut « Arpégé », chaque note y durant une croche.", docEn: "Duration of each chord in beats. Has no effect when « Mode » is « Arpeggiated », each note lasting an eighth there." },
      { nom: "Octave", nomEn: "Octave", plage: [2, 5], pas: 1, defaut: 3,
        doc: "Octave de base des accords.", docEn: "Base octave for chords." },
      { nom: "Mode", nomEn: "Mode", type: "choix", ...choixFaconAccord(["plaque", "arpege"]), defaut: "Plaqué",
        doc: "Plaqué joue toutes les notes simultanément, Arpégé les décline en croches.",
        docEn: "Block plays all notes at once, Arpeggiated plays them as eighth notes.", defautEn: "Block" },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      const tonic = ctx.paramTexte("Tonalité", "C");
      const progEntree = (typeof entree === "string" && entree.trim())
        || ctx.paramTexte("Progression", "I V vi IV");
      const tempo = ctx.paramNombre("Tempo", 120);
      const duree = ctx.paramNombre("Durée", 1);
      const octave = Math.round(ctx.paramNombre("Octave", 3));
      const mode = ctx.paramTexte("Mode", "Bloc");

      const tokens = progEntree.split(/\s+/).filter((t: string) => t.length > 0);
      // Un jeton en chiffres romains commence par (b/# facultatif +) I ou V,
      // éventuellement suivi d'une extension (IV7, IMaj7, vii°...) — aucun
      // symbole d'accord ne commence par I ou V (les notes vont de A à G),
      // donc tester juste le début du jeton (pas son intégralité) suffit à
      // distinguer les deux syntaxes sans rejeter les extensions.
      // Le premier jeton décide, pour tous les nœuds : `estProgressionRomaine`.
      const romains = estProgressionRomaine(tokens);
      // UN CHIFFRE QUI NE SE LIT PAS EST REFUSÉ, NOMMÉ, comme dans la Progression.
      const romainsIllisibles = romains ? romainsInconnus(tokens) : [];
      if (romainsIllisibles.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.tonal.romains_inconnus_var_0", romainsIllisibles.slice(0, 4).join(" » « ")) };
      }
      const gamme = gammeDemandee(ctx, entree);
      const hors = romains ? refusHorsGamme(tokens, gamme, 2) : null;
      if (hors) return hors;
      const accords = romains
        ? accordsDepuisRomains(tonic, tokens, gamme)
        : tokens;

      if (accords.length === 0 || accords.some((a: string) => !a)) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.progression_invalide") };
      }
      // UN SYMBOLE QU'AUCUN ACCORD NE RECONNAÎT EST REFUSÉ EN LE NOMMANT.
      //
      // LE GARDE DU DESSUS NE VOYAIT QUE LES CHAÎNES VIDES, et un jeton étranger n'est pas vide : il
      // passait, puis `accordVersNotation` le jetait en silence par un `if (ligne)`. MESURÉ : nourri
      // de « Tempo 90 / C4+E4+G4 2.000 », ce nœud annonçait « 4 accords » et n'en écrivait AUCUN —
      // sa notation ne contenait que son en-tête `TEMPO 120`, et sa liste d'accords renvoyait les
      // jetons étrangers tels quels. Le compte du message venait de l'ENTRÉE, et non de ce qui avait
      // été écrit.
      const inconnus = accordsInconnus(accords);
      if (inconnus.length > 0) {
        return { valeurs: [null, null], erreur: true,
          message: traduire("msg.accords_inconnus_var_0", inconnus.slice(0, 3).join(" ")) };
      }

      const lignes: string[] = [`TEMPO ${tempo}`];
      if (faconDe(mode) === "arpege") {
        const dureeNote = 0.5;
        for (const accord of accords) {
          // « N.C. » se tait le temps d'une triade arpégée, trois croches.
          if (estSansAccord(accord)) { lignes.push(`rest ${3 * dureeNote}`); continue; }
          for (const n of notesAccordAscendantes(accord, octave + 1)) {
            lignes.push(`${n} ${dureeNote}`);
          }
        }
      } else {
        for (const accord of accords) {
          const ligne = accordVersNotation(accord, octave, duree);
          if (ligne) lignes.push(ligne);
        }
      }

      // ET LE COMPTE EST CELUI DE CE QUI A ÉTÉ ÉCRIT, non celui de l'entrée. Ce garde-ci ne peut
      // plus tomber par un symbole inconnu, qui est refusé plus haut ; il reste pour qu'une ligne
      // perdue pour une autre raison ne puisse pas se cacher derrière un compte venu d'ailleurs.
      if (lignes.length === 1) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.progression_invalide") };
      }
      const notation = lignes.join("\n");
      const listeAccords = accords.join(" ");
      return { valeurs: [notation, listeAccords], message: traduire("msg.var_0_accords_var_1_var_2_bpm", accords.length, mode, tempo) };
   },
 }),
  fiche({
    id: "tonal-analyse", nom: "Analyse harmonique", nomEn: "Harmonic Analysis",
    // Avec les autres analyses (Détecteur d'accords, Analyse audio) : il en était
    // le seul exemplaire rangé dans « Traitement », où il formait à lui seul une
    // famille « Analyse ». Il ne transforme pas le son, il le décrit.
    univers: "Visualisation", famille: "Analyse",
    resume: "Détecte la tonalité d'un morceau et suggère une progression.",
    resumeEn: "Detects the key of a song and suggests a chord progression.",
    entrees: [{ nom: "Audio", type: "audio", requis: true }],
    sorties: [{ nom: "Tonalité", nomEn: "Key", type: "texte" }, { nom: "Progression", type: "texte" }, { nom: "Accords détectés", nomEn: "Detected chords", type: "texte" }],
    parametres: [
      { nom: "Style", nomEn: "Style", type: "choix", options: ["Pop", "Jazz", "Blues"], optionsEn: ["Pop", "Jazz", "Blues"], defaut: "Pop",
        doc: "Style de la progression suggérée, adapté au mode détecté (majeur ou mineur).", docEn: "Suggested progression style, adapted to the detected mode (major or minor).", defautEn: "Pop" },
    ],
    async executer(ctx) {
      const buffer = entreeAudio(ctx, 0, { sorties: 3 });
      if (sansEntree(buffer)) return buffer;
      const tonalite = estimerTonalite(buffer);
      const accords = detecterAccords(buffer, 0.5);
      const style = ctx.paramTexte("Style", "Pop");
      const mineur = tonalite.type === "minor";
      let prog = progressionSuggest(tonalite.type);
      // LA CADENCE DE L'USAGE, AVEC SES SEPTIÈMES, décision de Fabien du 2026-11-22. La suggestion en
      // mineur était « ii V i », lue Bm E Am en la : le si mineur portait un fa♯ hors de la gamme.
      if (style === "Jazz") prog = mineur ? "iiø7 V7 i" : "ii7 V7 Imaj7";
      if (style === "Blues") prog = mineur ? "i i i i iv iv i i v iv i v" : "I I I I IV IV I I V IV I V";
      // LA MISE EN TEXTE VIENT DU DOMAINE, et non d'une ligne écrite ici. `accordsVersTexte` est
      // ce que le détecteur d'accords emploie déjà : deux mises en forme de la même donnée avaient
      // commencé à diverger.
      //
      // DEUX CHOSES CHANGENT, ET PAS CELLE QU'ON CROIT. Les noms de notes ne sont pas traduits
      // d'une langue à l'autre : la fiche d'un accord porte « 0:00 F maj7 » et « 0:00 Fmaj7 », qui
      // ne diffèrent que par la CONVENTION D'ÉCRITURE, l'espace entre la fondamentale et la nature.
      // La ligne d'avant prenait toujours la forme anglaise, même sous une interface française. Et
      // elle taisait la confiance, que celle-ci donne.
      const accordsTexte = accordsVersTexte(accords, langueCourante());
      return {
        valeurs: [`${tonalite.nom} (${Math.round(tonalite.confiance * 100)}%)`, prog, accordsTexte],
        message: traduire("msg.tonalit_var_0_var_1_accord_s_d_tect_s", tonalite.nom, accords.length),
      };
   },
 }),
] as FicheAudio[]).map(avecDoc);
