// plugins/nancarrow.ts — Nœud « Canon de tempo (Nancarrow) » : le même motif
// superposé à lui-même dans un rapport de tempo fixe.
// Voir audio/nancarrow.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

/** Rapports proposés, du plus simple au plus retors. */
const RAPPORTS: Record<string, number> = {
  "3:2": 3 / 2,
  "4:3": 4 / 3,
  "5:4": 5 / 4,
  "7:5": 7 / 5,
  "racine2": Math.SQRT2,
  "nombre-or": (1 + Math.sqrt(5)) / 2,
  "pi-sur-e": Math.PI / Math.E,
};

export const fiches: FicheAudio[] = ([
  {
    id: "canon-nancarrow", nom: "Canon de tempo (Nancarrow)", nomEn: "Tempo Canon (Nancarrow)",
    univers: "Traitement", famille: "Effets",
    resume: "Superpose un motif à lui-même dans un rapport de tempo fixe.",
    resumeEn: "Layers a pattern against itself at a fixed tempo ratio.",
    notice: "D'après les « Studies for Player Piano » de Conlon Nancarrow. Il écrivait pour piano mécanique parce qu'aucun interprète ne pouvait jouer ce qu'il voulait entendre : le même motif superposé à lui-même à des tempos dans un rapport fixe — 3:4, 5:7, puis, dans les études tardives, des rapports IRRATIONNELS. La différence avec le déphasage de Reich n'est pas de degré mais de nature, et elle est arithmétique. Reich fait dériver deux copies à des vitesses presque identiques, et les voix se retrouvent périodiquement. Nancarrow fixe un rapport franc, qui s'entend d'emblée comme deux tempos distincts : si ce rapport est rationnel, le canon SE REFERME — les voix coïncident régulièrement et l'on perçoit un motif composite stable ; s'il est irrationnel, il ne se referme JAMAIS, et c'est précisément ce que Nancarrow cherchait. Le message du nœud indique au bout de combien de temps la coïncidence se produit, ou qu'elle ne se produira pas. Donnez-lui une boucle rythmique nette : c'est sur une pulsation identifiable que deux tempos se distinguent.",
    noticeEn: "After Conlon Nancarrow's \"Studies for Player Piano\". He wrote for player piano because no performer could play what he wanted to hear: the same pattern layered against itself at fixed tempo ratios — 3:4, 5:7, then, in the late studies, IRRATIONAL ratios. The difference from Reich's phasing is not one of degree but of kind, and it is arithmetic. Reich drifts two copies at almost identical speeds, and the voices meet again periodically. Nancarrow fixes a plain ratio, heard at once as two distinct tempos: if that ratio is rational the canon CLOSES — the voices coincide regularly and a stable composite pattern emerges; if it is irrational it NEVER closes, which is exactly what Nancarrow was after. The node's message tells you after how long the coincidence occurs, or that it will not. Feed it a clear rhythmic loop: two tempos only separate over an identifiable pulse.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio", sousType: "stereo" }],
    parametres: [
      { nom: "Rapport", nomEn: "Ratio", type: "choix",
        options: ["3:2", "4:3", "5:4", "7:5", "√2 : 1", "Nombre d'or", "π : e"],
        optionsEn: ["3:2", "4:3", "5:4", "7:5", "√2 : 1", "Golden ratio", "π : e"],
        optionIds: ["3:2", "4:3", "5:4", "7:5", "racine2", "nombre-or", "pi-sur-e"],
        defaut: "3:2", defautEn: "3:2",
        doc: "Rapport entre les tempos. Les quatre premiers sont rationnels : le canon se referme d'autant plus vite que le dénominateur est petit. Les trois derniers sont irrationnels : le canon ne se referme jamais, les voix ne coïncidant plus qu'approximativement et sans retour.",
        docEn: "Ratio between the tempos. The first four are rational: the canon closes the sooner the smaller the denominator. The last three are irrational: the canon never closes, the voices only ever coinciding approximately and without return." },
      { nom: "Voix", nomEn: "Voices", type: "nombre", plage: [2, 5], pas: 1, defaut: 2,
        doc: "Nombre de copies. Chaque voix supplémentaire élève le rapport d'une puissance : trois voix en 3:2 donnent les tempos 1, 1,5 et 2,25.",
        docEn: "Number of copies. Each extra voice raises the ratio by one more power: three voices at 3:2 give tempos 1, 1.5 and 2.25." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [1, 300], pas: 1, defaut: 30, unite: "s",
        doc: "Durée du son produit. Pour entendre un canon rationnel se refermer, prévoyez au moins une période de coïncidence — le message vous la donne.",
        docEn: "Length of the produced sound. To hear a rational canon close, allow at least one coincidence period — the message states it." },
      { nom: "Étalement stéréo", nomEn: "Stereo spread", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Répartition des voix dans l'image. Sans étalement, deux tempos superposés au centre deviennent difficiles à démêler.",
        docEn: "Spread of the voices across the image. Without it, two superposed tempos in the centre become hard to tell apart." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "nombre", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Fondu appliqué pour que la source boucle sans clic. Il raccourcit la boucle d'autant, ce dont le calcul de la période de coïncidence tient compte.",
        docEn: "Crossfade so the source loops without a click. It shortens the loop by that much, which the coincidence period accounts for." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const [{ canonDeTempo, periodeCanon }, { boucleSansCouture }] = await Promise.all([
        import("../audio/nancarrow"),
        import("../audio/risset"),
      ]);
      const cle = ctx.paramTexte("Rapport", "3:2");
      const rapport = RAPPORTS[cle] ?? 1.5;
      const voix = ctx.paramNombre("Voix", 2);
      const fonduBoucleSec = ctx.paramNombre("Fondu de boucle", 50) / 1000;
      // Chaque voix élève le rapport d'une puissance : 1, r, r², …
      const rapports = Array.from({ length: voix }, (_, k) => Math.pow(rapport, k));
      const out = canonDeTempo(a, {
        dureeSec: ctx.paramNombre("Durée", 30),
        rapports,
        stereo: ctx.paramNombre("Étalement stéréo", 80) / 100,
        fonduBoucleSec,
      });
      // La longueur EFFECTIVE, fondu déduit : c'est elle qui gouverne la
      // coïncidence, comme pour le déphasage de Reich.
      const boucleSec = boucleSansCouture(a, fonduBoucleSec).length / a.sampleRate;
      const periode = periodeCanon(rapport, boucleSec);
      return {
        valeurs: [out],
        message: Number.isFinite(periode)
          ? traduire("msg.canon_ferme_var_0_var_1_var_2", cle, voix, periode.toFixed(1))
          : traduire("msg.canon_ouvert_var_0_var_1", cle, voix),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
