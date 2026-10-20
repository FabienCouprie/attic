// electron/ced.test.ts — La lecture du journal de l'étiqueteur.
//
// CE MOTEUR N'ÉCRIT PAS DE FICHIER, il écrit sur sa sortie : les étiquettes arrivent dans une ligne
// `custom_schema_output=` du journal, et non dans un `--out` comme pour les deux autres familles de
// cette racine. Un code de retour nul ne prouve donc rien, et c'est la raison pour laquelle
// `etiqueter` traite un journal sans cette ligne comme un échec.
//
// LE SCHÉMA EST EXIGÉ PAR SON NOM, et c'est ce que les cas ci-dessous tiennent. `audiocpp_cli` sert
// cent vingt-cinq familles sur la même sortie ; lire pour des étiquettes ce qu'une autre famille y
// écrirait donnerait des mots inventés plutôt qu'une erreur. La ligne employée ici est celle que
// l'exécutable a réellement rendue le 2026-10-21, sur un rendu de guitare acoustique.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const { etiquettesDuJournal } = createRequire(import.meta.url)("./ced.cjs") as {
  etiquettesDuJournal: (journal: string) => { etiquette: string; score: number }[] | null;
};

const JOURNAL_REEL = [
  "family=ced",
  "task=cls",
  'custom_schema_output={"schema":"ced.classification.v1","data":{"scores":['
    + '{"index":137,"label":"Music","score":0.76312297582626343,"logit":1.1698782444000244},'
    + '{"index":140,"label":"Guitar","score":0.11253844201564789,"logit":-2.0650703907012939},'
    + '{"index":143,"label":"Acoustic guitar","score":0.026072015985846519,"logit":-3.6204748153686523}'
    + "]}}",
  "metrics.wall_ms=572.255",
  "metrics.rtf=0.0195978",
].join("\n");

describe("etiquettesDuJournal", () => {
  it("lit les étiquettes et leurs scores dans l'ordre rendu", () => {
    expect(etiquettesDuJournal(JOURNAL_REEL)).toEqual([
      { etiquette: "Music", score: 0.76312297582626343 },
      { etiquette: "Guitar", score: 0.11253844201564789 },
      { etiquette: "Acoustic guitar", score: 0.026072015985846519 },
    ]);
  });

  it("REFUSE UN AUTRE SCHÉMA, plutôt que d'en tirer des mots inventés", () => {
    const autre = JOURNAL_REEL.replace("ced.classification.v1", "autre.famille.v1");
    expect(etiquettesDuJournal(autre)).toBeNull();
  });

  it("un journal sans la ligne est un échec, non une liste vide", () => {
    expect(etiquettesDuJournal("family=ced\ntask=cls\nmetrics.wall_ms=1")).toBeNull();
    expect(etiquettesDuJournal("")).toBeNull();
    expect(etiquettesDuJournal(undefined as unknown as string)).toBeNull();
  });

  it("un JSON illisible est un échec, et ne jette pas", () => {
    expect(etiquettesDuJournal("custom_schema_output={ceci n'est pas du JSON}")).toBeNull();
  });

  it("une entrée sans étiquette ou sans score est écartée, les autres restent", () => {
    const abime = 'custom_schema_output={"schema":"ced.classification.v1","data":{"scores":['
      + '{"label":"Guitar","score":0.5},{"label":"Sans score"},{"score":0.2}]}}';
    expect(etiquettesDuJournal(abime)).toEqual([{ etiquette: "Guitar", score: 0.5 }]);
  });
});
