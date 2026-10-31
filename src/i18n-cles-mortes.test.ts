// src/i18n-cles-mortes.test.ts — L'autre sens du garde de i18n : une clé déclarée que rien n'emploie.
//
// `i18n.test.ts` tient un sens, et c'est celui qui faisait afficher « workflow.nouveauTitre » dans
// une infobulle : toute clé CITÉE dans le code existe dans le dictionnaire. Ce fichier tient
// l'autre : toute clé DÉCLARÉE est employée. Les deux fautes sont symétriques et n'ont pas la même
// cause — le dépôt garde déjà ses paquets de cette façon, `imports-declares.test.ts` d'un côté et
// `arbre-des-dependances.test.ts` de l'autre.
//
// CE QUI L'A RENDU NÉCESSAIRE : NEUF CLÉS MORTES, trouvées en une après-midi, et chacune pour une
// raison différente. Deux doublons restés après le passage de la barre d'outils aux clés `barre.*`.
// Un bouton de relance que son message porte désormais. Une aide de finesse que la notice du montage
// dit dans les deux langues. Un refus de dossier de travail remplacé par un refus commun. Trois
// messages de l'ancien `modifier-texte`, réécrit. Et un titre de menu que personne n'a jamais lu.
//
// Aucune ne cassait quoi que ce soit — c'est précisément pourquoi aucune ne se signalait. Elles
// coûtent au traducteur, qui les traduit, et au lecteur, qui cherche d'où elles viennent.
//
// LES FAMILLES DYNAMIQUES SONT LUES DANS LE CODE, non écrites ici. Un menu construit ses clés —
// `t(`favs.${f.cle}`)` —, de sorte qu'aucun de ses membres n'apparaît jamais écrit en entier. Les
// chercher dans le code plutôt que les recopier évite qu'une famille neuve fasse crier le garde à
// tort, et qu'une famille supprimée continue de couvrir des clés mortes.
//
// CE QUE CE GARDE NE VOIT PAS, ET IL FAUT LE DIRE : une clé morte À L'INTÉRIEUR d'une famille. C'est
// le cas de `favs.titre`, qui a ouvert ce relevé : la famille `favs.` la couvrait, et seule la
// lecture de `FAVORIS_SON` — où aucune entrée ne se nomme `titre` — a pu la condamner. Résoudre les
// quinze familles demanderait de lire quinze registres, et ce n'est pas fait.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CLES_CONNUES } from "./i18n";

const RACINE = join(__dirname, "..");
const DOSSIERS = ["src", "electron", "scripts", "tests-e2e"];
const EXTENSIONS = /\.(tsx?|cjs|mjs|js)$/;
/** Le dictionnaire lui-même : une clé citée seulement là où elle est déclarée n'est pas employée. */
const DICTIONNAIRE = join(RACINE, "src", "i18n.tsx");
/** Et ce garde : une clé nommée dans ses commentaires passerait pour employée. */
const CE_GARDE = join(RACINE, "src", "i18n-cles-mortes.test.ts");

function fichiersDe(racine: string, vus: string[] = []): string[] {
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) { fichiersDe(chemin, vus); continue; }
    if (EXTENSIONS.test(entree) && chemin !== DICTIONNAIRE && chemin !== CE_GARDE) vus.push(chemin);
  }
  return vus;
}

const SOURCES = DOSSIERS.flatMap((d) => fichiersDe(join(RACINE, d)));
const TOUT = SOURCES.map((f) => readFileSync(f, "utf8")).join("\n");

/**
 * La clé ENTIÈRE, et non un préfixe d'une autre. Cherchée comme sous-chaîne, une clé passait pour
 * employée dès qu'une autre commençait par elle, et quatre clés mortes ont tenu ainsi le 2026-10-31 :
 * trois de l'ancienne apparence de mise à jour, masquées par leurs voisines à suffixe, et une forme
 * de message à deux variables, préfixe de ses variantes à trois.
 */
function estEmployee(cle: string): boolean {
  let depuis = 0;
  for (;;) {
    const i = TOUT.indexOf(cle, depuis);
    if (i < 0) return false;
    if (!/[A-Za-z0-9_]/.test(TOUT.charAt(i + cle.length))) return true;
    depuis = i + 1;
  }
}

/** Les préfixes que le code interpole : `favs.`, `univers.`, `criteres.masse.`… */
const FAMILLES = [...new Set(
  [...TOUT.matchAll(/`([a-zA-Z][a-zA-Z0-9.]*\.)\$\{/g)].map((m) => m[1]),
)].sort();

describe("les clés du dictionnaire", () => {
  it("le relevé n'est pas vide : sources lues, familles trouvées", () => {
    // Sans ce cas, une lecture qui ne rendrait rien ferait passer le suivant sans rien vérifier.
    expect(SOURCES.length).toBeGreaterThan(500);
    expect(CLES_CONNUES.size).toBeGreaterThan(1000);
    expect(FAMILLES.length).toBeGreaterThan(5);
    expect(FAMILLES, "la famille des favoris se construit dans la barre d'outils").toContain("favs.");
  });

  it("AUCUNE CLÉ DÉCLARÉE N'EST MORTE : ce qui est traduit est employé", () => {
    const mortes = [...CLES_CONNUES]
      .filter((cle) => !estEmployee(cle))
      .filter((cle) => !FAMILLES.some((f) => cle.startsWith(f)))
      .sort();
    expect(mortes, [
      "Ces clés sont déclarées dans `i18n.tsx` et rien ne les emploie :",
      mortes.join("\n"),
      "Elles ne cassent rien — c'est pourquoi rien ne les signalait —, mais elles coûtent au",
      "traducteur, qui les traduit, et au lecteur, qui cherche d'où elles viennent. Les retirer, ou",
      "brancher ce qui devait les lire.",
    ].join("\n")).toEqual([]);
  });

  it("une famille construite dans le code couvre ses membres", () => {
    // Ce cas dit la LIMITE du précédent, pour qu'on ne la découvre pas en s'y fiant : un membre de
    // famille est tenu pour employé sans que personne ne vérifie qu'un registre le réclame.
    const parFamille = [...CLES_CONNUES].filter((cle) => FAMILLES.some((f) => cle.startsWith(f)));
    expect(parFamille.length, "les familles couvrent une part du dictionnaire").toBeGreaterThan(50);
    expect(parFamille.some((cle) => cle.startsWith("favs."))).toBe(true);
  });
});
