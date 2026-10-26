// plugins/generateurs-sources.ts — Sources elementaires : clavier, bruit, frequence, metronome.
//
// Les fiches sont rangees par nature de ce qu'elles engendrent, et non par famille : elles
// declarent presque toutes la meme, ce qui ne decoupe rien.


import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { decoderFichier, rendreAvecEchantillon, genererBruit, genererAudioFormule, notesVersFichierMidi, rendreSequence, appliquerInstrumentMidi, degresGammeMelodie, GAMMES_MELODIE_FR, GAMMES_MELODIE_EN, GAMMES_MELODIE_IDS, DEMI_TONS_CLE, type NoteEvenement } from "../audio";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2, decoderInstrumentSF2 } from "./soundfontGlobal";
import { avecDoc } from "./notices";
import { creerAleatoire, hasardDuNoeud } from "../core";

/**
 * Convertit une note texte (ex. C4, c#5, Bb3, A4, C4\n) en fréquence.
 * Accepte les altérations #/♯ et b/♭, ignore la casse et les espaces blancs.
 * Retourne null si la note est invalide.
 */
import { noteVersFrequence } from "./generateurs-aides";
import { accordageEgal, decrireAccordage, degrePlusProche, type Accordage } from "../audio/accordage";
import { rendreNotes, type Banque } from "../audio/clavier-banque";
import { deposerBanque } from "../audio/banques-vives";
import { CASES, etendue, sautDeRangee } from "../audio/clavier-isomorphe";
import type { Sequence } from "../audio/sequence";
import { FORMES_ONDE_CHOIX, LIBELLES_HERITES_FORMES, formeOndeDepuisTimbre } from "../audio/timbres";
import { PARAMETRE_CLE } from "../audio/cles";
import { SIGNATURES, clicsDeMesure, dureeUnite, lireSignature, tempsParMesure } from "../audio/signatures";
import { frequenceDeTravail } from "../audio/frequence-de-travail";

export const fiches: FicheAudio[] = ([
  {
    id: "clavier-melodie", nom: "Clavier mélodie", nomEn: "Melody Keyboard", univers: "Entrées", famille: "Génération",
    resume: "Joue une séquence enregistrée au clavier et exporte aussi un fichier MIDI.",
    resumeEn: "Plays a keyboard-recorded sequence and also exports a MIDI file.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
    parametres: [
      { ...PARAMETRE_SYNTHESE,        doc: "Automatique = SoundFont si un fichier SF2 est chargé, sinon FM. FM = synthèse locale. SoundFont = échantillons.",
        docEn: "Auto = SoundFont if an SF2 file is loaded, else FM. FM = local synthesis. SoundFont = samples." },
      PARAMETRE_INSTRUMENT_SF2,
      { nom:"Tempo", nomEn:"Tempo", type:"curseur", plage:[40,240], defaut:120, unite:"BPM" },
      { nom:"Volume", nomEn:"Volume", plage:[0,100], defaut:80, unite:"%" },
    ],
    // UN CLAVIER OÙ RIEN N'A ENCORE ÉTÉ JOUÉ N'EST PAS EN ERREUR, et il le disait : posé sur le
    // canevas puis lancé, le nœud affichait « Erreur · Aucune séquence. » avant que personne n'ait
    // touché une touche. Le filet du moteur lit « tout nul sur un nœud à sorties », et ce drapeau
    // est ce qui le désarme. LE CHEMIN D'ÉCHEC, LUI, SE DÉCLARE MAINTENANT : son `erreur: true`
    // n'était pas nécessaire tant que la nullité suffisait à le signaler, et le serait devenu
    // silencieux sans lui.
    sortieNullePermise: true,
    async executer(ctx: any) {
      console.log("[attic] Clavier mélodie : exécution démarrée");
      const notes = ctx.noeud.data.sequenceNotes as NoteEvenement[] | undefined;
      if (!notes || !Array.isArray(notes)) return { valeurs:[null, null], message:traduire("msg.aucune_s_quence") };
      try {
        const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
        const { programme: instrument, banque } = decoderInstrumentSF2(ctx.paramNombre("Instrument", 0));
        const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
        console.log(`[attic] Clavier mélodie : mode=${mode}, modeRendu=${modeRendu}, sf2Chargee=${!!sf2Chargee()}, instrument=${instrument}, banque=${banque}, notes=${notes.length}`);
        const buf = await rendreSequence(notes, modeRendu, ctx.paramNombre("Volume",80), instrument, banque);
        const tempo = ctx.paramNombre("Tempo", 120);
        const midiFile = await appliquerInstrumentMidi(notesVersFichierMidi(notes, tempo), ctx.paramNombre("Instrument", 0));
        console.log(`[attic] Clavier mélodie : buffer rendu, durée=${buf?.duration ?? 0}`);
        return { valeurs: [buf, midiFile] };
      } catch (e: any) {
        console.error("[attic] Clavier mélodie : erreur", e);
        // `erreur: true` EXPLICITE, depuis que la nullité ne suffit plus à signaler l'échec : le
        // drapeau `sortieNullePermise` désarme le filet du moteur pour le cas légitime, donc celui-ci
        // doit le dire lui-même. Sans cette ligne, une synthèse qui échoue passerait pour un clavier
        // au repos.
        return { valeurs:[null, null], erreur: true, message: traduire("msg.erreur_synth_se_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "clavier-isomorphe", nom: "Clavier isomorphe", nomEn: "Isomorphic Keyboard",
    univers: "Entrées", famille: "Génération",
    resume: "Joue les degrés d'un accordage au clavier de l'ordinateur, en réseau.",
    resumeEn: "Plays a tuning's degrees from the computer keyboard, as a lattice.",
    notice: "Joue les degrés d'un accordage au clavier de l'ordinateur. Les quatre rangées de lettres et de chiffres forment un réseau de quarante et une cases : une case vers la droite ajoute un degré, une rangée vers le haut en ajoute le nombre que « Saut de rangée » désigne. Un même intervalle garde ainsi la même forme sous les doigts, à n'importe quelle hauteur et dans n'importe quel accordage.\n\nL'entrée « Accordage » porte l'échelle à jouer. Le réseau se construit sur elle dès que le graphe a été lancé une fois. Sans entrée branchée, il se construit sur le tempérament égal que « Degrés par période » donne, et le message du nœud nomme alors cette source.\n\nL'entrée « Banque » porte le son à étaler sur le réseau. Branchée, chaque case joue l'échantillon à sa propre hauteur au lieu de la synthèse interne, et la sortie « Audio » le rend de la même façon ; le message du nœud dit laquelle des deux sonne. La banque arrive de « Étaler sur le clavier » ou de « Clavier SFZ », et le graphe doit avoir été lancé une fois pour que les cases aient de quoi jouer.\n\nCette banque se construit en demi-tons. Le réglage « Compter en » de « Étaler sur le clavier » pose, en degrés, un désaccord par touche que la hauteur d'une case porte déjà : les deux s'ajouteraient. Le mode degrés sert à écrire un instrument SFZ jouable sur un clavier de piano.\n\n« Saut de rangée » désigne un intervalle et non un nombre de degrés : la quinte la plus proche vaut sept degrés dans un tempérament à douze, onze dans un tempérament à dix-neuf, dix-huit dans un tempérament à trente et un. L'option « un degré » fait des rangées la suite des colonnes, et le réseau couvre alors l'échelle degré par degré.\n\n« Tonique » donne la hauteur du degré zéro, en numéro de note MIDI, le do central valant 60. Elle remplace celle que l'accordage porte. La case en bas à gauche la joue, et toutes les cases du même degré sont marquées de la couleur de l'accordage.\n\n« Volume » règle le niveau de ce qui s'entend sous les doigts comme celui de la sortie « Audio ».\n\nLes flèches haut et bas déplacent le réseau d'une période, de trois tours au plus de part et d'autre. Chaque case porte la lettre de la touche qui la joue, lue sur la disposition de clavier en service, son degré dans la période, et la hauteur jouée avec son écart au demi-ton tempéré quand il y en a un. La position de la touche décide, non la lettre imprimée dessus.\n\nLe bouton ⏺ ouvre l'enregistrement, ⏹ le ferme, ▶ rejoue ce qui a été enregistré et 🗑 l'efface. La vélocité vient du rythme de frappe : jouer vite fait sonner plus fort.\n\nLa sortie « Séquence » rend les notes enregistrées, hauteurs fractionnaires comprises. La sortie « Audio » les rend en synthèse interne, dont la conversion en fréquence est continue. Aucune sortie MIDI n'est offerte : un fichier MIDI porte la hauteur sur un octet entier, où un degré fractionnaire serait arrondi.",
    noticeEn: "Plays a tuning's degrees from the computer keyboard. The four rows of letters and digits form a lattice of forty-one cells: one cell to the right adds one degree, one row upwards adds the number « Row step » names. The same interval therefore keeps the same shape under the fingers, at any pitch and in any tuning.\n\nThe « Tuning » input carries the scale to play. The lattice is built on it as soon as the graph has been run once. With no input connected, it is built on the equal temperament « Degrees per period » gives, and the node writes beside the lattice which source it comes from.\n\nThe « Bank » input carries the sound to spread across the lattice. Connected, each cell plays the sample at its own pitch instead of the internal synthesis, and the « Audio » output renders it the same way; the node's message says which of the two sounds. The bank comes from « Spread Across Keyboard » or « SFZ Keyboard », and the graph must have been run once for the cells to have something to play.\n\nThat bank is built in semitones. The « Count in » setting of « Spread Across Keyboard » lays, in degrees, a per-key detune that a cell's pitch already carries: the two would add up. Degree mode is for writing an SFZ instrument playable on a piano keyboard.\n\n« Row step » names an interval and not a number of degrees: the nearest fifth is seven degrees in a twelve-degree temperament, eleven in a nineteen-degree one, eighteen in a thirty-one-degree one. The « one degree » option makes the rows continue the columns, and the lattice then runs along the scale instead of stacking it.\n\n« Tonic » gives the pitch of degree zero, as a MIDI note number, middle C being 60. It replaces the one the tuning carries. The bottom left cell plays it, and every cell of the same degree is marked in the tuning's colour.\n\n« Volume » sets the level of what sounds under the fingers as well as that of the « Audio » output.\n\nThe up and down arrows move the lattice by one period, by at most three turns either way. Each cell carries the letter of the key that plays it, read from the keyboard layout in use, its degree within the period, and the pitch played with its deviation from the tempered semitone when there is one. The key's position decides, not the letter printed on it.\n\nThe ⏺ button opens recording, ⏹ closes it, ▶ replays what was recorded and 🗑 clears it. Velocity comes from the striking rhythm: playing fast sounds louder.\n\nThe « Sequence » output returns the recorded notes, fractional pitches included. The « Audio » output renders them with the internal synthesis, whose pitch-to-frequency conversion is continuous. No MIDI output is offered: a MIDI file carries pitch in a whole byte, where a fractional degree would be rounded.",
    entrees: [
      { nom: "Accordage", nomEn: "Tuning", type: "accordage" },
      // LE PORT EST AJOUTÉ EN DERNIER, toujours : les graphes enregistrés désignent un port par son
      // RANG, et glisser celui-ci avant l'accordage rebrancherait chaque arête d'un cran.
      //
      // ET IL EST FACULTATIF, parce que ce clavier sait sonner sans. Branché, chaque case joue
      // l'échantillon à SA hauteur au lieu de la synthèse interne : c'est le son étalé sur le
      // réseau, et non sur les quatre-vingt-huit touches d'un piano.
      { nom: "Banque", nomEn: "Bank", type: "banque", requis: false },
    ],
    sorties: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Audio", nomEn: "Audio", type: "audio" },
    ],
    // DEUX SORTIES NULLES SONT UN RÉSULTAT VALIDE ICI, et c'est ce que ce drapeau déclare. Le travail
    // d'un run sur ce composant est de porter l'accordage reçu jusqu'au réseau ; tant que rien n'a
    // été joué, il n'y a aucune note à rendre. Sans le drapeau, le filet du moteur lit « tout nul
    // sur un nœud à sorties » et affiche « Erreur » sur un clavier prêt à jouer, ce qui est faux.
    sortieNullePermise: true,
    parametres: [
      { nom: "Degrés par période", nomEn: "Degrees per period", type: "curseur", plage: [2, 72], pas: 1, defaut: 12,
        doc: "Le nombre de degrés du tempérament égal sur lequel le réseau se construit quand aucun accordage n'est branché. Avec un accordage branché, ce réglage n'agit pas : l'échelle reçue le remplace entièrement.",
        docEn: "The number of degrees of the equal temperament the lattice is built on when no tuning is connected. With a tuning connected, this setting has no effect: the received scale replaces it entirely." },
      { nom: "Saut de rangée", nomEn: "Row step", type: "choix",
        options: ["la quinte la plus proche", "la quarte la plus proche", "la tierce majeure la plus proche", "un degré"],
        optionsEn: ["the nearest fifth", "the nearest fourth", "the nearest major third", "one degree"],
        optionIds: ["quinte", "quarte", "tierce", "degre"],
        defaut: "la quinte la plus proche", defautEn: "the nearest fifth",
        doc: "L'intervalle qu'une rangée ajoute. Il se cherche dans l'accordage reçu, de sorte que le même choix vaut sept degrés dans un tempérament à douze et onze dans un tempérament à dix-neuf. La quinte est l'axe des claviers généralisés depuis Bosanquet : une rangée de quintes place côte à côte les degrés d'une même harmonie. L'option « un degré » fait des rangées la suite des colonnes.",
        docEn: "The interval a row adds. It is sought within the received tuning, so the same choice is seven degrees in a twelve-degree temperament and eleven in a nineteen-degree one. The fifth is the axis of generalized keyboards since Bosanquet: a row of fifths puts the degrees of one harmony within reach. The « one degree » option makes the rows continue the columns." },
      { nom: "Tonique", nomEn: "Tonic", type: "curseur", plage: [24, 96], pas: 1, defaut: 60,
        doc: "La hauteur du degré zéro, en numéro de note MIDI, le do central valant 60. Elle remplace celle que l'accordage porte, et la case en bas à gauche la joue.",
        docEn: "The pitch of degree zero, as a MIDI note number, middle C being 60. It replaces the one the tuning carries, and the bottom left cell plays it." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Le niveau de ce qui s'entend sous les doigts, et celui de la sortie « Audio ».",
        docEn: "The level of what sounds under the fingers, and that of the « Audio » output." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      // L'ACCORDAGE REÇU, OU LE REPLI DÉCLARÉ. Le repli n'est pas un silence : le nœud dit de quelle
      // source son réseau vient, de sorte qu'un réseau à douze degrés faute d'entrée branchée ne se
      // confonde pas avec un réseau à douze degrés demandé.
      const recu = ctx.entree(0) as Accordage | null;
      const branche = Boolean(recu && Array.isArray(recu.degres) && recu.degres.length > 0);
      const base = branche ? recu! : accordageEgal(Math.round(ctx.paramNombre("Degrés par période", 12)));
      const accordage: Accordage = { ...base, reference: ctx.paramNombre("Tonique", 60) };
      const saut = sautDeRangee(accordage, ctx.paramTexte("Saut de rangée", "quinte"));
      const port = etendue(accordage, saut);
      const source = branche
        ? decrireAccordage(accordage, en)
        : `${decrireAccordage(accordage, en)} (${traduire("iso.repli")})`;
      // LE RÉSEAU EST RENDU PAR `designe`, le canal de ce qu'un run a désigné de ses entrées : il
      // survit donc à un changement de réglage, puisque régler ce composant ne touche pas à
      // l'accordage qu'il a reçu. La vue n'a aucun autre moyen de connaître une entrée.
      const designe = { accordage };
      // LA BANQUE PASSE PAR LE CACHE DES BANQUES VIVES, et non par `designe` : c'est un objet
      // VIVANT de plusieurs mégaoctets, dix-neuf tampons audio, et `banques-vives.ts` existe
      // précisément pour qu'une vue puisse jouer ce que l'exécution vient de calculer.
      const banque = ctx.entree(1) as Banque | null;
      const avecBanque = Boolean(banque && banque.zones?.length);
      if (avecBanque) deposerBanque(ctx.noeud.id, banque!);
      const timbre = avecBanque
        ? traduire("msg.iso.banque", String(banque!.zones.length))
        : traduire("msg.iso.synthese");
      const notes = ctx.noeud.data.sequenceNotes as NoteEvenement[] | undefined;
      if (!notes || !Array.isArray(notes) || notes.length === 0) {
        return {
          valeurs: [null, null], designe,
          message: traduire("msg.iso.prete", String(CASES), String(saut),
            String(port.degres), port.periodes.toFixed(1), source, timbre),
        };
      }
      const sequence: Sequence = { notes, tempo: 120, titre: decrireAccordage(accordage, en) };
      // CE QU'ON ENTEND EN JOUANT EST CE QUE LE NŒUD REND, et c'est la règle de `clavier-son.ts` :
      // la banque branchée rend l'audio comme elle sonne sous les doigts, par la fonction même que
      // « Clavier SFZ » emploie. Sans banque, la synthèse interne, qui est continue en hauteur.
      const volume = ctx.paramNombre("Volume", 80);
      // ET PAR LA MÊME ADRESSE QUE LES DOIGTS. Une banque accordée attend un NUMÉRO DE TOUCHE : les
      // notes enregistrées portent la hauteur fractionnaire du degré, et la lui donner telle quelle
      // ajouterait son écart au tempérament une seconde fois. `degrePlusProche` rend le rang, qui
      // est exact puisque ces hauteurs viennent du même accordage.
      const pourLaBanque = (ns: NoteEvenement[]) => (!banque?.accordee ? ns : ns.map((n) => ({
        ...n, note: banque.accordee!.tonique + degrePlusProche(accordage, n.note).rang,
      })));
      const buf = avecBanque
        ? rendreNotes(pourLaBanque(notes) as never, banque!, { volume: volume / 100 })
        : await rendreSequence(notes, "FM/Oscillateurs", volume);
      return {
        valeurs: [sequence, buf], designe,
        message: traduire("msg.iso.jouee", String(notes.length), String(CASES), String(saut), source, timbre),
      };
    },
  },
  {
    id: "sampler-personnalise", nom: "Sampler personnalisé", nomEn: "Custom Sampler", univers: "Entrées", famille: "Génération",
    resume: "Joue un échantillon audio comme un instrument mélodique.",
    resumeEn: "Plays an audio sample as a melodic instrument.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { ...PARAMETRE_CLE },
      { nom:"Gamme", nomEn:"Scale", type:"choix", options: GAMMES_MELODIE_FR, optionsEn: GAMMES_MELODIE_EN, optionIds: GAMMES_MELODIE_IDS, defaut:"Majeur", defautEn: "Major" },
      { nom:"Tempo", nomEn:"Tempo", plage:[40,240], defaut:100, unite:"BPM" },
      { nom:"Durée", nomEn:"Duration", plage:[1,60], defaut:4, unite:"s" },
      { nom:"Note référence", nomEn:"Reference note", plage:[21,108], defaut:60, docEn:"MIDI note for the original pitch of the sample." },
      { nom:"Graine", graine: true, nomEn:"Seed", plage:[0,999999], pas:1, defaut:0,
        doc:"Graine de la mélodie. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement la même mélodie.",
        docEn:"Seed for the melody. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same melody." },
    ],
    async executer(ctx: any) {
      // SANS FICHIER DÉPOSÉ, CE COMPOSANT N'A RIEN À JOUER, ET IL LE DIT.
      //
      // IL ALLAIT CHERCHER `/soundbank/waterdrop.mp3`, QUI N'A JAMAIS EXISTÉ — vérifié sur toute
      // l'histoire du dépôt, et c'était la seule référence à ce dossier dans tout le code. Le repli
      // était donc mort depuis l'origine, et il échouait de la pire façon : le serveur de
      // développement répond 200 avec sa page d'index pour un chemin inconnu, de sorte que `rep.ok`
      // était VRAI, le blob était du HTML, et le décodage levait « Unable to decode audio data ».
      //
      // Relevé en cataloguant les 367 composants : c'était la SEULE erreur de toute la passe, et
      // elle accusait le décodeur pour un fichier absent. `rep.ok` ne suffit jamais derrière un
      // repli d'application à page unique.
      const f = ctx.noeud.data.audioFichier as File|undefined;
      if (!f) return { valeurs:[null], message:traduire("msg.glissez_un_fichier_audio_sur_le_node") };
      let sample: AudioBuffer;
      try {
        sample = await decoderFichier(f, ctx.runtime);
      } catch (e: any) {
        // UN FICHIER QUI N'EST PAS DE L'AUDIO DIT POURQUOI. Sans ce filet, déposer un texte ou une
        // image rendait le même « Unable to decode audio data » que le repli mort : un message du
        // décodeur, qui ne nomme ni le fichier ni ce qu'on attendait de lui.
        return { valeurs:[null], message: traduire("msg.fichier_audio_illisible", f.name,
          String(e?.message ?? e).slice(0, 80)) };
      }
      const dureeAuto: number | null = sample.duration;
      const cle = ctx.paramTexte("Clé","Do");
      const gamme = ctx.paramTexte("Gamme","Majeur");
      const tempo = ctx.paramNombre("Tempo",100);
      const dAuto = dureeAuto ?? sample.duration ?? 4;
      const d = Math.min(dAuto, ctx.paramNombre("Durée", 4));
      const notes: { note: number; velocite: number; debut: number; fin: number }[] = [];
      const decalage = DEMI_TONS_CLE[cle] ?? 0;
      const deg = degresGammeMelodie(gamme);
      const dureeNoire = 60 / Math.max(1, tempo);
      const { graine, aleatoire: hasard } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      let t = 0;
      while (t < d) {
        const nb = hasard() < 0.3 ? 2 : 1;
        const len = dureeNoire / nb;
        for (let s = 0; s < nb; s++) {
          if (hasard() > 0.1) {
            const g = deg[Math.floor(hasard() * deg.length)];
            const midi = 60 + decalage + g + Math.floor(hasard() * 2) * 12;
            const debut = t + s * len;
            notes.push({ note: midi, velocite: 80 + Math.floor(hasard() * 40), debut, fin: debut + len * 0.9 });
          }
        }
        t += dureeNoire;
      }
      const noteRef = ctx.paramNombre("Note référence", 60);
      try {
        const buf = rendreAvecEchantillon(notes, sample, 80, noteRef);
        return { valeurs: [buf], message: `${traduire("msg.ok_var_0_notes_var_1_s", notes.length, buf.duration.toFixed(1))} · graine ${graine}` };
      } catch (e: any) {
        return { valeurs:[null], message: traduire("msg.erreur_rendu_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "generateur-bruit", nom: "Générateur de bruit", nomEn: "Noise Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère du bruit blanc, rose ou brownien.",
    resumeEn: "Generates white, pink or brownian noise.",
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix", options: ["Blanc", "Rose", "Brownien"], optionIds: ["Blanc","Rose","Brownien"], defaut: "Blanc",
        doc: "Blanc = toutes les fréquences à niveau égal (spectre plat). Rose = −3 dB/octave (perçu équilibré). Brownien = −6 dB/octave (grave, sourd). Branchez sur l'Analyseur de spectre pour voir la différence.",
        docEn: "White = all frequencies at equal level (flat spectrum). Pink = −3 dB/octave (perceptually balanced). Brownian = −6 dB/octave (dark, muffled). Connect to the Spectrum Analyzer to see the difference.", optionsEn: ["White", "Pink", "Brownian"], defautEn: "White" },
      { nom: "Durée", nomEn: "Duration", plage: [0.2, 10], pas: 0.1, defaut: 2, unite: "s" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du bruit. 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement le même bruit, échantillon par échantillon.",
        docEn: "Seed for the noise. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays the exact same noise, sample for sample." },
    ],
    async executer(ctx: any) {
      const type = ctx.paramTexte("Type", "Blanc");
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const buf = genererBruit(type, ctx.paramNombre("Durée", 2), ctx.paramNombre("Volume", 80), aleatoire);
      return { valeurs: [buf], message: `${traduire("msg.bruit_var_0_var_1_s", type.toLowerCase(), buf.duration.toFixed(1))} · graine ${graine}` };
    },
  },
  {
    id: "generateur-frequence", nom: "Générateur de fréquence", nomEn: "Frequency Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une tonalité pure à une fréquence (Hz) ou note donnée.",
    resumeEn: "Generates a pure tone at a given frequency (Hz) or note.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Saisie", nomEn: "Input", type: "choix", options: ["Fréquence (Hz)", "Note"], optionsEn: ["Frequency (Hz)", "Note"], optionIds: ["frequency", "note"], defaut: "Fréquence (Hz)",
        doc: "Mode de saisie : en Hz (ex. 440) ou en note musicale (ex. A4, C#5).",
        docEn: "Input mode: in Hz (e.g. 440) or as a musical note (e.g. A4, C#5).", defautEn: "Frequency (Hz)" },
      { nom: "Fréquence", nomEn: "Frequency", plage: [20, 20000], pas: 1, defaut: 440, unite: "Hz",
        doc: "Fréquence en Hertz (utilisé si « Saisie » = Fréquence). 440 = La3 de référence.",
        docEn: "Frequency in Hertz (used when « Input » = Frequency). 440 = reference A4." },
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A4",
        doc: "Note musicale (utilisé si « Saisie » = Note). Format : lettre + altération + octave, ex. C4, F#5, Bb3.",
        docEn: "Musical note (used when « Input » = Note). Format: letter + accidental + octave, e.g. A4, C#5, Bb3.", defautEn: "A4" },
      { nom: "Forme", nomEn: "Waveform", type: "choix", options: FORMES_ONDE_CHOIX.fr, optionsEn: FORMES_ONDE_CHOIX.en, optionIds: FORMES_ONDE_CHOIX.ids, optionsHeritees: LIBELLES_HERITES_FORMES, defaut: "Sinus",
        doc: "Forme d'onde. Sinus = pur, une seule fréquence ; Carré = harmoniques impaires ; Dent de scie = toutes les harmoniques ; Triangle = harmoniques impaires douces.",
        docEn: "Waveform. Sine = pure, a single frequency; Square = odd harmonics; Sawtooth = all harmonics; Triangle = soft odd harmonics.", defautEn: "Sine" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const saisie = ctx.paramTexte("Saisie", "frequency").trim().toLowerCase();
      const enModeNote = saisie === "note" || saisie.startsWith("note");
      let freq: number;
      if (enModeNote) {
        const noteStr = ctx.paramTexte("Note", "A4");
        const parsed = noteVersFrequence(noteStr);
        if (parsed == null) return { valeurs: [null], message: traduire("msg.note_invalide_var_0_format_a4_c_5_bb3", noteStr) };
        freq = parsed;
      } else {
        freq = ctx.paramNombre("Fréquence", 440);
      }
      freq = Math.max(20, Math.min(20000, freq));

      const forme = ctx.paramTexte("Forme", "sine");
      const duree = ctx.paramNombre("Durée", 2);
      const volume = ctx.paramNombre("Volume", 80);
      const sr = frequenceDeTravail();
      const len = Math.max(1, Math.floor(duree * sr));
      const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
      const vol = Math.max(0, Math.min(1, volume / 100)) * 0.7;
      // LA TABLE D'ALIAS TRADUIT, ET NON UNE CHAÎNE DE TERNAIRES : elle reconnaît l'identifiant
      // canonique, les libellés d'autrefois et l'ancien `saw` de ce composant, qui était justement
      // la raison de la traduction à la main.
      const typeOsc: OscillatorType = formeOndeDepuisTimbre(forme) ?? "sine";

      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          const phase = 2 * Math.PI * freq * t;
          let echantillon: number;
          switch (typeOsc) {
            case "square": echantillon = Math.sign(Math.sin(phase)); break;
            case "sawtooth": echantillon = 2 * ((freq * t) % 1) - 1; break;
            case "triangle": echantillon = 2 * Math.abs(2 * ((freq * t) % 1) - 1) - 1; break;
            default: echantillon = Math.sin(phase);
          }
          // Fondu entrée/sortie (10ms) pour éviter le clic
          const fondu = Math.min(1, i / (sr * 0.01), (len - i) / (sr * 0.01));
          d[i] = echantillon * vol * fondu;
        }
      }

      const noteAff = enModeNote ? ctx.paramTexte("Note", "A4") : `${freq.toFixed(1)} Hz`;
      const libelles = langueCourante() === "en" ? FORMES_ONDE_CHOIX.en : FORMES_ONDE_CHOIX.fr;
      const labelForme = libelles[FORMES_ONDE_CHOIX.ids.indexOf(typeOsc)] ?? forme;
      return { valeurs: [buf], message: traduire("msg.var_0_var_1_var_2_s", noteAff, labelForme, duree.toFixed(1)) };
    },
  },
  {
    id: "generateur-audio-mathematique", nom: "Générateur audio mathématique", nomEn: "Mathematical Audio Generator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un signal audio à partir d'une expression mathématique.",
    resumeEn: "Generates an audio signal from a mathematical expression.",
    // L'expression est écrite par l'utilisateur : rien ne borne ce qu'elle rend.
    sortieHorsPlagePossible: true,
    entrees: [], sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440)",
        doc: "Expression mathématique donnant la valeur de l'échantillon. Variables disponibles : t (temps en s), i (index), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the sample value. Available variables: t (time in s), i (index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * pi * 440)" },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 30], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée du signal généré.", docEn: "Duration of the generated signal." },
      { nom: "Canaux", nomEn: "Channels", type: "choix", options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["mono", "stereo"], defaut: "Stéréo",
        doc: "Nombre de canaux de sortie.", docEn: "Number of output channels.", defautEn: "Stereo" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%" },
    ],
    async executer(ctx: any) {
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440)");
      const duree = ctx.paramNombre("Durée", 2);
      const channels = ctx.paramTexte("Canaux", "stereo") === "mono" ? 1 : 2;
      const volume = ctx.paramNombre("Volume", 30);
      try {
        const buf = genererAudioFormule(formule, duree, frequenceDeTravail(), channels);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (vol !== 1) {
          for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [buf], message: traduire("msg.var_0_var_1_s", formule, buf.duration.toFixed(1)) };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_var_0", e?.message ?? e) };
      }
    },
  },
  {
    id: "metronome", nom: "Métronome", nomEn: "Metronome",
    univers: "Entrées", famille: "Génération",
    resume: "Génère un clic métronomique régulier à un tempo donné.",
    resumeEn: "Generates a steady metronome click at a given tempo.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Tempo", nomEn: "Tempo", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Vitesse en battements par minute.", docEn: "Speed in beats per minute." },
      { nom: "Signature", nomEn: "Time signature", type: "choix",
        options: [...SIGNATURES], optionsEn: [...SIGNATURES], defaut: "4/4", defautEn: "4/4",
        doc: "Signature rythmique. Le premier temps de chaque mesure porte le clic le plus fort. Dans une mesure composée, c'est-à-dire une mesure dont les unités se groupent par trois comme 6/8, 9/8 ou 12/8, chaque temps porte un clic moyen et les unités qui tombent à l'intérieur d'un temps portent un clic faible : 9/8 s'entend en trois temps et non en neuf. Les signatures irrégulières sont groupées en plaçant les groupes de trois en tête, 7/8 valant 3+2+2. Le tempo compte les noires : une croche dure la moitié d'un battement et une blanche le double.",
        docEn: "Time signature. The first beat of each bar carries the strongest click. In a compound signature, that is, a bar whose units group by three such as 6/8, 9/8 or 12/8, each beat carries a medium click and the units falling inside a beat carry a soft click: 9/8 is heard in three beats and not in nine. Irregular signatures are grouped with the groups of three first, 7/8 being 3+2+2. The tempo counts quarter notes: an eighth note lasts half a beat and a half note twice one." },
      { nom: "Durée", nomEn: "Duration", plage: [1, 60], pas: 1, defaut: 10, unite: "s",
        doc: "Durée totale du métronome.", docEn: "Total duration of the metronome." },
      { nom: "Timbre", nomEn: "Timbre", type: "choix",
        options: ["Clic", "Woodblock", "Bip"], optionsEn: ["Click", "Woodblock", "Beep"], optionIds: ["click", "woodblock", "beep"], defaut: "Clic",
        doc: "Son du clic. Clic = transitoire court ; Woodblock = résonance bois ; Bip = sinus bref.",
        docEn: "Click sound. Click = short transient; Woodblock = woody resonance; Beep = brief sine.", defautEn: "Click" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 90, unite: "%" },
    ],
    async executer(ctx: any) {
      const tempo = ctx.paramNombre("Tempo", 120);
      const sig = ctx.paramTexte("Signature", "4/4");
      const duree = ctx.paramNombre("Durée", 10);
      const timbre = ctx.paramTexte("Timbre", "click");
      const volume = ctx.paramNombre("Volume", 90);
      const sr = frequenceDeTravail();
      const vol = Math.max(0, Math.min(1, volume / 100));

      // LA SIGNATURE EST LUE PAR SA FORME, et ce qui ne se lit pas retombe sur quatre temps : un
      // graphe sauvegardé avec une valeur qui n'est plus offerte doit continuer de sonner.
      const { num, den } = lireSignature(sig) ?? { num: 4, den: 4 };
      const intervalle = dureeUnite(tempo, den) ?? 60 / 120;
      // LES CLICS D'UNE MESURE PORTENT LEUR RANG, ce qui est tout l'objet du groupement : en 9/8
      // il y a trois temps de trois croches, donc un clic fort, deux faibles, un moyen, deux
      // faibles, un moyen, deux faibles.
      const clics = clicsDeMesure(num, den);
      const unitesParMesure = Math.max(1, clics.length);

      const len = Math.max(1, Math.floor(duree * sr));
      const buf = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
      // Graine fixe plutôt qu'un paramètre : le bruit d'un clic de 8 ms n'a
      // aucune raison de changer d'une exécution à l'autre, et personne ne
      // souhaite le régler.
      const hasardClic = creerAleatoire(1);

      // TROIS RANGS, ET LES DEUX PREMIERS GARDENT LEURS VALEURS : une mesure simple n'a pas de
      // subdivision, donc son clic sonne exactement comme avant que le troisième rang existe.
      const AMPLEURS = [0.9, 0.5, 0.28];
      const AIGUS = { beep: [1500, 1000, 750], woodblock: [800, 600, 450] } as const;

      function ecrireClic(pos: number, niveau: 0 | 1 | 2) {
        const amp = vol * AMPLEURS[niveau];
        if (timbre === "beep") {
          const freq = AIGUS.beep[niveau];
          const dureeClic = 0.02;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 80);
            const s = Math.sin(2 * Math.PI * freq * t) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        } else if (timbre === "woodblock") {
          const freq = AIGUS.woodblock[niveau];
          const dureeClic = 0.05;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 40);
            const s = (Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t)) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        } else {
          // Clic = bruit court filtré
          const dureeClic = 0.008;
          const n = Math.floor(dureeClic * sr);
          for (let i = 0; i < n && pos + i < len; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 200);
            const s = (hasardClic() * 2 - 1) * amp * env;
            buf.getChannelData(0)[pos + i] += s;
            buf.getChannelData(1)[pos + i] += s;
          }
        }
      }

      // LE RANG SE PREND SUR LE COMPTE D'UNITÉS, ET NON SUR CELUI DES TEMPS : les deux existent
      // désormais côte à côte, et 7/8 porte sept unités pour trois temps. Prendre le mauvais des
      // deux resterait dans les bornes du tableau et sonnerait une autre mesure.
      let nbUnites = 0;
      for (let t = 0; t < duree; t += intervalle) {
        const pos = Math.floor(t * sr);
        if (pos >= len) break;
        ecrireClic(pos, clics[nbUnites % unitesParMesure].niveau);
        nbUnites++;
      }

      const nbMesures = Math.floor(nbUnites / unitesParMesure);
      const nbTemps = nbMesures * tempsParMesure(num, den);
      return {
        valeurs: [buf],
        message: traduire("msg.metronome.releve", tempo, sig, nbMesures, nbTemps, nbUnites),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
