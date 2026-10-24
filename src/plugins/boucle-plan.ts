// plugins/boucle-plan.ts — Le nœud « Début de boucle sur un plan ».
//
// CE QU'IL SERT À FAIRE, ET QU'AUCUN AUTRE NE PERMETTAIT. Les deux composants qui écrivent un plan
// de chanson portent une « Graine » : à graine fixe, ils rendent toujours le même plan, et à graine
// libre ils en rendent un autre à chaque exécution. Mais une exécution ne les appelle qu'une fois,
// de sorte qu'un morceau fait de plusieurs sections tirées du MÊME descriptif ne pouvait pas
// s'obtenir d'un seul graphe : il fallait poser autant de chaînes que de sections, et leur donner
// des graines à la main.
//
// UNE BOUCLE DE GRAPHE RÉSOUT CELA, à une condition : que ce qui tourne soit le PLAN, c'est-à-dire
// un texte. Le début de boucle existant porte l'audio, et un plan n'y entre pas.
//
// POURQUOI UN SECOND DÉBUT PLUTÔT QU'UN PORT DE PLUS SUR L'AUTRE. Le type d'un port n'est pas
// réglable : un début qui porterait l'audio ET le texte aurait quatre ports dont deux toujours
// vides, et le graphe ne dirait plus ce qui circule. Deux débuts, deux lectures évidentes.
//
// ET LE DÉPLIAGE LES DISTINGUE, ce qu'une première version de ce fichier niait. Reconnaître un
// second début ne suffisait pas : le dépliage CHAÎNE les tours, chacun partant du résultat du
// précédent, et c'est la bonne sémantique pour un son — une chaîne qui transpose d'un demi-ton en
// monte de n au n-ième tour. Un plan ne se compose pas : on veut n sections du MÊME descriptif. Les
// tours de cette boucle-ci repartent donc tous de l'entrée du début, et `boucle-graphe.ts` porte la
// liste de ceux qui rebouclent.
//
// MESURÉ DANS L'APPLICATION : branché sur le rebouclage, le deuxième tour recevait l'audio du
// premier sur une entrée texte, et la fin de boucle annonçait « Entrée en erreur » là où le premier
// tour était vert.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "boucle-plan-debut", nom: "Début de boucle sur un plan", nomEn: "Plan Loop Start",
    univers: "Entrées", famille: "Génération",
    resume: "Marque le début d'une boucle de graphe qui fait tourner un plan : ce qui suit est rejoué N fois, avec une graine par tour.",
    resumeEn: "Marks the start of a graph loop carrying a plan: what follows is replayed N times, with one seed per pass.",
    notice: "Ce composant ouvre une boucle de graphe sur un texte, et le plan d'une chanson en est l'usage. La chaîne comprise entre lui et une « Fin de boucle » est jouée autant de fois que « Tours » le demande, et le plan reçu traverse chaque tour sans être modifié.\n\n"
      + "Chaque tour repart du plan reçu, et non de ce que le tour précédent a produit : les tours sont indépendants, et ce qui les distingue vient donc uniquement des graines.\n\n"
      + "« Tours » fixe le nombre de passages. « Graines » dit ce que deviennent les réglages « Graine » des composants de la chaîne : « Identiques » leur donne la même à chaque tour, donc le même résultat ; « Une par tour » en donne une différente à chacun, ce qui rend des sections qui suivent le même plan sans se répéter.\n\n"
      + "L'entrée « Plan » reçoit le texte à faire tourner. La sortie du même nom le rend tel quel à chaque tour.\n\n"
      + "La boucle se referme sur « Fin de boucle A », qui met les tours bout à bout, « B », qui ne garde que le dernier, ou « C », qui les empile. Ces fins reçoivent de l'audio : la chaîne doit donc rendre un son à partir du plan.",
    noticeEn: "This node opens a graph loop on a text, and a song's plan is what it is for. The chain between it and a « Loop End » is played as many times as « Passes » asks, and the plan received crosses every pass unchanged.\n\n"
      + "Every pass starts again from the plan received, and not from what the previous pass produced: the passes are independent, and what tells them apart therefore comes from the seeds alone.\n\n"
      + "« Passes » sets the number of runs. « Seeds » says what becomes of the « Seed » settings of the chain's nodes: « Identical » gives them the same one at every pass, hence the same result; « One per pass » gives each a different one, which returns sections that follow the same plan without repeating.\n\n"
      + "The « Plan » input receives the text to turn. The output of the same name returns it as it is at every pass.\n\n"
      + "The loop closes on « Loop End A », which puts the passes end to end, « B », which keeps only the last, or « C », which stacks them. Those ends receive audio: the chain must therefore return a sound from the plan.",
    entrees: [{ nom: "Plan", nomEn: "Plan", type: "texte", sousType: "plan", requis: false }],
    sorties: [{ nom: "Plan", nomEn: "Plan", type: "texte", sousType: "plan" }],
    parametres: [
      // LES DEUX RÉGLAGES SONT CEUX DU DÉBUT DE BOUCLE SUR L'AUDIO, à la lettre près de leurs noms :
      // le déplieur les lit PAR LEUR NOM, « Tours » et « Graines », et non par l'identifiant du
      // nœud. Les renommer ici ferait une boucle de trois tours sans graines, sans rien dire.
      { nom: "Tours", nomEn: "Passes", type: "nombre", plage: [1, Infinity], pas: 1, defaut: 3,
        doc: "Nombre de fois où la chaîne comprise entre ce composant et la « Fin de boucle » est jouée. Le plan reçu est le même à chaque tour ; ce qui change d'un tour à l'autre vient du réglage « Graines ».",
        docEn: "How many times the chain between this node and the « Loop End » is played. The plan received is the same at every pass; what changes from one pass to the next comes from the « Seeds » setting." },
      { nom: "Graines", nomEn: "Seeds", type: "choix",
        options: ["Identiques", "Une par tour"], optionsEn: ["Identical", "One per pass"],
        optionIds: ["Identiques", "Une par tour"], defaut: "Une par tour", defautEn: "One per pass",
        doc: "Ce que deviennent les réglages « Graine » des composants de la chaîne. « Une par tour » en donne une différente à chaque tour : le plan reste le même et le rendu change, ce qui donne des sections d'un même morceau. « Identiques » donne la même à tous, et les tours se ressemblent.",
        docEn: "What becomes of the « Seed » settings of the chain's nodes. « One per pass » gives each pass a different one: the plan stays the same and the rendering changes, which yields sections of one piece. « Identical » gives them all the same, and the passes resemble each other." },
    ],
    async executer(ctx: any) {
      // CE NŒUD N'EST NORMALEMENT JAMAIS EXÉCUTÉ : le moteur déplie la boucle avant l'exécution et
      // le remplace par les copies de la chaîne. S'il s'exécute, c'est que le dépliage n'a pas eu
      // lieu, presque toujours faute de « Fin de boucle » en aval. On laisse alors passer le plan,
      // et on le dit, exactement comme le fait le début de boucle sur l'audio.
      const plan = ctx.entree(0);
      return {
        valeurs: [typeof plan === "string" ? plan : null],
        message: traduire("msg.boucle.nonDepliee"),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
