// plugins/generateurs.ts — Harmonie et melodie.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { genererMelodieAleatoire, genererAccords, analyserMidi, rendreAvecSF2, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi, rendreMidiDepuisBytes, GAMMES_ACCORDS, GAMMES_MELODIE_FR, GAMMES_MELODIE_EN, GAMMES_MELODIE_IDS } from "../audio";
import { parseMidi } from "midi-file";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";

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
    id: "generateur-accords", nom: "Générateur d'accords", nomEn: "Chord Generator", univers: "Entrées", famille: "Génération",
    resume: "Génère une progression d'accords.",
    resumeEn: "Generates a chord progression.",
    noticeEn: "Produces a sequence of chords based on the key, scale and genre. Each chord is voiced across 3 octaves with arpeggiation.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { ...PARAMETRE_CLE },
      // LES LIBELLÉS VIENNENT DE LA TABLE, comme les identifiants. Ils étaient écrits à la main et
      // en comptaient neuf quand la table en portait onze : le blues et la chromatique existaient
      // dans le moteur et ne se choisissaient nulle part. Relevé par le contrat de réglages.
      // LES LIBELLÉS ANGLAIS RESTENT CEUX D'ORIGINE, et ne viennent pas de la table : un projet
      // enregistré avant garde le libellé dans son fichier, et `valeurCanoniqueChoix` le retrouve
      // par comparaison exacte. Remplacer « minor » par le « Natural minor » de la table rendait
      // illisible tout projet qui avait choisi cette gamme. Un test de rétrocompatibilité le tient.
      { nom: "Gamme", nomEn: "Scale", type: "choix",
        // LES LIBELLÉS ANGLAIS VIENNENT DE LA TABLE EUX AUSSI : onze étaient écrits en clair face à
        // une liste française qui en dérivait, et les gammes ajoutées y seraient restées invisibles.
        options: GAMMES_ACCORDS.map((g) => g.fr),
        optionsEn: GAMMES_ACCORDS.map((g) => g.en),
        optionIds: GAMMES_ACCORDS_IDS, defaut: "Majeur", defautEn: "Major",
        optionsHeritees: LIBELLES_HERITES_GAMMES,
        doc: "Gamme employée pour construire les accords. Les sept modes, les trois mineures, les deux pentatoniques, le vocabulaire du jazz avec le blues, l'altérée, les deux dominantes et la bebop, les symétriques avec la gamme par tons, les deux diminuées et l'augmentée, les gammes à seconde augmentée et les deux pentatoniques japonaises, et la chromatique.",
        docEn: "Scale used to build the chords. The seven modes, the three minors, the two pentatonics, the jazz vocabulary with blues, altered, the two dominants and bebop, the symmetric ones with whole tone, the two diminished and augmented, the augmented-second scales and the two Japanese pentatonics, and chromatic." },
      { nom: "Genre", nomEn: "Genre", type: "choix", options: ["pop","rock","jazz","blues","classique","electro","hip-hop","reggae","ambient","personnalisé"], optionsEn: ["Pop","Rock","Jazz","Blues","Classical","Electronic","Hip-hop","Reggae","Ambient","Custom"], optionIds: GENRES_ACCORDS_IDS, defaut: "pop",
        doc: "Style déterminant la progression d'accords. « Personnalisé » ouvre la saisie d'une progression ci-dessous.",
        docEn: "Style determines the chord progression. Settings: « Custom » to enter your own progression below.", defautEn: "pop" },
      { nom: "Progression", nomEn: "Progression", type: "texte", defaut: "I-IV-V-I",
        doc: "Progression personnalisée en chiffres romains. I=tonique, IV=sous-dominante, V=dominante. Ex : I-IV-V-I, ii-V-I, I-V-vi-IV. Utilisée seulement si Genre = personnalisé.",
        docEn: "Custom progression in Roman numerals. I=tonic, IV=subdominant, V=dominant. Ex: I-IV-V-I, ii-V-I, I-V-vi-IV. Used only when Genre = Custom.", defautEn: "I-IV-V-I" },
      { nom: "Tempo", nomEn: "Tempo", plage: [40,240], defaut: 120, unite: "BPM" },
      { nom: "Durée par accord", nomEn: "Chord duration", plage: [1,8], pas: 1, defaut: 2, unite: "temps", uniteEn: "beats", docEn: "Duration per chord in beats." },
      { nom: "Nombre d'accords", nomEn: "Chord count", plage: [2,32], pas: 1, defaut: 8, docEn: "Total number of chords." },
      { nom: "Extension", nomEn: "Extension", type: "choix", options: ["Aucune","7e","6e"], optionsEn: ["None","7th","6th"], optionIds: ["aucune","septieme","sixte"], defaut: "Aucune", defautEn: "None",
        doc: "Ajoute une 7e ou une 6e diatonique (selon la gamme choisie) à chaque accord.", docEn: "Adds a diatonic 7th or 6th (per the chosen scale) to each chord." },
      { nom: "Volume", nomEn: "Volume", plage: [0,100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const cle = ctx.paramTexte("Clé","C"), gamme = ctx.paramTexte("Gamme","majeur");
      const genre = ctx.paramTexte("Genre","pop"), prog = ctx.paramTexte("Progression","I-IV-V-I");
      const tempo = ctx.paramNombre("Tempo",120), dAcc = ctx.paramNombre("Durée par accord",2);
      const nb = ctx.paramNombre("Nombre d'accords",8), vol = ctx.paramNombre("Volume",80);
      const extension = ctx.paramTexte("Extension", "aucune") as "aucune" | "septieme" | "sixte";
      const { midiBytes, description } = genererAccords(cle, gamme, genre, prog, tempo, dAcc, nb, extension);
      const sf2 = sf2Chargee();
      if (sf2) {
        const { notes, canauxInstrument } = analyserMidi(parseMidi(midiBytes));
        const sr = 44100, dTot = notes.reduce((m:number,n:any)=>Math.max(m,n.fin),0)+1;
        const master = new AudioBuffer({numberOfChannels:2,length:Math.ceil(dTot*sr),sampleRate:sr});
        for (const canal of [0,1]) {
          const nc = notes.filter((n:any)=>n.canal===canal);
          if (!nc.length) continue;
          const instCanal = canauxInstrument.get(canal)??{programme:0,banque:0};
          const idx = instCanal.programme < sf2.instruments.length ? instCanal.programme : undefined;
          const an = nc.map((n:any)=>({note:n.note,velocite:n.velocite,debut:n.debut,fin:n.fin}));
          const layer = rendreAvecSF2(sf2, an, vol, idx, instCanal.banque);
          // Canaux sortis de la boucle : quatrième et dernière occurrence du motif,
          // mesuré 40× plus lent pour un résultat identique au bit. Le master et
          // les couches partagent ici la même fréquence (44 100 des deux côtés),
          // donc pas de désaccord comme celui qu'avait le Groove Box.
          const mixL = master.getChannelData(0), mixR = master.getChannelData(1);
          const srcL = layer.getChannelData(0), srcR = layer.getChannelData(1);
          const n = Math.min(master.length, layer.length);
          for (let i = 0; i < n; i++) { mixL[i] += srcL[i]; mixR[i] += srcR[i]; }
        }
        return { valeurs:[master], message:traduire("msg.var_0_soundfont", description) };
      }
      const { rendreMidiDepuisBytes } = await import("../audio");
      return { valeurs:[await rendreMidiDepuisBytes(midiBytes,"FM/Oscillateurs",vol)], message:traduire("msg.var_0_fm", description) };
    },
  },
  {
    id: "melodie-aleatoire", nom: "Mélodie aléatoire", nomEn: "Random Melody", univers: "Entrées", famille: "Génération",
    resume: "Génère une mélodie aléatoire.",
    resumeEn: "Generates a random melody.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { ...PARAMETRE_CLE },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut:"Majeur", defautEn: "Major" },
      { nom:"Signature temporelle", nomEn:"Time signature", type:"choix", options:["4/4","3/4","6/8"], defaut:"4/4", optionsEn: ["4/4","3/4","6/8"], defautEn: "4/4" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:100, unite:"BPM" },
      { nom:"Mesures", nomEn:"Bars", plage:[1,32], pas:1, defaut:4 },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
      { nom:"Graine", graine: true, nomEn:"Seed", plage:[0,999999], pas:1, defaut:0,
        doc:"Graine de la mélodie. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement la même mélodie.",
        docEn:"Seed for the melody. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same melody." },
      { ...PARAMETRE_SYNTHESE,        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
    ],
    async executer(ctx: any) {
      console.log("[attic] Mélodie aléatoire : exécution démarrée");
      const tempo = ctx.paramNombre("Tempo",100);
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const { audio, notes } = await genererMelodieAleatoire(ctx.paramTexte("Clé","Do"),ctx.paramTexte("Gamme","Majeur"),ctx.paramTexte("Signature temporelle","4/4"),tempo,ctx.paramNombre("Mesures",4),aleatoire);
      const midiFile = notesVersFichierMidi(notes, tempo);
      const volume = ctx.paramNombre("Volume",80);
      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
      const useSf2 = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee());
      console.log(`[attic] Mélodie aléatoire : mode=${mode}, useSf2=${useSf2}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, notes=${notes.length}`);
      // Le volume s'appliquait au seul rendu SoundFont : en FM — le rendu par défaut sans banque
      // chargée — le réglage ne faisait rien. Il s'applique désormais aux deux.
      const audioFinal = useSf2
        ? await rendreSequence(notes, "SoundFont", volume, instrument, banque)
        : audio;
      if (!useSf2 && audioFinal) {
        const g = Math.max(0, Math.min(1, volume / 100));
        for (let c = 0; c < audioFinal.numberOfChannels; c++) {
          const d = audioFinal.getChannelData(c);
          for (let i = 0; i < d.length; i++) d[i] *= g;
        }
      }
      const midiFinal = await appliquerInstrumentMidi(midiFile, ctx.paramNombre("Instrument", 0));
      console.log(`[attic] Mélodie aléatoire : audioFinal durée=${audioFinal?.duration ?? 0}`);
      // La graine est AFFICHÉE et pas seulement utilisée : avec le réglage par
      // défaut (0 = tirée au sort), c'est le seul moyen de retrouver une
      // mélodie qu'on voudrait garder.
      return { valeurs: [audioFinal, midiFinal], message: `${notes.length} notes · graine ${graine}` };
    },
  },
] as FicheAudio[]).map(avecDoc);
