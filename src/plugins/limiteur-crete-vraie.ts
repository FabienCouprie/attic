// plugins/limiteur-crete-vraie.ts — Un limiteur dont le plafond tient entre les échantillons.
//
// LE CALCUL EST DANS `audio/limiteur-crete-vraie.ts`, qui dit pourquoi ce composant existe à côté du
// « Limiteur » à attaque instantanée, et ce que chacun des cinq temps de son calcul garantit. Cette
// fiche lit les cinq réglages, les lui passe, et rend ce qu'il a fait.
//
// « LIMITEUR » RESTE TEL QUEL, et c'est une décision de Fabien prise le 2026-10-28 : des graphes
// l'emploient avec ses trois modulations, un exercice du parcours le demande, et changer son son
// n'était pas demandé. Les deux composants vivent côte à côte.
//
// « ANTICIPATION », « MAINTIEN » ET « RELÂCHEMENT » SONT INERTES tant que rien ne dépasse le plafond,
// et leur documentation le dit : ils règlent une réduction qui n'a pas lieu.
import type { FicheAudio } from "../audio/types-domaine";
import {
  limiterDemande, type DemandeLimiteur, type ReglagesLimiteur, type ResultatLimiteur,
} from "../audio/limiteur-crete-vraie";
import { traduire } from "../i18n";
import { parUneFois } from "./hors-lot";
import { avecDoc } from "./notices";
import { entreeAudio, sansEntree } from "./lire-entree";

const INERTE = "Sans effet tant qu'aucune crête ne dépasse le plafond.";
const INERTE_EN = "No effect while no peak exceeds the ceiling.";

export const fiches = ([
  {
    id: "limiteur-crete-vraie", nom: "Limiteur à crête vraie", nomEn: "True-Peak Limiter",
    univers: "Traitement", famille: "Effets",
    resume: "Ramène le son sous un plafond en crête vraie, en voyant venir les crêtes.",
    resumeEn: "Brings the sound under a true-peak ceiling, seeing the peaks coming.",
    etiquettes: ["limiteur", "limiter", "true peak", "crête vraie", "dBTP", "mastering", "brickwall"],
    notice: "Ce composant ramène les crêtes d'un son sous un plafond exprimé en crête vraie, c'est-à-dire en "
      + "comptant les valeurs que prend le signal entre ses échantillons, selon la recommandation UIT-R BS.1770-4. "
      + "La crête vraie est lue par un suréchantillonnage par quatre. Un seul gain est appliqué à tous les canaux, "
      + "de sorte que l'image stéréo ne se déplace pas.\n\n"
      + "« Gain » élève le son avant la limitation : c'est par lui que le son gagne en sonie, les crêtes qui "
      + "dépassent alors le plafond étant ramenées dessous.\n\n"
      + "« Plafond » fixe la crête vraie que la sortie ne dépasse pas, en dBTP. Moins un est la valeur usuelle "
      + "de diffusion.\n\n"
      + "« Anticipation » fixe le temps pendant lequel le gain descend avant une crête : la réduction commence "
      + "avant elle et l'atteint en rampe, au lieu de tomber d'un coup sur l'échantillon. Plus elle est longue, "
      + "plus la descente est douce.\n\n"
      + "« Maintien » fixe le temps pendant lequel le gain reste à sa valeur la plus basse avant de remonter. Il "
      + "évite que le gain remonte entre deux alternances d'un son grave puis redescende avant la suivante, ce qui "
      + "déformerait l'onde. À zéro, rien n'est tenu.\n\n"
      + "« Relâchement » fixe la vitesse à laquelle le gain remonte ensuite, comme la constante de temps d'un "
      + "filtre du premier ordre.\n\n"
      + "« Anticipation », « Maintien » et « Relâchement » sont sans effet tant qu'aucune crête ne dépasse le "
      + "plafond : le son ressort alors élevé du seul « Gain ». Après la limitation, la crête vraie de la sortie est "
      + "mesurée ; s'il en reste une au-dessus du plafond, un gain fixe la ramène dessous, et le message "
      + "l'indique dès que ce gain atteint un centième de décibel.\n\n"
      + "La sortie « Audio » rend le son limité, avec la durée, la fréquence d'échantillonnage et les canaux reçus. "
      + "Le message donne la réduction la plus forte appliquée et la crête vraie de la sortie.",
    noticeEn: "This component brings the peaks of a sound under a ceiling expressed as a true peak, that is, "
      + "counting the values the signal takes between its samples, following Recommendation ITU-R BS.1770-4. The "
      + "true peak is read through fourfold oversampling. A single gain is applied to all channels, so that the "
      + "stereo image does not shift.\n\n"
      + "« Gain » raises the sound before limiting: this is how the sound gains loudness, the peaks that then "
      + "exceed the ceiling being brought back under it.\n\n"
      + "« Ceiling » sets the true peak the output does not exceed, in dBTP. Minus one is the usual broadcast "
      + "value.\n\n"
      + "« Lookahead » sets the time during which the gain falls before a peak: the reduction starts ahead of it "
      + "and reaches it in a ramp, instead of dropping at once on the sample. The longer it is, the gentler the "
      + "descent.\n\n"
      + "« Hold » sets the time during which the gain stays at its lowest before rising again. It keeps the gain "
      + "from rising between two cycles of a low sound and falling again before the next, which would distort the "
      + "wave. At zero, nothing is held.\n\n"
      + "« Release » sets the speed at which the gain then rises, like the time constant of a first-order "
      + "filter.\n\n"
      + "« Lookahead », « Hold » and « Release » have no effect while no peak exceeds the ceiling: the sound then "
      + "comes out raised by « Gain » alone. After limiting, the true peak of the output is measured; if one "
      + "remains above the ceiling, a fixed gain brings it under, and the message says so once that gain reaches "
      + "a hundredth of a decibel.\n\n"
      + "The « Audio » output returns the limited sound, with the received length, sample rate and channels. The "
      + "message gives the strongest reduction applied and the true peak of the output.",
    entrees: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Gain", nomEn: "Gain", plage: [0, 24], pas: 0.5, defaut: 0, unite: "dB",
        doc: "Élève le son avant la limitation. C'est par lui que le son gagne en sonie.",
        docEn: "Raises the sound before limiting. This is how the sound gains loudness." },
      { nom: "Plafond", nomEn: "Ceiling", plage: [-6, 0], pas: 0.1, defaut: -1, unite: "dBTP",
        doc: "La crête vraie que la sortie ne dépasse pas. Moins un est la valeur usuelle de diffusion.",
        docEn: "The true peak the output does not exceed. Minus one is the usual broadcast value." },
      { nom: "Anticipation", nomEn: "Lookahead", plage: [0.5, 10], pas: 0.5, defaut: 2, unite: "ms",
        doc: `Le temps pendant lequel le gain descend avant une crête. ${INERTE}`,
        docEn: `The time during which the gain falls before a peak. ${INERTE_EN}` },
      { nom: "Maintien", nomEn: "Hold", plage: [0, 100], pas: 1, defaut: 20, unite: "ms",
        doc: `Le temps pendant lequel le gain reste au plus bas avant de remonter ; il évite de déformer un grave. ${INERTE}`,
        docEn: `The time during which the gain stays at its lowest before rising; it keeps a low sound undistorted. ${INERTE_EN}` },
      { nom: "Relâchement", nomEn: "Release", plage: [10, 1000], pas: 5, defaut: 100, unite: "ms",
        doc: `La vitesse à laquelle le gain remonte après le maintien. ${INERTE}`,
        docEn: `The speed at which the gain rises after the hold. ${INERTE_EN}` },
    ],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0);
      if (sansEntree(audio)) return audio;
      const reglages: ReglagesLimiteur = {
        gainDb: ctx.paramNombre("Gain", 0),
        plafondDbtp: ctx.paramNombre("Plafond", -1),
        anticipationMs: ctx.paramNombre("Anticipation", 2),
        maintienMs: ctx.paramNombre("Maintien", 20),
        relachementMs: ctx.paramNombre("Relâchement", 100),
      };
      // HORS DU FIL : les canaux partent COPIÉS, le tampon reçu appartenant au nœud amont, et
      // reviennent transférés. Sans worker, en test, le même calcul tourne dans le fil.
      const canaux = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const r = await parUneFois<DemandeLimiteur, ResultatLimiteur>({ canaux, sr: audio.sampleRate, ...reglages }, {
        creerWorker: () => new Worker(new URL("../workers/limiteur-crete-vraie-worker.ts", import.meta.url), { type: "module" }),
        calcul: limiterDemande,
      });
      const sortie = new AudioBuffer({ numberOfChannels: audio.numberOfChannels, length: audio.length, sampleRate: audio.sampleRate });
      // `copyToChannel` et non `getChannelData().set` : les tableaux reviennent d'un ouvrier.
      r.canaux.forEach((c, i) => sortie.copyToChannel(new Float32Array(c), i));
      const message = traduire("msg.limiteur_crete_vraie.fait", r.reductionMaxDb.toFixed(1), r.creteVraieDb.toFixed(2))
        + (r.correctionDb <= -0.005 ? traduire("msg.limiteur_crete_vraie.correction", r.correctionDb.toFixed(2)) : "");
      return { valeurs: [sortie], message };
    },
  },
] as FicheAudio[]).map(avecDoc);
