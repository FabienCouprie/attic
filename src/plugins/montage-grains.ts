// plugins/montage-grains.ts — Le nœud « Montage par grains ». La détection et le montage sont dans
// `audio/grains.ts`, éprouvés sur des signaux dont on connaît la réponse ; ici, la prise.
//
// CE QUI LE SÉPARE DE TOUT LE RESTE DU CATALOGUE GRANULAIRE. Le gel granulaire, le brassage, la
// découpe aléatoire et les particules découpent sur une GRILLE réglée par l'utilisateur. Ici les
// frontières viennent du son : chaque frappe, chaque syllabe, chaque note devient un grain, et
// l'on peut en retirer une sur deux, les remettre dans un autre ordre ou les répéter sans jamais
// couper au milieu d'un son. C'est la famille `GRAIN` du Composers Desktop Project.
//
// LE RAPPORT SORT AVANT L'EFFET, ET CE N'EST PAS UN ORNEMENT. Toute manipulation repose sur la
// détection : retirer « une frappe sur deux » d'un rythme où l'on en a détecté treize pour huit ne
// retire rien de reconnaissable. Le nœud annonce donc d'abord ce qu'il a trouvé — combien, de
// quelle durée moyenne, à quel écart moyen —, et l'opération « Compter seulement » existe pour
// qu'on puisse régler la détection avant de toucher au son.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { creerAleatoire } from "../core/hasard";
import {
  ESPACEMENTS, EST_ESPACEMENT, EST_OPERATION, OPERATIONS, detecterGrains, monter, planMontage,
  rapportGrains, transformerGrains, type Grain,
} from "../audio/grains";

const nom = (liste: readonly { id: string; fr: string; en: string }[], id: string, en: boolean): string => {
  const x = liste.find((o) => o.id === id);
  return x ? (en ? x.en : x.fr) : id;
};

/** Le rapport en clair : ce qui a été trouvé, puis ce qui en a été fait. */
function texteRapport(grains: readonly Grain[], joues: readonly Grain[], frequence: number, en: boolean): string {
  const r = rapportGrains(grains, joues, frequence);
  const l: string[] = [];
  l.push(en ? "GRAINS FOUND" : "GRAINS TROUVÉS");
  l.push("");
  l.push(`  ${(en ? "Found" : "Trouvés").padEnd(18)}${r.trouves}`);
  l.push(`  ${(en ? "Played" : "Joués").padEnd(18)}${r.joues}`);
  l.push(`  ${(en ? "Mean duration" : "Durée moyenne").padEnd(18)}${r.dureeMoyenneMs.toFixed(1)} ms`);
  l.push(`  ${(en ? "Mean gap" : "Écart moyen").padEnd(18)}${r.ecartMoyenMs.toFixed(1)} ms`);
  if (grains.length > 0) {
    l.push("");
    l.push(en ? "Onsets, in seconds" : "Départs, en secondes");
    const departs = grains.map((g) => (g.debut / frequence).toFixed(3));
    for (let i = 0; i < departs.length; i += 8) l.push(`  ${departs.slice(i, i + 8).join("  ")}`);
  }
  return l.join("\n");
}

export const fiches: FicheAudio[] = ([
  {
    id: "montage-grains", nom: "Montage par grains", nomEn: "Grain Editing",
    univers: "Traitement", famille: "Montage",
    resume: "Trouve les grains d'un son (chaque frappe, chaque syllabe) puis en retire, en répète, en inverse l'ordre ou les mélange, sans jamais couper au milieu d'un son.",
    resumeEn: "Finds a sound's grains (each hit, each syllable) then drops some, repeats them, reverses their order or shuffles them, never cutting in the middle of a sound.",
    notice: "Découpe un son en grains dont les frontières viennent du son lui-même, puis les remonte. D'après la famille `GRAIN` du Composers Desktop Project, développée par Trevor Wishart. Les frontières viennent du son et non d'une cadence réglée : chaque frappe d'un rythme, chaque syllabe d'une voix, chaque note d'un arpège devient un grain que l'on peut retirer, déplacer ou répéter sans jamais couper au milieu d'un son.\n\nLa détection tient à deux règles, et la seconde est celle qui fait le travail. La première sépare ce qui sonne de ce qui ne sonne pas, au seuil en décibels, avec l'enveloppe du rognage des silences. Mais cette règle échoue exactement là où le procédé sert : sur un roulement, une phrase tenue ou une nappe, l'enveloppe ne redescend jamais au silence et l'on obtient un grain unique de trente secondes. La seconde règle cherche donc les attaques à l'intérieur de ce qui sonne : une remontée franche de l'enveloppe après une retombée ouvre un grain, même sans silence devant.\n\nLa sensibilité dit de combien de décibels l'enveloppe doit remonter pour qu'on y voie une attaque. Sur un roulement dont les frappes tombent toutes les 240 millisecondes sous une décroissance de 250 : entre deux d'entre elles, l'enveloppe ne retombe que de 8,4 décibels. À neuf décibels de sensibilité, une frappe se cache dans la queue de la précédente ; à six, les huit ressortent. Le réglage s'ajuste au son qu'on lui donne ; il ne devine pas.\n\nL'écart minimal empêche une même attaque de compter plusieurs fois. Une attaque n'est pas un instant mais une montée de quelques millisecondes, où l'enveloppe tremble : sans lui, une seule frappe donne trois ou quatre grains, et toutes les manipulations deviennent inutilisables.\n\nLe mode « Compter seulement » annonce le nombre de grains sans les produire. L'opération ne touche pas au son et le rapport dit ce qui a été trouvé, combien de grains, leur durée moyenne, leur écart moyen, et la liste de leurs départs en secondes. C'est là qu'on règle le seuil et la sensibilité ; tout ce qui suit en dépend.\n\nL'espacement décide de ce que devient le rythme. « D'origine » repose chaque grain à l'instant où il a été trouvé : retirer une frappe sur deux laisse un trou à sa place, la durée ne bouge pas, et le rythme reste reconnaissable, ce qui éclaircit une boucle. « Serré » recolle les grains bout à bout : le son raccourcit d'autant et le rythme change. Le premier conserve la durée, le second la densité.\n\nInverser l'ordre retourne la suite des grains sans retourner les grains eux-mêmes : les frappes se succèdent à l'envers, chacune restant à l'endroit. C'est tout autre chose qu'une lecture inversée, qui rendrait chaque attaque en fin de son.",
    noticeEn: "Cuts a sound into grains whose boundaries come from the sound itself, then reassembles them. After the `GRAIN` family of the Composers Desktop Project, developed by Trevor Wishart. The boundaries come from the sound and not from a set rate: each hit of a rhythm, each syllable of a voice, each note of an arpeggio becomes a grain that can be dropped, moved or repeated without ever cutting in the middle of a sound.\n\nDetection rests on two rules, and the second does the work. The first separates what sounds from what does not, by a threshold in decibels, using the envelope of the silence trimming. But that rule fails exactly where the process is useful: on a roll, a held phrase or a pad, the envelope never falls back to silence, and a single thirty-second grain is obtained. The second rule therefore looks for attacks inside what sounds: a clear rise of the envelope after a fall opens a grain, with no silence in front of it.\n\nSensitivity says by how many decibels the envelope must rise for an attack to be seen. On a roll whose hits fall every 240 milliseconds under a 250 millisecond decay: between two of them the envelope only falls by 8.4 decibels. At nine decibels of sensitivity one hit hides in the previous one's tail; at six, all eight come out. The setting adjusts to the sound it is given; it does not guess.\n\nThe minimum gap prevents one attack from counting several times. An attack is not an instant but a rise of a few milliseconds, where the envelope wavers: without it a single hit gives three or four grains, and every manipulation becomes unusable.\n\n« Count only » announces the number of grains without producing them. The operation does not touch the sound, and the report says what was found, how many grains, their mean duration, their mean gap, and the list of their onsets in seconds. That is where threshold and sensitivity get set; everything that follows depends on them.\n\nSpacing decides what becomes of the rhythm. « As found » puts each grain back at the instant it was found: dropping one hit in two leaves a hole in its place, duration does not move, and the rhythm stays recognisable, which thins out a loop. « Butted » glues the grains end to end: the sound shortens accordingly and the rhythm changes. The first keeps duration, the second keeps density.\n\nReversing the order turns the sequence of grains around without turning the grains themselves: the hits follow one another backwards, each of them still forwards. That is a wholly different thing from reversed playback, which would put every attack at the end of its sound.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Opération", nomEn: "Operation", type: "choix",
        options: OPERATIONS.map((o) => o.fr), optionsEn: OPERATIONS.map((o) => o.en),
        optionIds: OPERATIONS.map((o) => o.id), defaut: "Compter seulement", defautEn: "Count only",
        doc: "Ce qu'on fait des grains une fois trouvés. « Compter seulement » ne touche pas au son : c'est par là qu'il faut commencer, pour régler la détection sur le rapport avant de manipuler quoi que ce soit. Les autres retirent, répètent, renversent l'ordre ou mélangent, et aucune ne coupe au milieu d'un son, puisqu'elles travaillent sur des grains entiers.",
        docEn: "What is done with the grains once found. « Count only » does not touch the sound: start there, to set detection against the report before manipulating anything. The others drop, repeat, reverse the order or shuffle, and none cuts in the middle of a sound, since they work on whole grains." },
      { nom: "Garder", nomEn: "Keep", type: "curseur", plage: [0, 8], pas: 1, defaut: 1,
        doc: "Pour « Garder n sur m » : combien de grains on garde dans chaque paquet. À un sur deux, une frappe sur deux disparaît ; à deux sur trois, une sur trois. Zéro rend le silence, ce qui est une réponse juste à une demande absurde.",
        docEn: "For « Keep n out of m »: how many grains are kept in each group. At one out of two, every other hit disappears; at two out of three, one in three. Zero returns silence, which is a fair answer to an absurd request." },
      { nom: "Sur", nomEn: "Out of", type: "curseur", plage: [1, 8], pas: 1, defaut: 2,
        doc: "La taille du paquet dans lequel on compte. Avec « Garder », il décide du motif : un sur deux éclaircit de moitié, trois sur quatre retire un grain sur quatre.",
        docEn: "The size of the group being counted in. With « Keep », it decides the pattern: one out of two thins by half, three out of four drops one grain in four." },
      { nom: "Répétitions", nomEn: "Repeats", type: "curseur", plage: [1, 8], pas: 1, defaut: 2,
        doc: "Pour « Répéter chacun » : combien de fois chaque grain est joué. En espacement d'origine, les copies se superposent au reste et s'additionnent ; en serré, elles allongent le son d'autant.",
        docEn: "For « Repeat each »: how many times each grain is played. With « As found » spacing, the copies overlap the rest and add up; butted, they lengthen the sound accordingly." },
      { nom: "Espacement", nomEn: "Spacing", type: "choix",
        options: ESPACEMENTS.map((e) => e.fr), optionsEn: ESPACEMENTS.map((e) => e.en),
        optionIds: ESPACEMENTS.map((e) => e.id), defaut: "D'origine", defautEn: "As found",
        doc: "Où les grains retombent. « D'origine » garde les instants trouvés dans le son : la durée ne bouge pas et le rythme reste reconnaissable, un grain retiré laissant un trou à sa place. « Serré » les recolle bout à bout : le son raccourcit et le rythme change. Le premier conserve la durée, le second la densité.",
        docEn: "Where the grains land. « As found » keeps the instants found in the sound: duration does not move and the rhythm stays recognisable, a dropped grain leaving a hole in its place. « Butted » glues them end to end: the sound shortens and the rhythm changes. The first keeps duration, the second keeps density." },
      { nom: "Seuil", nomEn: "Threshold", type: "curseur", plage: [-80, -20], pas: 1, defaut: -45, unite: "dBFS",
        doc: "En dessous de ce niveau, on considère qu'il n'y a pas de son. C'est le même seuil, sur la même enveloppe, que le rognage des silences. Un seuil trop haut ne trouve que les frappes fortes ; trop bas, il prend le souffle pour un grain.",
        docEn: "Below this level, there is deemed to be no sound. It is the same threshold, on the same envelope, as the silence trimmer. Too high and only the loud hits are found; too low and hiss is taken for a grain." },
      { nom: "Sensibilité", nomEn: "Sensitivity", type: "curseur", plage: [0, 24], pas: 1, defaut: 6, unite: "dB",
        doc: "De combien l'enveloppe doit remonter, après une retombée, pour qu'on y voie une attaque. C'est ce réglage qui sépare les frappes d'un roulement, dont l'enveloppe ne redescend jamais au silence. À zéro, la règle est désactivée et seuls les silences séparent les grains, ce qui rend un grain unique sur un son tenu.",
        docEn: "By how much the envelope must rise, after a fall, for an attack to be seen. This is the setting that separates the hits of a roll, whose envelope never falls back to silence. At zero the rule is off and only silences separate grains, which gives one single grain on a sustained sound." },
      { nom: "Écart minimal", nomEn: "Minimum gap", type: "curseur", plage: [1, 500], pas: 1, defaut: 40, unite: "ms",
        doc: "Deux grains ne peuvent pas commencer à moins de cet écart. Une attaque n'est pas un instant mais une montée de quelques millisecondes où l'enveloppe tremble : sans cet écart, une seule frappe donne trois ou quatre grains.",
        docEn: "Two grains cannot start closer than this. An attack is not an instant but a rise of a few milliseconds where the envelope wavers: without this gap, a single hit gives three or four grains." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Le tirage du mélange. La même graine rejoue exactement le même ordre, ce qui permet de retrouver un résultat qu'on avait aimé.",
        docEn: "The shuffle's draw. The same seed replays exactly the same order, which is what makes a result you liked findable again." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: en ? "No input." : "Aucune entrée." };
      }
      const frequence = audio.sampleRate;
      const canaux = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c));
      const grains = detecterGrains(canaux[0], {
        frequence,
        seuilDb: ctx.paramNombre("Seuil", -45),
        ecartMinMs: ctx.paramNombre("Écart minimal", 40),
        monteeDb: ctx.paramNombre("Sensibilité", 6),
      });

      const demandee = ctx.paramTexte("Opération", "compter");
      const operation = EST_OPERATION(demandee) ? demandee : "compter";
      const espacementDemande = ctx.paramTexte("Espacement", "origine");
      const espacement = EST_ESPACEMENT(espacementDemande) ? espacementDemande : "origine";
      const joues = transformerGrains(grains, {
        operation,
        garder: ctx.paramNombre("Garder", 1),
        sur: ctx.paramNombre("Sur", 2),
        repetitions: ctx.paramNombre("Répétitions", 2),
        aleatoire: creerAleatoire(Math.max(1, Math.round(ctx.paramNombre("Graine", 42)))),
      });

      const rapport = texteRapport(grains, joues, frequence, en);
      // « Compter seulement » rend le son tel quel : un nœud de mesure ne doit rien changer à ce
      // qu'il mesure, et c'est ce qui permet de le laisser en place une fois le réglage trouvé.
      if (operation === "compter" || grains.length === 0) {
        const r = rapportGrains(grains, joues, frequence);
        return {
          valeurs: [audio, rapport],
          message: grains.length === 0
            ? (en ? "No grain found: lower the threshold, or the sensitivity."
                  : "Aucun grain trouvé : baissez le seuil, ou la sensibilité.")
            : `${r.trouves} ${en ? "grains" : "grains"} · ${en ? "mean gap" : "écart moyen"} ${r.ecartMoyenMs.toFixed(0)} ms`,
        };
      }

      // Retirer et répéter demandent que chaque grain reste à SA place ; mélanger et inverser
      // demandent l'inverse, puisque leur objet est qu'un grain tombe à la place d'un autre.
      const surPlace = operation === "garder" || operation === "repeter";
      const plan = planMontage(grains, joues, espacement, surPlace);
      const longueurMin = espacement === "origine" ? audio.length : 0;
      const sorties = monter(canaux, plan, longueurMin);
      const sortie = new AudioBuffer({
        numberOfChannels: sorties.length,
        length: Math.max(1, sorties[0].length),
        sampleRate: frequence,
      });
      for (let c = 0; c < sorties.length; c++) sortie.copyToChannel(new Float32Array(sorties[c]), c);

      const r = rapportGrains(grains, joues, frequence);
      return {
        valeurs: [sortie, rapport],
        message: [
          `${nom(OPERATIONS, operation, en)} · ${nom(ESPACEMENTS, espacement, en)}`,
          `${r.trouves} ${en ? "found" : "trouvés"} · ${r.joues} ${en ? "played" : "joués"} · ${(audio.duration).toFixed(2)} s → ${sortie.duration.toFixed(2)} s`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
