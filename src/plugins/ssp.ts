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

import { fiche, type NomDeReglage } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante, traduire } from "../i18n";
import { avecDoc } from "./notices";
import { frequenceDeTravail } from "../audio/frequence-de-travail";
import {
  AMPLITUDES_DEFAUT, EST_PRINCIPE, PRINCIPES, TEMPS_DEFAUT,
  centroideHz, composer, creteDb, lireEnsemble, type Principe,
} from "../audio/ssp";
import { etatEnBref, rapportSsp } from "../audio/ssp-rapport";

const optionsPrincipe = () => ({
  type: "choix" as const,
  options: PRINCIPES.map((p) => p.fr),
  optionsEn: PRINCIPES.map((p) => p.en),
  optionIds: PRINCIPES.map((p) => p.id),
});

export const fiches: FicheAudio[] = ([
  fiche({
    id: "ssp-koenig", nom: "SSP (Koenig)", nomEn: "SSP (Koenig)",
    univers: "Entrées", famille: "Génération",
    resume: "Compose la forme d'onde comme on compose une pièce : deux listes de nombres, des principes pour y puiser, et le son est le trait qui relie les points obtenus.",
    resumeEn: "Composes the waveform the way one composes a piece: two lists of numbers, principles for drawing from them, and the sound is the line joining the resulting points.",
    notice: "Synthétise un son point par point, sans modèle de forme d'onde : deux listes de nombres, des amplitudes et des durées, et des principes pour y puiser. D'après Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institut de sonologie d'Utrecht, années 1970, dont les principes de sélection viennent de ses programmes Projet 1 (1964) et Projet 2 (1966). Voir aussi Luc Döbereiner, « Models of Constructed Sound : Nonstandard Synthesis as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.\n\nCe que « non standard » veut dire. Toute la synthèse ordinaire part d'un modèle : un oscillateur, une forme d'onde, un spectre, une enveloppe, un instrument. Ici il n'y a rien de tout cela. Le composant prend deux listes de nombres, des amplitudes et des durées, et des principes pour y puiser. Les couples ainsi tirés sont des points, et le son est le trait qui les relie. Pas de hauteur, pas de note, pas de timbre : la hauteur qu'on entendra est une conséquence des durées écrites, jamais un réglage.\n\nLa thèse de Koenig. Les mêmes principes valent à toutes les échelles : ce qui ordonne les points d'une forme d'onde ordonne aussi les sections d'une pièce. C'est pourquoi le même choix de cinq mots est offert pour les amplitudes, pour les durées et pour l'ordre des sections. Une série veut dire exactement la même chose aux trois échelles, chaque élément une fois avant qu'aucun ne repasse.\n\nChaque section puise dans sa propre sélection des deux listes, tirée à la graine : la plus basse et la plus haute des amplitudes, une part des autres, et une part des durées, dans l'ordre écrit. Les principes des amplitudes et des durées puisent ensuite dans cette sélection, et le principe de la forme ordonne des sections qui ne sonnent pas pareil. Avec une seule section, la sélection est la liste entière.\n\nCe qui décide qu'une onde soit tenue ou bruitée est l'ordre dans lequel les deux listes sont parcourues, et non ce qu'elles contiennent. « Séquence » parcourt une liste dans l'ordre écrit ; les quatre autres principes en rebattent l'ordre à chaque passage, de sorte que la suite des points ne se répète jamais, et le son est un bruit coloré dont les durées fixent la couleur sans lui rendre de hauteur. Une onde tenue demande donc deux réglages ensemble : « Principe des amplitudes » sur « Séquence », et les durées non rebattues non plus, soit « Principe des durées » sur « Séquence », soit une seule durée dans la sélection de la section. En « Séquence » aux deux, chaque section tient sa propre onde, à sa propre hauteur. La ligne « Onde » du rapport compte les sections posées qui tiennent une onde et nomme le réglage qui manque aux autres ; le bloc « Sections » donne la sélection et l'onde de chacune. Une liste d'amplitudes d'une seule valeur rend un signal constant, et le rapport le dit constant.\n\nKoenig a constaté que le programme résistait à l'intention musicale, et l'écrasante majorité des réglages rend du bruit. Deux grandeurs se commandent. Sur une section, qui garde les listes entières, les durées font l'aigu : le centre de gravité du spectre va de 10 Hz pour des durées de mille échantillons à 4 420 Hz pour des durées de deux ou trois, soit plus de quatre cents pour un. Les amplitudes font la crête : de 1,76 dB pour deux valeurs extrêmes à 8,51 dB pour beaucoup de petites et une grande. Et les deux axes sont séparés, changer les amplitudes ne déplace pas l'aigu, changer les durées ne change pas la crête. Sur plusieurs sections, chacune ne garde qu'une part des amplitudes, et la crête change d'une section à l'autre.\n\nL'ordre de travail. Les durées décident de la région où le son se tiendra : autour de trois échantillons pour un sifflement aigu, autour de cinquante pour un registre médian, au-delà de cinq cents pour des reliefs qu'on entend défiler plutôt que sonner. Les amplitudes décident du relief : deux valeurs extrêmes donnent un son plein et droit, un mélange de petites et de grandes donne un son creusé. Les principes viennent en dernier.\n\nLa fenêtre d'une tendance couvre un tiers de la liste, et jamais moins de deux éléments ; elle glisse d'un bout à l'autre au cours de la section, chaque position tenant une part égale de sa durée. Appliquée aux amplitudes, elle dessine une rampe qui traverse l'ensemble, et non un son : à l'échelle d'une section entière, cela ne s'entend que comme un déplacement lent. Appliquée aux durées, elle fait descendre le registre des plus brèves aux plus longues. Sur une liste de deux éléments, la fenêtre la couvre entière, et la tendance tire comme l'aléa. La tendance agit à l'échelle de la forme, où Koenig l'employait.\n\nÀ graine égale, le composant rend deux fois le même son ; à graine différente, d'autres sélections et d'autres tirages dans le même matériau.",
    noticeEn: "Synthesises a sound point by point, with no waveform model: two lists of numbers, amplitudes and durations, and principles for drawing from them. After Gottfried Michael Koenig, « Sound Synthesis Program » (SSP), Institute of Sonology, Utrecht, in the 1970s, whose selection principles come from his programs Project 1 (1964) and Project 2 (1966). See also Luc Dobereiner, « Models of Constructed Sound: Nonstandard Synthesis as an Aesthetic Perspective », Computer Music Journal 35(3), 2011.\n\nWhat « nonstandard » means. All ordinary synthesis starts from a model: an oscillator, a waveform, a spectrum, an envelope, an instrument. Here there is none of that. The node takes two lists of numbers, amplitudes and durations, and principles for drawing from them. The pairs so drawn are points, and the sound is the line joining them. No pitch, no note, no timbre: the pitch heard is a consequence of the durations written, never a setting.\n\nKoenig's thesis. The same principles hold at every scale: what orders the points of a waveform also orders the sections of a piece. That is why the same choice of five words is offered for the amplitudes, for the durations and for the order of the sections. A series means exactly the same thing at all three scales, each element once before any repeats.\n\nEach section draws from its own selection of the two lists, drawn from the seed: the lowest and the highest amplitude, a share of the others, and a share of the durations, in the written order. The amplitude and duration principles then draw from that selection, and the form principle orders sections that do not sound alike. With a single section, the selection is the whole list.\n\nWhat decides whether a wave is held or noisy is the order in which the two lists are run through, not what they contain. « Sequence » runs through a list in the written order; the four other principles reshuffle that order at each pass, so the point sequence never repeats, and the sound is a coloured noise whose colour the durations set without giving it a pitch. A held wave therefore takes two settings together: « Amplitude principle » on « Sequence », and the durations not reshuffled either, so either « Duration principle » on « Sequence » or a single duration in the section's selection. With « Sequence » on both, each section holds its own wave, at its own pitch. The « Wave » line of the report counts the sections placed that hold a wave and names the setting the others are missing; the « Sections » block gives the selection and the wave of each. An amplitude list of a single value returns a constant signal, and the report calls it constant.\n\nKoenig found that the program resisted musical intention, and the overwhelming majority of settings return noise. Two quantities are under command. On a single section, which keeps the whole lists, the durations make the treble: the spectrum's centre of gravity runs from 10 Hz for durations of a thousand samples to 4,420 Hz for durations of two or three, over four hundred to one. The amplitudes make the crest: from 1.76 dB for two extreme values to 8.51 dB for many small ones and one large. And the two axes are separate: changing the amplitudes does not move the treble, changing the durations does not change the crest. On several sections, each keeps only a share of the amplitudes, and the crest changes from one section to the next.\n\nThe durations decide the region where the sound will sit: around three samples for a high whistle, around fifty for a middle register, beyond five hundred for reliefs you hear going past rather than sounding. The amplitudes decide the relief: two extreme values give a full, straight sound, a mixture of small and large gives a hollowed one. The principles come last.\n\nThe window of a tendency covers a third of the list, and never fewer than two elements; it slides from one end to the other over the section, each position holding an equal share of its length. Applied to the amplitudes, it draws a ramp crossing the set, not a sound: at the scale of a whole section it is heard only as a slow drift. Applied to the durations, it lowers the register from the briefest to the longest. On a list of two elements, the window covers all of it, and the tendency draws like alea. Tendency acts at the scale of form, which is where Koenig used it.\n\nAt equal seed the node returns the same sound twice; at a different seed, other selections and other draws from the same material.",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      { nom: "Amplitudes", nomEn: "Amplitudes", type: "texte", defaut: AMPLITUDES_DEFAUT.join(", "),
        placeholder: "-1, -0.6, -0.2, 0.2, 0.6, 1", placeholderEn: "-1, -0.6, -0.2, 0.2, 0.6, 1",
        doc: "La liste des amplitudes où puiser, entre −1 et 1, séparées par des virgules. C'est votre matériau, et non un réglage : l'ensemble n'est pas plus grand ou plus petit qu'un autre, il est autre. Sur une section, deux valeurs extrêmes donnent un son plein et droit, dont la crête tombe sous 2 dB ; beaucoup de petites valeurs et une grande donnent un son creusé, dont la crête dépasse 8 dB. Chaque section garde toujours la plus basse et la plus haute. Une liste vide, un jeton illisible ou une amplitude hors de −1 à 1 fait refuser le composant, et le message le nomme.",
        docEn: "The list of amplitudes to draw from, between -1 and 1, separated by commas. It is your material, not a setting: one set is not larger or smaller than another, it is other. On a single section, two extreme values give a full, straight sound whose crest falls below 2 dB; many small values and one large give a hollowed sound whose crest exceeds 8 dB. Each section always keeps the lowest and the highest. An empty list, an unreadable token or an amplitude outside -1 to 1 makes the node refused, and the message names it." },
      { nom: "Durées", nomEn: "Durations", type: "texte", defaut: TEMPS_DEFAUT.join(", "),
        placeholder: "5, 9, 17, 33, 65", placeholderEn: "5, 9, 17, 33, 65",
        doc: "La liste des écarts entre deux points, en échantillons. C'est le seul endroit d'où vienne la hauteur, et il n'en existe aucun autre : autour de trois échantillons, le son siffle vers 4 kHz ; autour de cinquante, il se tient dans le médian ; au-delà de cinq cents, on entend des reliefs défiler plutôt que sonner. Le rapport mesure après coup l'aigu obtenu, puisque rien ici ne permet de le prévoir de tête. Une durée s'écrit d'un nombre entier d'échantillons, au moins 1 ; une liste vide, un jeton illisible ou une autre durée fait refuser le composant, et le message le nomme.",
        docEn: "The list of gaps between two points, in samples. It is the only place pitch comes from, and there is no other: around three samples the sound whistles near 4 kHz; around fifty it sits in the middle register; beyond five hundred you hear reliefs going past rather than sounding. The report measures the treble obtained afterwards, since nothing here lets you predict it in your head. A duration is written as a whole number of samples, at least 1; an empty list, an unreadable token or any other duration makes the node refused, and the message names it." },
      { nom: "Principe des amplitudes", nomEn: "Amplitude principle", ...optionsPrincipe(),
        defaut: "Aléa", defautEn: "Alea",
        doc: "Comment puiser dans la liste des amplitudes. Aléa tire au hasard et peut répéter. Série épuise la liste avant de la reprendre, ce qui interdit toute répétition immédiate. Séquence suit l'ordre écrit, sans s'en écarter, et c'est la première des deux conditions d'une onde tenue. Groupe tient chaque valeur deux à cinq fois de suite, et l'on entend alors des paliers là où l'aléa ne fait entendre qu'un grésillement. Tendance fait dériver la fenêtre de tirage d'un bout à l'autre de la liste, appliquée aux amplitudes, elle dessine une rampe plutôt qu'un son.",
        docEn: "How to draw from the amplitude list. Alea draws at random and may repeat. Series exhausts the list before starting over, which forbids any immediate repeat. Sequence follows the written order, never departing from it, and that is the first of the two conditions for a held wave. Group holds each value two to five times in a row, and you then hear steps where alea only makes a sizzle. Tendency drifts the drawing window from one end of the list to the other, applied to amplitudes, it draws a ramp rather than a sound." },
      { nom: "Principe des durées", nomEn: "Duration principle", ...optionsPrincipe(),
        defaut: "Aléa", defautEn: "Alea",
        doc: "Comment puiser dans la liste des durées. Le même vocabulaire, appliqué au temps : une séquence sur les durées laisse l'écart entre deux points se répéter à l'identique, ce qui est la seconde condition d'une onde tenue, la première étant une séquence sur les amplitudes ; un aléa la dissout ; un groupe tient une vitesse plusieurs points de suite avant d'en changer, ce qui fait entendre des paliers de registre. Avec une seule durée, écrite ou tirée dans la sélection d'une section, ce réglage n'a plus rien à rebattre et la condition est acquise quel qu'il soit.",
        docEn: "How to draw from the duration list. The same vocabulary applied to time: a sequence on the durations lets the gap between two points repeat identically, which is the second condition for a held wave, the first being a sequence on the amplitudes; alea dissolves it; group holds one speed for several points before changing, which makes register steps audible. With a single duration, written or drawn in a section's selection, this setting has nothing left to reshuffle and the condition is met whatever it is." },
      { nom: "Principe de la forme", nomEn: "Form principle", ...optionsPrincipe(),
        defaut: "Série", defautEn: "Series",
        doc: "Comment ordonner les sections, et c'est ici que la thèse de Koenig se vérifie au lieu de se proclamer. Le même mot veut dire la même chose qu'à l'échelle de l'échantillon : une série fait passer chaque section une fois avant qu'aucune ne repasse, un groupe tient la même plusieurs fois, une tendance va des premières vers les dernières. À deux sections, la fenêtre de la tendance les couvre toutes deux, et elle tire comme l'aléa. Le rapport donne l'ordre obtenu.",
        docEn: "How to order the sections, and this is where Koenig's thesis is verified instead of proclaimed. The same word means the same thing as at the sample scale: a series has each section pass once before any repeats, a group holds the same one several times, a tendency moves from the first towards the last. With two sections, the tendency's window covers both, and it draws like alea. The report gives the resulting order." },
      { nom: "Sections", nomEn: "Sections", type: "curseur", plage: [1, 24], pas: 1, defaut: 4,
        doc: "Combien de sections distinctes composer avant de les ordonner, chacune avec sa propre sélection dans les deux listes. À une seule, la section garde les listes entières, la pièce est d'un seul tenant et le principe de la forme n'a plus d'objet. Au-delà d'une douzaine, chaque section devient trop brève pour qu'on l'identifie, et l'ordre cesse de s'entendre.",
        docEn: "How many distinct sections to compose before ordering them, each with its own selection from the two lists. At one, the section keeps the whole lists, the piece is of a single piece and the form principle has nothing to act on. Beyond a dozen, each section becomes too brief to be identified, and the order stops being audible." },
      { nom: "Reliure", nomEn: "Joining", type: "choix",
        options: ["Trait", "Marches"], optionsEn: ["Line", "Steps"], optionIds: ["trait", "marches"],
        defaut: "Trait", defautEn: "Line",
        doc: "Ce qui se passe entre deux points, et c'est la seule décision de timbre que la méthode connaisse. Le trait les relie et le signal passe par toutes les valeurs intermédiaires. Les marches tiennent chaque amplitude jusqu'au point suivant, si bien que le signal ne prend jamais que les valeurs que vous avez écrites. Sur une section, à points identiques, la crête passe de 5,12 à 3,35 dB : c'est un son plus plein, et plus dur.",
        docEn: "What happens between two points, and it is the only timbre decision the method knows. The line joins them and the signal passes through every intermediate value. Steps hold each amplitude until the next point, so the signal only ever takes the values you wrote. On a single section, with identical points, the crest goes from 5.12 to 3.35 dB: a fuller sound, and a harder one." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [0.5, 60], pas: 0.5, defaut: 8, unite: "s",
        doc: "La durée de la pièce. Elle se répartit entre les sections, qui sont donc d'autant plus brèves qu'on en demande.",
        docEn: "The duration of the piece. It is shared among the sections, which are therefore the briefer the more you ask for." },
      { nom: "Graine", graine: true, nomEn: "Seed", type: "curseur", plage: [0, 999999], pas: 1, defaut: 7,
        doc: "Deux graines donnent deux sons sans rapport tirés du même matériau : la graine tire la sélection de chaque section, puis les points. À graine égale, le composant rend deux fois exactement le même son, ce qui permet de retrouver un tirage qu'on avait aimé.",
        docEn: "Two seeds give two unrelated sounds drawn from the same material: the seed draws each section's selection, then the points. At equal seed the node returns exactly the same sound twice, which lets you find again a draw you had liked." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const frequence = frequenceDeTravail();
      const principe = (nom: NomDeReglage<typeof ctx>, defaut: Principe): Principe => {
        const choix = ctx.paramTexte(nom, defaut);
        return EST_PRINCIPE(choix) ? choix : defaut;
      };
      // CE QUE LES LISTES NE PORTENT PAS EST REFUSÉ, ET NOMMÉ : une amplitude hors de −1 à 1 était bornée, une
      // durée arrondie et portée à un échantillon, une liste vide ou illisible remplacée par celle d'origine.
      // Décision de Fabien du 2026-11-22, « Refuse it, named », revue des notations en texte.
      const refus = (cle: string, ...args: (string | number)[]) => ({ valeurs: [null, null], erreur: true, message: traduire(cle, ...args) });
      const lusA = lireEnsemble(ctx.paramTexte("Amplitudes", ""));
      if ("refus" in lusA) return lusA.refus ? refus("msg.ssp.amplitude_var_0", lusA.refus) : refus("msg.ssp.vide_var_0", "Amplitudes");
      const amplitudes = lusA.valeurs;
      const horsGabarit = amplitudes.find((v) => v < -1 || v > 1);
      if (horsGabarit !== undefined) return refus("msg.ssp.amplitude_var_0", String(horsGabarit));
      const lusT = lireEnsemble(ctx.paramTexte("Durées", ""));
      if ("refus" in lusT) return lusT.refus ? refus("msg.ssp.duree_var_0", lusT.refus) : refus("msg.ssp.vide_var_0", en ? "Durations" : "Durées");
      const temps = lusT.valeurs;
      const sansDuree = temps.find((v) => !Number.isInteger(v) || v < 1);
      if (sansDuree !== undefined) return refus("msg.ssp.duree_var_0", String(sansDuree));

      // LES DEUX PRINCIPES SONT NOMMÉS À PART : la ligne « Onde » du rapport s'en sert pour dire
      // lequel des deux empêche l'onde de se tenir.
      const principeAmplitudes = principe("Principe des amplitudes", "alea");
      const principeTemps = principe("Principe des durées", "alea");
      const principeForme = principe("Principe de la forme", "serie");

      const debut = performance.now();
      const composition = composer({
        frequence,
        duree: Math.max(0.1, ctx.paramNombre("Durée", 8)),
        sections: Math.max(1, Math.round(ctx.paramNombre("Sections", 4))),
        amplitudes, temps,
        principeAmplitudes, principeTemps, principeForme,
        interpole: ctx.paramTexte("Reliure", "trait") !== "marches",
        graine: Math.max(1, Math.round(ctx.paramNombre("Graine", 7))),
      });
      const millisecondes = performance.now() - debut;

      const buffer = new AudioBuffer({ numberOfChannels: 1, length: Math.max(1, composition.son.length), sampleRate: frequence });
      buffer.copyToChannel(new Float32Array(composition.son), 0);

      const aigu = centroideHz(composition.son, frequence);
      const crete = creteDb(composition.son);
      // LE RAPPORT JUGE CHAQUE SECTION POSÉE, et la ligne « Onde » nomme ce qui manque aux bruitées : voir
      // `audio/ssp-rapport.ts`, et `tenueDesPoints` dans `audio/ssp.ts` pour la conjonction des deux réglages.
      const rapport = rapportSsp({
        amplitudes, temps, principeAmplitudes, principeTemps, principeForme,
        composition, aigu, crete, millisecondes, en,
      });

      return {
        valeurs: [buffer, rapport],
        message: [
          `${composition.pointsPoses} points · ${aigu.toFixed(0)} Hz · ${crete.toFixed(1)} dB · ${etatEnBref(composition, en)}`,
          `${Math.round(millisecondes)} ms`,
        ].join("\n"),
      };
    },
  }),
] as FicheAudio[]).map(avecDoc);
