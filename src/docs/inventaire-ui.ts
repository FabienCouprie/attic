// src/docs/inventaire-ui.ts — L'habillage de chaque composant, écrit noir sur blanc.
//
// POURQUOI CE FICHIER EXISTE.
//
// Le catalogue (COMPONENTS.md) dit ce que chaque composant FAIT : ses ports, ses paramètres, sa
// notice. Rien ne disait comment il est MONTRÉ. Or l'affichage d'un composant ne se décide pas
// dans son propre fichier : il se décide dans trois tables partagées, loin de lui.
//
//   • `ui/vues.tsx` — quelle vue l'habille, et de quel côté du lecteur audio
//   • `ui/tailles-noeuds.ts` — la taille qu'il reçoit à sa création
//   • `ui/AtelierNode.tsx` — s'il est redimensionnable, et si le lecteur générique lui est laissé
//
// Une ligne changée dans l'une de ces tables modifie un composant qu'on ne regardait pas, et rien
// ne le dit. C'est arrivé : en ajoutant la gravure de partition, la ligne du cercle pulsant a
// changé de vue dans le même commit. Sa nouvelle vue exigeait une hauteur que ce composant ne
// reçoit pas ; son animation s'est écrasée à zéro, et personne ne l'a su avant de l'ouvrir.
//
// CE QUE CE FICHIER APPORTE. L'inventaire est VERSIONNÉ et vérifié par un test. Toucher à l'une des
// trois tables fait apparaître, dans le diff, une ligne par composant affecté :
//
//   - | cercle-pulsant | VueAttracteurIFS | avant | 240 × 162 | non | non |
//   + | cercle-pulsant | VueAnimationSvg  | avant | 240 × 162 | non | non |
//
// On n'a plus à ouvrir quatre cents composants : on lit le diff. Il ne dit pas si le résultat est
// bon — il dit QUI est concerné, ce qui est la seule question à laquelle une relecture ne peut pas
// répondre toute seule.
//
// Régénération : `npm run docs:interface`.
import { vuesPourNoeud, vueAvantMasqueMessage, vueAvantPorteLecteur } from "../ui/vues";
import { tailleDefaut } from "../ui/tailles-noeuds";
import type { FicheAudio } from "../audio/types-domaine";

export interface LigneInventaire {
  id: string;
  nom: string;
  vueAvant: string;
  vueApres: string;
  largeur: number;
  hauteur: number;
  /** Un `NodeResizer` est posé sur le nœud : sa hauteur est alors explicite, en pixels. */
  redimensionnable: boolean;
  /** Le lecteur audio générique du nœud. Il n'est retiré que si une vue DÉCLARE porter
   *  elle-même un moyen d'écouter, par `porteLecteur` dans le registre des vues. */
  lecteurGenerique: boolean;
  masqueMessage: boolean;
}

/** Les vues qui embarquent leur propre `NodeResizer`, et posent donc une hauteur sur leur nœud. */
const VUES_AVEC_REDIMENSIONNEUR = new Set(["VueAttracteurIFS", "VueRenduImage", "SongseeVue"]);

const nomsDeVues = (ficheId: string, position: "avant" | "apres"): string[] =>
  vuesPourNoeud(ficheId, position).map((v) => v.name || "(anonyme)");

export function inventorier(fiches: readonly FicheAudio[]): LigneInventaire[] {
  return fiches.map((f) => {
    const avant = nomsDeVues(f.id, "avant");
    const apres = nomsDeVues(f.id, "apres");
    const { width, height } = tailleDefaut(f);
    return {
      id: f.id,
      nom: f.nom,
      vueAvant: avant.join(" + ") || "—",
      vueApres: apres.join(" + ") || "—",
      largeur: width,
      hauteur: height,
      // `estVexFlow` dans AtelierNode.tsx, plus les vues qui posent le leur.
      redimensionnable: f.id.startsWith("vexflow-") || avant.some((v) => VUES_AVEC_REDIMENSIONNEUR.has(v)),
      // `!vueAvantPorteLecteur(id)` dans AtelierNode.tsx : une vue doit DECLARER porter un
      // lecteur pour que le noeud retire le sien.
      lecteurGenerique: !vueAvantPorteLecteur(f.id),
      masqueMessage: vueAvantMasqueMessage(f.id),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

const oui = (b: boolean) => (b ? "oui" : "non");

export function genererInventaireMarkdown(fiches: readonly FicheAudio[]): string {
  const lignes = inventorier(fiches);
  const habilles = lignes.filter((l) => l.vueAvant !== "—" || l.vueApres !== "—");
  const sansLecteur = lignes.filter((l) => !l.lecteurGenerique);

  const out: string[] = [
    "# INTERFACE.md — l'habillage des composants",
    "",
    "> Fichier **généré**. Ne pas éditer à la main : `npm run docs:interface`.",
    "",
    "Ce que chaque composant fait est dans [COMPONENTS.md](COMPONENTS.md). Ce fichier-ci dit comment",
    "il est **montré**, ce qui se décide dans des tables partagées et non dans son propre fichier :",
    "`ui/vues.tsx`, `ui/tailles-noeuds.ts`, `ui/AtelierNode.tsx`.",
    "",
    "Il est versionné pour une seule raison : **rendre visible dans un diff** le composant qu'une",
    "modification touche sans qu'on l'ait voulu. Une ligne qui change ici est un composant à rouvrir.",
    "",
    "## Comment lire une ligne",
    "",
    "- **Vue avant / après** — le composant React qui habille le nœud, avant ou après le lecteur audio.",
    "- **Taille** — ce que le nœud mesure à sa création. Une vue dont la hauteur se déduit d'un ancêtre",
    "  n'affiche rien si cette hauteur ne laisse pas de place : c'est la panne du cercle pulsant.",
    "- **Redimensionnable** — un `NodeResizer` pose une hauteur explicite en pixels sur le nœud.",
    "- **Lecteur générique** : `non` veut dire qu'une vue de ce composant déclare porter elle-même un",
    "  moyen d'écouter, et que le nœud retire donc le sien.",
    "",
    `**${lignes.length} composants**, dont **${habilles.length}** avec une vue propre et **${sansLecteur.length}** sans lecteur générique.`,
    "",
    "## Les composants habillés d'une vue",
    "",
    "| Composant | id | Vue avant | Vue après | Taille | Redim. | Lecteur | Msg masqué |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const l of habilles) {
    out.push(`| ${l.nom} | \`${l.id}\` | ${l.vueAvant} | ${l.vueApres} | ${l.largeur} × ${l.hauteur} | ${oui(l.redimensionnable)} | ${oui(l.lecteurGenerique)} | ${oui(l.masqueMessage)} |`);
  }
  out.push("", "## Les composants sans vue propre", "",
    "Ils reçoivent l'habillage ordinaire : le lecteur audio générique, le message, les ports.", "",
    "| Composant | id | Taille |", "| --- | --- | --- |");
  for (const l of lignes.filter((x) => x.vueAvant === "—" && x.vueApres === "—")) {
    out.push(`| ${l.nom} | \`${l.id}\` | ${l.largeur} × ${l.hauteur} |`);
  }
  out.push("");
  return out.join("\n");
}
