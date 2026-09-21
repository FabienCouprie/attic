// plugins/sms.ts — Nœud « Sinusoïdes + bruit (SMS) ».
//
// D'après Xavier Serra et Julius O. Smith III, « Spectral Modeling Synthesis: A Sound
// Analysis/Synthesis System Based on a Deterministic plus Stochastic Decomposition », Computer
// Music Journal 14(4), 1990 — et Robert McAulay et Thomas Quatieri, IEEE TASSP 34(4), 1986,
// pour le suivi de partiels et la resynthèse additive.
//
// La logique est dans `audio/sms.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { analyserSms, recalerEnergie, synthetiserPistes } from "../audio/sms";

export const fiches: FicheAudio[] = ([
  {
    id: "sms-sinusoides-bruit", nom: "Sinusoïdes + bruit (SMS)", nomEn: "Sinusoids + Noise (SMS)",
    univers: "Traitement", famille: "Effets",
    resume: "Suit les partiels d'un son et met le reste à part : transposer l'harmonie sans toucher au souffle.",
    resumeEn: "Tracks a sound's partials and sets the rest aside: transpose the harmony without touching the breath.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", type: "audio" },
      { nom: "Partiels", nomEn: "Partials", type: "audio" },
      { nom: "Résidu", nomEn: "Residual", type: "audio" },
    ],
    parametres: [
      { nom: "Transposition", nomEn: "Transpose", type: "curseur", plage: [-24, 24], pas: 1, defaut: 0,
        unite: " ½-ton", uniteEn: " st",
        doc: "Transposition des seuls partiels. Le résidu — souffle, archet, bruit d'attaque — n'en sait rien et reste à sa place : c'est ce qu'aucun transpositeur ne sait faire, et c'est tout l'intérêt du modèle. Dès qu'elle n'est pas nulle, les partiels sont refabriqués par addition d'oscillateurs plutôt que découpés dans le son d'origine.",
        docEn: "Transposes the partials only. The residual — breath, bow, attack noise — knows nothing of it and stays where it is: that is what no pitch shifter can do, and it is the whole point of the model. As soon as it is non-zero, the partials are rebuilt by adding oscillators rather than cut out of the original sound." },
      { nom: "Gain des partiels", nomEn: "Partials gain", type: "curseur", plage: [0, 200], pas: 5, defaut: 100, unite: "%",
        doc: "Niveau de la partie déterministe. À zéro, il ne reste que le souffle — un instrument sans note.",
        docEn: "Level of the deterministic part. At zero, only the breath remains — an instrument without a note." },
      { nom: "Gain du résidu", nomEn: "Residual gain", type: "curseur", plage: [0, 200], pas: 5, defaut: 100, unite: "%",
        doc: "Niveau de la partie stochastique. À zéro, le son devient une synthèse additive pure, lisse et sans grain ; au-delà de cent, l'instrument devient plus soufflé sans se désaccorder d'un centième de ton.",
        docEn: "Level of the stochastic part. At zero, the sound becomes pure additive synthesis, smooth and grainless; beyond a hundred, the instrument gets breathier without detuning by a hundredth of a tone." },
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [20, 90], pas: 5, defaut: 60, unite: " dB",
        doc: "Décibels sous le plus fort pic de chaque trame en deçà desquels un maximum n'est pas considéré. Bas, seuls les partiels dominants sont suivis ; haut, les plus faibles le sont aussi, au risque de prendre du bruit pour un partiel.",
        docEn: "Decibels below each frame's strongest peak under which a maximum is not considered. Low, only dominant partials are tracked; high, weaker ones too, at the risk of taking noise for a partial." },
      { nom: "Saillie", nomEn: "Prominence", type: "curseur", plage: [0, 30], pas: 1, defaut: 12, unite: " dB",
        doc: "Hauteur minimale d'un pic au-dessus de la médiane de son voisinage. C'est ce qui sépare un partiel d'une bosse de bruit, et il en faut un : la persistance ne suffit pas, deux trames voisines partageant les trois quarts de leurs échantillons. À zéro, un bruit blanc passe pour à moitié harmonique.",
        docEn: "Minimum height of a peak above the median of its neighbourhood. This is what separates a partial from a noise bump, and one is needed: persistence does not suffice, since neighbouring frames share three quarters of their samples. At zero, white noise passes for half harmonic." },
      { nom: "Partiels max", nomEn: "Max partials", type: "curseur", plage: [10, 120], pas: 5, defaut: 60,
        doc: "Nombre de pics gardés par trame, les plus forts d'abord.",
        docEn: "Number of peaks kept per frame, strongest first." },
      { nom: "Fenêtre", nomEn: "Window", type: "choix",
        options: ["1024", "2048", "4096"], optionsEn: ["1024", "2048", "4096"],
        optionIds: ["1024", "2048", "4096"], defaut: "2048", defautEn: "2048",
        doc: "Taille de la transformée. Grande, deux partiels voisins se distinguent mieux mais les attaques s'étalent ; petite, l'inverse.",
        docEn: "Transform size. Large separates neighbouring partials better but smears attacks; small does the opposite." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e") };
      }
      const transposition = Math.round(ctx.paramNombre("Transposition", 0));
      const gainPartiels = ctx.paramNombre("Gain des partiels", 100) / 100;
      const gainResidu = ctx.paramNombre("Gain du résidu", 100) / 100;
      const options = {
        taille: parseInt(ctx.paramTexte("Fenêtre", "2048"), 10) || 2048,
        seuilDb: ctx.paramNombre("Seuil", 60),
        saillieDb: ctx.paramNombre("Saillie", 12),
        maxPics: Math.round(ctx.paramNombre("Partiels max", 60)),
      };

      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const faire = () => new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      const melange = faire(), partiels = faire(), residus = faire();
      let nbPistes = 0;

      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.sms.canal", String(c + 1), String(canaux)));
        const r = analyserSms(entree.getChannelData(c), sampleRate, options);
        nbPistes += r.pistes.length;

        // Sans transposition, on garde la partie déterministe DÉCOUPÉE DANS LE SON : elle est
        // exacte, phase comprise, et sa somme avec le résidu redonne l'original. Dès qu'on
        // transpose, il faut refabriquer les partiels par addition — et les recaler sur
        // l'énergie de ceux qu'on remplace, faute de quoi le niveau sauterait.
        const det = transposition === 0
          ? r.deterministe
          : recalerEnergie(
            synthetiserPistes(r.pistes, length, sampleRate, r.saut, { transposition }),
            r.deterministe);

        const sortie = new Float32Array(length);
        for (let i = 0; i < length; i++) sortie[i] = det[i] * gainPartiels + r.residu[i] * gainResidu;
        melange.copyToChannel(new Float32Array(sortie), c);
        partiels.copyToChannel(new Float32Array(det), c);
        residus.copyToChannel(new Float32Array(r.residu), c);
      }

      return {
        valeurs: [melange, partiels, residus],
        message: traduire("msg.sms.resultat", String(Math.round(nbPistes / canaux)),
          transposition === 0 ? traduire("msg.sms.masque") : traduire("msg.sms.additif")),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
