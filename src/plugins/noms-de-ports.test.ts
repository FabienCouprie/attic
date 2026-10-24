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
};

/**
 * Les noms de contenu CANONIQUES, et la règle qu'ils imposent.
 *
 * QUAND UNE FICHE PORTE UN RÉGLAGE TEXTE DE CE NOM ET QU'ELLE A UNE ENTRÉE TEXTE, c'est ce nom que
 * l'entrée doit porter : le réglage est le repli du port, et le contenu a déjà un nom dans le
 * catalogue. Une fiche SANS entrée texte est hors de cette règle — son prompt ne se branche pas, il
 * se saisit, et « Pochette » comme « Film du cercle » sont dans ce cas.
 *
 * POURQUOI CETTE SECONDE RÈGLE EXISTE, ET C'EST UNE MESURE QUI L'A IMPOSÉE. Celle du dessus ne
 * regarde que les fiches à UNE entrée texte et UN réglage texte : elle avait donc attrapé trois des
 * cinq nœuds de la famille du prompt, et laissé passer « LLM Ollama » et « Prompt → graphe », qui
 * portent DEUX réglages texte — le prompt et le modèle. Un garde qui ne tient que le cas simple
 * laisse la faute s'installer là où la fiche est un peu plus fournie.
 *
 * TROIS NOMS SEULEMENT, et ils ne sont pas choisis : ce sont ceux que le relevé des sous-types de
 * texte a mesurés. La liste se complétera au fil de ce qu'on mesure, jamais par symétrie.
 */
const NOMS_CANONIQUES: readonly string[] = ["Prompt", "Notation", "ABC"];

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

  it("UN CONTENU QUI A DÉJÀ UN NOM LE PORTE DES DEUX CÔTÉS, réglage et port", () => {
    // DÉFAUT REPLANTÉ en rendant son ancien port « Texte » à l'un des cinq nœuds du prompt : ce cas
    // le nomme. Sur « LLM Ollama » et « Prompt → graphe », il est le SEUL à tomber — la règle du
    // dessus ne les regarde pas, puisqu'ils portent deux réglages texte.
    const fautifs: string[] = [];
    for (const f of toutesLesFiches as any[]) {
      const entrees = nomsTexte(f.entrees);
      if (entrees.length === 0) continue;
      for (const canon of nomsTexte(f.parametres).filter((n) => NOMS_CANONIQUES.includes(n))) {
        if (!entrees.includes(canon)) fautifs.push(`${f.id} : réglage « ${canon} », entrées [${entrees.join(", ")}]`);
      }
    }
    expect(fautifs, [
      "Une fiche porte un réglage texte dont le nom est celui d'un contenu déjà nommé",
      "dans le catalogue, mais son entrée texte porte un autre nom.",
      "Le réglage est le repli du port : les deux disent la même chose, ils portent le même nom.",
    ].join("\n")).toEqual([]);
  });

  it("LES CINQ GRAVEURS DÉCLARENT LA MÊME PAIRE DE SORTIES « SVG », texte puis fichier", () => {
    // CE CAS COUVRE « PARTITION GRAVÉE », que rien n'exécute : son graveur demande le module WASM de
    // Verovio, et la forme de sa fiche est justement ce que ce lot change. Les quatre autres sont
    // exécutés dans `vexflow.test.ts`.
    //
    // L'ORDRE EST TENU, ET IL COMPTE : un graphe enregistré désigne un port par son INDICE, donc la
    // sortie texte reste la première. Inverser la paire déplacerait tous les câbles existants.
    for (const id of ["partition-verovio", "vexflow-portee", "vexflow-tab", "vexflow-grille", "vexflow-partition"]) {
      const f = (toutesLesFiches as any[]).find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f.sorties.map((s: any) => `${s.nom}:${s.type}`), id).toEqual(["SVG:texte", "SVG:image"]);
    }
    // Et celui qui savait déjà alimenter l'export garde sa sortie unique.
    const midi = (toutesLesFiches as any[]).find((x) => x.id === "vexflow-midi");
    expect(midi.sorties.map((s: any) => `${s.nom}:${s.type}`)).toEqual(["SVG:image"]);
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
