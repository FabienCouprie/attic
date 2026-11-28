// plugins/matrice-activite.ts — La fiche de « Matrice d'activité » : la forme d'un morceau, quelles
// voix jouent à chaque section d'accords, tirée sous les contraintes de chaque voix.
//
// ELLE REPREND LA MATRICE DE `SimpleArrangementEngine` de SoundHelix 0.9 (décision D1 : le modèle
// réécrit, non le tirage du programme). Le calcul est dans `audio/soundhelix-arrangement.ts` (les
// voix lues, le nombre de voix par section) et `audio/soundhelix-recherche.ts` (la recherche) ; la
// matrice s'écrit par `audio/soundhelix-activite.ts`, la même écriture que les voix relisent.
//
// CHOIX PRIS DANS LE LOT, sur la consigne de Fabien d'avancer seul : les contraintes s'écrivent sous
// des mots-clés courts, une voix par ligne, dans les deux langues ; les sections d'entrée et de sortie
// se comptent depuis 1, depuis le début et depuis la fin ; « Essais » borne toute la recherche exacte,
// et chaque section de la recherche gloutonne.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";
import { langueCourante } from "../i18n";
import { hasardDuNoeud } from "../core";
import { lireHarmonie } from "../audio/soundhelix-midi";
import { ecrireActivite } from "../audio/soundhelix-activite";
import { CLES_EN, FauteArrangement, arranger, lireVoix } from "../audio/soundhelix-arrangement";

/** Sept voix écrites pour Attic, à la façon d'un morceau qui s'ouvre et se referme. */
export const VOIX_PAR_DEFAUT = [
  "nappe     part=50-90 longueur=2-",
  "basse     part=50-90 entree=1-3 longueur=2-",
  "arpege    part=30-70 longueur=2-",
  "accomp    part=30-70 longueur=2-",
  "batterie  part=40-80 entree=3- longueur=2-",
  "melodie   part=20-50 entree=5- sortie=3- segments=1-3 longueur=2-",
  "contre    part=10-40 entree=5- longueur=2- muette",
].join("\n");

/** Les mêmes, sous leurs noms et leurs mots-clés anglais. */
export const VOIX_PAR_DEFAUT_EN = [
  "pad       share=50-90 length=2-",
  "bass      share=50-90 entry=1-3 length=2-",
  "arpeggio  share=30-70 length=2-",
  "comp      share=30-70 length=2-",
  "drums     share=40-80 entry=3- length=2-",
  "melody    share=20-50 entry=5- exit=3- segments=1-3 length=2-",
  "counter   share=10-40 entry=5- length=2- silent",
].join("\n");

const lireListe = (t: string) => t.split(",").map((s) => s.trim()).filter((s) => s !== "").map(Number);

const NOTICE = "Tire quelles voix jouent à chaque section d'accords de l'harmonie reçue, sous les contraintes de chaque voix, et l'écrit en matrice d'activité. Le modèle est celui du moteur d'arrangement du générateur SoundHelix de Thomas Schürger (version 0.9, 2016).\n\n« Voix » donne une voix par ligne : son nom, puis ses contraintes, comptées en sections. part=a-b est la part des sections où la voix joue, en pour cent ; entree=a-b la section de sa première entrée, comptée depuis 1 ; sortie=a-b la section de sa dernière sortie, comptée depuis la fin, 1 étant la dernière ; segments=a-b le nombre de ses segments ; longueur=a-b la longueur de chacun ; pause=a-b la longueur de chaque silence entre deux segments. Une borne s'écrit a-b, a- ou -b, ou un nombre seul. muette permet à la voix de ne jamais jouer. debut= et fin= sont recopiés dans la matrice : ils déplacent en tics chaque entrée et chaque sortie de la voix. Les mots-clés anglais share, entry, exit, length et silent valent part, entree, sortie, longueur et muette.\n\nLe nombre de voix qui jouent se tire d'abord, section par section. « Entrée » donne celui des premières sections, « Sortie » celui des dernières, séparés par des virgules. Entre les deux, chaque section tire un nombre entre « Voix actives min » et « Voix actives max », à au plus « Changement par section » du précédent ; le même nombre que la section d'avant n'est gardé qu'une fois sur dix quand un autre est possible.\n\nLes voix se choisissent ensuite : chaque section part des voix de la précédente et en allume ou en éteint au hasard jusqu'à son nombre ; à nombre égal, une fois sur deux, elle en échange une. Sous « Recherche » à « Exacte », chaque section essaie plusieurs choix, garde le premier qui tient les contraintes, et revient à la section d'avant quand aucun ne tient ; quand aucune matrice ne tient les nombres de voix tirés, ils sont tirés à neuf, jusqu'à dix fois, chaque reprise recevant un dixième des essais ; « Essais » borne le nombre de choix de toute la recherche. Sous « Gloutonne », chaque section garde, parmi « Essais » choix, celui qui s'écarte le moins des contraintes, sans revenir en arrière : la matrice est toujours rendue, et ses écarts comptés.\n\n« Graine » fixe le tirage ; 0 tire une graine à chaque exécution, et le message la donne.\n\nLa sortie « Activité » porte la matrice : une ligne par voix, son nom, un signe par section, x quand la voix joue, . quand elle se tait, puis ses décalages.\n\nLe message donne le nombre de voix et de sections, la recherche, le nombre d'essais, les écarts de la recherche gloutonne et la graine ; quand la recherche exacte n'aboutit pas, la contrainte et la voix qui l'ont le plus souvent bloquée.";

const NOTICE_EN = "Draws which voices play in each chord section of the received harmony, under each voice's constraints, and writes it as an activity matrix. The model is that of the arrangement engine of the SoundHelix generator by Thomas Schürger (version 0.9, 2016).\n\n« Voices » gives one voice per line: its name, then its constraints, counted in sections. share=a-b is the share of sections where the voice plays, in percent; entry=a-b the section of its first entry, counted from 1; exit=a-b the section of its last exit, counted from the end, 1 being the last; segments=a-b the number of its segments; length=a-b the length of each; pause=a-b the length of each silence between two segments. A bound is written a-b, a- or -b, or a single number. silent allows the voice never to play. debut= and fin= are copied into the matrix: they move each entry and each exit of the voice in ticks. The keywords may also be written in French.\n\nThe number of playing voices is drawn first, section by section. « Opening » gives that of the first sections, « Closing » that of the last ones, separated by commas. In between, each section draws a number between « Active voices min » and « Active voices max », at most « Change per section » away from the previous one; the same number as the section before is kept only once in ten when another one is possible.\n\nThe voices are then chosen: each section starts from the voices of the previous one and turns some on or off at random up to its number; at an equal number, one time in two, it swaps one. With « Search » on « Exact », each section tries several choices, keeps the first that holds the constraints, and goes back to the section before when none holds; when no matrix holds the drawn numbers of voices, they are drawn anew, up to ten times, each new attempt receiving a tenth of the tries; « Tries » bounds the number of choices of the whole search. With « Greedy », each section keeps, among « Tries » choices, the one that strays least from the constraints, without going back: the matrix is always returned, and its deviations counted.\n\n« Seed » fixes the draw; 0 draws a seed at every run, and the message gives it.\n\nThe « Activity » output carries the matrix: one line per voice, its name, one sign per section, x when the voice plays, . when it is silent, then its shifts.\n\nThe message gives the number of voices and sections, the search, the number of tries, the deviations of the greedy search and the seed; when the exact search fails, the constraint and the voice that blocked it most often.";

export const fiches: FicheAudio[] = ([
  fiche({
    id: "matrice-activite", nom: "Matrice d'activité", nomEn: "Activity Matrix",
    univers: "Entrées", famille: "Génération",
    resume: "Tire quelles voix jouent à chaque section d'accords, sous les contraintes de chaque voix.",
    resumeEn: "Draws which voices play in each chord section, under each voice's constraints.",
    notice: NOTICE, noticeEn: NOTICE_EN,
    entrees: [{ nom: "Harmonie", nomEn: "Harmony", type: "midi", sousType: "harmonie" }],
    sorties: [{ nom: "Activité", nomEn: "Activity", type: "texte", sousType: "activite" }],
    parametres: [
      { nom: "Voix", nomEn: "Voices", type: "texte", defaut: VOIX_PAR_DEFAUT, defautEn: VOIX_PAR_DEFAUT_EN,
        doc: "Une voix par ligne, son nom puis ses contraintes en sections : part=, entree=, sortie=, segments=, longueur=, pause=, muette, et les décalages debut= et fin= en tics.",
        docEn: "One voice per line, its name then its constraints in sections: share=, entry=, exit=, segments=, length=, pause=, silent, and the shifts debut= and fin= in ticks." },
      { nom: "Voix actives min", nomEn: "Active voices min", plage: [0, 16], pas: 1, defaut: 3,
        doc: "Le moins de voix qui jouent à une section, hors des sections d'« Entrée » et de « Sortie ».",
        docEn: "The fewest voices playing in a section, outside the « Opening » and « Closing » sections." },
      { nom: "Voix actives max", nomEn: "Active voices max", plage: [1, 16], pas: 1, defaut: 6,
        doc: "Le plus de voix qui jouent à une section, hors des sections d'« Entrée » et de « Sortie ».",
        docEn: "The most voices playing in a section, outside the « Opening » and « Closing » sections." },
      { nom: "Changement par section", nomEn: "Change per section", plage: [1, 8], pas: 1, defaut: 2,
        doc: "L'écart le plus grand du nombre de voix d'une section à la suivante, hors des sections d'« Entrée » et de « Sortie ».",
        docEn: "The largest change in the number of voices from one section to the next, outside the « Opening » and « Closing » sections." },
      { nom: "Entrée", nomEn: "Opening", type: "texte", defaut: "1,2,3,4", defautEn: "1,2,3,4",
        doc: "Le nombre de voix des premières sections, séparés par des virgules : 1,2,3,4 ouvre le morceau voix par voix.",
        docEn: "The number of voices of the first sections, separated by commas: 1,2,3,4 opens the piece voice by voice." },
      { nom: "Sortie", nomEn: "Closing", type: "texte", defaut: "3,2", defautEn: "3,2",
        doc: "Le nombre de voix des dernières sections, séparés par des virgules.",
        docEn: "The number of voices of the last sections, separated by commas." },
      { nom: "Recherche", nomEn: "Search", type: "choix", options: ["Exacte", "Gloutonne"], optionsEn: ["Exact", "Greedy"],
        optionIds: ["exacte", "gloutonne"], defaut: "Exacte", defautEn: "Exact",
        doc: "Exacte : la matrice tient toutes les contraintes, ou le composant dit celle qui bloque. Gloutonne : la matrice est toujours rendue, au plus près des contraintes, et ses écarts sont comptés. Tant qu'aucune section n'est sans issue, les deux recherches font les mêmes choix et rendent la même matrice.",
        docEn: "Exact: the matrix holds every constraint, or the node names the one that blocks. Greedy: the matrix is always returned, as close to the constraints as it gets, and its deviations are counted. As long as no section is a dead end, both searches make the same choices and return the same matrix." },
      { nom: "Essais", nomEn: "Tries", plage: [100, 1000000], pas: 100, defaut: 100000,
        doc: "Sous « Recherche » à « Exacte » : le nombre de choix de toute la recherche. À « Gloutonne » : le nombre de choix de chaque section, qui s'arrête au premier choix sans écart ; sans effet quand chaque section en trouve un.",
        docEn: "With « Search » on « Exact »: the number of choices of the whole search. On « Greedy »: the number of choices of each section, which stops at the first choice without deviation; no effect when every section finds one." },
      { nom: "Graine", nomEn: "Seed", graine: true, plage: [0, 999999], pas: 1, defaut: 0,
        doc: "Graine du tirage des nombres de voix et des voix. 0 = tirée à chaque exécution, et donnée dans le message pour être recopiée ici.",
        docEn: "Seed for the draw of the numbers of voices and of the voices. 0 = drawn at every run, and given in the message so it can be copied back here." },
    ],
    async executer(ctx) {
      const en = langueCourante() === "en";
      const brute = ctx.entree(0);
      if (!(brute instanceof File)) {
        return { valeurs: [null], erreur: true, message: en ? "no harmony on the input" : "aucune harmonie en entrée" };
      }
      try {
        const h = lireHarmonie(new Uint8Array(await brute.arrayBuffer()));
        const voix = lireVoix(ctx.paramTexte("Voix", VOIX_PAR_DEFAUT));
        if (voix.length === 0) return { valeurs: [null], erreur: true, message: en ? "no voice" : "aucune voix" };
        const { graine, aleatoire } = hasardDuNoeud(ctx.paramNombre("Graine", 0));
        const n = h.sections.length;
        const comptes = {
          sections: n,
          min: Math.round(ctx.paramNombre("Voix actives min", 3)), max: Math.round(ctx.paramNombre("Voix actives max", 6)),
          changement: Math.round(ctx.paramNombre("Changement par section", 2)),
          entree: lireListe(ctx.paramTexte("Entrée", "1,2,3,4")), sortie: lireListe(ctx.paramTexte("Sortie", "3,2")),
        };
        const exacte = ctx.paramTexte("Recherche", "exacte") !== "gloutonne";
        const r = arranger({ voix, comptes, exacte, essais: Math.round(ctx.paramNombre("Essais", 100000)), aleatoire });
        if (!r.matrice) {
          const b = r.blocage;
          return { valeurs: [null], erreur: true, message: en
            ? `no matrix in ${r.essais} tries${b ? ` · most often blocked: « ${CLES_EN[b.contrainte]} » of « ${b.voix} »` : ""} · seed ${graine}`
            : `aucune matrice en ${r.essais} essais${b ? ` · le plus souvent bloquée : « ${b.contrainte} » de « ${b.voix} »` : ""} · graine ${graine}` };
        }
        const texte = ecrireActivite(voix.map((v, i) => ({ nom: v.nom, sections: r.matrice![i], debut: v.debut, fin: v.fin })));
        const recherche = exacte ? (en ? "exact" : "exacte") : (en ? "greedy" : "gloutonne");
        const ecarts = r.fautes.length ? (en ? ` · ${r.fautes.length} deviations` : ` · ${r.fautes.length} écarts`) : "";
        const message = en
          ? `${voix.length} voices · ${n} sections · ${recherche} in ${r.essais} tries${ecarts} · seed ${graine}`
          : `${voix.length} voix · ${n} sections · ${recherche} en ${r.essais} essais${ecarts} · graine ${graine}`;
        return { valeurs: [texte], message };
      } catch (e) {
        if (e instanceof FauteArrangement) return { valeurs: [null], erreur: true, message: en ? e.en : e.message };
        throw e;
      }
    },
  }),
] as FicheAudio[]).map(avecDoc);
