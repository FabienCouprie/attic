// plugins/noms-de-ports.test.ts — Un port porte le nom de ce qu'il reçoit.
//
// POURQUOI CE GARDE EXISTE. Le dépôt gouverne les VALEURS de ses réglages — gammes, fenêtres,
// qualités d'accord — par le registre des nomenclatures. Il ne gouvernait rien des NOMS DE PORT :
// mille quatre cent quatre-vingt-deux ports, trois cent trois noms, et aucun cas pour les tenir.
//
// CE QUE CELA A COÛTÉ, MESURÉ. « Texte → MIDI » recevait sa notation sur un port nommé « Texte »
// pendant que son propre réglage de repli s'appelait « Notation », et que quatre sorties du
// catalogue nommées « Notation » écrivaient précisément ce format. Un plan de chanson branché là
// était accepté et rendait zéro note : le câble était licite, les couleurs s'accordaient, et rien
// dans le graphe ne pouvait le dire. Même faute sur « ABC → MIDI », dont deux frères nomment « ABC »
// le port par lequel ils reçoivent la même chose.
//
// LA RÈGLE QUE CE FICHIER TIENT, et elle est étroite à dessein : quand une fiche n'a QU'UNE entrée
// texte et QU'UN réglage texte, le second est presque toujours le repli du premier — l'exécuteur
// écrit `ctx.entree(0) || ctx.paramTexte(...)` —, et les deux doivent alors porter le même nom.
// Quand ce n'est pas le cas, la fiche le DÉCLARE avec sa raison, plutôt que de diverger en silence.
//
// POURQUOI PAS PLUS LARGE. Le relevé a trouvé quinze noms de port qui portent plusieurs types de
// flux, dont « Accords » qui en porte trois. Six ne sont que la décoration `mono`/`stereo` d'un même
// type `audio` ; les neuf autres sont réels, et traversent cinq types de flux et des familles
// entières. Les tenir demande de nommer les CONTENUS, ce que le dépôt ne sait pas encore faire. Ce
// garde-ci tient ce qui se mesure sur une seule fiche, et rien de plus.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";

/**
 * Les fiches dont l'entrée texte et le réglage texte ne portent pas le même nom À DESSEIN.
 *
 * CHACUNE PORTE SA RAISON, comme le registre des nomenclatures l'exige de ses formes assumées : une
 * divergence sans raison écrite est une faute qui n'a pas encore été vue. Le mot DETTE marque celles
 * qui se paieront, par opposition à celles où le réglage n'est tout simplement pas le repli du port.
 */
const DIVERGENCES_DECLAREES: Record<string, string> = {
  "musicxml":
    "Le réglage n'est pas le repli du port : l'entrée reçoit un arbre rythmique, et le réglage nomme la partition écrite.",
  "galerie-exposition":
    "Le réglage n'est pas le repli du port : l'entrée reçoit des coordonnées, et le réglage nomme l'exposition.",
  "julia-processor":
    "Le réglage n'est pas le repli du port : l'entrée reçoit la donnée à traiter, et le réglage porte le programme qui la traite.",
  "python-processor":
    "Le réglage n'est pas le repli du port : l'entrée reçoit la donnée à traiter, et le réglage porte le programme qui la traite.",
  "tonal-progression":
    "Le réglage n'est pas le repli du port : l'entrée reçoit la tonique, et le réglage la suite de degrés.",
  "gpt2-paroles":
    "DETTE. Le port EST le repli du réglage « Prompt » — l'exécuteur écrit `ctx.entree(0) || ctx.paramTexte(\"Prompt\")` —, et deux autres nœuds nomment déjà « Prompt » le port par lequel ils reçoivent la même chose. À payer avec la famille du prompt, qui n'est pas celle de la notation.",
  "nllb-paroles":
    "DETTE. Même faute que « DistilGPT-2 », et même remède : le port est le repli de « Prompt », et le nom existe déjà ailleurs.",
  "qwen2.5-lyrics":
    "DETTE. Troisième de la famille du prompt, et celle que le catalogue engendré ne montrait pas : son identifiant porte un point, que le relevé lisait mal. Le registre vivant, lui, la rend.",
};

const nomsTexte = (ports: readonly { nom: string; type?: string }[] | undefined) =>
  (ports ?? []).filter((p) => p.type === "texte").map((p) => p.nom);

describe("les noms de port", () => {
  it("UNE ENTRÉE TEXTE PORTE LE NOM DE SON RÉGLAGE DE REPLI, ou la fiche dit pourquoi non", () => {
    // DÉFAUT REPLANTÉ en rendant à « Texte → MIDI » ou à « ABC → MIDI » son ancien port « Texte » :
    // la fiche reparaît dans la liste, et ce cas tombe en la nommant.
    const divergentes = toutesLesFiches
      .filter((f: any) => nomsTexte(f.entrees).length === 1 && nomsTexte(f.parametres as any).length === 1)
      .filter((f: any) => nomsTexte(f.entrees)[0] !== nomsTexte(f.parametres as any)[0])
      .map((f: any) => f.id)
      .sort();
    expect(divergentes, [
      "Une entrée texte ne porte pas le nom de son réglage de repli.",
      "Soit le port est mal nommé — il doit dire CE QU'IL REÇOIT, et non son type —,",
      "soit le réglage n'est pas ce repli, et la fiche le déclare ici avec sa raison.",
    ].join("\n")).toEqual(Object.keys(DIVERGENCES_DECLAREES).sort());
  });

  it("et chaque divergence déclarée porte une raison écrite", () => {
    for (const [id, raison] of Object.entries(DIVERGENCES_DECLAREES)) {
      expect(raison.length, id).toBeGreaterThan(40);
      expect(raison.trim().endsWith("."), id).toBe(true);
    }
  });

  it("LE CONTENU DE LA NOTATION A UN SEUL NOM DE PORT, des deux côtés du câble", () => {
    // CE QUE CE CAS TIENT, ET QUI EST LA RAISON D'ÊTRE DU LOT. Quatre sorties écrivent le format de
    // « Texte → MIDI » sous le nom « Notation » ; la seule entrée qui le lit le portait sous le nom
    // « Texte ». Les cinq s'accordent désormais, et un cinquième producteur ajouté demain sous un
    // autre nom fera tomber ce cas-ci.
    const fiches = toutesLesFiches;
    const sortiesNotation = fiches
      .filter((f) => (f.sorties ?? []).some((s: any) => s.type === "texte" && s.nom === "Notation"))
      .map((f: any) => f.id).sort();
    expect(sortiesNotation).toEqual(
      ["accords-joues", "accords-vers-notation", "gamme-jouee", "tonal-grille"]);
    const lecteur = fiches.find((f: any) => f.id === "texte-vers-midi")!;
    expect(nomsTexte(lecteur.entrees)).toEqual(["Notation"]);
    expect(nomsTexte(lecteur.parametres as any)).toEqual(["Notation"]);
  });

  it("ET L'ABC AUSSI : les trois nœuds qui en reçoivent nomment leur port de la même façon", () => {
    const fiches = toutesLesFiches;
    for (const id of ["abc-vers-midi", "reprise-abc", "edition-abc-llm"]) {
      const f = fiches.find((x: any) => x.id === id);
      expect(f, id).toBeDefined();
      expect((f!.entrees ?? []).map((e: any) => e.nom), id).toContain("ABC");
    }
  });
});
