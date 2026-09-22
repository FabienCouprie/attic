// plugins/ssp.ts — Le nœud « SSP (Koenig) ». La méthode est dans `audio/ssp.ts`, avec ses preuves ;
// ici, la prise.
//
// POURQUOI LES ENSEMBLES SONT DES CHAMPS DE TEXTE ET NON DES CURSEURS. Chez Koenig, le compositeur
// ne règle pas un paramètre : il DONNE une liste de nombres, qui est son matériau. Un curseur
// imposerait une échelle continue et une notion de « plus » et de « moins » qui n'ont pas cours —
// l'ensemble {5, 9, 17, 33, 65} n'est pas plus grand que {40, 80, 160}, il est autre. Écrire la
// liste à la main est la seule interface fidèle, et c'est aussi la plus directe.
//
// POURQUOI LE RAPPORT DIT L'AIGU ET LA CRÊTE QU'ON A OBTENUS. SSP ne possède aucun réglage de
// hauteur : la hauteur qu'on entend est une conséquence des durées écrites, et rien dans la fiche
// ne permet de la prévoir de tête. Le rapport la mesure donc après coup, ce qui est la seule façon
// honnête de rendre ce procédé utilisable sans le trahir.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  AMPLITUDES_DEFAUT, EST_PRINCIPE, PRINCIPES, TEMPS_DEFAUT,
  centroideHz, composer, creteDb, lireEnsemble, nomPrincipe, type Principe,
} from "../audio/ssp";

const optionsPrincipe = () => ({
  type: "choix" as const,
  options: PRINCIPES.map((p) => p.fr),
  optionsEn: PRINCIPES.map((p) => p.en),
  optionIds: PRINCIPES.map((p) => p.id),
});

export const fiches: FicheAudio[] = ([
  {
    id: "ssp-koenig", nom: "SSP (Koenig)", nomEn: "SSP (Koenig)",
    univers: "Entrées", famille: "Génération",
    resume: "Compose la forme d'onde comme on compose une pièce : deux listes de nombres, des principes pour y puiser, et le son est le trait qui relie les points obtenus.",
    resumeEn: "Composes the waveform the way one composes a piece: two lists of numbers, principles for drawing from them, and the sound is the line joining the resulting points.",
    notice: "D'après Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institut de sonologie d'Utrecht, années 1970, dont les principes de sélection viennent de ses programmes Projet 1 (1964) et Projet 2 (1966). Voir aussi Luc Döbereiner, « Models of Constructed Sound : Nonstandard Synthesis as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.\n\nCe que « non standard » veut dire. Toute la synthèse ordinaire part d'un modèle : un oscillateur, une forme d'onde, un spectre, une enveloppe, un instrument. Ici il n'y a rien de tout cela. Vous donnez deux listes de nombres — des amplitudes et des durées — et des principes pour y puiser. Les couples ainsi tirés sont des points, et le son est le trait qui les relie. Pas de hauteur, pas de note, pas de timbre : la hauteur qu'on entendra est une conséquence des durées écrites, jamais un réglage.\n\nLa thèse de Koenig, et ce qui rend ce nœud différent des autres. Les mêmes principes valent à toutes les échelles : ce qui ordonne les points d'une forme d'onde ordonne aussi les sections d'une pièce. C'est pourquoi le même choix de cinq mots est offert pour les amplitudes, pour les durées et pour l'ordre des sections. Une série veut dire exactement la même chose aux trois échelles — chaque élément une fois avant qu'aucun ne repasse —, et cela s'entend.\n\nL'avertissement qu'il faut donner. SSP a la réputation d'être impossible à diriger. Koenig lui-même a constaté que le programme résistait à l'intention musicale, et l'écrasante majorité des réglages rend du bruit. Mais deux choses se commandent vraiment, et elles se mesurent. Les durées font l'aigu : mesuré, le centre de gravité du spectre va de 9 Hz pour des durées de mille échantillons à 4 419 Hz pour des durées de deux ou trois, soit près de cinq cents pour un. Les amplitudes font la crête : de 1,81 dB pour deux valeurs extrêmes à 8,38 dB pour beaucoup de petites et une grande. Et les deux axes sont séparés — changer les amplitudes ne déplace pas l'aigu, changer les durées ne change pas la crête —, ce qui interdit de dire que ce nœud n'aurait qu'un seul bouton à bruit.\n\nComment s'en servir sans se perdre. Écrivez d'abord des durées, qui décident de la région où le son se tiendra : autour de trois échantillons pour un sifflement aigu, autour de cinquante pour un registre médian, au-delà de cinq cents pour des reliefs qu'on entend défiler plutôt que sonner. Écrivez ensuite des amplitudes, qui décident du relief : deux valeurs extrêmes donnent un son plein et droit, un mélange de petites et de grandes donne un son creusé. Les principes viennent en dernier, et c'est là que la composition commence.\n\nUn cas à connaître. Une tendance appliquée aux amplitudes dessine une rampe qui traverse l'ensemble d'un bout à l'autre, et non un son : à l'échelle d'une section entière, cela ne s'entend que comme un déplacement lent. La tendance prend tout son sens à l'échelle de la forme, où Koenig l'employait d'ailleurs.\n\nÀ graine égale, le nœud rend deux fois le même son ; à graine différente, deux sons sans rapport tirés du même matériau.",
    noticeEn: "After Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institute of Sonology, Utrecht, in the 1970s, whose selection principles come from his programs Project 1 (1964) and Project 2 (1966). See also Luc Dobereiner, « Models of Constructed Sound: Nonstandard Synthesis as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.\n\nWhat « nonstandard » means. All ordinary synthesis starts from a model: an oscillator, a waveform, a spectrum, an envelope, an instrument. Here there is none of that. You give two lists of numbers — amplitudes and durations — and principles for drawing from them. The pairs so drawn are points, and the sound is the line joining them. No pitch, no note, no timbre: the pitch you will hear is a consequence of the durations you wrote, never a setting.\n\nKoenig's thesis, and what makes this node unlike the others. The same principles hold at every scale: what orders the points of a waveform also orders the sections of a piece. That is why the same choice of five words is offered for the amplitudes, for the durations and for the order of the sections. A series means exactly the same thing at all three scales — each element once before any repeats — and you can hear it.\n\nThe warning that must be given. SSP has a reputation for being impossible to steer. Koenig himself found that the program resisted musical intention, and the overwhelming majority of settings return noise. But two things really are under your command, and they can be measured. The durations make the treble: measured, the spectrum's centre of gravity runs from 9 Hz for durations of a thousand samples to 4,419 Hz for durations of two or three, close to five hundred to one. The amplitudes make the crest: from 1.81 dB for two extreme values to 8.38 dB for many small ones and one large. And the two axes are separate — changing the amplitudes does not move the treble, changing the durations does not change the crest — which forbids saying that this node has but a single noise knob.\n\nHow to use it without getting lost. Write the durations first, which decide the region where the sound will sit: around three samples for a high whistle, around fifty for a middle register, beyond five hundred for reliefs you hear going past rather than sounding. Then write the amplitudes, which decide the relief: two extreme values give a full, straight sound, a mixture of small and large gives a hollowed one. The principles come last, and that is where composition begins.\n\nOne case worth knowing. A tendency applied to the amplitudes draws a ramp crossing the set from end to end, not a sound: at the scale of a whole section it is heard only as a slow drift. Tendency comes into its own at the scale of form, which is where Koenig used it.\n\nAt equal seed the node returns the same sound twice; at a different seed, two unrelated sounds drawn from the same material.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Amplitudes", nomEn: "Amplitudes", type: "texte", defaut: AMPLITUDES_DEFAUT.join(", "),
        placeholder: "-1, -0.6, -0.2, 0.2, 0.6, 1", placeholderEn: "-1, -0.6, -0.2, 0.2, 0.6, 1",
        doc: "La liste des amplitudes où puiser, entre −1 et 1, séparées par des virgules. C'est votre matériau, et non un réglage : l'ensemble n'est pas plus grand ou plus petit qu'un autre, il est autre. Deux valeurs extrêmes donnent un son plein et droit, dont la crête tombe sous 2 dB ; beaucoup de petites valeurs et une grande donnent un son creusé, dont la crête dépasse 8 dB. Une saisie vide ou illisible retombe sur la liste d'origine.",
        docEn: "The list of amplitudes to draw from, between -1 and 1, separated by commas. It is your material, not a setting: one set is not larger or smaller than another, it is other. Two extreme values give a full, straight sound whose crest falls below 2 dB; many small values and one large give a hollowed sound whose crest exceeds 8 dB. An empty or unreadable entry falls back on the original list." },
      { nom: "Durées", nomEn: "Durations", type: "texte", defaut: TEMPS_DEFAUT.join(", "),
        placeholder: "5, 9, 17, 33, 65", placeholderEn: "5, 9, 17, 33, 65",
        doc: "La liste des écarts entre deux points, en échantillons. C'est le seul endroit d'où vienne la hauteur, et il n'en existe aucun autre : autour de trois échantillons, le son siffle vers 4 kHz ; autour de cinquante, il se tient dans le médian ; au-delà de cinq cents, on entend des reliefs défiler plutôt que sonner. Le rapport mesure après coup l'aigu obtenu, puisque rien ici ne permet de le prévoir de tête.",
        docEn: "The list of gaps between two points, in samples. It is the only place pitch comes from, and there is no other: around three samples the sound whistles near 4 kHz; around fifty it sits in the middle register; beyond five hundred you hear reliefs going past rather than sounding. The report measures the treble obtained afterwards, since nothing here lets you predict it in your head." },
      { nom: "Principe des amplitudes", nomEn: "Amplitude principle", ...optionsPrincipe(),
        defaut: "Aléa", defautEn: "Alea",
        doc: "Comment puiser dans la liste des amplitudes. Aléa tire au hasard et peut répéter. Série épuise la liste avant de la reprendre, ce qui interdit toute répétition immédiate. Séquence suit l'ordre écrit, sans s'en écarter. Groupe tient chaque valeur deux à cinq fois de suite, et l'on entend alors des paliers là où l'aléa ne fait entendre qu'un grésillement. Tendance fait dériver la fenêtre de tirage d'un bout à l'autre de la liste — appliquée aux amplitudes, elle dessine une rampe plutôt qu'un son.",
        docEn: "How to draw from the amplitude list. Alea draws at random and may repeat. Series exhausts the list before starting over, which forbids any immediate repeat. Sequence follows the written order, never departing from it. Group holds each value two to five times in a row, and you then hear steps where alea only makes a sizzle. Tendency drifts the drawing window from one end of the list to the other — applied to amplitudes, it draws a ramp rather than a sound." },
      { nom: "Principe des durées", nomEn: "Duration principle", ...optionsPrincipe(),
        defaut: "Aléa", defautEn: "Alea",
        doc: "Comment puiser dans la liste des durées. Le même vocabulaire, appliqué au temps : une séquence sur les durées donne une périodicité stricte, donc une hauteur franche ; un aléa la dissout ; un groupe tient une vitesse plusieurs points de suite avant d'en changer, ce qui fait entendre des paliers de registre.",
        docEn: "How to draw from the duration list. The same vocabulary applied to time: a sequence on the durations gives strict periodicity, hence a clear pitch; alea dissolves it; group holds one speed for several points before changing, which makes register steps audible." },
      { nom: "Principe de la forme", nomEn: "Form principle", ...optionsPrincipe(),
        defaut: "Série", defautEn: "Series",
        doc: "Comment ordonner les sections, et c'est ici que la thèse de Koenig se vérifie au lieu de se proclamer. Le même mot veut dire la même chose qu'à l'échelle de l'échantillon : une série fait passer chaque section une fois avant qu'aucune ne repasse, un groupe tient la même plusieurs fois, une tendance va des premières vers les dernières. Le rapport donne l'ordre obtenu.",
        docEn: "How to order the sections, and this is where Koenig's thesis is verified instead of proclaimed. The same word means the same thing as at the sample scale: a series has each section pass once before any repeats, a group holds the same one several times, a tendency moves from the first towards the last. The report gives the resulting order." },
      { nom: "Sections", nomEn: "Sections", type: "curseur", plage: [1, 24], pas: 1, defaut: 4,
        doc: "Combien de sections distinctes composer avant de les ordonner. À une seule, la pièce est d'un seul tenant et le principe de la forme n'a plus d'objet. Au-delà d'une douzaine, chaque section devient trop brève pour qu'on l'identifie, et l'ordre cesse de s'entendre.",
        docEn: "How many distinct sections to compose before ordering them. At one, the piece is of a single piece and the form principle has nothing to act on. Beyond a dozen, each section becomes too brief to be identified, and the order stops being audible." },
      { nom: "Reliure", nomEn: "Joining", type: "choix",
        options: ["Trait", "Marches"], optionsEn: ["Line", "Steps"], optionIds: ["trait", "marches"],
        defaut: "Trait", defautEn: "Line",
        doc: "Ce qui se passe entre deux points, et c'est la seule décision de timbre que la méthode connaisse. Le trait les relie et le signal passe par toutes les valeurs intermédiaires. Les marches tiennent chaque amplitude jusqu'au point suivant, si bien que le signal ne prend jamais que les valeurs que vous avez écrites. Mesuré à points identiques, la crête passe de 5,14 à 3,34 dB : c'est un son plus plein, et plus dur.",
        docEn: "What happens between two points, and it is the only timbre decision the method knows. The line joins them and the signal passes through every intermediate value. Steps hold each amplitude until the next point, so the signal only ever takes the values you wrote. Measured on identical points, the crest goes from 5.14 to 3.34 dB: a fuller sound, and a harder one." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 60], pas: 0.5, defaut: 8, unite: "s",
        doc: "La durée de la pièce. Elle se répartit entre les sections, qui sont donc d'autant plus brèves qu'on en demande.",
        docEn: "The duration of the piece. It is shared among the sections, which are therefore the briefer the more you ask for." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 9999], pas: 1, defaut: 7,
        doc: "Deux graines donnent deux sons sans rapport tirés du même matériau. À graine égale, le nœud rend deux fois exactement le même son, ce qui permet de retrouver un tirage qu'on avait aimé.",
        docEn: "Two seeds give two unrelated sounds drawn from the same material. At equal seed the node returns exactly the same sound twice, which lets you find again a draw you had liked." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const frequence = 44100;
      const principe = (nom: string, defaut: Principe): Principe => {
        const choix = ctx.paramTexte(nom, defaut);
        return EST_PRINCIPE(choix) ? choix : defaut;
      };
      const amplitudes = lireEnsemble(ctx.paramTexte("Amplitudes", ""), AMPLITUDES_DEFAUT)
        // Les amplitudes sont ramenées dans le gabarit sans être redistribuées : une valeur écrite
        // à 3 devient 1, et non l'ensemble divisé par trois, qui changerait tout le reste.
        .map((v) => Math.max(-1, Math.min(1, v)));
      const temps = lireEnsemble(ctx.paramTexte("Durées", ""), TEMPS_DEFAUT)
        .map((v) => Math.max(1, Math.round(v)));

      const debut = performance.now();
      const composition = composer({
        frequence,
        duree: Math.max(0.1, ctx.paramNombre("Durée", 8)),
        sections: Math.max(1, Math.round(ctx.paramNombre("Sections", 4))),
        amplitudes, temps,
        principeAmplitudes: principe("Principe des amplitudes", "alea"),
        principeTemps: principe("Principe des durées", "alea"),
        principeForme: principe("Principe de la forme", "serie"),
        interpole: ctx.paramTexte("Reliure", "trait") !== "marches",
        graine: Math.max(1, Math.round(ctx.paramNombre("Graine", 7))),
      });
      const millisecondes = performance.now() - debut;

      const buffer = new AudioBuffer({ numberOfChannels: 1, length: Math.max(1, composition.son.length), sampleRate: frequence });
      buffer.copyToChannel(new Float32Array(composition.son), 0);

      const aigu = centroideHz(composition.son, frequence);
      const crete = creteDb(composition.son);
      const lignes: string[] = [];
      const colonne = (fr: string, enn: string, valeur: string) => `  ${(en ? enn : fr).padEnd(24)}${valeur}`;
      lignes.push(en ? "Nonstandard synthesis" : "Synthèse non standard");
      lignes.push("");
      lignes.push(colonne("Amplitudes", "Amplitudes", amplitudes.join(", ")));
      lignes.push(colonne("Durées", "Durations", `${temps.join(", ")} ${en ? "samples" : "échantillons"}`));
      lignes.push("");
      lignes.push(colonne("Points posés", "Points placed", String(composition.pointsPoses)));
      lignes.push(colonne("Écart moyen", "Mean gap", `${composition.dureeMoyenne.toFixed(1)} ${en ? "samples" : "éch."}`));
      lignes.push(colonne("Aigu obtenu", "Treble obtained", `${aigu.toFixed(0)} Hz`));
      lignes.push(colonne("Facteur de crête", "Crest factor", `${crete.toFixed(2)} dB`));
      lignes.push(colonne("Calculé en", "Computed in", `${Math.round(millisecondes)} ms`));
      lignes.push("");
      lignes.push(`  ${en ? "Order of sections" : "Ordre des sections"} (${nomPrincipe(principe("Principe de la forme", "serie"), en)})`);
      lignes.push(`    ${composition.ordre.map((r) => r + 1).join(" · ")}`);
      lignes.push("");
      lignes.push(`  ${en ? "First points" : "Premiers points"}`);
      for (const p of composition.points.slice(0, 10)) {
        lignes.push(`    ${p.amplitude.toFixed(2).padStart(6)}  ${en ? "held" : "tenu"} ${String(p.duree).padStart(5)} ${en ? "samples" : "éch."}`);
      }
      lignes.push("");
      lignes.push(en
        ? "  Pitch is a consequence of the durations, never a setting."
        : "  La hauteur est une conséquence des durées, jamais un réglage.");

      return {
        valeurs: [buffer, lignes.join("\n")],
        message: [
          `${composition.pointsPoses} ${en ? "points" : "points"} · ${aigu.toFixed(0)} Hz · ${crete.toFixed(1)} dB`,
          `${Math.round(millisecondes)} ms`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
