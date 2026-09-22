// plugins/demonstration.ts — Nœud « Démonstration ».
//
// Posé sur un graphe, il en fabrique une vidéo : chaque nœud à son tour, en suivant les chaînes,
// avec son résultat — le son qu'il rend, sa courbe, son image, son texte. Le plan et la bande-son
// sont dans `audio/demonstration.ts`, pur et testé ; le dessin et l'encodage dans
// `audio/demonstration-video.ts`.
//
// TROIS PARTICULARITÉS, qui ont chacune une raison :
//  1. Il lit les résultats des autres nœuds par un état ambiant (`grapheGlobal.ts`), et non par
//     des entrées : il montre le graphe entier, et le câbler à chaque nœud serait absurde.
//  2. Il déclare `executerEnDernier` : sans entrée, le tri topologique pourrait le lancer en
//     premier, avant qu'aucun résultat n'existe. Lancé seul, il lance tout le graphe.
//  3. Il déclare `jamaisCache` : son résultat dépend de tout le graphe, que les empreintes du
//     cache ne regardent pas.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { executionCourante } from "./grapheGlobal";
import { bandeSon, etapesDeLExecution, planifier } from "../audio/demonstration";

const en = () => langueCourante() === "en";

// Import DYNAMIQUE, comme dans documentation.ts : audio/adaptateur importe plugins/index, qui
// importe ce fichier.
async function obtenirRegistre() {
  const { registre } = await import("../audio/adaptateur");
  return registre;
}

const RESOLUTIONS: Record<string, [number, number]> = { "480p": [854, 480], "720p": [1280, 720], "1080p": [1920, 1080] };

export const fiches: FicheAudio[] = ([
  {
    id: "demonstration", nom: "Démonstration", nomEn: "Demonstration",
    univers: "Autres", famille: "Vidéo",
    resume: "Fabrique la vidéo du graphe où il est posé : chaque nœud à son tour, son nom, ses réglages, et son résultat joué ou affiché.",
    resumeEn: "Makes a video of the graph it sits in: each node in turn, its name, its settings, and its result played or shown.",
    notice: "Ce nœud fabrique une vidéo du graphe où il est posé. Il ne se branche à rien : il passe après tous les autres nœuds, reprend leurs résultats et consacre à chacun un segment de même durée.\n\nLes nœuds sont montrés en suivant les chaînes du graphe : un nœud vient juste après celui qui l'alimente, avant de passer à une autre branche. Aucun nœud n'est montré avant ce qu'il reçoit.\n\nChaque segment montre le nom du nœud, son résumé, ses réglages, et son résultat. Un son est joué, et sa forme d'onde défile sous une tête de lecture ; une courbe est tracée et parcourue ; une image est affichée ; un texte est affiché, et défile s'il dépasse le cadre. Un nœud qui rend plusieurs choses est montré par son son d'abord, puis son image, sa courbe, son texte. Un nœud qui ne rend rien de montrable n'a pas de segment. En bas de l'image, la chaîne des étapes situe le nœud courant : un trait relie deux étapes quand la première alimente la seconde, un point les sépare sinon.\n\nLe son d'un nœud commence 0,4 s après le début de son segment et s'arrête 0,3 s avant la fin ; un son plus long est coupé avec un fondu, et la légende indique l'extrait joué. Les sons sont posés tels quels, sans normalisation : on entend les niveaux que le graphe produit.\n\nLa vidéo est rendue hors temps réel, image par image, et encodée en WebM (vidéo VP9, son Opus à 48 kHz) : deux rendus du même graphe donnent la même vidéo. Lancer ce nœud seul lance tout le graphe. Les copies d'un nœud dans une boucle n'ont qu'un segment, qui montre le résultat du dernier tour.",
    noticeEn: "This node makes a video of the graph it sits in. It connects to nothing: it runs after every other node, takes their results and gives each one a segment of the same length.\n\nNodes are shown following the chains of the graph: a node comes right after the one that feeds it, before moving on to another branch. No node is shown before what it receives.\n\nEach segment shows the node's name, its summary, its settings, and its result. A sound is played while its waveform scrolls under a playhead; a curve is drawn and traversed; an image is shown; a text is shown, and scrolls if it overflows the frame. A node that returns several things is shown by its sound first, then its image, its curve, its text. A node that returns nothing showable gets no segment. At the bottom of the picture, the chain of steps places the current node: a line joins two steps when the first feeds the second, a dot separates them otherwise.\n\nA node's sound starts 0.4 s after the start of its segment and stops 0.3 s before the end; a longer sound is cut with a fade, and the caption gives the excerpt played. Sounds are laid in as they are, without normalisation: one hears the levels the graph produces.\n\nThe video is rendered offline, frame by frame, and encoded as WebM (VP9 video, Opus sound at 48 kHz): two renders of the same graph give the same video. Running this node alone runs the whole graph. The copies of a node inside a loop get a single segment, showing the result of the last pass.",
    entrees: [],
    sorties: [{ nom: "Vidéo", nomEn: "Video", type: "fichier" }],
    jamaisCache: true,
    executerEnDernier: true,
    parametres: [
      { nom: "Durée par nœud", nomEn: "Length per node", type: "curseur", plage: [2, 60], pas: 0.5, defaut: 6, unite: "s",
        doc: "Durée du segment de chaque nœud. Un son plus long que le segment, moins 0,7 s, est coupé.",
        docEn: "Length of each node's segment. A sound longer than the segment, minus 0.7 s, is cut." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "", defautEn: "", placeholder: "Une voix, trois traitements", placeholderEn: "One voice, three treatments",
        doc: "Titre affiché sur un carton d'ouverture de 3 s. Vide, la vidéo commence directement par le premier nœud.",
        docEn: "Title shown on a 3 s opening card. Empty, the video starts straight on the first node." },
      { nom: "Résolution", nomEn: "Resolution", type: "choix", options: ["480p", "720p", "1080p"], optionsEn: ["480p", "720p", "1080p"],
        optionIds: ["480p", "720p", "1080p"], defaut: "720p", defautEn: "720p",
        doc: "Taille de l'image : 854 × 480, 1280 × 720 ou 1920 × 1080. Le temps de rendu croît avec elle.",
        docEn: "Picture size: 854 × 480, 1280 × 720 or 1920 × 1080. Rendering time grows with it." },
      { nom: "Images par seconde", nomEn: "Frames per second", type: "choix", options: ["24", "30", "60"], optionsEn: ["24", "30", "60"],
        optionIds: ["24", "30", "60"], defaut: "30", defautEn: "30",
        doc: "Cadence de la vidéo. 60 rend le défilement plus fluide et double le temps de rendu.",
        docEn: "Video frame rate. 60 makes scrolling smoother and doubles rendering time." },
      { nom: "Réglages", nomEn: "Settings", type: "choix", options: ["Affichés", "Masqués"], optionsEn: ["Shown", "Hidden"],
        optionIds: ["affiches", "masques"], defaut: "Affichés", defautEn: "Shown",
        doc: "Affiche à droite de chaque segment les valeurs réglées du nœud, huit au plus. Masqués, le résultat prend toute la largeur.",
        docEn: "Shows the node's set values to the right of each segment, eight at most. Hidden, the result takes the full width." },
    ],
    async executer(ctx: any) {
      const exec = executionCourante();
      if (!exec) return { valeurs: [null], message: en() ? "No run in progress." : "Aucune exécution en cours." };
      const registre = await obtenirRegistre();
      const anglais = en();
      const etapes = etapesDeLExecution(
        exec,
        (ficheId) => {
          const def = registre.trouverDef(ficheId);
          if (!def) return null;
          return {
            nom: (anglais && def.nomEn) || def.nom,
            resume: (anglais && def.resumeEn) || def.resume,
            parametres: (def.parametres as { nom: string; nomEn?: string; defaut?: unknown; modulationDe?: string; unite?: string; uniteEn?: string }[])
              .map((p) => ({ ...p, cle: p.nom, nom: (anglais && p.nomEn) || p.nom, unite: (anglais && p.uniteEn) || p.unite })),
          };
        },
        (ficheId) => registre.trouverDef(ficheId)?.executerEnDernier === true,
        anglais,
      );
      if (!etapes.length) {
        return { valeurs: [null], message: anglais ? "No node returned anything showable." : "Aucun nœud n'a rendu de résultat montrable." };
      }
      const plan = planifier(etapes, { dureeParNoeud: ctx.paramNombre("Durée par nœud", 6), titre: ctx.paramTexte("Titre", "") });
      const [largeur, hauteur] = RESOLUTIONS[String(ctx.paramTexte("Résolution", "720p"))] ?? RESOLUTIONS["720p"];
      const ips = Number(ctx.paramTexte("Images par seconde", "30")) || 30;
      const { rendreVideo } = await import("../audio/demonstration-video");
      const video = await rendreVideo(plan, bandeSon(plan), {
        largeur, hauteur, ips,
        afficherReglages: String(ctx.paramTexte("Réglages", "affiches")) !== "masques",
        textes: {
          etapes: anglais ? "steps" : "étapes",
          extrait: (a, b) => (anglais ? `excerpt ${a} of ${b}` : `extrait de ${a} sur ${b}`),
        },
        signal: ctx.signal,
        onProgress: (f) => ctx.onProgress?.(`${Math.round(f * 100)} %`),
      });
      const fichier = new File([video], "demonstration.webm", { type: "video/webm" });
      const data = ctx.noeud.data as Record<string, unknown>;
      if (typeof data._demoVideoUrl === "string") URL.revokeObjectURL(data._demoVideoUrl);
      data._demoVideoUrl = URL.createObjectURL(video);
      data._demoVideoTaille = video.size;
      const duree = (Math.round(plan.duree * 10) / 10).toLocaleString(anglais ? "en-US" : "fr-FR");
      return {
        valeurs: [fichier],
        message: `${etapes.length} ${anglais ? "steps" : "étapes"} · ${duree} s · ${largeur} × ${hauteur}`,
      };
    },
  },
  {
    id: "film-application", nom: "Film de l'application", nomEn: "Application Film",
    univers: "Autres", famille: "Vidéo",
    resume: "Filme la fenêtre d'Attic pendant qu'elle construit le graphe où il est posé, le lance et fait entendre chaque nœud.",
    resumeEn: "Films the Attic window while it builds the graph it sits in, runs it and plays each node.",
    notice: "Ce nœud filme la fenêtre d'Attic pendant qu'elle rejoue le graphe où il est posé. Il ne se branche à rien ; le film se lance par son bouton « Filmer l'application », et non par l'exécution du graphe.¶D'abord la construction : le canevas se vide, puis chaque nœud apparaît à sa place, avec en légende son nom et l'endroit de la palette où il se trouve ; ses câbles se tirent depuis les nœuds déjà posés, et ses réglages s'ouvrent dans l'inspecteur. Les nœuds sont posés en suivant les chaînes du graphe : un nœud vient juste après celui qui l'alimente. Puis la visite : le graphe est lancé, la vue s'approche de chaque nœud à son tour, l'inspecteur montre ses réglages, et son résultat se fait entendre pendant la durée par nœud. Un curseur dessiné montre chaque geste. Le film finit sur le graphe entier.¶Le titre, s'il est rempli, ouvre le film. Échap interrompt. À la fin, le graphe, la vue et la sélection sont rendus tels qu'ils étaient, avec les résultats du run. Dans Attic, la fenêtre se filme elle-même ; dans un navigateur, celui-ci demande l'autorisation de partager l'onglet. Le son enregistré est celui des résultats écoutés. Le film est un WebM, à la taille de la fenêtre.",
    noticeEn: "This node films the Attic window while it replays the graph it sits in. It connects to nothing; the film starts from its « Film the application » button, not from running the graph.¶First the construction: the canvas empties, then each node appears in its place, captioned with its name and where it sits in the palette; its cables are drawn from the nodes already placed, and its settings open in the inspector. Nodes are placed following the chains of the graph: a node comes right after the one that feeds it. Then the tour: the graph runs, the view moves close to each node in turn, the inspector shows its settings, and its result is heard for the length per node. A drawn cursor shows every gesture. The film ends on the whole graph.¶The title, if filled in, opens the film. Esc stops it. At the end, the graph, the view and the selection are put back as they were, with the results of the run. In Attic, the window films itself; in a browser, the browser asks permission to share the tab. The recorded sound is that of the results played. The film is a WebM, at the size of the window.",
    entrees: [],
    sorties: [],
    sortieNullePermise: true,
    parametres: [
      { nom: "Durée par nœud", nomEn: "Length per node", type: "curseur", plage: [1, 60], pas: 0.5, defaut: 5, unite: "s",
        doc: "Temps d'écoute de chaque nœud pendant la visite. Un son plus court s'arrête avant ; un nœud qui ne rend ni son ni image est passé.",
        docEn: "Listening time for each node during the tour. A shorter sound stops earlier; a node that returns neither sound nor picture is skipped." },
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "", defautEn: "", placeholder: "Une voix, trois traitements", placeholderEn: "One voice, three treatments",
        doc: "Titre affiché 3 s en ouverture du film. Vide, le film commence directement par la construction.",
        docEn: "Title shown for 3 s at the opening of the film. Empty, the film starts straight on the construction." },
    ],
    async executer() {
      return { valeurs: [], message: en() ? "Use « Film the application »." : "Utiliser « Filmer l'application »." };
    },
  },
] as FicheAudio[]).map(avecDoc);
