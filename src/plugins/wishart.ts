// plugins/wishart.ts — Nœud « Wavesets » : découpe le son aux passages par zéro
// et manipule les segments obtenus. Voir audio/wishart.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "wavesets-wishart", nom: "Wavesets (Wishart)", nomEn: "Wavesets (Wishart)",
    univers: "Traitement", famille: "Effets",
    resume: "Découpe le son aux passages par zéro et rejoue les segments autrement.",
    resumeEn: "Cuts the sound at zero crossings and replays the segments differently.",
    notice: "D'après « Audible Design » de Trevor Wishart (1994). Le son est découpé non pas en tranches de durée fixe — ce que fait la granulation — mais aux PASSAGES PAR ZÉRO : chaque segment contient une pseudo-période, dont la longueur suit donc la hauteur du son au lieu d'une horloge extérieure. C'est toute la différence : une granulation impose sa grille et produit des artefacts sans rapport avec le matériau, là où les wavesets épousent la forme d'onde. Répéter les segments fait descendre la hauteur sans toucher au timbre de chacun ; en omettre troue le son d'une manière qui reste corrélée à sa propre périodicité. Et comme les segments commencent et finissent à zéro, on peut les découper, réordonner ou jeter sans jamais produire de clic — la propriété qui rend toute la famille possible. À savoir : sur un son inharmonique ou bruité, le découpage devient erratique car les passages par zéro n'y correspondent plus à une périodicité. C'est une limite du procédé, dont Wishart fait d'ailleurs un usage délibéré.",
    noticeEn: "After Trevor Wishart's \"Audible Design\" (1994). The sound is cut not into fixed-length slices — what granulation does — but at ZERO CROSSINGS: each segment holds one pseudo-period, whose length therefore follows the pitch of the sound rather than an external clock. That is the whole difference: granulation imposes its grid and produces artefacts unrelated to the material, where wavesets hug the waveform. Repeating segments lowers the pitch without touching each one's timbre; omitting them punches holes correlated with the sound's own periodicity. And since segments start and end at zero, they can be cut, reordered or discarded without ever producing a click — the property that makes the whole family possible. Note: on inharmonic or noisy material the segmentation becomes erratic, because zero crossings no longer correspond to any periodicity. That is a limit of the process, and one Wishart deliberately exploits.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: ["Répétition", "Omission", "Inversion", "Mélange", "Égalisation"],
        optionsEn: ["Repeat", "Omit", "Reverse", "Shuffle", "Level"],
        optionIds: ["repetition", "omission", "inversion", "melange", "egalisation"],
        defaut: "repetition", defautEn: "repetition",
        doc: "« Répétition » rejoue chaque segment plusieurs fois : la hauteur descend et le son s'allonge d'autant. « Omission » en tait certains sans raccourcir le son. « Inversion » lit chaque segment à l'envers : durée et énergie inchangées, timbre altéré. « Mélange » réordonne les segments par groupes. « Égalisation » ramène tous les segments au même niveau, ce qui aplatit toute dynamique.",
        docEn: "\"Repeat\" plays each segment several times: the pitch drops and the sound lengthens accordingly. \"Omit\" silences some without shortening the sound. \"Reverse\" plays each segment backwards: same duration and energy, altered timbre. \"Shuffle\" reorders segments in groups. \"Level\" brings every segment to the same level, flattening all dynamics." },
      { nom: "Facteur", nomEn: "Factor", type: "nombre", plage: [1, 16], pas: 1, defaut: 2,
        doc: "Nombre de répétitions, pas d'omission (1 segment gardé sur N), ou taille du groupe mélangé. Sans effet sur Inversion et Égalisation.",
        docEn: "Number of repeats, omission step (1 segment kept out of N), or shuffled group size. No effect on Reverse and Level." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 9999], pas: 1, defaut: 1,
        doc: "Graine du mélange : même graine, même résultat. Sans effet sur les autres opérations.",
        docEn: "Shuffle seed: same seed, same result. No effect on the other operations." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { transformerWavesets, decouperWavesets } = await import("../audio/wishart");
      const operation = ctx.paramTexte("Opération", "repetition");
      const facteur = ctx.paramNombre("Facteur", 2);
      const segments = Math.max(0, decouperWavesets(a.getChannelData(0)).length - 1);
      const out = transformerWavesets(a, {
        operation: operation as any,
        facteur,
        graine: ctx.paramNombre("Graine", 1),
      });
      return {
        valeurs: [out],
        message: traduire("msg.wavesets_var_0_var_1_var_2", segments, facteur, out.duration.toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
