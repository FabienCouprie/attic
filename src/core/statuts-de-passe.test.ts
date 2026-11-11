// core/statuts-de-passe.test.ts — La pose des statuts d'une passe pose ce que posait le moteur.
//
// LE TÉMOIN EST L'ANCIEN CODE, recopié tel quel depuis `ui/hooks/useExecutionGraphe.ts` (master
// 2f5a67f, l. 252 à 281) : deux fermetures qui lisaient `plat.expansions` et appelaient
// `definirStatut` et `poserStatutOmbre`. Les deux reçoivent les mêmes prêts, qui écrivent dans une
// trace, et une même suite de poses doit rendre la même trace.
import { describe, expect, it } from "vitest";

import { creerPoseDesStatuts } from "./statuts-de-passe";

type Pose = [string, ...unknown[]];

/**
 * Des prêts qui écrivent dans une trace : la pose d'un statut, l'ombre, et une langue d'essai.
 *
 * LA POSE A LA SIGNATURE DE `definirStatut`, défaut compris : c'est elle que le moteur prête, et le
 * témoin l'appelait sous ce nom. Un défaut posé d'un seul côté ferait différer les deux traces pour
 * une raison qui n'existe pas dans l'application, et c'est ce qu'a fait la première écriture.
 */
function prets(expansions: Map<string, string>) {
  const trace: Pose[] = [];
  return {
    trace,
    expansions,
    poser: (id: string, statut: string, progression?: string, progressionDuNoeud = false) => {
      trace.push(["statut", id, statut, progression, progressionDuNoeud]);
    },
    poserOmbre: (id: string, visible: string, statut: string) => { trace.push(["ombre", id, visible, statut]); },
    t: (cle: string) => `<${cle}{detail}>`,
  };
}

/** L'ANCIEN CODE, tel quel : seuls les noms des prêts ont changé de portée. */
function temoin(p: ReturnType<typeof prets>) {
  const plat = { expansions: p.expansions };
  const definirStatut = p.poser;
  const poserStatutOmbre = p.poserOmbre;
  const t = p.t;

  const marquerMetaEnEchec = (idAplati: string, detail?: string) => {
    const proprio = plat.expansions.get(idAplati);
    if (proprio && proprio !== idAplati) {
      definirStatut(proprio, "erreur", detail ? t("execution.brancheEnEchecDetail").replace("{detail}", detail) : t("execution.brancheEnEchec"));
    }
  };

  const visiblesEnErreur = new Set<string>();
  const poserStatut = (nodeId: string, statut: string, progression?: string, progressionDuNoeud = false) => {
    const visibleId = plat.expansions.get(nodeId) ?? nodeId;
    if (visibleId !== nodeId) poserStatutOmbre(nodeId, visibleId, statut);
    if (statut === "erreur") visiblesEnErreur.add(visibleId);
    else if (visiblesEnErreur.has(visibleId)) return;
    definirStatut(visibleId, statut, progression, progressionDuNoeud);
  };
  return { poserStatut, marquerMetaEnEchec };
}

/**
 * Une boucle de trois tours dont le corps est « fx » (copies « d#0::fx » à « d#2::fx »), un méta
 * « outil1 » dont un membre est « outil1::cd », et un nœud visible « src ».
 */
const expansions = () => new Map([
  ["d#0::fx", "fx"], ["d#1::fx", "fx"], ["d#2::fx", "fx"],
  ["outil1::cd", "outil1"], ["src", "src"],
]);

/** La suite d'une passe qui touche à tout : progressions, une copie en erreur, des copies après elle. */
function jouer(pose: { poserStatut: (...a: [string, string, string?, boolean?]) => void; marquerMetaEnEchec: (id: string, d?: string) => void }) {
  pose.poserStatut("src", "en_cours", "Étape 1/6");
  pose.poserStatut("src", "en_cours", "40 %", true);
  pose.poserStatut("src", "termine");
  pose.poserStatut("d#0::fx", "en_cours", "Étape 2/6");
  pose.poserStatut("d#0::fx", "termine");
  pose.poserStatut("d#1::fx", "erreur", "boum");
  pose.marquerMetaEnEchec("d#1::fx", "boum");
  pose.poserStatut("d#2::fx", "en_cours", "Étape 4/6");
  pose.poserStatut("d#2::fx", "termine");
  pose.poserStatut("outil1::cd", "erreur");
  pose.marquerMetaEnEchec("outil1::cd");
  pose.marquerMetaEnEchec("outil1::cd", "cd");
  pose.marquerMetaEnEchec("src", "rien");
  pose.marquerMetaEnEchec("inconnu");
  pose.poserStatut("seul", "termine");
}

describe("la pose des statuts d'une passe", () => {
  it("POSE CE QUE POSAIT LE MOTEUR, pose pour pose, sur une passe qui touche à tout", () => {
    const ancien = prets(expansions());
    jouer(temoin(ancien));
    const nouveau = prets(expansions());
    jouer(creerPoseDesStatuts(nouveau));
    expect(nouveau.trace).toEqual(ancien.trace);
    // Le témoin a bien posé quelque chose : une trace vide des deux côtés serait égale.
    expect(ancien.trace.length).toBeGreaterThan(15);
  });

  it("UNE ERREUR DE COPIE TIENT : la copie suivante qui finit ne l'efface pas", () => {
    const p = prets(expansions());
    const { poserStatut } = creerPoseDesStatuts(p);
    poserStatut("d#0::fx", "termine");
    poserStatut("d#1::fx", "erreur", "boum");
    poserStatut("d#2::fx", "en_cours", "Étape 4/6");
    poserStatut("d#2::fx", "termine");
    const surLeVisible = p.trace.filter((x) => x[0] === "statut");
    expect(surLeVisible).toEqual([
      ["statut", "fx", "termine", undefined, false],
      ["statut", "fx", "erreur", "boum", false],
    ]);
  });

  it("CHAQUE COPIE GARDE SON OMBRE, même quand son nœud visible est déjà en erreur", () => {
    const p = prets(expansions());
    const { poserStatut } = creerPoseDesStatuts(p);
    poserStatut("d#1::fx", "erreur");
    poserStatut("d#2::fx", "termine");
    poserStatut("src", "termine");
    expect(p.trace.filter((x) => x[0] === "ombre")).toEqual([
      ["ombre", "d#1::fx", "fx", "erreur"],
      ["ombre", "d#2::fx", "fx", "termine"],
    ]);
  });

  it("LE MÉTA D'UN NŒUD INTERNE EN ÉCHEC LE DIT, avec ou sans détail ; un nœud visible ne marque personne", () => {
    const p = prets(expansions());
    const { marquerMetaEnEchec } = creerPoseDesStatuts(p);
    marquerMetaEnEchec("outil1::cd");
    marquerMetaEnEchec("outil1::cd", "cd");
    marquerMetaEnEchec("src", "rien");
    marquerMetaEnEchec("inconnu");
    expect(p.trace).toEqual([
      ["statut", "outil1", "erreur", "<execution.brancheEnEchec{detail}>", false],
      ["statut", "outil1", "erreur", "<execution.brancheEnEchecDetailcd>", false],
    ]);
  });

  it("ET CE MARQUAGE NE PASSE PAS PAR L'ERREUR QUI TIENT, comme dans le moteur", () => {
    // Le moteur posait le méta par `definirStatut`, sans l'inscrire parmi les visibles en erreur :
    // une pose ordinaire qui suit le remplace donc. C'est l'état d'avant, gardé tel quel.
    const p = prets(expansions());
    const { poserStatut, marquerMetaEnEchec } = creerPoseDesStatuts(p);
    marquerMetaEnEchec("outil1::cd");
    poserStatut("outil1", "termine");
    expect(p.trace.at(-1)).toEqual(["statut", "outil1", "termine", undefined, false]);
  });
});
