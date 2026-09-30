// plugins/effets-spectral.ts — Effets spectraux, formules et bruit.
//
// Les fiches sont rangees par nature du traitement, et non par famille : les quarante-trois
// effets declarent la meme, « Effets », ce qui ne decoupe rien. Les fabriques partagees vivent
// dans `effets-aides.ts`.


import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { estCourbe, progressionPour, valeurA, valeursParametre } from "../audio/courbe";
import { creerAleatoire } from "../core";
import { appliquerFiltre, reduireBruit, reduireBruitNotches, calculerProfilBruit, equaliser, inverserAudio, inverserPolarite, echangerCanaux, extraireCentreCote, appliquerFondu, extraireZone, appliquerPaulstretch, appliquerFormuleEchantillons, appliquerFormuleSpectrale, ajusterLargeurStereo, granularFreeze } from "../audio";

import { effet, param, simple } from "./effets-aides";

export const fiches: FicheAudio[] = ([
  {
    id: "paulstretch", nom: "Paulstretch", nomEn: "Paulstretch", univers: "Traitement", famille: "Effets",
    resume: "Étirement extrême par randomisation des phases (stéréo).",
    resumeEn: "Extreme phase-randomization time-stretch (stereo).",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Stretch" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Stretch", nomEn: "Stretch", defaut: 8, unite: "×", plage: [1, 100], pas: 1,
        doc: "Facteur d'étirement. 1 = pas d'effet, 8 = 8 fois plus long. Une courbe branchée sur l'entrée Modulation prend la main, et l'étirement varie alors au fil du son.",
        docEn: "Stretch factor. 1 = no effect, 8 = 8× longer. A curve connected to the Modulation input takes over, and the stretch then varies along the sound." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Stretch", defaut: 1, unite: "×", plage: [1, 100], pas: 1,
        doc: "Facteur que vaut le zéro d'une courbe branchée. La course se parcourt en multipliant : de 1 à 64, le milieu de la courbe vaut 8, et chaque doublement dure autant. Sans courbe, ce réglage ne sert pas.",
        docEn: "Factor that a connected curve's zero means. The travel is multiplicative: from 1 to 64, the middle of the curve is 8, and every doubling lasts as long. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Stretch", defaut: 20, unite: "×", plage: [1, 100], pas: 1,
        doc: "Facteur que vaut le un de la courbe.", docEn: "Factor that the curve's one means." },
      { nom: "Fenêtre", nomEn: "Window", defaut: 0.25, unite: "s", doc: "Taille de la fenêtre STFT en secondes. Grande = texture lisse, petite = plus de transitoires.", docEn: "STFT window size in seconds. Large = smooth texture, small = more transients.", plage: [0.01, 1], pas: 0.01 },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 42,
        doc: "Graine de la randomisation des phases. Valeur par défaut fixe : un étirement qui change à chaque exécution serait un défaut. La changer donne une autre texture, de même caractère.",
        docEn: "Seed for the phase randomization. The default is fixed: a stretch that changes on every run would be a defect. Changing it gives another texture of the same character." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const fenetre = ctx.paramNombre("Fenêtre", 0.25);
      // Un seul chemin : sans courbe, un tableau plat à la valeur du réglage. L'étirement se
      // parcourt en MULTIPLIANT, parce qu'un facteur est un rapport : de 1 à 64, le milieu de la
      // course vaut 8, et non 32 comme le donnerait une répartition linéaire.
      const facteurs = valeursParametre(ctx.entree(1), audio.length, ctx.paramNombre("Stretch", 8), {
        min: ctx.paramNombre("Modulation min", 1),
        max: ctx.paramNombre("Modulation max", 20),
        echelle: "logarithmique",
      });
      const out = await appliquerPaulstretch(audio, facteurs, fenetre,
        { onProgress: ctx.onProgress, signal: ctx.signal, hasard: creerAleatoire(ctx.paramNombre("Graine", 42)) });
      // Le message dit ce qui a été parcouru : avec une courbe, le facteur n'est plus sur le
      // réglage, et la durée seule ne dit pas entre quelles bornes l'étirement a voyagé.
      let bas = Infinity;
      let haut = 0;
      for (const f of facteurs) { if (f < bas) bas = f; if (f > haut) haut = f; }
      const nb = (v: number) => v.toFixed(1).replace(".", ",");
      return {
        valeurs: [out],
        message: estCourbe(ctx.entree(1))
          ? `${nb(out.duration)} s · ${nb(bas)} à ${nb(haut)} ×`
          : `${nb(out.duration)} s · ${nb(haut)} ×`,
      };
    },
  },
  effet("granular-freeze", "Granular freeze", "Granular Freeze", "Boucle un grain avec contrôle de taille et de hauteur.", "Loops a grain with size and pitch control.",
    [param("Taille", 50, "Grain size", "ms", "Taille du grain bouclé.", "Size of the looped grain.", [5, 500], 1), param("Pitch", 0, "Pitch", "st", "Transposition du grain en demi-tons.", "Grain pitch shift in semitones.", [-24, 24], 1), param("Position", 0, "Position", "%", "Position dans le fichier où le grain est extrait.", "Position in the file where the grain is extracted.", [0, 100], 1), param("Mix", 50, "Mix", "%", "Équilibre signal original / effet.", "Dry/wet balance.", [0, 100], 1)],
    (a, taille, pitch, position, mix) => granularFreeze(a, taille, pitch, position / 100, mix)),
  {
    id: "formule-echantillons", nom: "Formule sur échantillons", nomEn: "Sample Formula",
    univers: "Traitement", famille: "Effets",
    resume: "Applique une expression mathématique à chaque échantillon du signal.",
    resumeEn: "Applies a mathematical expression to each sample of the signal.",
    entrees: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "Modulation", nomEn: "Modulation", type: "courbe", requis: false, module: "Volume" },
    ],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Formule", nomEn: "Formula", type: "texte", defaut: "sin(t * 2 * pi * 440) + x",
        doc: "Expression mathématique donnant la valeur de sortie de chaque échantillon. Variables : x (valeur actuelle), t (temps en secondes), i (index de l'échantillon), c (canal), ch (nombre de canaux), sr (fréquence d'échantillonnage).",
        docEn: "Mathematical expression giving the output value of each sample. Variables: x (current value), t (time in seconds), i (sample index), c (channel), ch (channel count), sr (sample rate).", defautEn: "sin(t * 2 * pi * 440) + x" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%",
        doc: "Gain de sortie. Une courbe branchée sur l'entrée Modulation donne cette valeur à chaque instant, à la place du curseur.",
        docEn: "Output gain. A curve connected to the Modulation input gives this value at each instant, in place of the slider." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 0, unite: "%",
        doc: "Gain que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe branchée, ce réglage n'agit pas.",
        docEn: "Gain that a connected curve's zero means on the Modulation input. With no curve connected, this setting has no effect." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Gain que vaut le un de la courbe. Une valeur inférieure à Modulation min inverse le sens du parcours.",
        docEn: "Gain that the curve's one means. A value below Modulation min reverses the direction of travel." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const formule = ctx.paramTexte("Formule", "sin(t * 2 * pi * 440) + x");
      const volume = ctx.paramNombre("Volume", 30);
      // Sans courbe branchée, le gain reste un nombre et la boucle garde son chemin : à volume plein
      // elle n'est même pas parcourue, comme avant.
      const modulation = ctx.entree(1);
      const courbeVolume = estCourbe(modulation)
        ? valeursParametre(modulation, audio.length, 0, {
          min: ctx.paramNombre("Modulation min", 0), max: ctx.paramNombre("Modulation max", 100),
        })
        : null;
      try {
        const out = appliquerFormuleEchantillons(audio, formule);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (courbeVolume) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= Math.max(0, Math.min(1, valeurA(courbeVolume, i) / 100));
          }
        } else if (vol !== 1) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [out], message: traduire("msg.formule_appliqu_e_var_0", formule) };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_var_0", e?.message ?? e) };
      }
   },
 },
  {
    id: "formule-spectrale", nom: "Formule spectrale", nomEn: "Spectral Formula",
    univers: "Traitement", famille: "Effets",
    resume: "Modifie le spectre du signal par des expressions mathématiques sur magnitude et phase.",
    resumeEn: "Modifies the signal spectrum by mathematical expressions on magnitude and phase.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Magnitude", nomEn: "Magnitude", type: "texte", defaut: "mag * 2",
        doc: "Expression pour la magnitude de chaque bin spectral. Variables : mag, phase, freq (Hz), bin, N (taille FFT), sr.",
        docEn: "Expression for the magnitude of each spectral bin. Variables: mag, phase, freq (Hz), bin, N (FFT size), sr.", defautEn: "mag * 2" },
      { nom: "Phase", nomEn: "Phase", type: "texte", defaut: "phase + 0.5",
        doc: "Expression pour la phase de chaque bin (laissez vide pour ne pas la modifier). Exemple : phase + 0.5 décale la phase de 0.5 radian. Variables : mag, phase, freq, bin, N, sr.",
        docEn: "Expression for the phase of each bin (leave empty to leave unchanged). Example: phase + 0.5 shifts the phase by 0.5 radian. Variables: mag, phase, freq, bin, N, sr.", defautEn: "phase + 0.5" },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 30, unite: "%", doc: "Gain de sortie.", docEn: "Output gain." },
      { nom: "FFT", nomEn: "FFT", type: "nombre", plage: [64, 8192], pas: 64, defaut: 2048, unite: "éch.", uniteEn: "samples",
        doc: "Taille de la FFT (arrondie à la puissance de 2 supérieure).", docEn: "FFT size (rounded up to next power of 2)." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const formuleMag = ctx.paramTexte("Magnitude", "mag * 2");
      const formulePhase = ctx.paramTexte("Phase", "");
      const fftSize = ctx.paramNombre("FFT", 2048);
      const volume = ctx.paramNombre("Volume", 30);
      try {
        const out = appliquerFormuleSpectrale(audio, formuleMag, formulePhase, fftSize);
        const vol = Math.max(0, Math.min(1, volume / 100));
        if (vol !== 1) {
          for (let c = 0; c < out.numberOfChannels; c++) {
            const d = out.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= vol;
          }
        }
        return { valeurs: [out], message: traduire("msg.formule_spectrale_appliqu_e") };
      } catch (e: any) {
        return { valeurs: [null], message: traduire("msg.erreur_formule_spectrale_var_0", e?.message ?? e) };
      }
   },
  },
  effet("equaliseur", "Égaliseur", "Equalizer", "Égaliseur 9 bandes.", "9-band equalizer.",
    [
      param("32 Hz", 0, "32 Hz", "dB", "Gain de la bande 32 Hz.", "32 Hz band gain.", [-24, 24], 1),
      param("64 Hz", 0, "64 Hz", "dB", "Gain de la bande 64 Hz.", "64 Hz band gain.", [-24, 24], 1),
      param("125 Hz", 0, "125 Hz", "dB", "Gain de la bande 125 Hz.", "125 Hz band gain.", [-24, 24], 1),
      param("250 Hz", 0, "250 Hz", "dB", "Gain de la bande 250 Hz.", "250 Hz band gain.", [-24, 24], 1),
      param("500 Hz", 0, "500 Hz", "dB", "Gain de la bande 500 Hz.", "500 Hz band gain.", [-24, 24], 1),
      param("1 kHz", 0, "1 kHz", "dB", "Gain de la bande 1 kHz.", "1 kHz band gain.", [-24, 24], 1),
      param("2 kHz", 0, "2 kHz", "dB", "Gain de la bande 2 kHz.", "2 kHz band gain.", [-24, 24], 1),
      param("4 kHz", 0, "4 kHz", "dB", "Gain de la bande 4 kHz.", "4 kHz band gain.", [-24, 24], 1),
      param("8 kHz", 0, "8 kHz", "dB", "Gain de la bande 8 kHz.", "8 kHz band gain.", [-24, 24], 1),
    ],
    (a, ...gains) => equaliser(a, ...gains)),
  simple("inverseur-audio", "Lecture inversée", "Reverse Playback",
    "Lit la piste de la fin vers le début.", "Plays the track from end to start.", inverserAudio),
  // L'INVERSION DE POLARITÉ MANQUAIT, et le nœud ci-dessus la promettait sans la faire : il
  // s'appelait « Inverseur audio » et se résumait par « inverse le signal », la formule qui désigne
  // la polarité partout ailleurs. Qui la cherchait le trouvait et obtenait une lecture à l'envers.
  simple("inversion-polarite", "Inversion de polarité", "Polarity Inversion",
    "Change le signe de chaque échantillon. Inaudible seule, décisive en relation.",
    "Flips the sign of every sample. Inaudible on its own, decisive in relation.", inverserPolarite),
  simple("echange-canaux", "Échange canaux", "Swap Channels", "Permute gauche/droite.", "Swaps left/right channels.", echangerCanaux),
  effet("extraction-centre-cote", "Extraction centre/côté", "Center/Side Extract", "Sépare le centre stéréo des côtés.", "Separates stereo center from sides.",
    [param("Centre", 50, "Center", "%", "Niveau du canal central.", "Center channel level."), param("Côté", 50, "Side", "%", "Niveau des canaux latéraux.", "Side channel level.")],
    (a,centre,cote) => {
      const { centre: c, cote: s } = extraireCentreCote(a);
      const mixC = Math.max(0, centre) / 100;
      const mixS = Math.max(0, cote) / 100;
      const resultat = new AudioBuffer({ numberOfChannels: 2, length: a.length, sampleRate: a.sampleRate });
      for (let ch = 0; ch < 2; ch++) {
        const srcC = c.getChannelData(ch);
        const srcS = s.getChannelData(ch);
        const dst = resultat.getChannelData(ch);
        for (let i = 0; i < a.length; i++) dst[i] = srcC[i] * mixC + srcS[i] * mixS;
      }
      return resultat;
    }),
  effet("largeur-stereo", "Largeur stéréo / MS", "Stereo Width / MS", "Ajuste la largeur stéréo et le niveau Mid.", "Adjusts stereo width and Mid level.",
    [param("Largeur", 100, "Width", "%", "Largeur du champ stéréo. 0% = mono, 100% = original, 200% = stéréo élargi.", "Stereo width. 0% = mono, 100% = original, 200% = widened stereo.", [0, 200], 1), param("Mid", 100, "Mid", "%", "Gain du signal central (Mid).", "Mid channel gain.", [0, 200], 1)],
    (a, largeur, mid) => ajusterLargeurStereo(a, largeur, mid),
    undefined,
    { parametre: "Largeur", bornes: [0, 200], unite: "%" }),
  effet("fondu", "Fondu", "Fade", "Fondu entrée/sortie.", "Fade in/out.",
    [param("Entrée", 0.5, "In", "s", "Durée du fondu d'entrée.", "Fade-in duration."), param("Sortie", 0.5, "Out", "s", "Durée du fondu de sortie.", "Fade-out duration.")],
    (a,e,s) => { const r = appliquerFondu(a, "Fermeture", s); return appliquerFondu(r, "Ouverture", e); }),
  {
    id: "extraire-zone", nom: "Extraire une zone", nomEn: "Extract Zone", univers: "Traitement", famille: "Montage",
    resume: "Extrait une portion avec fondu et renvoie l'objet Zone.",
    resumeEn: "Extracts a portion with fade and returns the Zone object.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }, { nom: "Zone", nomEn: "Zone", type: "controle" }],
    parametres: [
      { nom: "Début", nomEn: "Start", plage: [0, 600], pas: 0.1, defaut: 0, unite: "s", doc: "Début de la zone à extraire.", docEn: "Start of the extracted zone." },
      { nom: "Durée", nomEn: "Duration", plage: [0.1, 600], pas: 0.1, defaut: 5, unite: "s", doc: "Durée de la zone extraite.", docEn: "Duration of the extracted zone." },
      { nom: "Fondu", nomEn: "Fade", plage: [0, 100], pas: 1, defaut: 5, unite: "ms", doc: "Durée du fondu aux bords.", docEn: "Crossfade duration at edges." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const debut = ctx.paramNombre("Début", 0);
      const duree = Math.min(ctx.paramNombre("Durée", 5), a.duration - debut);
      // Le paramètre « Fondu » n'était tout simplement jamais lu : il existait
      // dans l'interface, documenté « fondu aux bords », sans piloter quoi que
      // ce soit (extraireZone n'avait d'ailleurs pas d'argument correspondant).
      const fondu = ctx.paramNombre("Fondu", 5);
      const zone = { debut, duree };
      return { valeurs: [extraireZone(a, debut, duree, fondu), zone] };
   },
  },
  {
    id: "reduction-bruit", nom: "Réduction de bruit", nomEn: "Noise Reduction", univers: "Traitement", famille: "Effets",
    resume: "Soustraction spectrale du bruit.",
    resumeEn: "Spectral noise subtraction.",
    entrees: [{ nom: "Audio", type: "audio" }, { nom: "Profil", nomEn: "Profile", type: "controle" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Mode", nomEn: "Mode", type: "choix", options: ["Spectral", "Notches"], optionsEn: ["Spectral", "Notches"], optionIds: ["spectral", "notches"], defaut: "Spectral",
        doc: "Spectral = soustraction de puissance standard. Notches = filtres coupe-bande dynamiques sur les fréquences les plus fortes du profil (utile pour un ronflement/hum).", docEn: "Spectral = standard power subtraction. Notches = dynamic notch filters on the strongest profile frequencies (useful for hum/buzz).", defautEn: "Spectral" },
      { nom: "Réduction", nomEn: "Reduction", type: "nombre", plage: [0, 100], pas: 1, defaut: 100, unite: "%", doc: "(Mode Spectral) Pourcentage de la puissance du bruit soustrait au signal. 100% = soustraction complète, 0% = aucun effet.", docEn: "(Spectral mode) Percentage of the noise power subtracted from the signal. 100% = full subtraction, 0% = no effect." },
      { nom: "Plancher", nomEn: "Floor", type: "nombre", plage: [0, 100], pas: 1, defaut: 1, unite: "%", doc: "(Mode Spectral) Niveau minimum de puissance conservé (pourcentage de la puissance du signal bruité). 0% = débruitage maximal, peut créer des artefacts musicaux.", docEn: "(Spectral mode) Minimum residual power level (percentage of the noisy signal power). 0% = maximum denoising, may create musical artifacts." },
      { nom: "Notches", nomEn: "Notches", type: "nombre", plage: [1, 100], pas: 1, defaut: 50, unite: "", doc: "(Mode Notches) Nombre maximum de filtres coupe-bande appliqués. Augmentez si le ronflement a beaucoup d'harmoniques.", docEn: "(Notches mode) Maximum number of notch filters applied. Increase if the hum has many harmonics." },
      { nom: "Q", nomEn: "Q", type: "nombre", plage: [1, 50], pas: 1, defaut: 10, unite: "", doc: "(Mode Notches) Sélectivité des filtres coupe-bande. Plus Q est élevé, plus la bande supprimée est étroite. Pour des harmoniques proches, laissez Q = 10.", docEn: "(Notches mode) Notch filter selectivity. Higher Q = narrower removed band. For close harmonics, leave Q = 10." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      const profil = ctx.entree(1);
      if (!(audio instanceof AudioBuffer) || !(profil instanceof Float32Array))
        return { valeurs: [null], message: traduire("msg.branchez_audio_profil_n_ud_profil_de_bruit") };
      const profilEnergie = profil.reduce((a, b) => a + b, 0) / profil.length;
      if (profilEnergie < 1e-6) {
        return { valeurs: [audio], message: traduire("msg.reduction_bruit_profil_trop_faible") };
      }
      const mode = ctx.paramTexte("Mode", "Spectral");
      if (mode === "Notches" || mode === "notches") {
        const nb = Math.round(ctx.paramNombre("Notches", 50));
        const q = ctx.paramNombre("Q", 10);
        return { valeurs: [await reduireBruitNotches(audio, profil, 2, nb, q)] };
      }
      const reduction = ctx.paramNombre("Réduction", 100) / 100;
      const plancher = ctx.paramNombre("Plancher", 1) / 100;
      return { valeurs: [await reduireBruit(audio, profil, reduction, plancher)] };
   },
  },
  {
    id: "profil-bruit", nom: "Profil de bruit", nomEn: "Noise Profile", univers: "Traitement", famille: "Effets",
    resume: "Capture le profil spectral d'un bruit.",
    resumeEn: "Captures the spectral profile of a noise.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Profil", nomEn: "Profile", type: "controle" }],
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const profil = await calculerProfilBruit(audio);
      const profilEnergie = profil.reduce((a, b) => a + b, 0) / profil.length;
      return { valeurs: [profil], message: profilEnergie < 1e-6 ? traduire("msg.profil_bruit_trop_faible") : undefined };
   },
  },
  {
    id: "reponse-filtre", nom: "Filtre + réponse", nomEn: "Filter + Response",
    univers: "Traitement", famille: "Effets",
    resume: "Filtre le signal ET affiche la courbe de réponse en fréquence.",
    resumeEn: "Filters the signal and displays the frequency response curve.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Modulation coupure", nomEn: "Cutoff modulation", type: "courbe", requis: false, module: "Fréquence de coupure" },
      // Ajouté EN FIN DE LISTE : les ports se désignent par leur rang, et l'insérer ailleurs
      // débrancherait l'audio de tous les graphes déjà enregistrés.
      { nom: "Modulation résonance", nomEn: "Resonance modulation", type: "courbe", requis: false, module: "Résonance" },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix",
        options: ["Passe-bas", "Passe-haut", "Passe-bande", "Coupe-bande"], optionIds: ["Passe-bas","Passe-haut","Passe-bande","Coupe-bande"], defaut: "Passe-bas",
        doc: "Type de filtre. Passe-bas laisse passer les graves, passe-haut les aigus, passe-bande une bande, coupe-bande retire une bande.",
        docEn: "Filter type. Lowpass passes lows, highpass passes highs, bandpass keeps a band, notch removes a band.", optionsEn: ["Lowpass", "Highpass", "Bandpass", "Notch"], defautEn: "Lowpass" },
      { nom: "Fréquence de coupure", nomEn: "Cutoff", plage: [20, 20000], pas: 1, defaut: 1000, unite: "Hz",
        doc: "Fréquence charnière du filtre (coupure ou centre de bande).", docEn: "Filter hinge frequency (cutoff or band center)." },
      { nom: "Résonance", nomEn: "Resonance", plage: [0.5, 12], pas: 0.1, defaut: 0.7, unite: "Q",
        doc: "Facteur de qualité Q : plus il est élevé, plus la courbe présente une bosse marquée à la coupure.", docEn: "Quality factor Q: higher = a sharper peak at the cutoff." },
      { nom: "Modulation min", nomEn: "Modulation min", modulationDe: "Fréquence de coupure", plage: [20, 20000], pas: 1, defaut: 200, unite: "Hz",
        doc: "Coupure que vaut le zéro d'une courbe branchée sur l'entrée Modulation. Sans courbe, ce réglage ne sert pas.",
        docEn: "Cutoff that a connected curve's zero means. With no curve, this setting does nothing." },
      { nom: "Modulation max", nomEn: "Modulation max", modulationDe: "Fréquence de coupure", plage: [20, 20000], pas: 1, defaut: 6000, unite: "Hz",
        doc: "Coupure que vaut le un de la courbe. Brancher la brillance du son lui-même sur cette entrée donne l'effet adaptatif de l'article : le filtre s'ouvre quand le son devient dur.",
        docEn: "Cutoff that the curve's one means. Feeding the sound's own brightness into this input gives the paper's adaptive effect: the filter opens as the sound gets harsh." },
      { nom: "Résonance min", nomEn: "Resonance min", modulationDe: "Résonance", type: "curseur", plage: [0.5, 12], pas: 0.1, defaut: 0.7, unite: "Q",
        doc: "Résonance que vaut le zéro d'une courbe branchée sur l'entrée Modulation résonance.",
        docEn: "Resonance that a curve's zero means on the Resonance modulation input." },
      { nom: "Résonance max", nomEn: "Resonance max", modulationDe: "Résonance", type: "curseur", plage: [0.5, 12], pas: 0.1, defaut: 8, unite: "Q",
        doc: "Résonance que vaut le un de la courbe. Deux réglages du même filtre peuvent bouger ensemble : la coupure qui balaie pendant que la résonance se pince est ce qu'aucune mise en série de deux filtres ne reproduit.",
        docEn: "Resonance that the curve's one means. Two settings of the same filter can move together: the cutoff sweeping while the resonance pinches is what no two filters in series can reproduce." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const type = ctx.paramTexte("Type", "Passe-bas");
      const modulationQ = ctx.entree(2);
      const q = estCourbe(modulationQ)
        ? valeursParametre(modulationQ, a.length, 0, {
          min: ctx.paramNombre("Résonance min", 0.7), max: ctx.paramNombre("Résonance max", 8),
          ...progressionPour({ unite: "Q" }),
        })
        : ctx.paramNombre("Résonance", 0.7);
      const map: Record<string, BiquadFilterType> = { "Passe-bas": "lowpass", "Passe-haut": "highpass", "Passe-bande": "bandpass", "Coupe-bande": "notch" };
      // Sans courbe branchée, on passe le NOMBRE et non un tableau constant : le filtre garde
      // alors exactement le chemin qu'il avait, et son résultat ne bouge pas d'un bit.
      const modulation = ctx.entree(1);
      const coupure = estCourbe(modulation)
        // LA COUPURE EST UNE FRÉQUENCE, DONC ELLE SE PARCOURT EN MULTIPLIANT. Réparti
        // linéairement, un balayage de 200 à 6000 Hz mettait sa moitié à 3 100 Hz : l'octave
        // 200-400, la plus audible du trajet, occupait trois pour-cent de la course, et le
        // balayage se précipitait puis s'arrêtait. La progression est déduite de l'unité déclarée
        // par le réglage, et non choisie ici — voir `progressionPour` dans `audio/courbe.ts`.
        ? valeursParametre(modulation, a.length, 0, {
          min: ctx.paramNombre("Modulation min", 200),
          max: ctx.paramNombre("Modulation max", 6000),
          ...progressionPour({ unite: "Hz", pas: 1 }),
        })
        : ctx.paramNombre("Fréquence de coupure", 1000);
      return { valeurs: [await appliquerFiltre(a, map[type] ?? "lowpass", coupure, q)] };
   },
 },
  {
    id: "reverbe-convolution", nom: "Réverbération à convolution (IR)", nomEn: "Convolution Reverb (IR)", univers: "Traitement", famille: "Effets",
    resume: "Réverbération à convolution avec IR synthétique (paramétrable) ou fichier IR externe.",
    resumeEn: "Convolution reverb with synthetic IR (adjustable) or external IR file.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Type", nomEn: "Type", type: "choix",
        options: ["Room", "Hall", "Plate", "Spring", "Cathédrale"], optionIds: ["Room","Hall","Plate","Spring","Cathédrale"], defaut: "Hall",
        doc: "Room = petite pièce (courte, dense). Hall = grand espace (longue queue). Plate = réverbération métallique (dense, linéaire). Spring = ressort (caractéristique, oscillant). Cathédrale = très long, spectral.",
        docEn: "Room = small room (short, dense). Hall = large space (long tail). Plate = metallic reverb (dense, linear). Spring = spring reverb (characteristic, oscillating). Cathedral = very long, spectral.", optionsEn: ["Room", "Hall", "Plate", "Spring", "Cathedral"], defautEn: "Hall" },
      { nom: "Taille", nomEn: "Size", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Taille de l'espace simulé. Affecte la durée et la densité des réflexions.",
        docEn: "Size of the simulated space. Affects reflection duration and density." },
      { nom: "Decay", nomEn: "Decay", plage: [0.1, 10], pas: 0.1, defaut: 2, unite: "s",
        doc: "Temps de déclin de la queue de réverbération (RT60 approximatif).",
        docEn: "Reverb tail decay time (approximate RT60)." },
      { nom: "Pre-delay", nomEn: "Pre-delay", plage: [0, 200], pas: 1, defaut: 20, unite: "ms",
        doc: "Délai avant la première réflexion. Sépare le son direct de la réverbération (sens de l'espace).",
        docEn: "Delay before the first reflection. Separates dry signal from reverb (sense of space)." },
      { nom: "Damping", nomEn: "Damping", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Absorption des hautes fréquences. Élevé = son plus sombre/étouffé. Faible = son brillant.",
        docEn: "High-frequency absorption. High = darker/muffled sound. Low = bright sound." },
      { nom: "Mix", nomEn: "Mix", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Équilibre son direct / réverbération.",
        docEn: "Dry/wet balance." },
      { nom: "Graine", graine: true, nomEn: "Seed", plage: [0, 999999], pas: 1, defaut: 42,
        doc: "Graine de la queue diffuse. Contrairement aux composants où le hasard est l'effet recherché, la valeur par défaut est fixe : une réverbération qui change de pièce à chaque exécution serait un défaut. La changer donne une autre pièce, de mêmes dimensions.",
        docEn: "Seed for the diffuse tail. Unlike nodes where randomness is the point, the default is fixed: a reverb that moves to a different room on every run would be a defect. Changing it gives another room of the same dimensions." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e_audio") };
      const { reverberationConvolution, genererIR } = await import("../audio");
      const mix = ctx.paramNombre("Mix", 50);
      let irBuffer: AudioBuffer;
      const fichier = ctx.noeud.data.irFichier as File | undefined;
      if (fichier) {
        const { decoderFichier } = await import("../audio");
        ctx.onProgress(traduire("progress.d_codage_de_l_ir"));
        irBuffer = await decoderFichier(fichier, ctx.runtime);
      } else {
        ctx.onProgress(traduire("progress.g_n_ration_de_l_ir"));
        const type = ctx.paramTexte("Type", "Hall");
        const taille = ctx.paramNombre("Taille", 50);
        const decay = ctx.paramNombre("Decay", 2);
        const preDelay = ctx.paramNombre("Pre-delay", 20);
        const damping = ctx.paramNombre("Damping", 30);
        irBuffer = genererIR(type, taille, decay, preDelay, damping, a.sampleRate,
          creerAleatoire(ctx.paramNombre("Graine", 42)));
      }
      ctx.onProgress(traduire("progress.convolution"));
      const r = await reverberationConvolution(a, irBuffer, mix);
      return { valeurs: [r], message: traduire("msg.r_verb_ration_convolution_ir_var_0_s", irBuffer.duration.toFixed(1)) };
   },
 },
] as FicheAudio[]).map(avecDoc);
