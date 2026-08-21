// plugins/cribles.ts — Nœud « Crible (Xenakis) » : fabrique une échelle et un
// rythme par arithmétique modulaire, puis les joue.
// Voir audio/cribles.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "crible-xenakis", nom: "Crible (Xenakis)", nomEn: "Sieve (Xenakis)",
    // Générateur sans entrée : sa place est parmi les sources.
    univers: "Entrées", famille: "Génération",
    resume: "Fabrique une échelle et un rythme par arithmétique modulaire.",
    resumeEn: "Builds a scale and a rhythm from modular arithmetic.",
    notice: "D'après la théorie des cribles d'Iannis Xenakis (« Sieves », 1990 ; le procédé apparaît dès « Nomos alpha », 1966). Xenakis cherchait un moyen de fabriquer des échelles et des rythmes qui ne soient ni réguliers ni aléatoires — les deux ennuient l'oreille, l'un par prévisibilité, l'autre par absence de forme. Sa réponse tient à l'arithmétique modulaire : un crible retient les entiers n tels que n ≡ i (mod m), ce qui se note m@i. Pris seul, un crible n'est qu'une grille : 3@0 donne 0, 3, 6, 9… Réunis, deux cribles produisent une suite dont les écarts ne se répètent qu'au bout du PPCM des modules — assez long pour qu'on n'entende plus la périodicité, assez structuré pour qu'on n'entende pas du hasard. C'est exactement cet espace intermédiaire que Xenakis visait, et c'est pourquoi il choisissait des modules premiers entre eux : 5, 7 et 11 donnent une période de 385, hors de portée de l'oreille. Le nœud lit la même structure sur deux axes — les degrés retenus deviennent des hauteurs, ou des instants, ou les deux — ce que Xenakis revendiquait explicitement : hauteur et rythme sont pour lui la même chose vue de deux côtés.",
    noticeEn: "After Iannis Xenakis's sieve theory (\"Sieves\", 1990; the technique appears as early as \"Nomos alpha\", 1966). Xenakis was looking for a way to build scales and rhythms that are neither regular nor random — both bore the ear, one through predictability, the other through shapelessness. His answer lies in modular arithmetic: a sieve keeps the integers n such that n ≡ i (mod m), written m@i. Taken alone a sieve is just a grid: 3@0 gives 0, 3, 6, 9… Combined, two sieves produce a sequence whose intervals only repeat after the LCM of the moduli — long enough that periodicity is no longer heard, structured enough that it is not heard as chance. That in-between is exactly what Xenakis aimed at, and why he chose coprime moduli: 5, 7 and 11 give a period of 385, beyond the ear's reach. The node reads the same structure along two axes — the kept degrees become pitches, or onsets, or both — which Xenakis claimed explicitly: pitch and rhythm are for him the same thing seen from two sides.",
    entrees: [],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Crible", nomEn: "Sieve", type: "texte", defaut: "5@0 7@2 11@3", defautEn: "5@0 7@2 11@3",
        doc: "Classes résiduelles, sous la forme « module@résidu », séparées par des espaces. Des modules premiers entre eux donnent la période la plus longue : 5@0 7@2 11@3 ne se répète qu'au bout de 385 degrés. Les fragments mal formés sont ignorés plutôt que de vider le crible.",
        docEn: "Residual classes as \"modulus@residue\", separated by spaces. Coprime moduli give the longest period: 5@0 7@2 11@3 only repeats after 385 degrees. Malformed fragments are ignored rather than emptying the sieve." },
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: ["Réunion", "Intersection", "Différence"], optionsEn: ["Union", "Intersection", "Difference"],
        optionIds: ["union", "intersection", "difference"],
        defaut: "union", defautEn: "union",
        doc: "« Réunion » garde ce qu'au moins une classe retient — c'est l'opération qui crée l'irrégularité. « Intersection » ne garde que ce que toutes retiennent, donc très peu. « Différence » garde ce que la PREMIÈRE classe retient et qu'aucune autre ne reprend : la seule façon de creuser des trous dans une grille régulière.",
        docEn: "\"Union\" keeps what at least one class holds — the operation that creates irregularity. \"Intersection\" keeps only what all of them hold, hence very little. \"Difference\" keeps what the FIRST class holds and no other does: the only way to punch holes in a regular grid." },
      { nom: "Lecture", nomEn: "Reading", type: "choix",
        options: ["Hauteurs", "Rythme", "Hauteurs et rythme"], optionsEn: ["Pitches", "Rhythm", "Pitches and rhythm"],
        optionIds: ["hauteurs", "rythme", "les-deux"],
        defaut: "les-deux", defautEn: "les-deux",
        doc: "Sur quel axe lire le crible. « Hauteurs » joue les degrés retenus en notes régulières ; « Rythme » joue une seule note aux instants retenus ; « Hauteurs et rythme » fait les deux à la fois — la dualité que Xenakis revendiquait.",
        docEn: "Which axis to read the sieve along. \"Pitches\" plays the kept degrees as evenly spaced notes; \"Rhythm\" plays a single note at the kept onsets; \"Pitches and rhythm\" does both — the duality Xenakis claimed." },
      { nom: "Étendue", nomEn: "Span", type: "nombre", plage: [8, 512], pas: 1, defaut: 96,
        doc: "Nombre de degrés examinés. Pour entendre un crible de longue période, il en faut au moins autant que sa période — sinon on n'en écoute qu'un fragment.",
        docEn: "Number of degrees examined. To hear a long-period sieve you need at least its period — otherwise you only hear a fragment." },
      { nom: "Note de base", nomEn: "Base note", type: "nombre", plage: [24, 96], pas: 1, defaut: 48,
        doc: "Hauteur MIDI du degré 0. Chaque degré retenu vaut un demi-ton au-dessus.",
        docEn: "MIDI pitch of degree 0. Each kept degree is one semitone above." },
      { nom: "Subdivision", nomEn: "Subdivision", type: "nombre", plage: [20, 1000], pas: 10, defaut: 120, unite: "ms",
        doc: "Durée d'un degré sur l'axe du temps. Courte, le crible s'entend comme une texture ; longue, comme une mélodie.",
        docEn: "Duration of one degree on the time axis. Short, the sieve is heard as a texture; long, as a melody." },
      { nom: "Durée de note", nomEn: "Note length", type: "curseur", plage: [10, 100], pas: 5, defaut: 60, unite: "%",
        doc: "Part de la subdivision réellement sonnante. Faible, les notes se détachent ; élevée, elles se rejoignent.",
        docEn: "Share of the subdivision actually sounding. Low, notes stand apart; high, they run together." },
    ],
    async executer(ctx: any) {
      const { parserCrible, appliquerCrible, periodeCrible, ecrireCrible } = await import("../audio/cribles");
      const classes = parserCrible(ctx.paramTexte("Crible", "5@0 7@2 11@3"));
      if (!classes.length) {
        return { valeurs: [null], erreur: true, message: traduire("msg.crible_vide") };
      }
      const etendue = ctx.paramNombre("Étendue", 96);
      const retenus = appliquerCrible({
        classes,
        operation: ctx.paramTexte("Opération", "union") as any,
        etendue,
      });
      if (!retenus.length) {
        return { valeurs: [null], erreur: true, message: traduire("msg.crible_sans_resultat") };
      }

      const sr = ctx.runtime?.sampleRate ?? 44100;
      const lecture = ctx.paramTexte("Lecture", "les-deux");
      const noteBase = ctx.paramNombre("Note de base", 48);
      const subdivision = ctx.paramNombre("Subdivision", 120) / 1000;
      const partSonnante = ctx.paramNombre("Durée de note", 60) / 100;

      // Sur l'axe du temps, le crible décide QUAND ; sur celui des hauteurs, il
      // décide QUOI. En mode « rythme » seul, la hauteur est fixe ; en mode
      // « hauteurs » seul, les instants sont réguliers.
      const evenements = lecture === "hauteurs"
        ? retenus.map((degre, k) => ({ instant: k * subdivision, note: noteBase + degre }))
        : retenus.map((degre, k) => ({
            instant: degre * subdivision,
            note: lecture === "rythme" ? noteBase : noteBase + retenus[k % retenus.length] % 24,
          }));

      const fin = evenements.length ? evenements[evenements.length - 1].instant + subdivision : subdivision;
      const n = Math.max(1, Math.round(fin * sr));
      const out = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
      const d = out.getChannelData(0);
      const dureeNote = Math.max(1, Math.round(subdivision * partSonnante * sr));

      for (const ev of evenements) {
        const debut = Math.round(ev.instant * sr);
        const freq = 440 * Math.pow(2, (ev.note - 69) / 12);
        for (let i = 0; i < dureeNote && debut + i < n; i++) {
          // Enveloppe en cloche : sans elle, chaque note commencerait et
          // finirait sur un clic, et l'on entendrait la grille plutôt que le
          // crible.
          const env = 0.5 * (1 - Math.cos((2 * Math.PI * i) / dureeNote));
          d[debut + i] += 0.35 * env * Math.sin((2 * Math.PI * freq * i) / sr);
        }
      }

      return {
        valeurs: [out],
        message: traduire("msg.crible_var_0_var_1_var_2",
          ecrireCrible(classes), retenus.length, periodeCrible(classes)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
