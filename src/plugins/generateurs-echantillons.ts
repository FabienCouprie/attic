// plugins/generateurs-echantillons.ts — Echantillonneur MIDI et boite a groove.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { decoderFichier, rendreAvecEchantillon, analyserMidi, rendreSequence, rendreMidiDepuisBytes, filtrerCanauxMidi, normaliserPic, limiterPic, appliquerInstrumentsParCanal, GAMMES_ACCORDS } from "../audio";
import { parseMidi } from "midi-file";
import { genererGrooveBox, type ConfigGrooveBox } from "../audio/groove-box";
import { rendreBatterieMidi } from "../audio/tone-synths";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2_SUIVI } from "./soundfontGlobal";
import { optionsPatrons } from "./patrons-rythme";
import { avecDoc } from "./notices";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */
import { GENRES_ACCORDS_IDS, GAMMES_ACCORDS_IDS } from "./generateurs-aides";
import { LIBELLES_HERITES_GAMMES } from "../audio/gammes";
import { PARAMETRE_CLE } from "../audio/cles";

export const fiches: FicheAudio[] = ([
  {
    id: "sampler-midi", nom: "Sampler MIDI", nomEn: "MIDI Sampler", univers: "Traitement", famille: "Effets",
    resume: "Joue les notes MIDI entrantes avec un échantillon audio chargé dans l'inspecteur.",
    resumeEn: "Plays incoming MIDI notes with an audio sample loaded from the inspector.",
    entrees: [{ nom: "MIDI", type: "midi" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de sortie.", docEn: "Output volume." },
      { nom: "Note référence", nomEn: "Reference note", plage: [21, 108], pas: 1, defaut: 60,
        doc: "Note MIDI correspondant à la hauteur d'origine de l'échantillon (60 = Do central).", docEn: "MIDI note matching the original pitch of the sample (60 = middle C)." },
    ],
    async executer(ctx: any) {
      const midiFile = ctx.entree(0);
      if (!(midiFile instanceof File)) return { valeurs: [null, null], message: traduire("msg.branchez_un_source_midi") };
      const audioFichier = ctx.noeud.data.audioFichier as File | undefined;
      if (!audioFichier) return { valeurs: [null, midiFile], message: traduire("msg.chargez_un_chantillon_audio_dans_l_inspecteur") };
      const sample = await decoderFichier(audioFichier, ctx.runtime);
      const bytes = new Uint8Array(await midiFile.arrayBuffer());
      const { notes } = analyserMidi(parseMidi(bytes));
      if (!notes.length) return { valeurs: [null, midiFile], message: traduire("msg.aucune_note_dans_le_midi") };
      const vol = ctx.paramNombre("Volume", 80);
      const noteRef = ctx.paramNombre("Note référence", 60);
      const adapt = notes.map((n: any) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.fin }));
      const buf = rendreAvecEchantillon(adapt, sample, vol, noteRef);
      return { valeurs: [buf, midiFile], message: traduire("msg.var_0_notes_chantillon_var_1", notes.length, audioFichier.name) };
    },
  },
  {
    id: "boite-groove",
    nom: "Groove Box",
    nomEn: "Groove Box",
    univers: "Entrées",
    famille: "Génération",
    resume: "Génère une boucle groove : progression d'accords déterministe + mélodie de réservoir + batterie.",
    resumeEn: "Generates a groove loop: deterministic chord progression + reservoir melody + drums.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio", sousType: "stereo" },
      { nom: "MIDI batterie", nomEn: "MIDI drums", type: "midi" },
      { nom: "MIDI accords", nomEn: "MIDI chords", type: "midi" },
      { nom: "MIDI basse", nomEn: "MIDI bass", type: "midi" },
      { nom: "MIDI mélodie", nomEn: "MIDI melody", type: "midi" },
    ],
    parametres: [
      {
        ...PARAMETRE_CLE,
        doc: "Note fondamentale (tonique) de la grille harmonique.",
        docEn: "Root note (tonic) of the harmonic grid.",
      },
      {
        nom: "Gamme",
        nomEn: "Scale",
        type: "choix",
        // Les libellés viennent de la table, comme les identifiants : voir le générateur d'accords,
        // où les deux listes s'étaient désaccordées et cachaient deux gammes.
        options: GAMMES_ACCORDS.map((g) => g.fr),
        // LES LIBELLÉS ANGLAIS VIENNENT DE LA TABLE EUX AUSSI. Ils étaient écrits en clair, et onze
        // libellés pour une liste qui en compte davantage auraient caché les gammes ajoutées : c'est
        // exactement le désaccord que le commentaire ci-dessus relevait déjà, par l'autre bout.
        optionsEn: GAMMES_ACCORDS.map((g) => g.en),
        optionIds: GAMMES_ACCORDS_IDS,
        // Les libellés que ce choix a portés autrefois, pour qu'un projet enregistré retrouve sa
        // gamme : ils n'étaient pas les mêmes que ceux des composants de mélodie.
        optionsHeritees: LIBELLES_HERITES_GAMMES,
        defaut: "Majeur",
        defautEn: "Major",
        doc: "Gamme employée pour construire les accords. Les sept modes, les trois mineures, les deux pentatoniques, le vocabulaire du jazz avec le blues, l'altérée, les deux dominantes et la bebop, les symétriques avec la gamme par tons, les deux diminuées et l'augmentée, les gammes à seconde augmentée et les deux pentatoniques japonaises, et la chromatique.",
        docEn: "Scale used to build chords. The seven modes, the three minors, the two pentatonics, the jazz vocabulary with blues, altered, the two dominants and bebop, the symmetric ones with whole tone, the two diminished and augmented, the augmented-second scales and the two Japanese pentatonics, and chromatic.",
      },
      {
        nom: "Genre",
        nomEn: "Genre",
        type: "choix",
        options: ["pop","rock","jazz","blues","classique","electro","hiphop","reggae","ambient","personnalisé"],
        optionsEn: ["Pop","Rock","Jazz","Blues","Classical","Electronic","Hip-hop","Reggae","Ambient","Custom"],
        optionIds: GENRES_ACCORDS_IDS,
        defaut: "pop",
        defautEn: "pop",
        doc: "Style déterminant la progression d'accords. « Personnalisé » ouvre la saisie de la progression.",
        docEn: "Style that determines the chord progression. Settings: « Custom » to enter the progression.",
      },
      {
        nom: "Progression",
        nomEn: "Progression",
        type: "texte",
        defaut: "I-V-vi-IV",
        defautEn: "I-V-vi-IV",
        doc: "Progression personnalisée en chiffres romains (ex. I-V-vi-IV, ii-V-I). Utilisée seulement si Genre = personnalisé.",
        docEn: "Custom progression in Roman numerals (e.g. I-V-vi-IV, ii-V-I). Used only when Genre = Custom.",
      },
      {
        nom: "Tempo",
        nomEn: "Tempo",
        type: "nombre",
        plage: [40, 240],
        pas: 1,
        defaut: 110,
        unite: "BPM",
        doc: "Vitesse en battements par minute.",
        docEn: "Speed in beats per minute.",
      },
      {
        nom: "Durée par accord",
        nomEn: "Chord duration",
        type: "nombre",
        plage: [1, 8],
        pas: 1,
        defaut: 2,
        unite: "temps",
        uniteEn: "beats",
        doc: "Durée de chaque accord en temps (4 temps = 1 mesure 4/4).",
        docEn: "Duration of each chord in beats (4 beats = 1 4/4 bar).",
      },
      {
        nom: "Nombre d'accords",
        nomEn: "Chord count",
        type: "nombre",
        plage: [2, 32],
        pas: 1,
        defaut: 8,
        doc: "Nombre total d'accords / taille de la boucle.",
        docEn: "Total number of chords / loop length.",
      },
      {
        nom: "Extension",
        nomEn: "Extension",
        type: "choix",
        options: ["Aucune", "Idiomatique"],
        optionsEn: ["None", "Idiomatic"],
        optionIds: ["aucune", "idiomatique"],
        defaut: "Aucune",
        defautEn: "None",
        doc: "Ajoute une septième diatonique là où le genre la place, et non à tous les accords : sur la dominante seule en pop, rock, classique ou reggae ; sur chaque accord en jazz et en blues, dont c'est l'idiome ; sur la tonique et la sous-dominante en ambient. La note ajoutée vaut aussi pour le réservoir mélodique quand il se cale sur l'accord. Les anciens réglages « 7e » et « 6e », qui coloraient tous les accords, sont lus comme « Idiomatique ».",
        docEn: "Adds a diatonic seventh where the genre puts it, rather than on every chord: on the dominant only for pop, rock, classical and reggae; on every chord for jazz and blues, whose idiom it is; on the tonic and subdominant for ambient. The added note also applies to the melodic reservoir when it snaps to the chord. The former « 7th » and « 6th » settings, which coloured every chord, are read as « Idiomatic »."
      },
      {
        nom: "Style rythmique",
        nomEn: "Rhythm style",
        type: "choix",
        // La même liste que la Boîte à rythmes, restreinte à ce que la boucle sait jouer :
        // sa grille est en 4/4, et un patron qui n'a que du 3/4 y retombait en silence sur
        // un patron de secours. Dix patrons étaient recopiés ici à la main ; ils sont
        // cinquante-trois à savoir jouer en 4/4.
        ...optionsPatrons("4/4"),
        defaut: "Pop dance",
        defautEn: "Pop dance",
        doc: "Patron de batterie appliqué sur la boucle, choisi parmi ceux de la Boîte à rythmes qui se jouent en 4/4.",
        docEn: "Drum pattern applied to the loop, chosen among the Drum Machine's patterns that play in 4/4.",
      },
      {
        nom: "Neurones",
        nomEn: "Neurons",
        type: "nombre",
        plage: [5, 50],
        pas: 1,
        defaut: 15,
        doc: "Nombre de neurones du réservoir mélodique. Peu = motifs courts ; beaucoup = motifs complexes.",
        docEn: "Number of neurons in the melodic reservoir. Few = short patterns; many = complex patterns.",
      },
      {
        nom: "Connectivité",
        nomEn: "Connectivity",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 30,
        unite: "%",
        doc: "Probabilité de connexion entre neurones.",
        docEn: "Probability of connection between neurons.",
      },
      {
        nom: "Mémoire",
        nomEn: "Memory",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 30,
        unite: "%",
        doc: "Taux de fuite (leaking). Élevé = mémoire longue.",
        docEn: "Leaking rate. High = long memory.",
      },
      {
        nom: "Spectre",
        nomEn: "Spectral radius",
        type: "nombre",
        plage: [50, 150],
        pas: 1,
        defaut: 90,
        unite: "%",
        doc: "Rayon spectral du réseau. <100% = stable, >100% = chaotique.",
        docEn: "Network spectral radius. <100% = stable, >100% = chaotic.",
      },
      {
        nom: "Octave",
        nomEn: "Octave",
        type: "nombre",
        plage: [2, 6],
        pas: 1,
        defaut: 4,
        doc: "Octave de départ de la mélodie du réservoir.",
        docEn: "Starting octave of the reservoir melody.",
      },
      {
        nom: "Densité",
        nomEn: "Density",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 70,
        unite: "%",
        doc: "Probabilité de produire une note mélodique à chaque pas.",
        docEn: "Probability of producing a melodic note at each step.",
      },
      {
        nom: "Répétition",
        nomEn: "Repetition",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 25,
        unite: "%",
        doc: "Tendance à répéter la note mélodique précédente.",
        docEn: "Tendency to repeat the previous melodic note.",
      },
      {
        nom: "Silence",
        nomEn: "Silence",
        type: "nombre",
        plage: [0, 50],
        pas: 1,
        defaut: 10,
        unite: "%",
        doc: "Probabilité de silence mélodique à chaque pas.",
        docEn: "Probability of melodic silence at each step.",
      },
      {
        nom: "Graine", graine: true,
        nomEn: "Seed",
        type: "nombre",
        plage: [0, 999999],
        pas: 1,
        defaut: 0,
        doc: "Graine du réservoir (0 = aléatoire à chaque exécution). Même graine = même mélodie.",
        docEn: "Reservoir seed (0 = random each run). Same seed = same melody.",
      },
      {
        nom: "Volume",
        nomEn: "Volume",
        type: "nombre",
        plage: [0, 100],
        pas: 1,
        defaut: 80,
        unite: "%",
        doc: "Volume général des parties mélodiques et harmoniques.",
        docEn: "General volume for melodic and harmonic parts.",
      },
      {
        nom: "Volume batterie",
        nomEn: "Drum volume",
        type: "nombre",
        plage: [0, 200],
        pas: 1,
        defaut: 100,
        unite: "%",
        doc: "Volume de la batterie, relatif aux parties mélodiques. Les deux bus sont mis à niveau séparément avant d'être additionnés : les parties mélodiques à 0,80 de pic, la batterie à 0,50 à 100 %. Le niveau de la mélodie ne dépend donc plus de la batterie, auparavant le mix entier était ramené au pic des frappes, et les parties mélodiques sortaient 9 dB plus bas avec la batterie à 100 qu'à 0. Au-delà de 100 la batterie domine, à 0 elle disparaît.",
        docEn: "Drum volume, relative to the melodic parts. The two buses are levelled separately before being summed: the melodic parts to a 0.80 peak, the drums to 0.50 at 100%. The melody's level therefore no longer depends on the drums, the whole mix used to be scaled down to the drum hits' peak, and the melodic parts came out 9 dB lower with drums at 100 than at 0. Above 100 the drums dominate; at 0 they are gone.",
      },
      {
        ...PARAMETRE_SYNTHESE,
        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. La batterie utilise toujours le drum-synth interne.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. Drums always use the internal drum synth.",
      },
      // UN INSTRUMENT PAR PARTIE, et non un seul pour les trois.
      //
      // Le nœud expose quatre sorties MIDI — batterie, accords, basse, mélodie —
      // et ne déclarait qu'une case « Instrument ». La laisser sur « Suivre le
      // MIDI » donnait le bon arrangement (piano, basse jouée aux doigts, lead
      // carré), mais y choisir quoi que ce soit l'aplatissait : mesuré, un
      // réglage sur « Church Organ » mettait les TROIS parties à l'orgue, la
      // basse perdant son patch de basse. Un seul rendu suffit toujours : les
      // instruments sont écrits dans le MIDI avant de rendre.
      //
      // La batterie n'a pas de case : elle passe par le drum-synth interne, dont
      // les sons ne viennent pas du SoundFont.
      {
        ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        nom: "Instrument accords", nomEn: "Chord instrument",
        doc: "Preset du SoundFont pour la partie d'accords, ou « Suivre le MIDI » pour garder celui que le composant lui donne (piano). Le choix est aussi écrit dans la sortie « MIDI accords », pour que le composant qui la rendra ensuite l'utilise.",
        docEn: "SoundFont preset for the chord part, or « Follow MIDI » to keep the one the node assigns (piano). The choice is also written into the « MIDI chords » output, so whichever node renders it next will use it.",
      },
      {
        ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        nom: "Instrument basse", nomEn: "Bass instrument",
        doc: "Preset du SoundFont pour la basse, ou « Suivre le MIDI » pour garder celui que le composant lui donne (basse jouée aux doigts). Le choix est aussi écrit dans la sortie « MIDI basse », pour que le composant qui la rendra ensuite l'utilise.",
        docEn: "SoundFont preset for the bass, or « Follow MIDI » to keep the one the node assigns (fingered bass). The choice is also written into the « MIDI bass » output, so whichever node renders it next will use it.",
      },
      {
        ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        nom: "Instrument mélodie", nomEn: "Melody instrument",
        doc: "Preset du SoundFont pour la mélodie, ou « Suivre le MIDI » pour garder celui que le composant lui donne (lead carré). Le choix est aussi écrit dans la sortie « MIDI mélodie », pour que le composant qui la rendra ensuite l'utilise.",
        docEn: "SoundFont preset for the melody, or « Follow MIDI » to keep the one the node assigns (square lead). The choice is also written into the « MIDI melody » output, so whichever node renders it next will use it.",
      },
      {
        ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        nom: "Kit de batterie", nomEn: "Drum kit",
        doc: "Quatrième case, pour la quatrième sortie. « Suivre le MIDI » garde le drum-synth interne, des percussions synthétisées, toujours audibles même sans SoundFont chargé, et c'est le comportement par défaut. Choisir un preset fait rendre la batterie par ce kit du SoundFont à la place ; prenez-en un de la banque 128. Dans les deux cas, la sortie « MIDI batterie » porte le kit choisi, pour que le composant qui la rendra ensuite l'utilise.",
        docEn: "A fourth slot, for the fourth output. « Follow MIDI » keeps the internal drum synth, synthesized percussion, always audible even with no SoundFont loaded, and the default. Picking a preset renders the drums with that SoundFont kit instead; choose one from bank 128. Either way the « MIDI drums » output carries the chosen kit, so whichever node renders it next will use it.",
      },
    ],
    async executer(ctx: any) {
      const config: ConfigGrooveBox = {
        cle: ctx.paramTexte("Clé", "C"),
        gamme: ctx.paramTexte("Gamme", "majeur"),
        genre: ctx.paramTexte("Genre", "pop"),
        progression: ctx.paramTexte("Progression", "I-V-vi-IV"),
        extension: ctx.paramTexte("Extension", "aucune"),
        tempo: ctx.paramNombre("Tempo", 110),
        dureeAccord: ctx.paramNombre("Durée par accord", 2),
        nbAccords: ctx.paramNombre("Nombre d'accords", 8),
        styleRythme: ctx.paramTexte("Style rythmique", "Pop dance"),
        neurones: ctx.paramNombre("Neurones", 15),
        connectivite: ctx.paramNombre("Connectivité", 30) / 100,
        memoire: ctx.paramNombre("Mémoire", 30) / 100,
        spectre: ctx.paramNombre("Spectre", 90) / 100,
        octave: ctx.paramNombre("Octave", 4),
        densite: ctx.paramNombre("Densité", 70) / 100,
        repetition: ctx.paramNombre("Répétition", 25) / 100,
        silence: ctx.paramNombre("Silence", 10) / 100,
        graine: ctx.paramNombre("Graine", 0),
      };
      ctx.onProgress(traduire("progress.g_n_ration_groove_box"));
      const { midiBytes, midiAccords, midiBasse, midiMelodie, midiBatterie, description, graineUtilisee } = genererGrooveBox(config);
      const volume = ctx.paramNombre("Volume", 80);
      const volumeBatterie = ctx.paramNombre("Volume batterie", 100);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());

      // L'ancienne case unique « Instrument » n'est plus déclarée, mais un projet
      // enregistré avant ce changement la porte encore dans ses données : on la
      // lit comme valeur de repli, pour que ces projets sonnent comme avant. Un
      // choix explicite par partie l'emporte.
      const legs = ctx.paramNombre("Instrument", -1);
      const pourPartie = (nom: string) => {
        const v = ctx.paramNombre(nom, -1);
        return v >= 0 ? v : legs;
      };
      const instrumentsParCanal = new Map<number, number>([
        [0, pourPartie("Instrument accords")],
        [1, pourPartie("Instrument basse")],
        [2, pourPartie("Instrument mélodie")],
      ]);

      // L'instrument choisi est écrit dans la sortie MIDI de SA partie, pour qu'il
      // voyage avec le fichier : c'est ce que fait deja « Multi-reservoirs » pour sa
      // piste de rythme. Sans cela, le nœud qui rendra ce MIDI retomberait sur le
      // programme que le generateur y inscrit en dur — piano 0, basse 33, lead 80,
      // kit « Standard » banque 128 programme 0 — et le reglage n'aurait aucun effet
      // en aval.
      //
      // C'EST LE DÉFAUT RAPPORTÉ : seule la batterie était traitée ainsi. Les trois
      // autres cases n'agissaient que sur le rendu audio interne du nœud, où elles
      // s'entendaient parfaitement. Branchées sur « Jointure MIDI » puis rendues,
      // les parties revenaient au piano-basse-lead d'origine.
      const kitBatterie = ctx.paramNombre("Kit de batterie", -1);
      const sortieMidi = (octets: Uint8Array, canal: number, nom: string) => {
        const inst = canal === 9 ? kitBatterie : instrumentsParCanal.get(canal) ?? -1;
        const bytes = inst >= 0 ? appliquerInstrumentsParCanal(octets, new Map([[canal, inst]])) : octets;
        return new File([bytes as unknown as BlobPart], nom, { type: "audio/midi" });
      };
      const fichierBatterie = sortieMidi(midiBatterie, 9, "groove-box-drums.mid");
      const fichierAccords = sortieMidi(midiAccords, 0, "groove-box-chords.mid");
      const fichierBasse = sortieMidi(midiBasse, 1, "groove-box-bass.mid");
      const fichierMelodie = sortieMidi(midiMelodie, 2, "groove-box-melody.mid");

      const { notes: notesMidi, dureeTotale } = analyserMidi(parseMidi(midiBytes));

      // La batterie passe-t-elle par le SoundFont ? Alors elle est rendue AVEC les
      // trois autres parties, dans le même passage : le canal 9 rejoint les canaux
      // 0, 1 et 2, son kit écrit dans le MIDI comme les autres instruments. Un seul
      // rendu pour les quatre parties, et surtout plus aucun mélange de tampons —
      // c'est précisément là que vivait le défaut de fréquence d'échantillonnage.
      const batterieAuSoundFont = useSf2 && kitBatterie >= 0;
      if (batterieAuSoundFont) instrumentsParCanal.set(9, kitBatterie);

      let melodicBuf: AudioBuffer;
      if (useSf2) {
        // Les instruments sont écrits DANS le MIDI, canal par canal, et le rendu
        // n'a plus qu'à suivre le fichier. Passer un instrument global au moteur
        // l'aurait appliqué aux trois canaux — c'était le défaut. Un seul rendu,
        // donc un seul tampon, pour autant de timbres que de canaux.
        const melodicBytes = appliquerInstrumentsParCanal(
          filtrerCanauxMidi(midiBytes, batterieAuSoundFont ? [0, 1, 2, 9] : [0, 1, 2]),
          instrumentsParCanal,
        );
        melodicBuf = await rendreMidiDepuisBytes(melodicBytes, "SoundFont", volume);
      } else {
        const melodic = notesMidi
          .filter((n) => n.canal !== 9)
          .map((n) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.fin }));
        melodicBuf = await rendreSequence(melodic, "FM/Oscillateurs", volume);
      }

      // UNE SEULE fréquence d'échantillonnage pour le mix, celle de la partie
      // mélodique — et non celle de l'AudioContext.
      //
      // Le mix additionne les deux tampons INDICE PAR INDICE. Il faut donc qu'ils
      // partagent leur fréquence, ce qui n'était pas le cas : `rendreMidiDepuisBytes`
      // rend toujours du 44 100 Hz (codé en dur), la batterie était rendue à la
      // fréquence de l'AudioContext, et le master aussi. Sur une machine à
      // 48 000 Hz, la partie mélodique était donc relue 8,8 % trop vite —
      // **+1,47 demi-ton**, et 8 % trop courte : sur une section de 150 s, la
      // mélodie finissait douze secondes avant la batterie.
      //
      // Le défaut s'entendait sans se voir : le nœud sortait de l'audio plausible,
      // simplement dans une autre tonalité que ses propres sorties MIDI. Il a été
      // trouvé en poursuivant un désaccord entre « Analyse harmonique », qui
      // annonçait fa♯ mineur, et le MIDI, dont les 501 notes étaient toutes en la
      // mineur. L'analyseur avait raison.
      const sampleRate = melodicBuf.sampleRate;

      // Aucune frappe a synthetiser quand le SoundFont s'en charge deja : le tampon
      // de batterie est alors vide, et le mix ci-dessous n'ajoute rien.
      const drums = batterieAuSoundFont ? [] : notesMidi
        .filter((n) => n.canal === 9)
        .map((n) => ({ note: n.note, velocite: n.velocite, debut: n.debut, fin: n.fin }));
      const drumBuf = await rendreBatterieMidi({ notes: drums, volume: volumeBatterie, sampleRate });

      const dureeMix = Math.max(dureeTotale, drumBuf.duration, melodicBuf.duration, 0.5);
      const master = new AudioBuffer({
        numberOfChannels: 2,
        length: Math.ceil(dureeMix * sampleRate),
        sampleRate,
      });

      // Les tableaux de canaux sont sortis de la boucle : `getChannelData` était
      // appelé quatre fois par échantillon, soit 29 millions de franchissements
      // de frontière pour 150 s de musique. Mesuré : 2215 ms contre 55 ms, un
      // facteur 40 pour un résultat identique au bit.
      const mixL = master.getChannelData(0), mixR = master.getChannelData(1);

      // Normalisation : un pic par BUS, avant la somme.
      //
      // Le mix entier était ramené à 0,9 de son pic, et ce pic, ce sont les frappes de
      // batterie : tout le reste descendait avec elles. Mesuré dans l'application, même
      // graine, le mix sortait à −23,1 dB RMS avec la batterie à 100 et à −13,9 dB sans
      // elle — 9 dB de moins pour les parties mélodiques à cause des transitoires de la
      // caisse claire. Baisser « Volume batterie » n'y suffisait pas : à 25 % il restait
      // 4,5 dB d'écart, parce que la frappe porte toujours le pic.
      //
      // Chaque bus est donc amené à son propre pic — les parties mélodiques à 0,80, la
      // batterie à 0,50 pour « Volume batterie » à 100 — avant d'être additionnés. Le
      // niveau de la mélodie ne dépend plus de la batterie, et « Volume batterie » règle
      // vraiment un rapport entre les deux. La somme ne peut dépasser 1,30 ; une
      // normalisation de sécurité ne touche alors qu'aux rares instants où les deux
      // culminent ensemble.
      normaliserPic(melodicBuf, 0.80);
      normaliserPic(drumBuf, 0.50 * Math.max(0, volumeBatterie) / 100);

      const melL = melodicBuf.getChannelData(0), melR = melodicBuf.getChannelData(1);
      const batL = drumBuf.getChannelData(0), batR = drumBuf.getChannelData(1);
      const nMel = Math.min(melL.length, master.length);
      const nBat = Math.min(batL.length, master.length);
      for (let i = 0; i < nMel; i++) { mixL[i] += melL[i]; mixR[i] += melR[i]; }
      for (let i = 0; i < nBat; i++) { mixL[i] += batL[i]; mixR[i] += batR[i]; }

      // Sécurité : seulement si la somme dépasse le plafond (voir audio/mixage.ts).
      limiterPic(master, 0.95);

      return {
        valeurs: [master, fichierBatterie, fichierAccords, fichierBasse, fichierMelodie],
        message: `${description} · graine ${graineUtilisee}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
