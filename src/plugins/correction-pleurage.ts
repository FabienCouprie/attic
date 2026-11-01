// plugins/correction-pleurage.ts — Le pleurage et le scintillement d'une bande, retrouvés dans un ton de référence et annulés.
//
// LE CALCUL EST DANS `audio/correction-pleurage.ts`, qui dit comment la vitesse se lit dans la
// référence et pourquoi chaque étape est écrite ainsi. Cette fiche lit les quatre réglages, les lui
// passe hors du fil de l'interface, et rend ce qu'il a fait.
//
// UNE SEULE TÂCHE ET NON UNE PAR CANAL, comme le limiteur à crête vraie : l'horloge retrouvée est
// commune à tous les canaux, et la référence se suit sur tous ensemble. Deux tâches retrouveraient
// deux horloges, et l'image stéréo se décalerait d'un canal à l'autre.
//
// RANGÉ DANS « TRAITEMENT → DÉBRUITAGE », ET VERSÉ PAR `debruitage-ia.ts` : c'est la famille de ce
// qui enlève ce qui n'est pas le son, et l'index, en dette de taille, ne prend pas une ligne de plus.
import type { FicheAudio } from "../audio/types-domaine";
import {
  corrigerPleurage, suiviPour, type DemandePleurage, type ModeVitesse, type ResultatPleurage,
} from "../audio/correction-pleurage";
import { traduire } from "../i18n";
import { parUneFois } from "./hors-lot";
import { entreeAudio, sansEntree } from "./lire-entree";
import { avecDoc } from "./notices";

const pourCent = (x: number, chiffres = 2) => (100 * x).toFixed(chiffres);
/** Un écart signé ; « −0.00 » se lit « 0.00 », un zéro n'ayant pas de sens. */
const signe = (x: number) => {
  const texte = pourCent(x);
  return Number(texte) === 0 ? pourCent(0) : `${x > 0 ? "+" : ""}${texte}`;
};

/** Le message du nœud, tiré de ce que le calcul a rendu. */
function messageDe(r: ResultatPleurage, d: DemandePleurage): string {
  const reference = d.referenceHz.toFixed(d.referenceHz % 1 === 0 ? 0 : 2);
  if (r.raison === "hors-bande") return traduire("msg.correction_pleurage.hors_bande", reference, String(d.sr));
  if (r.raison === "trop-court") {
    const s = suiviPour(d.sr, d);
    return traduire("msg.correction_pleurage.trop_court", reference, ((2 * s.demi + 2 * s.pas) / d.sr).toFixed(2));
  }
  if (r.raison === "introuvable") return traduire("msg.correction_pleurage.introuvable", reference, pourCent(r.partIncertaine, 0));
  const mode = traduire(d.vitesseMoyenne === "garder" ? "msg.correction_pleurage.gardee" : "msg.correction_pleurage.corrigee");
  return traduire("msg.correction_pleurage.fait", pourCent(r.creteEcart), pourCent(r.efficaceEcart), signe(r.vitesseMoyenne), mode)
    + (r.partIncertaine >= 0.01 ? traduire("msg.correction_pleurage.incertaine", pourCent(r.partIncertaine, 0)) : "")
    + (r.rythmeSuiviHz < d.rythmeMaxHz - 1e-9 ? traduire("msg.correction_pleurage.rythme_borne", r.rythmeSuiviHz.toFixed(1)) : "");
}

export const fiches = ([
  {
    id: "correction-pleurage", nomDicte: "correction de la vitesse de bande", nom: "Correction du pleurage", nomEn: "Wow and Flutter Correction",
    univers: "Traitement", famille: "Effets",
    resume: "Retire les variations de vitesse d'une bande, retrouvées dans un ton de fréquence fixe.",
    resumeEn: "Removes the speed variations of a tape, found in a fixed-frequency tone.",
    etiquettes: ["pleurage", "scintillement", "wow", "flutter", "de-flutter", "deflutter", "bande", "tape",
      "vitesse", "restauration", "restoration", "ronflement", "hum", "ton pilote", "pilot tone"],
    notice: "Ce composant retire d'un son les variations de vitesse d'une bande : le pleurage, lent, et le "
      + "scintillement, rapide. Il les retrouve dans un ton de fréquence fixe enregistré avec la musique, ronflement "
      + "du secteur, ton pilote ou note tenue, dont la hauteur a varié comme celle de tout le reste. La phase de ce ton, "
      + "suivie pas à pas, donne l'horloge de l'enregistrement, et le son est relu selon elle, par une interpolation à "
      + "sinus cardinal fenêtré. Le ton est suivi sur tous les canaux ensemble, et la même horloge s'applique à chacun.\n\n"
      + "« Référence » donne la fréquence nominale de ce ton, en hertz : 50 ou 60 pour le ronflement du secteur, ou la "
      + "fréquence d'un ton pilote. Le ton doit dominer la bande qui l'entoure ; un autre son à la même hauteur se mêle "
      + "à son suivi.\n\n"
      + "« Écart max » fixe la plus grande variation de vitesse admise, en pour cent. Un pas où la référence s'écarte "
      + "davantage, ou devient trop faible, est déclaré incertain et prend la vitesse moyenne des pas sûrs dans la seconde "
      + "qui l'entoure. Au-delà de la moitié de pas incertains, la référence est déclarée introuvable, et le son ressort "
      + "tel qu'il est entré.\n\n"
      + "« Rythme max » fixe la variation la plus rapide suivie, en hertz. La bande suivie autour de la référence vaut "
      + "« Écart max » appliqué à « Référence », plus ce rythme ; elle est ramenée, s'il le faut, aux six dixièmes de "
      + "« Référence », et le message donne alors le rythme suivi.\n\n"
      + "« Vitesse moyenne » décide de la vitesse d'ensemble. « Gardée » ne retire que les variations autour de la "
      + "vitesse moyenne, et la durée reste celle du son reçu. « Corrigée » ramène aussi la référence à sa fréquence "
      + "nominale : un transfert d'un pour cent trop rapide ressort d'un pour cent plus long et plus grave.\n\n"
      + "Au début et à la fin du son, sur la moitié de la fenêtre de suivi, l'écart ne se lit pas ; ces passages prennent "
      + "la vitesse moyenne des pas qui les suivent ou les précèdent.\n\n"
      + "La sortie « Audio » rend le son corrigé, avec la fréquence d'échantillonnage et les canaux reçus. La sortie "
      + "« Écart » rend l'écart de vitesse autour de la moyenne, instant par instant, sur la durée reçue : un demi vaut "
      + "aucun écart, zéro et un valent « Écart max » en moins et en plus. Le message donne l'écart en crête et l'écart "
      + "efficace, la vitesse moyenne du transfert, et la part du son où la référence était incertaine.",
    noticeEn: "This component removes the speed variations of a tape from a sound: wow, which is slow, and flutter, "
      + "which is fast. It finds them in a fixed-frequency tone recorded along with the music, mains hum, pilot tone or "
      + "held note, whose pitch varied like everything else. The phase of this tone, followed step by step, gives the "
      + "clock of the recording, and the sound is read again along it, through a windowed sinc interpolation. The tone "
      + "is followed on all channels together, and the same clock applies to each of them.\n\n"
      + "« Reference » gives the nominal frequency of this tone, in hertz: 50 or 60 for mains hum, or the frequency of a "
      + "pilot tone. The tone must dominate the band around it; another sound at the same pitch mixes into its tracking.\n\n"
      + "« Max deviation » sets the largest speed variation allowed, in percent. A step where the reference strays "
      + "further, or becomes too weak, is declared uncertain and takes the mean speed of the reliable steps within the "
      + "second around it. Beyond half of the steps uncertain, the reference is declared not found, and the sound comes "
      + "out as it went in.\n\n"
      + "« Max rate » sets the fastest variation followed, in hertz. The band followed around the reference is "
      + "« Max deviation » applied to « Reference », plus this rate; it is brought back, when needed, to six tenths of "
      + "« Reference », and the message then gives the rate followed.\n\n"
      + "« Mean speed » decides the overall speed. « Kept » removes only the variations around the mean speed, and the "
      + "duration stays that of the received sound. « Corrected » also brings the reference back to its nominal "
      + "frequency: a transfer one percent too fast comes out one percent longer and lower.\n\n"
      + "At the start and the end of the sound, over half of the tracking window, the deviation cannot be read; these "
      + "passages take the mean speed of the steps that follow or precede them.\n\n"
      + "The « Audio » output returns the corrected sound, with the received sample rate and channels. The « Deviation » "
      + "output returns the speed deviation around the mean, instant by instant, over the received duration: one half "
      + "means no deviation, zero and one mean « Max deviation » below and above. The message gives the peak and RMS "
      + "deviation, the mean speed of the transfer, and the share of the sound where the reference was uncertain.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }, { nom: "Écart", nomEn: "Deviation", type: "courbe" }],
    parametres: [
      { nom: "Référence", nomEn: "Reference", type: "nombre", plage: [20, 20000], pas: 0.01, defaut: 50, unite: "Hz",
        doc: "La fréquence nominale du ton suivi : 50 ou 60 pour le ronflement du secteur, ou celle d'un ton pilote.",
        docEn: "The nominal frequency of the tone followed: 50 or 60 for mains hum, or that of a pilot tone." },
      { nom: "Écart max", nomEn: "Max deviation", plage: [0.5, 10], pas: 0.1, defaut: 3, unite: "%",
        doc: "La plus grande variation de vitesse admise. Un pas qui la dépasse est déclaré incertain.",
        docEn: "The largest speed variation allowed. A step beyond it is declared uncertain." },
      { nom: "Rythme max", nomEn: "Max rate", plage: [1, 100], pas: 1, defaut: 20, unite: "Hz",
        doc: "La variation la plus rapide suivie. La bande suivie reste sous les six dixièmes de « Référence ».",
        docEn: "The fastest variation followed. The band followed stays under six tenths of « Reference »." },
      { nom: "Vitesse moyenne", nomEn: "Mean speed", type: "choix",
        options: ["Gardée", "Corrigée"], optionsEn: ["Kept", "Corrected"], optionIds: ["garder", "corriger"],
        defaut: "Gardée", defautEn: "Kept",
        doc: "Gardée : seules les variations autour de la moyenne sont retirées, et la durée reste. Corrigée : la référence revient aussi à sa fréquence nominale.",
        docEn: "Kept: only the variations around the mean are removed, and the duration stays. Corrected: the reference also returns to its nominal frequency." },
    ],
    async executer(ctx) {
      const audio = entreeAudio(ctx, 0, { sorties: 2 });
      if (sansEntree(audio)) return audio;
      const demande: DemandePleurage = {
        canaux: Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c)),
        sr: audio.sampleRate,
        referenceHz: ctx.paramNombre("Référence", 50),
        ecartMax: ctx.paramNombre("Écart max", 3) / 100,
        rythmeMaxHz: ctx.paramNombre("Rythme max", 20),
        vitesseMoyenne: (ctx.paramTexte("Vitesse moyenne", "garder") === "corriger" ? "corriger" : "garder") as ModeVitesse,
      };
      // HORS DU FIL : les canaux partent COPIÉS, le tampon reçu appartenant au nœud amont, et
      // reviennent transférés. Sans worker, en test, le même calcul tourne dans le fil.
      const r = await parUneFois<DemandePleurage, ResultatPleurage>(demande, {
        creerWorker: () => new Worker(new URL("../workers/correction-pleurage-worker.ts", import.meta.url), { type: "module" }),
        calcul: corrigerPleurage,
      });
      const sortie = new AudioBuffer({ numberOfChannels: audio.numberOfChannels, length: r.canaux[0].length, sampleRate: audio.sampleRate });
      // `copyToChannel` et non `getChannelData().set` : les tableaux reviennent d'un ouvrier.
      r.canaux.forEach((c, i) => sortie.copyToChannel(new Float32Array(c), i));
      return { valeurs: [sortie, { valeurs: new Float32Array(r.ecart), cadence: 200 }], message: messageDe(r, demande) };
    },
  },
] as FicheAudio[]).map(avecDoc);
