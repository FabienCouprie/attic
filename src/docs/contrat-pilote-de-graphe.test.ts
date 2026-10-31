// src/docs/contrat-pilote-de-graphe.test.ts — Un seul endroit pilote un graphe, et il lit l'interface d'aujourd'hui.
//
// POURQUOI CE TEST, ET IL GARDE DEUX CHOSES DIFFÉRENTES.
//
// 1. LE PILOTAGE NE SE RECOPIE PAS. Semer un graphe, presser Lancer, savoir quand le run est fini et
//    quand les aperçus se sont posés : `tests-e2e/pilote-graphe.ts` porte TROIS corrections, chacune
//    payée d'une mesure fausse — un clic qui n'était pas un geste utilisateur et laissait le contexte
//    audio suspendu, une attente de trente-huit secondes qui mesurait un graphe à moitié calculé, et
//    une attente fixe qui relevait six aperçus à une passe et huit à la suivante. C'est exactement
//    la forme du défaut que le dépôt a payé le plus cher : `serveur-de-developpement.ts` a été
//    extrait de TRENTE-TROIS specs qui l'avaient recopié en sept formes divergentes.
//
// 2. ET IL LIT L'INTERFACE PAR DES NOMS, qui ne sont vérifiés par aucun compilateur. Un sélecteur
//    de classe dans une chaîne de caractères ne lève pas quand la classe est renommée : il ne
//    trouve plus rien. Les conséquences ne sont pas de même gravité, et c'est ce qui décide du
//    contenu de ce test :
//
//      · LA PASTILLE DE STATUT RENOMMÉE se voit tout de suite — plus aucune pastille, donc le run
//        n'est jamais « fini », donc une attente qui expire bruyamment au bout de trois minutes.
//      · LE MESSAGE RENOMMÉ NE SE VOIT PAS. Chaque nœud rend alors `message: null`, le rapport
//        d'`exécuter` perd ses explications et la liste des nœuds en erreur du garde du son devient
//        une liste d'identifiants nus. Tout reste VERT.
//      · LA CLÉ DE PROFONDEUR D'EXPORT RENOMMÉE NE SE VOIT PAS NON PLUS : les empreintes porteraient
//        soudain sur de l'audio quantifié selon la préférence du poste, sans que rien ne le dise.
//
// CE QU'IL NE GARDE PAS, PARCE QUE C'EST DÉJÀ TENU AILLEURS. Le pilote trouve le bouton par
// `button[title*="Lancer"]`, donc par une TRADUCTION — et `src/ui/barre-outils-groupes.test.ts`
// épingle déjà « Lancer l'exécution (Espace) » dans la passe ordinaire. Un second garde sur la même
// chaîne vieillirait à côté du premier.
//
// ET IL NE DEMANDE PAS QU'UN SPEC CESSE DE PRESSER LANCER. Relevé avant d'écrire la règle : onze
// specs le pressent et cinq lisent la pastille de statut, pour leurs propres raisons — la barre
// d'outils, l'arrêt d'une exécution, un nœud précis dans l'application. La règle ne porte donc que
// sur CE QUI APPELLE LE PILOTE : un appelant n'a pas le droit de garder son pilotage à côté.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "../..");
const DOSSIER = resolve(RACINE, "tests-e2e");
const PILOTE = resolve(DOSSIER, "pilote-graphe.ts");
const NOEUD = resolve(RACINE, "src/ui/AtelierNode.tsx");

const source = (p: string) => readFileSync(p, "utf8");

/**
 * Le code seul, commentaires retirés.
 *
 * SANS CELA LE GARDE SERAIT UN VERT QUI NE PROUVE RIEN, et le dépôt l'a déjà payé : la première
 * version de `contrat-serveur-de-specs.test.ts` cherchait `--strictPort` dans le TEXTE du fichier,
 * où l'en-tête le mentionnait — elle restait verte après qu'on eut retiré le drapeau de l'appel.
 * Les en-têtes d'ici nomment `statut-puce` et `waitForFunction` en toutes lettres.
 */
const codeSeul = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

/** Tout ce que `src/ui/` contient, lu une fois : les classes y vivent entre le composant et le CSS. */
function interfaceEntiere(): string {
  const dossier = resolve(RACINE, "src/ui");
  const lire = (d: string): string[] => readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? lire(resolve(d, e.name)) : [resolve(d, e.name)]));
  return lire(dossier).map((f) => source(f)).join("\n");
}

describe("le pilote de graphe", () => {
  it("LES CLASSES QU'IL LIT EXISTENT DANS L'INTERFACE", () => {
    const ui = interfaceEntiere();
    const classes = [...new Set([...codeSeul(source(PILOTE)).matchAll(/\.(attic-[a-z0-9-]+)/g)]
      .map((m) => m[1]))].sort();
    expect(classes.length, "le pilote doit lire l'interface par des classes `attic-…`")
      .toBeGreaterThanOrEqual(3);
    const fantomes = classes.filter((c) => !ui.includes(c));
    expect(fantomes, [
      "Ces classes sont lues par `tests-e2e/pilote-graphe.ts` et n'existent plus dans `src/ui/`.",
      "Un sélecteur de classe est une CHAÎNE : il ne lève pas, il ne trouve rien. Pour",
      "`attic-node-message` cela ne se voit même pas — chaque nœud rend alors `message: null`, le",
      "rapport d'`exécuter` perd ses explications, et tout reste vert.",
    ].join("\n")).toEqual([]);
  });

  it("LES CLÉS QU'IL ÉCRIT SONT CELLES QUE L'APPLICATION LIT", () => {
    const cles = [...new Set([...codeSeul(source(PILOTE)).matchAll(/setItem\("([^"]+)"/g)]
      .map((m) => m[1]))].sort();
    expect(cles, "le pilote sème le graphe et épingle la profondeur d'export")
      .toEqual(["attic-encours", "attic-profondeur-export"]);
    // ET CE RELEVÉ EXCLUT LES TESTS ET LE CSS, parce que sans cela il se lit LUI-MÊME. Ce cas vit
    // dans `src/docs/`, et la clé qu'il attend y figure en toutes lettres : une première version
    // parcourait tout `src/` et déclarait donc connue n'importe quelle clé, y compris une clé que
    // l'application n'a jamais lue. Un faux vert parfait, trouvé en plantant le défaut. Une classe
    // CSS homonyme ferait la même chose : une clé se déclare dans du TypeScript.
    const dansSrc = readdirSync(resolve(RACINE, "src"), { recursive: true })
      .filter((f): f is string => typeof f === "string" && /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => source(resolve(RACINE, "src", f))).join("\n");
    const fantomes = cles.filter((c) => !dansSrc.includes(c));
    expect(fantomes, [
      "Ces clés de localStorage sont écrites par le pilote et personne ne les lit plus dans `src/`.",
      "Un graphe semé sous une clé oubliée lance un canevas VIDE ; une profondeur d'export semée",
      "sous une clé oubliée laisse les empreintes porter sur de l'audio quantifié selon la",
      "préférence du poste, sans que rien ne le dise.",
    ].join("\n")).toEqual([]);
  });

  // ET CE CAS-CI A ÉTÉ ÉCRIT TROIS FOIS, parce que deux fois il est resté VERT sur le défaut planté.
  // C'est le même piège que `--strictPort` avant lui, en plus retors :
  //
  //   PREMIER JET — chaque statut cherché dans le TEXTE de `AtelierNode.tsx`. Resté vert quand la
  //   classe `termine` est devenue `fini`, parce que le fichier contient aussi `etatExec.statut ===
  //   "termine"` : l'ÉTAT D'EXÉCUTION, qui s'écrit comme la classe sans être elle.
  //   DEUXIÈME JET — cherché dans l'EXPRESSION qui calcule la classe. Resté vert : l'homonyme est
  //   DANS cette expression, en position de CONDITION du même ternaire.
  //
  // LA RÈGLE PORTE DONC SUR LES POSITIONS DE RÉSULTAT du ternaire — ce qui atterrit dans
  // `statutClasse` — et non sur les mots qu'il contient. Si quelqu'un réécrit ce calcul autrement
  // qu'en ternaire, ce cas tombe en demandant qu'on le réécrive : c'est voulu, et c'est la forme
  // qu'emploie déjà `contrat-serveur-de-specs.test.ts` sur la ligne qui passe le port.
  it("LES STATUTS QU'IL CONNAÎT SONT LES CLASSES QUE LA PASTILLE PEUT PORTER", () => {
    // Le pilote décide de la fin d'un run sur `en-cours` et `attente`, et déclare une erreur sur
    // `erreur`. Un cinquième statut posé par le nœud sans être ici serait lu comme « attente », et
    // le run ne serait jamais fini : trois minutes d'attente pour un échec qui n'explique rien.
    const code = codeSeul(source(PILOTE));
    const statuts = new Set([...code.matchAll(/"(termine|erreur|en-cours|attente)"/g)].map((m) => m[1]));
    expect([...statuts].sort(), "les quatre statuts du nœud")
      .toEqual(["attente", "en-cours", "erreur", "termine"]);

    const calcul = /statutClasse\s*=([^;]*);/.exec(codeSeul(source(NOEUD)))?.[1];
    expect(calcul, [
      "`AtelierNode.tsx` ne calcule plus `statutClasse` en une seule expression terminée par `;`.",
      "Relisez ce cas : il extrait les classes des positions de RÉSULTAT d'un ternaire chaîné.",
    ].join("\n")).toBeTruthy();
    const resultats = new Set([
      ...[...calcul!.matchAll(/\?\s*"([^"]*)"/g)].map((m) => m[1]),
      ...[...calcul!.matchAll(/:\s*"([^"]*)"\s*$/g)].map((m) => m[1]),
    ]);
    expect([...resultats].sort(), [
      "Les classes que la pastille peut porter ne sont plus celles que le pilote sait lire.",
      "Un statut que le pilote ne connaît pas est lu comme « attente » : le run n'est jamais fini,",
      "et l'attente expire au bout de trois minutes sans rien expliquer.",
    ].join("\n")).toEqual([...statuts].sort());
  });

  // ET CE CAS-CI VIENT D'UNE CÉCITÉ QUI M'A COÛTÉ UN FAUX DIAGNOSTIC.
  //
  // L'application pose la cause d'une erreur dans l'INFOBULLE du libellé de statut, et non dans le
  // message du nœud — décision écrite dans `AtelierNode.tsx` : « le message va dans l'infobulle
  // plutôt que dans le libellé, qui doit rester court ». Le pilote ne lisait que
  // `.attic-node-message`, qui porte le RÉSULTAT d'un run réussi.
  //
  // CE QUE CELA A PRODUIT : un rapport annonçant « sans message » sur un nœud dont la cause était
  // lisible à côté, et huit entrées sur dix réduites à des identifiants nus dans la base du son.
  // Parti réparer un message vide, j'ai mesuré qu'il ne l'était pas : il valait « error ».
  //
  // LES DEUX MOITIÉS DOIVENT DONC SE TENIR : l'application met la cause là, et le pilote la lit là.
  // Déplacer l'une sans l'autre rend le pilote muet SANS RIEN CASSER, ce qui est la pire espèce.
  it("LA CAUSE D'UNE ERREUR SE LIT LÀ OÙ L'APPLICATION LA MET", () => {
    const noeud = codeSeul(source(NOEUD));
    // L'élément qui porte le libellé de statut, et son infobulle.
    const libelle = /<span className="attic-node-statut-label"([^>]*)>/.exec(noeud)?.[1];
    expect(libelle, [
      "`AtelierNode.tsx` ne porte plus un `<span className=\"attic-node-statut-label\">`.",
      "C'est l'élément dont l'infobulle dit POURQUOI un nœud est en erreur ; le pilote l'y lit.",
    ].join("\n")).toBeTruthy();
    expect(libelle, "son infobulle doit porter la cause, et seulement quand le nœud est en erreur")
      .toMatch(/title=\{[^}]*"erreur"/);

    const pilote = codeSeul(source(PILOTE));
    expect(pilote, [
      "Le pilote ne lit plus l'infobulle du libellé de statut.",
      "Il annoncerait « sans cause déclarée » sur chaque nœud en erreur, sans qu'une ligne ne casse.",
    ].join("\n")).toContain(".attic-node-statut-label");
    expect(pilote, "et il la lit par `getAttribute(\"title\")`").toMatch(/getAttribute\("title"\)/);
  });

  it("ET SES APPELANTS PASSENT PAR LUI : aucun ne garde son propre pilotage", () => {
    const appelants = readdirSync(DOSSIER)
      .filter((f) => f.endsWith(".spec.ts"))
      .filter((f) => /from "\.\/pilote-graphe"/.test(source(resolve(DOSSIER, f))));
    // LA LISTE EST FIGÉE, et c'est ce qui force un appelant neuf à se déclarer. Cinq aujourd'hui :
    // les deux verbes qui lancent un graphe entier, le garde des gains de piste du montage, celui
    // des types aux ports, et celui du mélange de deux fréquences. Les trois derniers ont besoin du
    // même pilotage — semer, lancer, attendre la fin, relire ce que la page dit — pour mesurer par
    // le chemin de l'interface, là où le banc appelle l'exécuteur directement.
    //
    // ET LE DERNIER A FAIT NAÎTRE `avantDeLancer` PLUTÔT QU'UN PILOTAGE À LUI : il doit poser deux
    // fichiers par le bouton du nœud, ce qui ne peut se faire qu'entre le rechargement et le clic.
    // C'est exactement le cas que ce garde-ci existe pour empêcher de résoudre à part.
    //
    // LE GARDE DES CONTENEURS A FAIT NAÎTRE `semer` ET `lancerLeNoeudEtAttendre` de la même façon : le
    // ▶ d'un nœud ne se mène pas comme Lancer, et il fallait l'apprendre au pilote plutôt qu'au spec.
    //
    // LA RESTAURATION D'UN COMPRESSÉ Y EST ENTRÉE POUR UN MORCEAU DE 194 S, qui ne passe que par
    // « Entrée audio » et donc par `avantDeLancer` : le métronome plafonne à soixante secondes, et
    // c'est la durée qui faisait tomber le moteur en mémoire.
    //
    // LE COPIER-COLLER DES NOTES ET DES CADRES N'Y PREND QUE `semer` : il ne lance rien, il sème un
    // graphe puis le travaille au clavier.
    expect(appelants.sort(), "les appelants déclarés du pilote")
      .toEqual(["boucle-reprise-dans-application.spec.ts", "conteneurs-dans-application.spec.ts",
        "copier-coller-annotations-dans-application.spec.ts",
        "empreintes-exemples.spec.ts", "executer.spec.ts",
        "frequence-de-travail-dans-application.spec.ts", "gel-de-conversion-dans-application.spec.ts",
        "melange-frequences-dans-application.spec.ts", "montage-gains-pistes.spec.ts",
        "profondeur-dans-application.spec.ts", "rendu-image-taille-dans-application.spec.ts",
        "restaurer-dans-application.spec.ts",
        "sorties-extensibles-dans-application.spec.ts", "types-au-port.spec.ts"]);
    const coupables = appelants.filter((f) => {
      const code = codeSeul(source(resolve(DOSSIER, f)));
      return code.includes("statut-puce") || code.includes("waitForFunction");
    });
    expect(coupables, [
      "Ces specs appellent le pilote ET gardent un pilotage à eux.",
      "C'est par là que la divergence revient : une correction posée dans l'un, et l'autre garde le",
      "défaut. `serveur-de-developpement.ts` a été extrait de trente-trois specs pour cette raison,",
      "dont une portait seule le délai de crochet que les trente-deux autres auraient dû avoir.",
    ].join("\n")).toEqual([]);
  });
});
