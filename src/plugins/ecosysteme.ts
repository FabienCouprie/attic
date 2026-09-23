// plugins/ecosysteme.ts — Le nœud « Écosystème (Di Scipio) ». Le système est dans
// `audio/ecosysteme.ts`, avec ses preuves ; ici, la prise.
//
// POURQUOI L'HOMÉOSTAT EST UN RÉGLAGE, ET NON UN DÉTAIL CACHÉ. C'est le témoin du nœud : le
// débrancher laisse tourner la même boucle, les mêmes grains, la même mémoire, et l'on entend
// aussitôt ce que la régulation faisait — le système suit le volume du monde au lieu de tenir le
// sien. Un nœud qui cacherait cette pièce demanderait qu'on le croie sur parole.
//
// POURQUOI LE JOURNAL EST LA MOITIÉ DU NŒUD, comme le livre d'écrans de Xenakis. Ce que le système
// fait ne s'entend pas toujours : un système qui se tient sans peine et un système à bout de
// forces sonnent au même volume, puisque c'est précisément ce que l'homéostat leur impose. Ce qui
// les sépare est la dépense, et elle ne se lit que sur la courbe de poussée.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { nomRegime, tracer, vivre } from "../audio/ecosysteme";

export const fiches: FicheAudio[] = ([
  {
    id: "ecosysteme", nom: "Écosystème (Di Scipio)", nomEn: "Ecosystem (Di Scipio)",
    univers: "Traitement", famille: "Effets",
    resume: "Un système qui s'écoute, règle lui-même sa densité et ses grains d'après ce qu'il entend, et cherche son propre équilibre. On ne règle pas le résultat, on règle le couplage.",
    resumeEn: "A system that listens to itself, sets its own density and grains from what it hears, and seeks its own balance. You do not set the result, you set the coupling.",
    notice: "D'après Agostino Di Scipio, « \"Sound is the interface\" : from interactive to ecosystemic signal processing », Organised Sound 8(3), 2003, et la série « Audible Ecosystemics » (2003-2005) ; le moteur non linéaire vient de « Iterated Nonlinear Functions as a Sound-Generating Engine », Leonardo 34(3), 2001.\n\nLe résultat ne se règle pas directement. On règle le couplage — la force avec laquelle le système s'entend lui-même — et tout le reste est décidé par le système, à partir de ce qu'il mesure de sa propre voix et du monde qu'on lui donne. La densité des grains, leur durée, l'endroit du passé où il va les chercher : tout cela sort de la boucle, jamais des curseurs. C'est ce que Di Scipio appelle faire du son l'interface.\n\nLa boucle est entière à l'intérieur du composant, parce que le graphe est acyclique et qu'un composant ne peut pas se réinjecter dans lui-même. Un graphe cyclique n'aurait plus d'ordre d'exécution, et la boucle interne est d'ailleurs fidèle au modèle : les dispositifs de Di Scipio sont des boucles fermées, un seul appareil qui s'écoute.\n\nCe n'est pas un compresseur, et cela se mesure. Un compresseur aussi ramène un niveau à une cible. La différence est que l'observation, ici, ne commande pas un volume mais la forme même de la synthèse. Deux mondes de rigoureusement même niveau, dont l'un bouge et l'autre pas : les deux sorties sortent au même niveau, et les deux textures n'ont rien de commun. Un monde calme rend 24 grains par seconde de 82 ms, un monde agité 51 grains de 39 ms. Un compresseur s'arrête au volume ; le système, lui, change de comportement.\n\nLe son vient de la boucle, non de l'entrée. Le monde arrêté au bout d'une seconde, les sept suivantes restent : à couplage nul il ne reste rien du tout, et le niveau de ce qui reste monte avec le couplage, sans trou ni renversement. Le composant ne granule pas son entrée, il vit à partir d'elle.\n\nLe régime ne se lit pas sur le niveau, et le journal est là pour cela. L'homéostat ramène presque toujours le niveau à sa cible : un système qui se tient sans peine et un système à bout de forces sonnent au même volume. Ce qui les sépare est ce qu'il a fallu dépenser, et cela se lit sur la courbe de poussée. Poussée collée au plafond, le couplage est trop faible et l'on entend le monde à peine granulé. Poussée au plancher, le système s'emballerait si on le laissait faire et l'homéostat ne fait plus que le retenir. Entre les deux, il se tient, ou il balance.\n\nLe bruit de fond est inaudible, à cent décibels sous la cible. Sans lui, le zéro serait un état absorbant : que la mémoire s'annule une fois, et aucune quantité de poussée ne pourrait plus amplifier du silence exact. Di Scipio fait de ce bruit le point de départ de son « Background Noise Study » ; il joue ici le même rôle.\n\nÀ graine égale, le système rend deux fois le même son. À graine différente, il rend deux sons qui ne se ressemblent en rien échantillon par échantillon et se ressemblent en tout statistiquement : ce n'est pas un objet, c'est une instance.",
    noticeEn: "After Agostino Di Scipio, « \"Sound is the interface\": from interactive to ecosystemic signal processing », Organised Sound 8(3), 2003, and the « Audible Ecosystemics » series (2003-2005); the nonlinear engine comes from « Iterated Nonlinear Functions as a Sound-Generating Engine », Leonardo 34(3), 2001. Last of the paths surveyed in the literature of the grain.\n\nThis node is not set like the others, and that is its whole point. Everywhere else in the catalog you set an effect and the effect obeys: a density, a threshold, a duration. Here nobody sets the result. You set the coupling — the strength with which the system hears itself — and everything else is decided by the system, from what it measures of its own voice and of the world you give it. The density of the grains, their duration, the place in the past it fetches them from: all of that comes out of the loop, never out of the sliders. This is what Di Scipio calls making sound the interface.\n\nThe loop lives entirely inside the node, because the graph is acyclic and a node cannot feed back into itself. That is a good thing — a cyclic graph would have no execution order — and it is faithful besides: Di Scipio's devices are closed loops, one single apparatus listening to itself.\n\nIt is not a compressor, and that can be measured. A compressor too brings a level back to a target. The difference is that observation here does not command a volume but the very shape of the synthesis. Give the system two worlds of rigorously equal level, one of which moves and one of which does not: both outputs come out at the same level, and the two textures have nothing in common. A calm world gives 24 grains per second of 82 ms, an agitated one 51 grains of 39 ms. A compressor stops at volume; the system changes behaviour.\n\nThe sound comes from the loop, not from the input. Stop the world after one second and listen to the seven that follow: at zero coupling nothing at all is left, and the level of what remains rises with the coupling, with no gap and no reversal. The node does not granulate its input, it lives from it.\n\nThe regime cannot be read from the level, and the log is there for that. The homeostat almost always brings the level back to its target: a system holding itself easily and a system at the end of its strength sound at the same volume. What separates them is what it cost, and that is read on the drive curve. Drive pinned at the ceiling, the coupling is too weak and you hear the world barely granulated. Drive at the floor, the system would run away if allowed and the homeostat is merely holding it back: that is where the liveliest textures are found. In between, it holds, or it swings.\n\nThe background noise, inaudible a hundred decibels below the target, is not a contrivance. Without it zero would be an absorbing state: let the memory vanish once, and no amount of drive could ever amplify exact silence again. Di Scipio makes that noise the starting point of his « Background Noise Study »; it plays the same part here.\n\nAt equal seed the system returns the same sound twice — without which none of the above would be verifiable. At a different seed it returns two sounds that resemble each other in no sample and in every statistic: it is not an object, it is an instance.",
    entrees: [{ nom: "Monde", nomEn: "World", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Journal", nomEn: "Log", type: "texte" },
    ],
    parametres: [
      { nom: "Couplage", nomEn: "Coupling", type: "curseur", plage: [0, 3], pas: 0.05, defaut: 0.8,
        doc: "La force avec laquelle le système s'entend lui-même, et le seul réglage qui compte vraiment. À zéro, il n'entend que le monde et ne survit pas à son silence. Faible, la poussée se colle au plafond sans jamais rejoindre la cible : on entend le monde à peine granulé. Vers un, le système se porte lui-même et l'homéostat passe son temps à le retenir — c'est là que les textures les plus vivantes se trouvent. Le journal dit dans quel régime le réglage vous a mené, ce qu'aucun chiffre lu ici ne peut prédire.",
        docEn: "The strength with which the system hears itself, and the only setting that really matters. At zero it hears only the world and does not survive its silence. Weak, the drive pins itself to the ceiling without ever reaching the target: you hear the world barely granulated. Around one, the system carries itself and the homeostat spends its time holding it back — that is where the liveliest textures are found. The log says which regime the setting led you to, which no number read here can predict." },
      { nom: "Point d'équilibre", nomEn: "Balance point", type: "curseur", plage: [-40, -6], pas: 1, defaut: -20, unite: "dB",
        doc: "Le niveau que le système cherche à tenir pour sa propre voix, et non pour la pièce entière. La distinction n'est pas une subtilité : un système qui règlerait sur ce qu'il entend serait condamné au silence dès que le monde serait plus fort que la cible, l'erreur restant négative quoi qu'il fasse.",
        docEn: "The level the system seeks to hold for its own voice, not for the whole room. The distinction is no subtlety: a system regulating on what it hears would be condemned to silence as soon as the world were louder than the target, the error staying negative whatever it did." },
      { nom: "Réactivité", nomEn: "Reactivity", type: "curseur", plage: [0, 1], pas: 0.05, defaut: 0.5,
        doc: "La vitesse à laquelle l'homéostat corrige son écart. Lente, le système dépasse sa cible puis met des secondes à revenir, en un balancier qu'on entend très bien. Vive, il tient son niveau de près et laisse moins de vie à la texture. À zéro il ne corrige plus rien, et le couplage seul décide de tout.",
        docEn: "How fast the homeostat corrects its error. Slow, the system overshoots its target then takes seconds to come back, in a swing you hear very clearly. Quick, it holds its level closely and leaves less life to the texture. At zero it no longer corrects anything, and the coupling alone decides everything." },
      { nom: "Mémoire", nomEn: "Memory", type: "curseur", plage: [0.05, 8], pas: 0.05, defaut: 1.5, unite: "s",
        doc: "La profondeur du passé où les grains sont puisés. Le système y mêle sa propre voix et le monde, et choisit lui-même la distance : agité, il puise près du présent et le son se resserre ; calme, il va chercher loin en arrière et l'on entend revenir des choses oubliées.",
        docEn: "How deep into the past the grains are drawn from. The system mixes its own voice and the world in there, and chooses the distance itself: agitated, it draws near the present and the sound tightens; calm, it reaches far back and you hear forgotten things return." },
      { nom: "Densité maximale", nomEn: "Maximum density", type: "curseur", plage: [5, 400], pas: 5, defaut: 120, unite: "/s",
        doc: "Le plafond de grains par seconde, que le système atteint quand il se juge très agité. Il ne s'y tient jamais longtemps : la densité qu'il emploie vraiment est rapportée dans le journal, et c'est elle qui dit ce qu'il a fait du monde qu'on lui a donné.",
        docEn: "The ceiling of grains per second, which the system reaches when it judges itself very agitated. It never stays there long: the density it actually uses is reported in the log, and it is that one which says what it made of the world it was given." },
      { nom: "Durée", nomEn: "Duration", type: "curseur", plage: [1, 120], pas: 1, defaut: 15, unite: "s",
        doc: "La durée de la sortie, indépendante de celle du monde. C'est ici que le composant se distingue d'un effet : demandez trente secondes pour une entrée d'une seconde, et écoutez ce que le système devient une fois le monde parti.",
        docEn: "The output duration, independent of the world's. This is where the node parts company with an effect: ask for thirty seconds on a one-second input, and listen to what the system becomes once the world has gone." },
      { nom: "Homéostat", nomEn: "Homeostat", type: "choix",
        options: ["Branché", "Débranché"], optionsEn: ["Connected", "Disconnected"],
        optionIds: ["branche", "debranche"], defaut: "Branché", defautEn: "Connected",
        doc: "Le témoin du composant, et il est fait pour être débranché. La même boucle, les mêmes grains, la même mémoire, sans la régulation : le système suit alors le volume du monde au lieu de tenir le sien. Mesuré, trois mondes distants de trente-quatre décibels rendent trois sorties distantes de 1,13 dB avec l'homéostat, et de 33,19 dB sans lui.",
        docEn: "The node's control, and it is made to be disconnected. The same loop, the same grains, the same memory, without the regulation: the system then follows the world's volume instead of holding its own. Measured, three worlds thirty-four decibels apart give three outputs 1.13 dB apart with the homeostat, and 33.19 dB apart without it." },
      { nom: "Graine", nomEn: "Seed", type: "curseur", plage: [1, 9999], pas: 1, defaut: 7,
        doc: "Deux graines donnent deux sons qui ne se ressemblent en rien échantillon par échantillon, et se ressemblent en tout statistiquement — mêmes niveaux, mêmes densités. Ce que le composant rend n'est pas un objet mais une instance, et la graine sert à retrouver exactement celle qu'on avait aimée.",
        docEn: "Two seeds give two sounds that resemble each other in no sample and in every statistic — same levels, same densities. What the node returns is not an object but an instance, and the seed serves to find again exactly the one you had liked." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: en ? "No input." : "Aucune entrée." };
      }
      const frequence = audio.sampleRate;
      const options = {
        frequence,
        duree: Math.max(0.1, ctx.paramNombre("Durée", 15)),
        couplage: Math.max(0, ctx.paramNombre("Couplage", 0.8)),
        cibleDb: ctx.paramNombre("Point d'équilibre", -20),
        reactivite: ctx.paramNombre("Réactivité", 0.5),
        memoireS: Math.max(0.05, ctx.paramNombre("Mémoire", 1.5)),
        densiteMax: Math.max(1, ctx.paramNombre("Densité maximale", 120)),
        homeostat: ctx.paramTexte("Homéostat", "branche") !== "debranche",
        graine: Math.max(1, Math.round(ctx.paramNombre("Graine", 7))),
      };

      const debut = performance.now();
      const sorties = [];
      let premier: ReturnType<typeof vivre> | null = null;
      for (let c = 0; c < audio.numberOfChannels; c++) {
        // Chaque canal est un écosystème à part entière, et sa graine en est décalée : deux canaux
        // qui partageraient la leur rendraient exactement le même son, donc une mono déguisée.
        const r = vivre(audio.getChannelData(c), { ...options, graine: options.graine + c * 101 });
        sorties.push(r.son);
        if (c === 0) premier = r;
      }
      const millisecondes = performance.now() - debut;
      const r = premier!;

      const buffer = new AudioBuffer({
        numberOfChannels: sorties.length,
        length: Math.max(1, sorties[0].length),
        sampleRate: frequence,
      });
      for (let c = 0; c < sorties.length; c++) buffer.copyToChannel(new Float32Array(sorties[c]), c);

      const lignes: string[] = [];
      const colonne = (fr: string, enn: string, valeur: string) =>
        `  ${(en ? enn : fr).padEnd(22)}${valeur}`;
      lignes.push(en ? "Ecosystem" : "Écosystème");
      lignes.push("");
      lignes.push(colonne("Régime", "Regime", nomRegime(r.regime, en)));
      lignes.push(colonne("Sa propre voix", "Its own voice", `${r.niveauFinalDb.toFixed(2)} dB`));
      lignes.push(colonne("Point d'équilibre", "Balance point", `${options.cibleDb.toFixed(0)} dB`));
      lignes.push(colonne("Densité employée", "Density used", `${r.densiteMediane.toFixed(0)} /s`));
      lignes.push(colonne("Durée de grain", "Grain duration", `${r.dureeMedianeMs.toFixed(0)} ms`));
      lignes.push(colonne("Calculé en", "Computed in", `${Math.round(millisecondes)} ms`));
      if (!options.homeostat) {
        lignes.push("");
        lignes.push(en
          ? "  Homeostat disconnected: the system follows the world's volume."
          : "  Homéostat débranché : le système suit le volume du monde.");
      }

      const courbe = (titre: string, valeur: (p: typeof r.trajectoire[number]) => number) => {
        lignes.push("");
        lignes.push(`  ${titre}`);
        for (const l of tracer(r.trajectoire, valeur, 6, 58)) lignes.push(`    ${l}`);
      };
      courbe(en ? "Drive — what the regulation costs" : "Poussée — ce que la régulation coûte", (p) => p.poussee);
      courbe(en ? "Density — what it made of the world" : "Densité — ce qu'il a fait du monde", (p) => p.densite);
      lignes.push(`    ${(en ? "0 s" : "0 s").padEnd(52)}${options.duree.toFixed(0)} s`);

      lignes.push("");
      lignes.push(`  ${EXPLICATIONS[r.regime][en ? "en" : "fr"]}`);

      return {
        valeurs: [buffer, lignes.join("\n")],
        message: [
          `${nomRegime(r.regime, en)} · ${r.niveauFinalDb.toFixed(1)} dB · ${r.densiteMediane.toFixed(0)}/s`,
          `${Math.round(millisecondes)} ms`,
        ].join("\n"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

/** Ce que chaque régime veut dire, en une phrase, sous la courbe qui l'a montré. */
const EXPLICATIONS = {
  insuffisant: {
    fr: "Poussée au plafond sans rejoindre la cible : le couplage est trop faible pour que le système se porte. Montez-le.",
    en: "Drive at the ceiling without reaching the target: the coupling is too weak for the system to carry itself. Raise it.",
  },
  regule: {
    fr: "Le système tient son équilibre sans forcer. Montez le couplage pour le mettre en peine, et l'entendre vivre.",
    en: "The system holds its balance without strain. Raise the coupling to put it to the test, and hear it live.",
  },
  oscille: {
    fr: "La poussée balaie sa course : le système dépasse sa cible puis se rattrape, en un balancier lent. Baissez la réactivité pour l'allonger.",
    en: "The drive sweeps its range: the system overshoots its target then catches itself, in a slow swing. Lower the reactivity to lengthen it.",
  },
  bride: {
    fr: "Poussée au plancher : il s'emballerait si on le laissait faire, et l'homéostat ne fait plus que le retenir. C'est ici que ça vit le mieux.",
    en: "Drive at the floor: it would run away if allowed, and the homeostat is merely holding it back. This is where it lives best.",
  },
} as const;
