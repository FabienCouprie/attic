// plugins/karplus-strong.ts — La corde de Karplus et Strong, et les extensions de Jaffe et Smith.
//
// UN COMPOSANT À CÔTÉ DE « PLUCK SYNTH », ET NON À SA PLACE (2026-11-27). Celle-ci boucle sur un
// passe-bas de Butterworth, joue une note et n'a pas d'entrée ; des graphes enregistrés tiennent à
// son son, qui ne change pas. Celui-ci expose l'algorithme tel que l'article l'écrit : la moyenne
// de deux échantillons, le tambour, l'étirement, le gain de boucle, et trois filtres sur ce qui
// pince la corde. Le calcul est le même module, `audio/corde-pincee.ts`, qui porte l'accord exact.
//
// CHAQUE NOTE DU MIDI EST UNE CORDE. Elle part à son début, et à sa fin le gain de la boucle descend
// à zéro sur le « Relâchement » : c'est la façon d'étouffer une note que proposent Jaffe et Smith.
// Sans MIDI, le composant joue sa « Note » pendant sa « Durée ».
//
// LA SORTIE SE PREND À L'ENTRÉE DE LA BOUCLE, y(n) = x(n) + …, comme l'article l'écrit. Prise à la
// sortie de la ligne, chaque note partirait une période trop tard : neuf millisecondes au la2.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { hasardDuNoeud } from "../core";
import { notesDuMidi } from "../audio/midi";
import { hauteurOuRefus } from "../audio/noms-de-notes";
import { calculerCordePincee } from "../audio/corde-pincee";
import { excitationDeCorde, type GenreExcitation } from "../audio/excitation-corde";
import { versMono } from "../audio/multicanal";
import { FREQUENCE_ECH, frequenceDe, melanger, versBuffer } from "./instruments-communs";

/** La plus haute vélocité MIDI, celle à laquelle la nuance vaut la « Brillance ». */
const VELOCITE_PLEINE = 127;

export const fiches: FicheAudio[] = ([
  fiche({
    id: "karplus-strong", nom: "Corde de Karplus-Strong", nomEn: "Karplus-Strong String",
    univers: "Entrées", famille: "Génération",
    resume: "Joue chaque note d'un MIDI sur une corde de Karplus-Strong : une ligne à retard remplie de bruit, moyennée à chaque tour.",
    resumeEn: "Plays each note of a MIDI file on a Karplus-Strong string: a delay line filled with noise, averaged on each pass.",
    etiquettes: ["karplus", "strong", "jaffe", "pluck", "digitar", "corde pincée", "plucked string"],
    entrees: [
      { nom: "MIDI", type: "midi", requis: false },
      { nom: "Excitation", nomEn: "Excitation", type: "audio", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Note", nomEn: "Note", type: "texte", defaut: "A3", defautEn: "A3",
        doc: "Note jouée quand aucun MIDI n'est branché (ex. A3, C4, F#5). Un MIDI l'emporte, et chacune de ses notes est jouée sur sa propre corde. Un nom avec son octave, en lettres ou en noms français, avec #, b, ♯ ou ♭. Une note illisible ou sans octave est refusée, et nommée.",
        docEn: "Note played when no MIDI is connected (e.g. A3, C4, F#5). A MIDI file wins, and each of its notes is played on a string of its own. A name with its octave, in letters or French names, with #, b, ♯ or ♭. An unreadable note, or one without an octave, is refused and named." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "s",
        doc: "Durée de la note, quand aucun MIDI n'est branché ; le « Relâchement » commence à sa fin.",
        docEn: "Note duration, when no MIDI is connected; the « Release » starts at its end." },
      { nom: "Excitation", nomEn: "Excitation", type: "choix",
        options: ["Bruit blanc", "Bruit rose", "Impulsion", "Entrée audio"],
        optionsEn: ["White noise", "Pink noise", "Impulse", "Audio input"],
        optionIds: ["blanc", "rose", "impulsion", "audio"],
        defaut: "Bruit blanc", defautEn: "White noise",
        doc: "Ce qui remplit la corde au début de chaque note. Le bruit blanc est celui de Karplus et Strong ; le bruit rose est plus sombre ; l'impulsion est un seul échantillon, d'où une attaque en claquement plus forte que ce que la corde tient ensuite. « Entrée audio » lit le son de l'entrée « Excitation » à l'instant de chaque note, et refuse de jouer quand rien n'y est branché.",
        docEn: "What fills the string at the start of each note. White noise is Karplus and Strong's; pink noise is darker; the impulse is a single sample, hence a click attack louder than what the string then sustains. « Audio input » reads the sound of the « Excitation » input at the instant of each note, and refuses to play when nothing is connected there." },
      { nom: "Longueur d'excitation", nomEn: "Excitation length", type: "nombre", plage: [0.25, 20], pas: 0.25, defaut: 1, unite: "périodes", uniteEn: "periods",
        doc: "Combien de périodes de la note l'excitation dure. À 1, la ligne est remplie une fois, comme dans l'algorithme d'origine ; au-delà, l'excitation continue de s'ajouter à ce qui circule, et l'attaque est plus longue et plus forte. Sans effet quand l'« Excitation » est l'« Impulsion », qui ne dure qu'un échantillon.",
        docEn: "How many periods of the note the excitation lasts. At 1, the line is filled once, as in the original algorithm; beyond, the excitation keeps adding to what circulates, and the attack is longer and louder. No effect when the « Excitation » is the « Impulse », which lasts a single sample." },
      { nom: "Mélange", nomEn: "Blend", type: "nombre", plage: [0, 1], pas: 0.01, defaut: 1,
        doc: "Le facteur b de la variante tambour : à chaque échantillon, le signe de ce qui revient dans la boucle est gardé avec la probabilité b, et inversé sinon. À 1, la corde ; vers 0,5, un tambour, sans hauteur nette ; à 0, la boucle s'inverse à chaque tour, et la corde sonne une octave plus bas, sur ses seuls harmoniques impairs. La « Graine » fixe le tirage.",
        docEn: "The blend factor b of the drum variant: on each sample, the sign of what returns into the loop is kept with probability b, and flipped otherwise. At 1, the string; near 0.5, a drum, with no clear pitch; at 0, the loop flips on every pass, and the string sounds an octave lower, on its odd harmonics only. The « Seed » fixes the draw." },
      { nom: "Étirement", nomEn: "Decay stretch", type: "nombre", plage: [1, 50], pas: 0.1, defaut: 1,
        doc: "Le facteur S de l'étirement de la décroissance, au sens de Karplus et Strong : les partiels graves durent S fois plus longtemps. La boucle moyenne deux échantillons pondérés 1 − s et s, comme chez Jaffe et Smith, avec s(1 − s) = 1/(4S) ; à 1, s vaut ½, la moyenne de l'algorithme d'origine, et chaque partiel s'éteint d'autant plus vite qu'il est aigu. La hauteur ne bouge pas : le retard du filtre est déduit de la ligne.",
        docEn: "The decay stretch factor S, in Karplus and Strong's sense: the low partials last S times longer. The loop averages two samples weighted 1 − s and s, as in Jaffe and Smith, with s(1 − s) = 1/(4S); at 1, s is ½, the original algorithm's average, and each partial dies out faster the higher it is. The pitch does not move: the filter's delay is taken off the line." },
      { nom: "Gain de boucle", nomEn: "Loop gain", type: "nombre", plage: [0.9, 1], pas: 0.0005, defaut: 1,
        doc: "Le facteur ρ, qui multiplie ce qui revient dans la boucle à chaque tour, donc à chaque période : il raccourcit la décroissance de tous les partiels, d'autant plus vite que la note est aiguë. À 1, seule la moyenne éteint la corde.",
        docEn: "The factor ρ, which multiplies what returns into the loop on each pass, hence on each period: it shortens the decay of every partial, the faster the higher the note. At 1, only the average silences the string." },
      { nom: "Position du pincement", nomEn: "Pick position", type: "nombre", plage: [0, 0.5], pas: 0.01, defaut: 0,
        doc: "Le point β où la corde est pincée, en part de sa longueur. L'excitation passe dans le peigne 1 − z^(−⌊βN + ½⌋), N étant la période : les partiels multiples de 1/β s'éteignent, comme sur une corde pincée en ce point. À 0,2, les partiels 5, 10, 15 ; à 0,5, tous les partiels pairs. À 0, pas de peigne.",
        docEn: "The point β where the string is plucked, as a share of its length. The excitation goes through the comb 1 − z^(−⌊βN + ½⌋), N being the period: the partials that are multiples of 1/β die out, as on a string plucked at that point. At 0.2, partials 5, 10, 15; at 0.5, all even partials. At 0, no comb." },
      { nom: "Direction du pincement", nomEn: "Pick direction", type: "nombre", plage: [0, 0.95], pas: 0.01, defaut: 0,
        doc: "Le coefficient p du passe-bas (1 − p) / (1 − p·z⁻¹) que l'excitation traverse : à 0, rien n'est filtré ; plus p monte, plus l'attaque est sombre, comme un pincement dans l'autre sens.",
        docEn: "The coefficient p of the lowpass (1 − p) / (1 − p·z⁻¹) the excitation goes through: at 0, nothing is filtered; the higher p, the darker the attack, like a pluck the other way." },
      { nom: "Brillance", nomEn: "Brightness", type: "nombre", plage: [200, 20000], pas: 10, defaut: 20000, unite: "Hz",
        doc: "La nuance L, une bande en hertz, à la vélocité 127 ; une note plus douce a une bande proportionnellement plus étroite. L'excitation traverse le passe-bas (1 − R) / (1 − R·z⁻¹), dont le pôle R se calcule pour chaque note : son gain à la fondamentale égale celui qu'un passe-bas de bande L, de pôle e^(−πL/fs), a à la fréquence de référence, la moyenne géométrique de 20 Hz et de la moitié de la fréquence d'échantillonnage. À nuance égale, le fondamental a ainsi la même amplitude à toutes les hauteurs ; une nuance plus étroite assombrit la note. La note sort aussi moins fort, en proportion de sa vélocité.",
        docEn: "The dynamic level L, a bandwidth in hertz, at velocity 127; a softer note has a proportionally narrower band. The excitation goes through the lowpass (1 − R) / (1 − R·z⁻¹), whose pole R is computed for each note: its gain at the fundamental equals the gain a lowpass of bandwidth L, with pole e^(−πL/fs), has at the reference frequency, the geometric mean of 20 Hz and half the sample rate. At an equal dynamic level, the fundamental thus has the same amplitude at every pitch; a narrower level darkens the note. The note also comes out quieter, in proportion to its velocity." },
      { nom: "Relâchement", nomEn: "Release", type: "nombre", plage: [0, 3], pas: 0.01, defaut: 0.2, unite: "s",
        doc: "À la fin de chaque note, la corde perd 60 dB en ce temps, quelle que soit sa hauteur, en plus de sa décroissance propre : le gain de la boucle devient 10^(−3 / (f·T)) par période. À 0, elle se tait d'un coup ; sans effet sur une note que la corde a déjà fini de faire entendre.",
        docEn: "At the end of each note, the string loses 60 dB over this time, whatever its pitch, on top of its own decay: the loop gain becomes 10^(−3 / (f·T)) per period. At 0, it stops at once; no effect on a note the string has already finished sounding." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 60, unite: "%",
        doc: "Volume de sortie. Le mélange des notes est d'abord ramené à 0,9 de crête.",
        docEn: "Output volume. The mix of the notes is first brought to a 0.9 peak." },
      { nom: "Graine", nomEn: "Seed", graine: true, plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du bruit qui pince la corde et du tirage des signes du « Mélange ». 0 = tirée au sort à chaque exécution, et affichée dans le message pour pouvoir être recopiée ici. Toute autre valeur rejoue exactement le même son. Sans effet quand l'« Excitation » est l'« Impulsion » ou l'« Entrée audio » et que le « Mélange » vaut 1 : rien n'y est tiré.",
        docEn: "Seed of the noise that plucks the string and of the « Blend » sign draw. 0 = drawn at random on every run, and shown in the message so it can be copied back here. Any other value replays exactly the same sound. No effect when the « Excitation » is the « Impulse » or the « Audio input » and the « Blend » is 1: nothing is drawn there." },
    ],
    async executer(ctx) {
      const sr = FREQUENCE_ECH();
      const genre = ctx.paramTexte("Excitation", "blanc") as GenreExcitation;
      const recu = ctx.entree(1);
      // LE SON REÇU SE LIT À SA PROPRE FRÉQUENCE : l'instant d'une note se compte en ses échantillons.
      const audio = recu instanceof AudioBuffer
        ? { mono: versMono(Array.from({ length: recu.numberOfChannels }, (_, c) => recu.getChannelData(c))), sr: recu.sampleRate }
        : null;
      if (genre === "audio" && !audio) return { valeurs: [null], erreur: true, message: traduire("msg.karplus.sans_audio") };

      const relache = ctx.paramNombre("Relâchement", 0.2);
      let notes = await notesDuMidi(ctx.entree(0));
      if (!notes || notes.length === 0) {
        const lue = hauteurOuRefus(ctx.paramTexte("Note", "A3"));
        if ("refus" in lue) return { valeurs: [null], erreur: true, message: lue.refus };
        notes = [{ note: lue.midi, velocite: VELOCITE_PLEINE, debut: 0, fin: ctx.paramNombre("Durée", 2), canal: 0 }];
      }
      const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
      const reglages = {
        longueur: ctx.paramNombre("Longueur d'excitation", 1),
        melange: ctx.paramNombre("Mélange", 1),
        etirement: ctx.paramNombre("Étirement", 1),
        resonance: ctx.paramNombre("Gain de boucle", 1),
        position: ctx.paramNombre("Position du pincement", 0),
        direction: ctx.paramNombre("Direction du pincement", 0),
        brillance: ctx.paramNombre("Brillance", 20000),
      };

      // UNE NOTE SE REND JUSQU'À UNE FOIS ET DEMIE SON RELÂCHEMENT APRÈS SA FIN : elle y est à −90 dB
      // de ce qu'elle était à sa fin, et la couper là ne s'entend pas.
      const queue = 1.5 * relache;
      const fin = Math.max(...notes.map((n) => n.fin)) + queue + 0.05;
      const somme = new Float32Array(Math.ceil(fin * sr));
      for (const n of notes) {
        const frequence = frequenceDe(n.note);
        const nuance = Math.max(0, Math.min(1, n.velocite / VELOCITE_PLEINE));
        const excitation = excitationDeCorde({
          genre, periode: sr / frequence, longueur: reglages.longueur,
          audio: audio?.mono, debutAudio: audio ? Math.round(n.debut * audio.sr) : 0,
          position: reglages.position, direction: reglages.direction,
          bande: reglages.brillance * nuance, sampleRate: sr, aleatoire,
        });
        for (let i = 0; i < excitation.length; i++) excitation[i] *= nuance;
        const tenue = Math.max(0, n.fin - n.debut);
        melanger(somme, calculerCordePincee({
          frequence, sampleRate: sr, duree: tenue + queue + 0.05,
          resonance: reglages.resonance, debutRelache: tenue, relache: 0, t60Relache: relache, volume: 1, aleatoire,
          etirement: reglages.etirement, melange: reglages.melange, excitation, priseALEntree: true,
        }), n.debut);
      }
      return {
        valeurs: [versBuffer(somme, ctx.paramNombre("Volume", 60))],
        message: traduire("msg.var_0_graine_var_1", traduire("msg.karplus.resultat", notes.length, fin.toFixed(1)), graine),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
