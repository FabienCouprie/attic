// plugins/lucier.ts — Nœud « Pièce de Lucier » : réinjecte un son dans la même
// pièce, encore et encore, jusqu'à ce que la pièce le remplace.
// Voir audio/lucier.ts pour le principe.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "piece-lucier", nom: "Pièce de Lucier", nomEn: "Lucier Room",
    univers: "Traitement", famille: "Effets",
    resume: "Réinjecte le son dans la même pièce jusqu'à ne laisser que ses résonances.",
    resumeEn: "Feeds the sound back into the same room until only its resonances remain.",
    notice: "D'après « I Am Sitting in a Room » d'Alvin Lucier (1969), dont le principe tient en une phrase : enregistrer une voix dans une pièce, rejouer l'enregistrement dans cette même pièce, ré-enregistrer, et recommencer. À chaque passage, les fréquences que la pièce favorise sont renforcées et celles qu'elle absorbe s'effacent un peu plus ; au bout de quelques dizaines de passages il ne reste plus de parole, rien que les modes de résonance du lieu devenus un accord tenu. Ce n'est PAS une réverbération très mouillée : un espace est un filtre, et l'appliquer un grand nombre de fois ne fait pas « plus de la même chose » — cela transforme le filtre en son. Le paramètre décisif est donc le nombre d'itérations : en dessous de 5 on entend une coloration, vers 15-20 la source devient méconnaissable, au-delà de 30 il ne reste que la pièce. Les autres réglages décrivent l'espace, exactement comme sur le nœud de réverbération à convolution. À savoir : le pré-délai s'accumule d'un passage à l'autre et repousse progressivement le son ; c'est le comportement attendu, pas un défaut.",
    noticeEn: "After Alvin Lucier's \"I Am Sitting in a Room\" (1969), whose principle fits in one sentence: record a voice in a room, play the recording back into that same room, re-record, and repeat. With each pass the frequencies the room favours are reinforced and those it absorbs fade further; after a few dozen passes no speech is left, only the room's resonant modes turned into a sustained chord. This is NOT a very wet reverb: a space is a filter, and applying it many times does not give \"more of the same\" — it turns the filter into the sound. The decisive parameter is therefore the iteration count: below 5 you hear colouring, around 15-20 the source becomes unrecognisable, past 30 only the room remains. The other settings describe the space, exactly as on the convolution reverb node. Note: the pre-delay accumulates from pass to pass and progressively pushes the sound later; that is expected behaviour, not a fault.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Itérations", nomEn: "Iterations", type: "nombre", plage: [1, 60], pas: 1, defaut: 20,
        doc: "Nombre de passages dans la pièce. C'est le seul paramètre de l'œuvre, et celui qui décide de tout : coloration en dessous de 5, source méconnaissable vers 15-20, plus que la pièce au-delà de 30.",
        docEn: "Number of passes through the room. The only parameter of the piece, and the one that decides everything: colouring below 5, unrecognisable source around 15-20, nothing but the room past 30." },
      { nom: "Type", nomEn: "Type", type: "choix",
        options: ["Room", "Hall", "Plate", "Spring", "Cathédrale"],
        optionsEn: ["Room", "Hall", "Plate", "Spring", "Cathedral"],
        optionIds: ["Room", "Hall", "Plate", "Spring", "Cathédrale"],
        defaut: "Cathédrale", defautEn: "Cathédrale",
        doc: "Type d'espace. Plus il est résonant, plus vite ses modes prennent le dessus — une cathédrale se révèle en quelques passages là où une petite pièce en demande beaucoup.",
        docEn: "Type of space. The more resonant it is, the faster its modes take over — a cathedral shows itself in a few passes where a small room needs many." },
      { nom: "Taille", nomEn: "Size", type: "nombre", plage: [0, 100], pas: 1, defaut: 70, unite: "%",
        doc: "Taille de l'espace.", docEn: "Size of the space." },
      { nom: "Decay", nomEn: "Decay", type: "nombre", plage: [0.1, 10], pas: 0.1, defaut: 3, unite: "s",
        doc: "Durée de la queue de réverbération.", docEn: "Length of the reverb tail." },
      { nom: "Pre-delay", nomEn: "Pre-delay", type: "nombre", plage: [0, 200], pas: 1, defaut: 10, unite: "ms",
        doc: "Retard avant les premières réflexions. Il s'ACCUMULE d'un passage à l'autre : une valeur élevée combinée à beaucoup d'itérations repousse le son vers la fin, voire le fait sortir du cadre.",
        docEn: "Delay before the first reflections. It ACCUMULATES from pass to pass: a high value combined with many iterations pushes the sound later, possibly out of the frame." },
      { nom: "Damping", nomEn: "Damping", type: "nombre", plage: [0, 100], pas: 1, defaut: 30, unite: "%",
        doc: "Absorption des aigus par l'air et les matériaux.", docEn: "Absorption of highs by air and materials." },
    ],
    async executer(ctx: any) {
      const a = ctx.entree(0);
      if (!(a instanceof AudioBuffer)) return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      const [{ pieceDeLucier, platitudeSpectrale }, { genererIR }] = await Promise.all([
        import("../audio/lucier"),
        import("../audio/convolution"),
      ]);
      const iterations = ctx.paramNombre("Itérations", 20);
      const ir = genererIR(
        ctx.paramTexte("Type", "Cathédrale"),
        ctx.paramNombre("Taille", 70),
        ctx.paramNombre("Decay", 3),
        ctx.paramNombre("Pre-delay", 10),
        ctx.paramNombre("Damping", 30),
        a.sampleRate,
      );
      // Exprimée en dB : la platitude s'effondre si vite (0,73 pour la source,
      // 0,05 après un seul passage, puis en dessous de 0,001) qu'un affichage
      // décimal montrerait « 0,000 » dès la cinquième itération. En dB, la
      // progression reste lisible d'un bout à l'autre.
      const enDb = (v: number) => (10 * Math.log10(Math.max(v, 1e-12))).toFixed(1);
      const avant = platitudeSpectrale(a);
      const out = await pieceDeLucier(a, ir, {
        iterations,
        surIteration: (i, total) => ctx.onProgress(traduire("progress.lucier_var_0_var_1", i, total)),
      });
      // La platitude spectrale rend l'effet lisible plutôt qu'impressionniste :
      // elle chute à mesure que les modes de la pièce remplacent la source.
      const apres = platitudeSpectrale(out);
      return {
        valeurs: [out],
        message: traduire("msg.lucier_var_0_var_1_var_2", iterations, enDb(avant), enDb(apres)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
