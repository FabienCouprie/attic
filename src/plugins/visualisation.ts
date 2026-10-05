// plugins/visualisation.ts — Parcours pédagogique « voir le son ».
// Analyseur de spectre + spectrogramme : passe-plat (audio in → audio out), la
// représentation est calculée/dessinée par la VUE enregistrée (vues-domaine/vues.tsx).
// Oscillateur pédagogique : générateur (synthèse additive band-limitée) dont la
// vue montre l'onde ET son spectre (timbre ↔ harmoniques).

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";

// LES QUATRE FORMES D'ONDE, DÉCLARÉES UNE SEULE FOIS. Elles l'étaient trois : les libellés
// français dans `options`, les anglais dans `optionsEn`, et une troisième copie — française — dans
// l'exécuteur, qui servait à nommer la forme dans le message. C'est cette troisième copie qui
// faisait annoncer « Sinus · 220 Hz · 1 harmonic(s) » à une interface en anglais. La fiche lit
// cette table, l'exécuteur la relit, et il n'y a plus d'endroit où les deux puissent diverger.
const FORMES = [
  { id: "sine", fr: "Sinus", en: "Sine" },
  { id: "square", fr: "Carré", en: "Square" },
  { id: "sawtooth", fr: "Dent de scie", en: "Sawtooth" },
  { id: "triangle", fr: "Triangle", en: "Triangle" },
] as const;

const libelleForme = (id: string): string => {
  const f = FORMES.find((x) => x.id === id);
  return f ? (langueCourante() === "en" ? f.en : f.fr) : id;
};

export const fiches: FicheAudio[] = ([
  {
    id: "analyseur-spectre", nom: "Analyseur de spectre", nomEn: "Spectrum Analyzer",
    univers: "Visualisation", famille: "Analyse",
    resume: "Décompose le signal en fréquences (FFT) et affiche son spectre.",
    resumeEn: "Decomposes the signal into frequencies (FFT) and displays its spectrum.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["1024", "2048", "4096", "8192"], defaut: "4096",
        doc: "Taille de la fenêtre FFT (échantillons). Plus grande = meilleure résolution fréquentielle (mais moins de résolution temporelle).",
        // Pas d'optionsEn/defautEn : des tailles de fenêtre ne se traduisent pas.
        // (Ces champs contenaient des formes d'onde — « Sine », « Square »… —
        // copiées-collées depuis un paramètre d'oscillateur, ce qui affichait
        // des noms de formes d'onde à la place des tailles en anglais.)
        docEn: "FFT window size (samples). Larger = finer frequency resolution (but coarser time resolution).",
     },
      {
        nom: "Échelle", nomEn: "Scale", type: "choix",
        options: ["Logarithmique", "Linéaire"], optionIds: ["log","lineaire"], defaut: "Logarithmique",
        doc: "Échelle de l'axe des fréquences. Logarithmique = proche de la perception de la hauteur (octaves régulières) ; linéaire = fréquences réparties uniformément.",
        docEn: "Frequency axis scale. Logarithmic = close to pitch perception (even octaves); linear = evenly spaced frequencies.", optionsEn: ["Logarithmic", "Linear"], defautEn: "Logarithmic",
     },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.connectez_une_source_audio") };
      return { valeurs: [a] };
   },
 },
  {
    id: "spectrogramme", nom: "Spectrogramme", nomEn: "Spectrogram",
    univers: "Visualisation", famille: "Analyse",
    resume: "Affiche l'évolution du spectre dans le temps (temps × fréquence × intensité).",
    resumeEn: "Shows how the spectrum evolves over time (time × frequency × intensity).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["512", "1024", "2048", "4096"], defaut: "1024",
        doc: "Taille de la fenêtre FFT (échantillons). Petite = meilleure résolution temporelle ; grande = meilleure résolution fréquentielle (compromis temps/fréquence).",
        // Idem : pas d'optionsEn/defautEn (mêmes formes d'onde copiées-collées).
        docEn: "FFT window size (samples). Small = better time resolution; large = better frequency resolution (time/frequency trade-off).",
     },
      {
        nom: "Échelle", nomEn: "Scale", type: "choix",
        options: ["Logarithmique", "Linéaire"], optionIds: ["log","lineaire"], defaut: "Logarithmique",
        doc: "Échelle de l'axe vertical des fréquences (log = proche de la perception).",
        docEn: "Vertical frequency axis scale (log = close to perception).", optionsEn: ["Logarithmic", "Linear"], defautEn: "Logarithmic",
     },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.connectez_une_source_audio") };
      return { valeurs: [a] };
   },
 },
  {
    id: "oscillateur", nom: "Oscillateur", nomEn: "Oscillator",
    univers: "Entrées", famille: "Génération",
    resume: "Génère une forme d'onde pure ; la vue montre l'onde et ses harmoniques.",
    resumeEn: "Generates a pure waveform; the view shows the wave and its harmonics.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Forme", nomEn: "Waveform", type: "choix",
        options: FORMES.map((f) => f.fr), optionsEn: FORMES.map((f) => f.en),
        optionIds: FORMES.map((f) => f.id), defaut: "Sinus",
        doc: "Forme d'onde. Sinus = une seule fréquence. Carré/Triangle = harmoniques impaires. Dent de scie = toutes les harmoniques.",
        docEn: "Waveform. Sine = a single frequency. Square/Triangle = odd harmonics. Sawtooth = all harmonics.", defautEn: "Sine",
     },
      { nom: "Fréquence", nomEn: "Frequency", plage: [20, 4000], pas: 1, defaut: 220, unite: "Hz",
        doc: "Hauteur du son (fondamentale), en hertz.", docEn: "Pitch (fundamental), in hertz." },
      { nom: "Durée", nomEn: "Duration", plage: [0.2, 5], pas: 0.1, defaut: 1.5, unite: "s",
        doc: "Durée du son généré.", docEn: "Duration of the generated tone." },
      { nom: "Volume", nomEn: "Volume", plage: [0, 100], defaut: 80, unite: "%" },
    ],
    async executer(ctx: any) {
      const forme = ctx.paramTexte("Forme", "sine");
      const freq = ctx.paramNombre("Fréquence", 220);
      const duree = ctx.paramNombre("Durée", 1.5);
      const vol = ctx.paramNombre("Volume", 80) / 100;
      const sr = 44100;
      const len = Math.max(1, Math.floor(sr * duree));
      const buf = new AudioBuffer({ numberOfChannels: 1, length: len, sampleRate: sr });
      const d = buf.getChannelData(0);
      const labelForme = libelleForme(forme);

      // Synthèse ADDITIVE band-limitée : somme d'harmoniques sous Nyquist.
      // Séries de Fourier des ondes idéales — aucun aliasing, spectre exact.
      const harmoniques: { h: number; amp: number }[] = [];
      for (let h = 1; h * freq < sr / 2; h++) {
        let amp = 0;
        if (forme === "sine") amp = h === 1 ? 1 : 0;
        else if (forme === "sawtooth") amp = 1 / h;
        else if (forme === "square") amp = h % 2 === 1 ? 1 / h : 0;
        else if (forme === "triangle") amp = h % 2 === 1 ? (((h - 1) / 2) % 2 === 0 ? 1 : -1) / (h * h) : 0;
        if (amp !== 0) harmoniques.push({ h, amp });
      }
      const norm = harmoniques.reduce((s, x) => s + Math.abs(x.amp), 0) || 1;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let s = 0;
        for (const { h, amp } of harmoniques) s += amp * Math.sin(2 * Math.PI * h * freq * t);
        d[i] = (s / norm) * vol;
      }
      // Fondu 5 ms aux extrémités (évite les clics).
      const nf = Math.min(len >> 1, Math.floor(sr * 0.005));
      for (let i = 0; i < nf; i++) { const g = i / nf; d[i] *= g; d[len - 1 - i] *= g; }

      return { valeurs: [buf], message: traduire("msg.var_0_var_1_hz_var_2_harmonique_s", labelForme, freq, harmoniques.length) };
   },
 },
  {
    id: "comparateur-ab", nom: "Comparateur A/B", nomEn: "A/B Comparator",
    univers: "Sorties", famille: "Écoute",
    resume: "Compare deux signaux à niveau égalisé ; bascule l'écoute A/B.",
    resumeEn: "Compares two signals at matched level; toggles A/B listening.",
    // UNE SEULE DES DEUX SUFFIT, ET C'EST ICI QUE ÇA SE DÉCLARE. `requis` vaut `true` par défaut :
    // sans ces deux mentions, le moteur refusait d'exécuter le nœud dès qu'un câble manquait —
    // « entrée obligatoire « A » non connectée » — alors que son exécuteur a toujours porté un
    // repli sur l'autre entrée et que son message promet « Connectez A et/ou B ». Trois pièces du
    // même nœud se contredisaient, et c'étaient les ports qui avaient tort : on peut vouloir poser
    // le comparateur sur une seule source, l'écouter au niveau aligné, puis brancher la seconde.
    entrees: [
      { nom: "A", nomEn: "A", type: "audio", requis: false },
      { nom: "B", nomEn: "B", type: "audio", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Écoute", nomEn: "Listen", type: "choix", options: ["A", "B"], defaut: "A",
        doc: "Quelle entrée est envoyée en sortie et écoutée. Si l'entrée choisie n'est pas connectée, l'autre est envoyée en sortie.",
        docEn: "Which input is sent to the output and heard. If the chosen input is not connected, the other one is sent to the output.", optionsEn: ["A", "B"], defautEn: "A" },
      { nom: "Aligner les niveaux", nomEn: "Match levels", type: "choix", options: ["Oui", "Non"], optionIds: ["yes", "no"], defaut: "Oui",
        doc: "Ramène le signal écouté au même niveau crête, pour une comparaison honnête (le plus fort paraît sinon « meilleur »).",
        docEn: "Brings the heard signal to the same peak level, for a fair comparison (the louder one otherwise seems « better »).", optionsEn: ["Yes", "No"], defautEn: "Yes" },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0), b = ctx.entree(1);
      const A = a instanceof AudioBuffer ? a : null;
      const B = b instanceof AudioBuffer ? b : null;
      if (!A && !B) return { valeurs: [null], message: traduire("msg.connectez_a_et_ou_b") };
      const sel = ctx.paramTexte("Écoute", "A");
      const align = ctx.paramTexte("Aligner les niveaux", "yes") === "yes";
      // CE QUI EST ANNONCÉ EST CE QUI EST ENTENDU. Quand l'entrée demandée est absente, l'autre
      // prend le relais — c'est voulu, un seul câble suffit pour se servir du nœud — mais le
      // message annonçait tout de même CELLE QU'ON AVAIT DEMANDÉE : « Écoute A » pendant que B
      // jouait. Sur un nœud dont tout l'objet est de dire lequel des deux on entend, c'est la
      // seule chose qu'il ne pouvait pas se permettre de dire faux. Le repli se décide donc ici,
      // une fois, et le nom qui part dans le message est celui de l'entrée RETENUE. L'un des deux
      // existe forcément : le cas où aucun n'est branché est sorti juste au-dessus.
      const entendu = sel === "A" ? (A ? "A" : "B") : (B ? "B" : "A");
      const choisi = entendu === "A" ? A : B;
      const crete = (buf: AudioBuffer | null) => {
        if (!buf) return 0;
        let m = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } }
        return m;
      };
      const pA = crete(A), pB = crete(B);
      let out = choisi!;
      if (align && choisi) {
        const p = crete(choisi), cible = 0.9;
        if (p > 0) {
          const g = cible / p;
          const nb = new AudioBuffer({ numberOfChannels: choisi.numberOfChannels, length: choisi.length, sampleRate: choisi.sampleRate });
          for (let c = 0; c < choisi.numberOfChannels; c++) { const s = choisi.getChannelData(c), dd = nb.getChannelData(c); for (let i = 0; i < choisi.length; i++) dd[i] = s[i] * g; }
          out = nb;
        }
      }
      const dB = (p: number) => (p > 0 ? `${(20 * Math.log10(p)).toFixed(1)} dB` : "−∞");
      const mention = align ? ` · ${traduire("msg.niveaux_egalises")}` : "";
      return { valeurs: [out], message: traduire("msg.coute_var_0_a_var_1_b_var_2_var_3", entendu, dB(pA), dB(pB), mention) };
   },
 },
  {
    id: "vu-metre", nom: "VU-mètre / LUFS", nomEn: "VU-meter / LUFS",
    univers: "Visualisation", famille: "Analyse",
    resume: "Mesure et affiche les niveaux audio : RMS, peak, true peak, LUFS.",
    resumeEn: "Measures and displays audio levels: RMS, peak, true peak, LUFS.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Mesures", nomEn: "Readings", type: "texte" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null, null], message: traduire("msg.aucune_entr_e") };
      const { mesurerNiveau } = await import("../audio");
      const m = mesurerNiveau(a);
      const rapport = `RMS: ${m.rmsDb.toFixed(1)} dBFS\nPeak: ${m.peakDb.toFixed(1)} dBFS\nTrue Peak: ${m.vraiPicDb.toFixed(1)} dBTP\nLUFS: ${m.lufs.toFixed(1)}\nCrest: ${m.crestFactorDb.toFixed(1)} dB\nLRA: ${m.plageDynamiqueDb.toFixed(1)} dB\nLUFS max: ${m.lufsMax > -119 ? m.lufsMax.toFixed(1) : "—"}\nLUFS min: ${m.lufsMin > -119 ? m.lufsMin.toFixed(1) : "—"}`;
      return { valeurs: [a, rapport], message: traduire("msg.rms_var_0_db_peak_var_1_db_lufs_var_2", m.rmsDb.toFixed(1), m.peakDb.toFixed(1), m.lufs.toFixed(1)) };
   },
 },
  {
    id: "colorsynth", nom: "ColorSynth", nomEn: "ColorSynth",
    univers: "Visualisation", famille: "Analyse",
    resume: "Déduit une palette de couleurs depuis le spectre audio (voir le timbre).",
    resumeEn: "Derives a color palette from the audio spectrum (see the timbre).",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      return { valeurs: [a], message: traduire("msg.palette_de_couleurs_g_n_r_e") };
   },
 },
] as FicheAudio[]).map(avecDoc);
