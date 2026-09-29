// plugins/generateurs-rythme.ts — Rythme, et systemes de reecriture.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { genererBoiteRythmes, notesVersFichierMidi, rendreSequence, genererRythmeCantor, genererGrilleCantor, grilleBoiteRythmes, degresGammeMelodie, GAMMES_MELODIE_FR, GAMMES_MELODIE_EN, GAMMES_MELODIE_IDS, DEMI_TONS_CLE } from "../audio";
import { CANAL_PERCUSSION, frappesDePistesBooleennes, notesDepuisFrappes } from "../audio/batterie-midi";
import { rendreBatterieMidi } from "../audio/tone-synths";
import { motifEnTexte, motifEuclidien, nomTraditionnel, notesEuclidiennes } from "../audio/euclidien";
import { EXEMPLES, interpreter, lireRegles, reecrire } from "../audio/lsysteme";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { optionsPatrons } from "./patrons-rythme";
import { avecDoc } from "./notices";
import { creerAleatoire, hasardDuNoeud } from "../core";
import { PARAMETRE_CLE } from "../audio/cles";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */

export const fiches: FicheAudio[] = ([
  {
    id: "boite-rythmes", nom: "Boîte à rythmes", nomEn: "Drum Machine", univers: "Entrées", famille: "Génération",
    resume: "Génère une piste rythmique, et sort le même rythme en MIDI pour pouvoir changer les sons dessous.",
    resumeEn: "Generates a drum pattern, and outputs the same rhythm as MIDI so the sounds underneath can be changed.",
    // La sortie MIDI est AJOUTÉE À LA FIN : les prises sont identifiées par leur rang, et l'insérer
    // avant l'audio aurait déplacé les branchements de tous les graphes déjà enregistrés.
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    parametres: [
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:120, unite:"BPM" },
      { nom:"Patron", nomEn:"Pattern", type:"choix", ...optionsPatrons(), defaut:"Rock", defautEn: "Rock" },
      { nom:"Mesures", nomEn:"Bars", plage:[1,8], pas:1, defaut:2 },
      { nom:"Kick", nomEn:"Kick", plage:[0,100], defaut:80, unite:"%" },
      { nom:"Caisse claire", nomEn:"Snare", plage:[0,100], defaut:70, unite:"%" },
      { nom:"Charley", nomEn:"Hi-hat", plage:[0,100], defaut:60, unite:"%" },
      { nom:"Graine", graine: true, nomEn:"Seed", plage:[0, 999999], pas:1, defaut:42,
        doc:"Graine des rafales de bruit (caisse claire, charley). Valeur par défaut fixe : le même patron doit rendre le même fichier à chaque exécution.",
        docEn:"Seed for the noise bursts (snare, hi-hat). The default is fixed: the same pattern must render the same file on every run." },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const patron = ctx.paramTexte("Patron", "Rock");
      const mesures = ctx.paramNombre("Mesures", 2);
      const niveauKick = ctx.paramNombre("Kick", 80);
      const niveauSnare = ctx.paramNombre("Caisse claire", 70);
      const niveauCharley = ctx.paramNombre("Charley", 60);
      const buffer = await genererBoiteRythmes(tempo, patron, mesures, niveauKick, niveauSnare,
        niveauCharley, 4, 4, creerAleatoire(ctx.paramNombre("Graine", 42)));
      // LE MÊME PATRON, EN MIDI, pour pouvoir changer les sons dessous — kit SFZ, SoundFont, orchestre
      // Csound. La grille vient de la fonction QUE LE RENDU EMPLOIE, et non d'une seconde lecture du
      // patron : c'est la seule façon d'être sûr que les deux sorties frappent aux mêmes instants.
      // Les niveaux des pistes deviennent des vélocités, un fichier MIDI n'ayant pas de volume.
      const grille = grilleBoiteRythmes(patron, mesures, 4, 4);
      const notesMidi = notesDepuisFrappes(frappesDePistesBooleennes([
        { piste: 0, pas: grille.kick, niveau: niveauKick },
        { piste: 1, pas: grille.snare, niveau: niveauSnare },
        { piste: 2, pas: grille.hat, niveau: niveauCharley },
        { piste: 3, pas: grille.hatOuvert, niveau: niveauCharley },
      ]), { tempo, pasParMesure: grille.pasMesure, mesures });
      const midi = notesMidi.length > 0 ? notesVersFichierMidi(notesMidi, tempo, CANAL_PERCUSSION) : null;
      return {
        valeurs: [buffer, midi],
        message: `${buffer.duration.toFixed(1)} s · ${traduire("msg.batterie.midi", String(notesMidi.length))}`,
      };
    },
  },
  {
    id: "l-systeme", nom: "L-système", nomEn: "L-system", univers: "Entrées", famille: "Génération",
    resume: "Engendre une mélodie par une grammaire qui se réécrit (Lindenmayer).",
    resumeEn: "Generates a melody from a self-rewriting grammar (Lindenmayer).",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", nomEn: "MIDI", type: "midi" }, { nom: "Mot", nomEn: "Word", type: "texte" }],
    parametres: [
      { nom: "Exemple", nomEn: "Example", type: "choix",
        options: ["Écrit à la main", ...EXEMPLES.map((e) => e.fr)],
        optionsEn: ["Hand-written", ...EXEMPLES.map((e) => e.en)],
        optionIds: ["manuel", ...EXEMPLES.map((e) => e.id)],
        defaut: "Algues de Lindenmayer", defautEn: "Lindenmayer's algae",
        doc: "Charge une grammaire connue à la place de l'axiome et des règles saisis. « Écrit à la main » prend les règles écrites dans les champs.",
        docEn: "Loads a known grammar instead of the axiom and rules typed below. « Hand-written » takes the rules written in the fields." },
      { nom: "Axiome", nomEn: "Axiom", type: "texte", defaut: "A", defautEn: "A",
        doc: "Le mot de départ, réécrit à chaque tour.", docEn: "The starting word, rewritten on every pass." },
      { nom: "Règles", nomEn: "Rules", type: "texte", defaut: "A=AB, B=A", defautEn: "A=AB, B=A",
        doc: "Les remplacements, sous la forme « A=AB », séparés par des virgules ou des retours à la ligne. Une lettre sans règle se réécrit en elle-même. Les signes + et − montent et descendent d'un degré, les crochets ouvrent et ferment une broderie, > et < allongent et raccourcissent le pas, le point est un silence.",
        docEn: "The replacements, written « A=AB », separated by commas or line breaks. A letter without a rule rewrites to itself. The signs + and − move up and down one scale degree, brackets open and close an ornament, > and < lengthen and shorten the step, a dot is a rest." },
      { nom: "Itérations", nomEn: "Iterations", type: "nombre", plage: [0, 12], pas: 1, defaut: 5,
        doc: "Nombre de réécritures. Le mot grandit vite : une règle qui double sa longueur atteint le millier en dix tours.",
        docEn: "Number of rewrites. The word grows fast: a rule that doubles its length reaches a thousand in ten passes." },
      { ...PARAMETRE_CLE, doc: "Tonique de la gamme.", docEn: "Tonic of the scale." },
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS,
        defaut: "Majeur", defautEn: "Major",
        doc: "Les degrés que + et − parcourent : le mot ne sort jamais de la gamme.",
        docEn: "The degrees that + and − walk through: the word never leaves the scale." },
      { nom: "Octave", nomEn: "Octave", type: "nombre", plage: [1, 7], pas: 1, defaut: 4,
        doc: "Octave de la note de départ.", docEn: "Octave of the starting note." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 300], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse : un pas vaut une croche.", docEn: "Speed: one step is an eighth note." },
      { ...PARAMETRE_SYNTHESE, doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM.", docEn: "Auto = SoundFont if an SF2 file is loaded, else FM." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const choix = ctx.paramTexte("Exemple", "algues");
      const exemple = EXEMPLES.find((e) => e.id === choix);
      const axiome = exemple ? exemple.axiome : ctx.paramTexte("Axiome", "A");
      const regles = lireRegles(exemple ? exemple.regles : ctx.paramTexte("Règles", "A=AB, B=A"));
      const mot = reecrire(axiome, regles, ctx.paramNombre("Itérations", 5));
      const notes = interpreter(mot, {
        degres: degresGammeMelodie(ctx.paramTexte("Gamme", "majeur")),
        depart: (ctx.paramNombre("Octave", 4) + 1) * 12 + (DEMI_TONS_CLE[ctx.paramTexte("Clé", "C")] ?? 0),
        dureePas: (60 / ctx.paramNombre("Tempo", 120)) / 2,
        velocite: 90,
        noteMin: 21,
        noteMax: 108,
      });
      if (notes.length === 0) return { valeurs: [null, null, mot], message: traduire("msg.lsysteme.aucuneNote") };
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const { programme, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const buffer = await rendreSequence(notes, modeRendu, ctx.paramNombre("Volume", 80), programme, banque);
      const midi = notesVersFichierMidi(notes, ctx.paramNombre("Tempo", 120));
      return {
        valeurs: [buffer, midi, mot],
        message: traduire("msg.lsysteme.resultat", mot.length, notes.length),
      };
    },
  },
  {
    id: "rythme-euclidien", nom: "Rythme euclidien", nomEn: "Euclidean Rhythm", univers: "Entrées", famille: "Génération",
    resume: "Répartit N frappes le plus régulièrement possible sur M pas (algorithme de Bjorklund).",
    resumeEn: "Spreads N onsets as evenly as possible over M steps (Bjorklund's algorithm).",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Pas", nomEn: "Steps", type: "nombre", plage: [1, 32], pas: 1, defaut: 8,
        doc: "Longueur du cycle, en pas. C'est le « M » de E(N, M).",
        docEn: "Cycle length, in steps. The « M » of E(N, M)." },
      { nom: "Frappes", nomEn: "Onsets", type: "nombre", plage: [0, 32], pas: 1, defaut: 3,
        doc: "Nombre de frappes à répartir sur le cycle. C'est le « N » de E(N, M). Trois frappes sur huit pas donnent le tresillo cubain, cinq sur huit le cinquillo, sept sur douze le bembé.",
        docEn: "Number of onsets to spread over the cycle. The « N » of E(N, M). Three onsets over eight steps give the Cuban tresillo, five over eight the cinquillo, seven over twelve the bembé." },
      { nom: "Rotation", nomEn: "Rotation", type: "nombre", plage: [0, 31], pas: 1, defaut: 0,
        doc: "Décale le départ du cycle sans changer les intervalles. Le même motif entendu depuis un autre pas : le tresillo tourné de 3 donne la figure qui commence sur le contretemps.",
        docEn: "Shifts the cycle's start without changing the intervals. The same pattern heard from another step: the tresillo rotated by 3 gives the figure that starts off-beat." },
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse, en battements par minute.", docEn: "Speed, in beats per minute." },
      { nom: "Durée d'un pas", nomEn: "Step length", type: "choix",
        options: ["Noire", "Croche", "Double-croche", "Triolet de croches"],
        optionsEn: ["Quarter", "Eighth", "Sixteenth", "Eighth triplet"],
        optionIds: ["noire", "croche", "double", "triolet"],
        defaut: "Croche", defautEn: "Eighth",
        doc: "Valeur rythmique d'un pas du cycle.", docEn: "Rhythmic value of one step of the cycle." },
      { nom: "Répétitions", nomEn: "Repeats", type: "nombre", plage: [1, 32], pas: 1, defaut: 4,
        doc: "Nombre de fois que le cycle est joué.", docEn: "How many times the cycle is played." },
      { nom: "Percussion", nomEn: "Drum", type: "choix",
        options: ["Grosse caisse", "Caisse claire", "Charley fermé", "Charley ouvert", "Clave", "Cloche", "Tom grave", "Tom aigu"],
        optionsEn: ["Kick", "Snare", "Closed hi-hat", "Open hi-hat", "Clave", "Cowbell", "Low tom", "High tom"],
        optionIds: ["36", "38", "42", "46", "75", "56", "41", "48"],
        defaut: "Grosse caisse", defautEn: "Kick",
        doc: "Note de percussion jouée (canal 9). Superposez plusieurs composants sur des percussions différentes pour obtenir une polyrythmie.",
        docEn: "Drum note played (channel 9). Stack several nodes on different drums to build a polyrhythm." },
      { nom: "Vélocité", nomEn: "Velocity", type: "nombre", plage: [1, 127], pas: 1, defaut: 90,
        doc: "Force des frappes.", docEn: "Strength of the onsets." },
      { nom: "Accent", nomEn: "Accent", type: "nombre", plage: [0, 40], pas: 1, defaut: 20,
        doc: "Supplément de vélocité sur le premier pas de chaque cycle, pour qu'on entende où le cycle recommence.",
        docEn: "Extra velocity on the first step of each cycle, so the cycle's start can be heard." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume du rendu audio.", docEn: "Output volume." },
    ],
    async executer(ctx: any) {
      const DUREES: Record<string, number> = { noire: 1, croche: 0.5, double: 0.25, triolet: 1 / 3 };
      const config = {
        pas: ctx.paramNombre("Pas", 8),
        frappes: ctx.paramNombre("Frappes", 3),
        rotation: ctx.paramNombre("Rotation", 0),
        tempo: ctx.paramNombre("Tempo", 120),
        pasParNoire: DUREES[ctx.paramTexte("Durée d'un pas", "croche")] ?? 0.5,
        repetitions: ctx.paramNombre("Répétitions", 4),
        notePercussion: parseInt(ctx.paramTexte("Percussion", "36"), 10) || 36,
        velocite: ctx.paramNombre("Vélocité", 90),
        accent: ctx.paramNombre("Accent", 20),
      };
      const motif = motifEuclidien(config.pas, config.frappes, config.rotation);
      const notes = notesEuclidiennes(config);
      if (notes.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.euclidien.aucune_frappe") };
      }
      const buffer = await rendreBatterieMidi({ notes, volume: ctx.paramNombre("Volume", 80) });
      const midiFile = notesVersFichierMidi(notes, config.tempo, 9);
      const nom = nomTraditionnel(config.pas, config.frappes);
      const rotation = config.rotation > 0 ? ` · rotation ${config.rotation}` : "";
      return {
        valeurs: [buffer, midiFile],
        message: `E(${config.frappes},${config.pas}) ${motifEnTexte(motif)}${rotation}${nom ? ` · ${nom}` : ""}`,
      };
    },
  },
  {
    id: "rythme-cantor", nom: "Rythme de Cantor", nomEn: "Cantor Rhythm", univers: "Entrées", famille: "Génération",
    resume: "Génère une groove rythmique auto-similaire par récursion sur une grille de pas, et la sort aussi en MIDI.",
    resumeEn: "Generates a self-similar rhythmic groove by recursively removing beats from a grid, and also outputs it as MIDI.",
    // Sortie MIDI ajoutée À LA FIN, pour la même raison que sur la boîte à rythmes : les prises sont
    // des rangs, et les graphes enregistrés pointent sur eux.
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", nomEn: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", type: "nombre", plage: [40, 240], defaut: 120, unite: "BPM", doc: "Vitesse du groove en battements par minute.", docEn: "Groove speed in beats per minute." },
      { nom: "Profondeur", nomEn: "Depth", type: "nombre", plage: [1, 6], pas: 1, defaut: 3, doc: "Nombre de niveaux de récursion de la suppression de pas (plus = plus fractal).", docEn: "Number of recursion levels of beat removal (higher = more fractal)." },
      { nom: "Subdivision", nomEn: "Subdivision", type: "choix", options: ["3", "5", "7"], optionsEn: ["3", "5", "7"], defaut: "3", defautEn: "3", doc: "Nombre de segments dans lesquels chaque intervalle est divisé à chaque récursion.", docEn: "Number of segments each interval is divided into at each recursion." },
      { nom: "Partie retirée", nomEn: "Removed part", type: "choix", options: ["Centre", "Gauche", "Droite", "Aléatoire"], optionsEn: ["Center", "Left", "Right", "Random"], optionIds: ["center", "left", "right", "random"], defaut: "Centre", defautEn: "Center", doc: "Partie de l'intervalle retirée à chaque niveau de récursion.", docEn: "Part of the interval removed at each recursion level." },
      { nom: "Instrument", nomEn: "Instrument", type: "choix", options: ["Kick", "Caisse claire", "Charley", "Tous"], optionsEn: ["Kick", "Snare", "Hi-hat", "All"], optionIds: ["kick", "snare", "hihat", "all"], defaut: "Tous", defautEn: "All", doc: "Percussion(s) jouée(s) par les pas survivants.", docEn: "Drum(s) played by the surviving steps." },
      { nom: "Mesures", nomEn: "Bars", type: "nombre", plage: [1, 8], pas: 1, defaut: 2, doc: "Nombre de mesures générées.", docEn: "Number of bars generated." },
      { nom: "Swing", nomEn: "Swing", type: "nombre", plage: [0, 100], defaut: 0, unite: "%", doc: "Décalage des temps impairs pour un feeling swing/shuffle.", docEn: "Offset of odd beats for a swing/shuffle feel." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], defaut: 80, unite: "%", doc: "Volume de sortie du groove.", docEn: "Output volume of the groove." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "nombre", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du choix de la partie retirée et des rafales de bruit. Sans effet sur la grille hors du mode « Aléatoire », mais elle fixe toujours le bruit. 0 = tirée au sort à chaque exécution, et affichée dans le message.",
        docEn: "Seed for the removed-part choice and the noise bursts. No effect on the grid outside the « Random » mode, but it always fixes the noise. 0 = drawn at random on every run, and shown in the message." },
    ],
    async executer(ctx: any) {
      const partie = ctx.paramTexte("Partie retirée", "center") as any;
      const partieValide = ["center", "left", "right", "random"].includes(partie) ? partie : "center";
      const subdivision = parseInt(ctx.paramTexte("Subdivision", "3"), 10);
      const subdivisionValide = [3, 5, 7].includes(subdivision) ? subdivision : 3;
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const tempo = ctx.paramNombre("Tempo", 120);
      const profondeur = ctx.paramNombre("Profondeur", 3);
      const mesures = Math.max(1, Math.round(ctx.paramNombre("Mesures", 2)));
      const instrument = ctx.paramTexte("Instrument", "all") as string;
      const volume = ctx.paramNombre("Volume", 80);
      const swing = ctx.paramNombre("Swing", 0);
      const buffer = await genererRythmeCantor(tempo, profondeur, subdivisionValide, partieValide,
        mesures, instrument as any, volume, swing, aleatoire);
      // LE MÊME RYTHME, EN MIDI. La grille est RECONSTRUITE avec un générateur NEUF de la même graine :
      // le rendu tire la sienne avant ses rafales de bruit, donc un générateur déjà consommé donnerait
      // une autre grille en mode « Aléatoire » — et le MIDI ne serait plus le rythme entendu.
      const PAS_CANTOR = 64;
      const grille = genererGrilleCantor(PAS_CANTOR, Math.max(1, profondeur), subdivisionValide,
        partieValide, creerAleatoire(graine));
      // Trois pistes, comme le rendu : le niveau de récursion module l'instrument en mode « Tous ».
      const pistes = [0, 1, 2].map(() => new Array(mesures * PAS_CANTOR).fill(false));
      for (let m = 0; m < mesures; m++) {
        for (let p = 0; p < PAS_CANTOR; p++) {
          const niveau = grille[p];
          if (niveau < 0) continue;
          const piste = instrument === "all" ? niveau % 3
            : instrument === "kick" ? 0 : instrument === "snare" ? 1 : 2;
          pistes[piste][m * PAS_CANTOR + p] = true;
        }
      }
      const notesMidi = notesDepuisFrappes(
        frappesDePistesBooleennes(pistes.map((pas, piste) => ({ piste, pas, niveau: volume }))),
        { tempo, pasParMesure: PAS_CANTOR, mesures, swing });
      const midi = notesMidi.length > 0 ? notesVersFichierMidi(notesMidi, tempo, CANAL_PERCUSSION) : null;
      return {
        valeurs: [buffer, midi],
        message: `${buffer.duration.toFixed(1)} s · grille Cantor · graine ${graine}`
          + ` · ${traduire("msg.batterie.midi", String(notesMidi.length))}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
