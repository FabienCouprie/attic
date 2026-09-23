// plugins/documentation.ts — Nœud « Documentation du graphe ».
//
// Le cas d'usage qui l'a fait naître : construire une application sur un graphe d'Attic — un
// synthétiseur soustractif, par exemple — et devoir confier à un agent la documentation
// complète de ce graphe et des composants qui le forment. Jusqu'ici, il fallait la rassembler
// à la main : lire chaque nœud dans l'inspecteur, relever chaque valeur, retrouver chaque
// notice dans COMPONENTS.md, redessiner le câblage. Ce nœud le fait en se posant sur le graphe.
//
// Il produit deux textes du même modèle, pour deux publics qui ne lisent pas la même chose :
// du Markdown dense pour un agent, et un site d'une seule page pour un humain. La fabrication
// vit dans `docs/documentation-graphe.ts`, pure et testée ; ce fichier n'est que la prise.
//
// DEUX PARTICULARITÉS, et elles ont l'une et l'autre une raison :
//
//  1. Il lit le graphe par un état ambiant (`grapheGlobal.ts`) et non par son contexte
//     d'exécution : le contrat du cœur ne porte pas le graphe, délibérément. Voir l'en-tête de
//     ce module, qui explique pourquoi on ne l'élargit pas.
//  2. Il déclare `jamaisCache`. Son résultat ne dépend ni de ses entrées — il n'en a pas — ni
//     de ses paramètres, mais du GRAPHE ENTIER, que les empreintes du cache ne regardent pas.
//     Sans ce drapeau il rendrait la documentation de l'avant-dernier état du graphe, ce qui
//     est exactement le genre de mémoire qu'on vient de corriger ailleurs.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { grapheCourant } from "./grapheGlobal";
import {
  documenterGraphe, documentationVersHtml, documentationVersMarkdown,
} from "../docs/documentation-graphe";

// Import DYNAMIQUE, comme dans prompt-graphe.ts : audio/adaptateur importe plugins/index, qui
// importe ce fichier. Un import statique fermerait le cycle et casserait l'initialisation dès
// qu'un test entre directement par ici.
async function obtenirRegistre() {
  const { registre } = await import("../audio/adaptateur");
  return registre;
}

export const fiches: FicheAudio[] = ([
  {
    id: "documentation-graphe", nom: "Documentation du graphe", nomEn: "Graph Documentation",
    univers: "Autres", famille: "Texte",
    resume: "Documente le graphe où il est posé : chaque composant, ses valeurs réglées, son câblage, et la notice de chaque composant employé.",
    resumeEn: "Documents the graph it sits in: every node, its set values, its wiring, and the notice of every component used.",
    entrees: [],
    sorties: [
      { nom: "Documentation", nomEn: "Documentation", type: "texte" },
      { nom: "Site", nomEn: "Site", type: "texte" },
    ],
    parametres: [
      { nom: "Titre", nomEn: "Title", type: "texte", defaut: "", defautEn: "",
        placeholder: "Synthétiseur soustractif", placeholderEn: "Subtractive synthesizer",
        doc: "Titre du document. Vide, le document s'appelle « Documentation du graphe ».",
        docEn: "Title of the document. Empty, the document is called « Graph documentation »." },
      { nom: "Notices", nomEn: "Notices", type: "choix",
        options: ["Complètes", "Résumés seuls"], optionsEn: ["Full", "Summaries only"],
        optionIds: ["completes", "resumes"], defaut: "Complètes", defautEn: "Full",
        doc: "Les notices entières de chaque composant, ou leurs seuls résumés. Entières pour un agent, à qui elles disent ce que fait chaque composant et pourquoi ; résumés pour une vue d'ensemble, le document étant alors quatre à cinq fois plus court.",
        docEn: "Each component's full notice, or its summary alone. Full for an agent, to whom they say what each node does and why; summaries for an overview, the document then being four to five times shorter." },
      { nom: "Dossier de sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Où écrire « documentation.md » et « index.html ». Vide, rien n'est écrit sur le disque et les deux textes ne sortent que par les ports, de quoi les brancher sur un modèle de langage ou sur un composant de texte.",
        docEn: "Where to write « documentation.md » and « index.html ». Empty, nothing is written to disk and both texts leave through the ports only, enough to feed a language model or a text node." },
    ],
    // Son résultat dépend du graphe entier, qu'aucune empreinte de cache ne regarde.
    jamaisCache: true,
    async executer(ctx: any) {
      const graphe = grapheCourant();
      if (!graphe || graphe.noeuds.length === 0) {
        return { valeurs: [null, null], erreur: true, message: traduire("msg.doc.aucunGraphe") };
      }
      const registre = await obtenirRegistre();
      const doc = documenterGraphe({
        noeuds: graphe.noeuds,
        aretes: graphe.aretes,
        fiches: registre.tousLesPlugins() as FicheAudio[],
        langue: langueCourante() === "en" ? "en" : "fr",
        titre: ctx.paramTexte("Titre", ""),
        notices: ctx.paramTexte("Notices", "completes") === "completes",
        libelleFlux: (type: string) => registre.typeFlux(type)?.libelle ?? type,
      });
      const markdown = documentationVersMarkdown(doc);
      const html = documentationVersHtml(doc);

      // L'écriture sur le disque est facultative et explicite : sans dossier, le nœud ne
      // touche à rien. Un nœud qui écrirait de lui-même dans le répertoire de travail à
      // chaque lancement serait une mauvaise surprise.
      const dossier = ctx.paramTexte("Dossier de sortie", "").trim().replace(/\\/g, "/");
      let ecrits = 0;
      if (dossier) {
        const api = (window as any).api;
        if (!api?.ecrireFichier) {
          return {
            valeurs: [markdown, html],
            message: traduire("msg.doc.sansElectron", String(doc.compte.noeuds)),
          };
        }
        const sansSlash = dossier.replace(/\/+$/, "");
        if (await api.ecrireFichier(`${sansSlash}/documentation.md`, markdown)) ecrits++;
        if (await api.ecrireFichier(`${sansSlash}/index.html`, html)) ecrits++;
      }

      return {
        valeurs: [markdown, html],
        message: traduire(dossier ? "msg.doc.ecrit" : "msg.doc.rendu",
          String(doc.compte.noeuds), String(doc.compte.composants),
          dossier ? String(ecrits) : String(doc.avertissements.length)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
