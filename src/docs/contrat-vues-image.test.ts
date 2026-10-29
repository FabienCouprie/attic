// @vitest-environment jsdom
// src/docs/contrat-vues-image.test.ts — Un composant qui rend une image la montre sur son nœud.
//
// LE DÉFAUT, RELEVÉ LE 2026-10-29 en filmant la présentation : « Texte → image (MOSS) » passait à
// « Done » après 165 s de calcul, message « Seed 42 · 512 × 512 », et son nœud ne montrait rien.
// L'image existait pourtant, dans le magasin des résultats : branchée sur « Rendu d'image », elle
// s'affichait. Une sortie image ne se montre pas d'elle-même, il faut une vue déclarée au registre
// (`vues-domaine/vues.tsx`), et ce composant n'en avait pas quand « Texte → image » avait la sienne.
//
// LA LISTE EST CELLE DU REGISTRE, jamais une liste recopiée : toute fiche qui déclare une sortie de
// type « image » est éprouvée, et celle qu'on ajoutera demain le sera le jour même. Relevé à
// l'écriture de ce garde : 510 fiches, 21 à sortie image, et cinq sans aucune vue, MOSS compris.
//
// CE QUI EST ÉPROUVÉ EST LA FORME, et non un nom de vue. Chaque vue que le registre donne au
// composant est montée avec une image posée là où l'exécution la pose, `imageResultatUrl` ; il passe
// si l'une d'elles rend cette image. Trois vues montrent l'image par un autre canal : chacune est
// alors montée avec ce canal-là, et doit rendre un dessin.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlowProvider } from "@xyflow/react";

import { toutesLesFiches } from "../plugins";
// Le shell demande son registre au lieu de l'importer : ce test exerce `vues-domaine/vues.tsx`, il
// doit donc en déposer un, comme le fait la racine de composition.
import { registre } from "../audio/adaptateur";
import { configurerRegistreUI, type RegistreUI } from "../ui/registre-actif";
import { vuesPourNoeud, type Vue } from "../ui/registre-vues";
import type { DonneesNoeud } from "../ui/AtelierNode";
// Les vues du domaine se déclarent par un effet de bord, que ce test provoque comme l'application.
import "../vues-domaine/vues";
import { VueGravure, VuePochette, VueVexFlow } from "../vues-domaine/vues-images";

configurerRegistreUI(registre as unknown as RegistreUI);
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
// jsdom n'écrit pas d'adresse d'objet, et la pochette en demande une pour son propre dessin.
if (typeof URL.createObjectURL !== "function") URL.createObjectURL = () => "blob:dessin-de-la-vue";
if (typeof URL.revokeObjectURL !== "function") URL.revokeObjectURL = () => {};

/** L'adresse de l'image posée dans le nœud, comme l'exécution la pose après un run. */
const URL_SONDE = "blob:sonde-image";
const SVG_SONDE = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"></svg>";

/**
 * LES VUES QUI MONTRENT L'IMAGE PAR UN AUTRE CANAL, et ce qu'il faut leur donner pour qu'elles la
 * montrent. Les portées VexFlow reçoivent leur SVG par le message, la gravure Verovio par le canal du
 * texte, et la pochette se redessine de ses réglages, sans attendre de run. Chacune est montée avec
 * ce canal et doit rendre un dessin : une vue de cette table qui cesserait de dessiner fait tomber
 * ses composants, et ne les laisse pas passer.
 */
const AUTRE_CANAL = new Map<Vue, Partial<DonneesNoeud>>([
  [VueVexFlow, { audioResultatMessage: SVG_SONDE }],
  [VueGravure, { scriptGenere: SVG_SONDE }],
  [VuePochette, {}],
]);

/**
 * LES COMPOSANTS QUI NE MONTRENT PAS LEUR IMAGE PAR DÉCISION, et non par oubli. Leur image reste sur
 * son port, pour qui la branche ailleurs. Ce garde tient la décision dans les deux sens : un
 * composant de cette table qui se mettrait à montrer son image la contredirait.
 */
const SANS_IMAGE_VOULUE = new Map<string, string>([
  ["classification-pistes", "pas de graphique sur le nœud, décidé par Fabien le 2026-10-29"],
]);

/**
 * LES COMPOSANTS QUI RENDENT UNE IMAGE SANS LA MONTRER, et laissés tels quels. Le relevé en a trouvé
 * cinq ; MOSS, « Spectrogramme fractal » et « Spectrogramme → image » ont reçu leur vue le même jour,
 * et la classification de pistes est passée dans la table des décisions. Cette liste ne peut que
 * décroître, comme la dette de taille : un composant réparé doit en sortir.
 */
const DETTE = new Map<string, string>([
  // UNE LIGNE AU REGISTRE NE LE RÉPARERAIT PAS : sa sortie « Matrice » porte un texte SVG et non un
  // fichier, que l'exécution range parmi les textes (`scriptGenere`), où une vue d'image ne cherche pas.
  ["auto-similarite", "rend sa matrice en texte SVG et non en fichier, et n'a aucune vue"],
]);

/** Monte une vue comme le nœud la monte, rend une copie de ce qu'elle a dessiné, et la démonte. */
function monter(vue: Vue, ficheId: string, donnees: Partial<DonneesNoeud>): HTMLElement {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  const data = { ficheId, parametres: {}, statut: "termine", ...donnees } as DonneesNoeud;
  act(() => {
    racine.render(createElement(ReactFlowProvider, null,
      createElement(vue, { id: "sonde", data, def: registre.trouverDef(ficheId) as never })));
  });
  const rendu = hote.cloneNode(true) as HTMLElement;
  act(() => racine.unmount());
  hote.remove();
  return rendu;
}

const vuesDe = (ficheId: string): Vue[] => [...vuesPourNoeud(ficheId, "avant"), ...vuesPourNoeud(ficheId, "apres")];

/** La vue par laquelle le nœud montre son image, ou `null` s'il ne la montre pas. */
function vueQuiMontre(ficheId: string): string | null {
  for (const vue of vuesDe(ficheId)) {
    if (monter(vue, ficheId, { imageResultatUrl: URL_SONDE }).querySelector(`img[src="${URL_SONDE}"]`)) return vue.name;
    const canal = AUTRE_CANAL.get(vue);
    if (canal && monter(vue, ficheId, canal).querySelector("svg, img")) return `${vue.name}, par un autre canal`;
  }
  return null;
}

const aImage = toutesLesFiches.filter((f) => (f.sorties ?? []).some((s) => s.type === "image"));

describe("un composant qui rend une image", () => {
  it("EST TROUVÉ AU REGISTRE, et la sonde reconnaît une image montrée", () => {
    // UN GARDE QUI NE TROUVERAIT PLUS RIEN PASSERAIT AU VERT EN N'ÉPROUVANT RIEN : le compte relevé à
    // l'écriture sert de plancher, et deux réponses connues d'avance éprouvent la sonde elle-même.
    expect(aImage.length, "la lecture du registre ne trouve plus les sorties image").toBeGreaterThanOrEqual(21);
    expect(vueQuiMontre("rendu-image"), "« Rendu image » montre ce qu'il reçoit").toBe("VueRenduImage");
    expect(vueQuiMontre("vexflow-portee"), "la portée se dessine par son message").toBe("VueVexFlow, par un autre canal");
  });

  it("LA MONTRE SUR SON NŒUD, par une vue déclarée au registre", () => {
    const excuses = (id: string) => DETTE.has(id) || SANS_IMAGE_VOULUE.has(id);
    const fautes = aImage.filter((f) => !excuses(f.id) && vueQuiMontre(f.id) === null).map((f) => {
      const vues = vuesDe(f.id).map((v) => v.name);
      return `${f.id} (${f.nom}) : ${vues.length ? `ses vues ${vues.join(" + ")} ne montrent pas l'image` : "aucune vue au registre"}`;
    });
    expect(fautes, "une sortie image ne se montre pas d'elle-même : déclarer une vue dans vues-domaine/vues.tsx")
      .toEqual([]);
  });

  it("ET LA DETTE NE PEUT QUE DÉCROÎTRE : un composant réparé en sort", () => {
    const sortis = [...DETTE.keys()].filter((id) => !aImage.some((f) => f.id === id) || vueQuiMontre(id) !== null);
    expect(sortis, "ces composants montrent leur image ou n'en rendent plus : les retirer de DETTE").toEqual([]);
  });

  it("ET UNE DÉCISION DE NE PAS LA MONTRER EST TENUE : le composant rend une image et n'a pas de vue qui la montre", () => {
    const contredits = [...SANS_IMAGE_VOULUE.entries()]
      .filter(([id]) => !aImage.some((f) => f.id === id) || vueQuiMontre(id) !== null)
      .map(([id, pourquoi]) => `${id} : ${pourquoi}`);
    expect(contredits, "la décision n'a plus d'objet ou elle est contredite : la relire avec Fabien").toEqual([]);
  });
});
