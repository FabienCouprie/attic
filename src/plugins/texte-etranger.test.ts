// @vitest-environment jsdom
// plugins/texte-etranger.test.ts — Le banc du texte étranger.
//
// CE QU'IL TIENT, EN UNE PHRASE : aucun composant ne doit annoncer une réussite après avoir reçu, sur
// une entrée qui attend un FORMAT, un texte qui n'en est pas un.
//
// POURQUOI CE BANC EXISTE. Une campagne menée à la main sur les quarante-deux entrées texte du
// catalogue qui attendent un format a trouvé CINQ composants qui mentaient, tous de la même façon :
// l'échec se disait dans la valeur ou dans le message, jamais dans le statut.
//
//   « Accord »              émettait la chaîne « Accord inconnu » SUR SA SORTIE
//   « Grille d'accords »    annonçait « 4 accords » et n'en écrivait aucun
//   « Progression »         rendait un « m » entouré d'espaces
//   « Composer un plan »    écrivait le texte étranger dans le plan, qui part vers un modèle
//   « Rythme sur hauteurs » jouait un fa dièse 6 tiré du nombre 90
//
// Chacun a été réparé et porte son cas ; aucun n'était visible d'un fichier à l'autre, et rien
// n'empêchait le sixième. C'est ce banc-ci qui l'empêche.
//
// LE VERDICT EST CELUI DU MOTEUR, ET NON UNE APPROXIMATION. `estResultatEnErreur` est la fonction
// que `useExecutionGraphe` appelle pour décider du statut affiché : un composant est en erreur s'il
// pose `erreur`, OU si toutes ses valeurs sont nulles alors qu'il déclare des sorties. Un composant
// SANS sortie échappe donc au second filet, et ne peut se signaler que par le premier — c'est ce qui
// avait laissé dix-sept chemins d'échec annoncer « Terminé » sur sept composants.
//
// LE TEXTE DE SONDE EST UNE VRAIE NOTATION, celle de « Texte → MIDI » : une ligne de tempo, puis un
// accord de trois notes tenu deux temps. C'est voulu. Un charabia quelconque serait refusé par tout
// le monde sans rien prouver ; celui-ci est lisible par UN composant et étranger à tous les autres,
// ce qui est exactement le piège que la campagne a trouvé cinq fois.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";
import { estResultatEnErreur } from "../core/execution";

const TEXTE_ETRANGER = "Tempo 90\nC4+E4+G4 2.000";

/**
 * Les noms de port qui n'attendent AUCUN format, et qu'il serait faux d'éprouver.
 *
 * Un prompt, une description, des paroles ou une liste de noms de style acceptent n'importe quel
 * texte : les refuser serait la faute inverse. « Instruments », « Styles », « Émotions » et
 * « Tessitures » sont les quatre entrées du générateur de script, qui reprend les mots tels quels.
 */
const SANS_FORMAT = new Set([
  "Texte", "Prompt", "Description", "Paroles", "Phrase", "Instruction",
  "Instruments", "Styles", "Émotions", "Tessitures",
]);

/**
 * Les entrées qui ACCEPTENT légitimement ce texte-ci, avec leur raison.
 *
 * Une entrée déclarée ici ne sera pas comptée fautive ; une entrée fautive non déclarée fait tomber
 * le cas. C'est la forme du registre des nomenclatures : ce qui déroge se déclare et porte sa raison.
 */
const ACCEPTENT: Record<string, string> = {
  "texte-vers-midi in:0":
    "Le texte de sonde EST sa notation : « Tempo 90 » est sa ligne de tempo et « C4+E4+G4 2.000 » un accord de trois notes tenu deux temps. Il a raison de rendre trois notes à 90 BPM.",
  "boucle-plan-debut in:0":
    "Un début de boucle non déplié laisse passer le plan et le dit, exactement comme celui qui porte l'audio. Ce n'est pas un échec, c'est un graphe auquel il manque sa fin de boucle.",
};

const contexte = (entrees: any[], indice: number) => ({
  noeud: { id: "n", data: { ficheId: "x", parametres: {} } },
  entree: (j: number) => (j === indice ? TEXTE_ETRANGER : null),
  entrees: () => entrees.map((_: any, j: number) => (j === indice ? TEXTE_ETRANGER : null)),
  paramTexte: (_nom: string, defaut: string) => defaut,
  paramNombre: (_nom: string, defaut: number) => defaut,
  onProgress: () => {},
  repertoireTravail: "",
});

describe("le banc du texte étranger", () => {
  it("AUCUN COMPOSANT N'ANNONCE UNE RÉUSSITE SUR UN TEXTE QUI N'EST PAS SON FORMAT", async () => {
    const acceptent: string[] = [];
    let eprouvees = 0;
    for (const f of toutesLesFiches as any[]) {
      const entrees = (f.entrees ?? []) as any[];
      for (let i = 0; i < entrees.length; i++) {
        if (entrees[i].type !== "texte" || SANS_FORMAT.has(entrees[i].nom)) continue;
        eprouvees++;
        const cle = `${f.id} in:${i}`;
        let res: any;
        try {
          res = await f.executer(contexte(entrees, i) as any);
        } catch {
          // UNE LEVÉE EST UN REFUS, et non une réussite : le moteur la rattrape et marque le nœud.
          continue;
        }
        if (!estResultatEnErreur(f, res)) acceptent.push(cle);
      }
    }
    // LE COMPTE EST TENU LUI AUSSI : un banc qui n'éprouverait plus rien passerait en silence.
    expect(eprouvees, "le banc doit éprouver toutes les entrées à format du catalogue")
      .toBeGreaterThanOrEqual(40);
    expect(acceptent.sort(), [
      "Un composant a reçu, sur une entrée qui attend un format, un texte qui n'en est pas un,",
      "et il a annoncé une réussite. Soit il doit refuser en nommant ce qu'il attendait,",
      "soit il accepte légitimement ce texte et le déclare dans `ACCEPTENT`, avec sa raison.",
    ].join("\n")).toEqual(Object.keys(ACCEPTENT).sort());
  }, 120000);

  it("et chaque acceptation déclarée porte une raison écrite", () => {
    for (const [cle, raison] of Object.entries(ACCEPTENT)) {
      expect(raison.length, cle).toBeGreaterThan(60);
      expect(raison.trim().endsWith("."), cle).toBe(true);
    }
  });
});
