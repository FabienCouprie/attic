// plugins/reich.ts — Nœud « Déphasage de Reich » : deux copies d'un même motif
// qui se décalent lentement, et dont le décalage compose tout seul.
// Voir audio/reich.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "dephasage-reich", nom: "Déphasage de Reich", nomEn: "Reich Phasing",
    univers: "Traitement", famille: "Effets",
    resume: "Fait dériver plusieurs copies d'un motif l'une par rapport à l'autre.",
    resumeEn: "Lets several copies of a pattern drift apart from one another.",
    notice: "Steve Reich découvre le procédé par accident en 1965 : deux copies d'une même bande tournent sur deux magnétophones dont les moteurs ne vont pas exactement à la même vitesse. D'abord à l'unisson, elles se décalent lentement — et ce décalage produit des motifs que personne n'a composés. Il transposera le procédé aux instruments avec « Piano Phase » (1967). Ce qui rend la chose fascinante tient à sa gratuité : aucune note n'est ajoutée, aucun traitement appliqué. Les motifs composites, les accents qui se déplacent, la pseudo-polyrythmie ne sont que la conséquence d'un écart de vitesse minuscule — la musique est déjà tout entière dans le matériau, il suffit de le décaler d'avec lui-même. Le réglage se fait en durée de CYCLE : le temps au bout duquel le décalage a parcouru une boucle entière et où les voix se retrouvent à l'unisson. Donnez-lui une boucle brève et bien marquée — un motif de piano, une cellule rythmique — et un cycle long : c'est la lenteur qui rend le procédé hypnotique. Les voix sont réparties dans l'image stéréo, sans quoi on entend une bouillie au lieu de voix distinctes.",
    noticeEn: "Steve Reich stumbled on the process in 1965: two copies of the same tape running on two machines whose motors are not quite in step. Starting in unison, they drift slowly apart — and that drift produces patterns nobody composed. He later moved the process to instruments with \"Piano Phase\" (1967). What makes it fascinating is how little it costs: no note is added, no processing applied. The composite patterns, the shifting accents, the pseudo-polyrhythm are merely the consequence of a minute speed difference — the music is already entirely in the material; it just has to be offset against itself. The control is the CYCLE duration: the time after which the offset has travelled a whole loop and the voices meet again in unison. Feed it a short, clearly articulated loop — a piano figure, a rhythmic cell — and a long cycle: slowness is what makes the process hypnotic. Voices are spread across the stereo image, without which you hear mush rather than distinct voices.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 600], pas: 1, defaut: 60, unite: "s",
        doc: "Durée du son produit. Pour entendre le procédé aboutir, prévoyez au moins un cycle complet.",
        docEn: "Length of the produced sound. To hear the process complete, allow at least one full cycle." },
      { nom: "Cycle", nomEn: "Cycle", type: "nombre", plage: [2, 600], pas: 1, defaut: 60, unite: "s",
        doc: "Temps au bout duquel les voix se retrouvent à l'unisson, le décalage ayant parcouru une boucle entière. Long = dérive imperceptible et hypnotique ; court = effet de flanger, beaucoup moins intéressant.",
        docEn: "Time after which the voices meet again in unison, the offset having travelled a whole loop. Long = imperceptible, hypnotic drift; short = a flanger-like effect, far less interesting." },
      { nom: "Voix", nomEn: "Voices", type: "nombre", plage: [2, 6], pas: 1, defaut: 2,
        doc: "Nombre de copies. Deux suffisent au procédé — c'est la version de Reich ; au-delà, la texture s'épaissit et les motifs deviennent plus difficiles à suivre.",
        docEn: "Number of copies. Two is enough for the process — Reich's own version; beyond that the texture thickens and the patterns get harder to follow." },
      { nom: "Étalement stéréo", nomEn: "Stereo spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Répartition des voix dans l'image. À 0 % elles se superposent au centre et l'on entend surtout un peigne ; à 100 % chacune occupe sa place et le déphasage devient limpide.",
        docEn: "Spread of the voices across the image. At 0% they pile up in the centre and you mostly hear comb filtering; at 100% each has its own place and the phasing becomes clear." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Fondu appliqué pour que la source boucle sans clic. Il RACCOURCIT la boucle d'autant, ce dont le calcul du cycle tient compte.",
        docEn: "Crossfade applied so the source loops without a click. It SHORTENS the loop by that much, which the cycle computation accounts for." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const { dephasage, ecartPourPeriode, longueurBoucleEffectiveSec } = await import("../audio/reich");
      const fonduBoucleSec = ctx.paramNombre("Fondu de boucle", 50) / 1000;
      const cycle = ctx.paramNombre("Cycle", 60);
      // L'écart est déduit du cycle voulu, et non demandé à l'utilisateur : un
      // pourcentage de vitesse ne dit rien à l'oreille, alors qu'une durée de
      // cycle se choisit musicalement. Le calcul passe par la longueur EFFECTIVE
      // de la boucle, fondu déduit — sans quoi le cycle serait manqué d'autant.
      const ecart = ecartPourPeriode(a, cycle, fonduBoucleSec);
      const voix = ctx.paramNombre("Voix", 2);
      const out = dephasage(a, {
        dureeSec: ctx.paramNombre("Durée", 60),
        ecart, voix,
        stereo: ctx.paramNombre("Étalement stéréo", 80) / 100,
        fonduBoucleSec,
      });
      return {
        valeurs: [out],
        message: traduire("msg.reich_var_0_var_1_var_2",
          voix, cycle, (longueurBoucleEffectiveSec(a, fonduBoucleSec)).toFixed(2)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
