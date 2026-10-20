// scripts/arbre-des-dependances.test.ts — Un arbre de dépendances amputé ne passe plus pour sain.
//
// CE QUE CE FICHIER GARDE, ET CE QUI L'A RENDU NÉCESSAIRE. `npm prune --production`, que
// `scripts/build-electron.cjs` lance avant de fabriquer l'installeur, retire des paquets de
// `node_modules`. Il est arrivé que l'arbre reparte amputé de trois dépendances de production, et
// que l'ordre de vérification du dépôt n'en dise rien.
//
// POURQUOI `tsc -b` NE PEUT PAS LE VOIR, mesuré en écartant les paquets un à un : trois des neuf
// dépendances de production ne sont employées que depuis des fichiers `.cjs` — `electron-updater`,
// `onnxruntime-node` et `@huggingface/tokenizers`. Or le processus principal est en CommonJS, que
// `tsconfig` ne couvre pas : ces fichiers ne sont jamais typés. Écarter n'importe lequel des trois
// laisse `tsc -b` rendre **zéro**, et la passe de tests complète rester verte à huit mille sept cent
// cinquante-huit cas. L'application fabriquée tombe alors à l'exécution, chez la personne.
//
// CE N'ÉTAIT PAS LE CACHE INCRÉMENTAL, contrairement à ce que j'avais d'abord conclu : éprouvé en
// mettant le cache à jour, puis en écartant un paquet employé depuis du TypeScript sans toucher à
// une seule source, `tsc -b` le voit et rend deux. Ce qui échappe au typage, c'est le CommonJS, et
// rien d'autre.
//
// CE QUI EST DANGEREUX EST CE QUI EST SILENCIEUX, et la différence se mesure. Écarter `vite`
// empêche vitest de démarrer, sur une erreur que personne ne peut manquer : ce cas-là se garde
// tout seul. Écarter `electron-updater` ne produit aucun bruit du tout. Ce fichier existe pour la
// seconde espèce, celle dont rien dans la chaîne ne réclame la présence au moment du contrôle.
//
// LA FORME EST CHERCHÉE, JAMAIS LES NOMS. Les cas ci-dessous lisent les déclarations de
// `package.json` et ne portent aucune liste de paquets : une dépendance ajoutée demain est gardée
// le jour où elle est déclarée.
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const RACINE = process.cwd();
const PAQUET = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")) as
  Record<string, Record<string, string> | undefined>;

/**
 * Les champs dont l'absence est une faute.
 *
 * `optionalDependencies` et `peerDependencies` en sont exclus À DESSEIN : pour les premières,
 * l'absence est prévue par npm lui-même, et pour les secondes c'est au projet hôte de les fournir.
 * Un cas plus bas vérifie que le dépôt n'en déclare aucune, pour que cette exclusion ne couvre
 * jamais rien en silence.
 */
const CHAMPS_EXIGES = ["dependencies", "devDependencies"] as const;
const CHAMPS_TOLERES = ["optionalDependencies", "peerDependencies"] as const;

const declarees = (): string[] =>
  CHAMPS_EXIGES.flatMap((champ) => Object.keys(PAQUET[champ] ?? {})).sort();

/**
 * Les paquets déclarés qui ne sont pas installés.
 *
 * LA PRÉSENCE SE JUGE SUR `package.json`, et non sur le dossier : un dossier qui survit à une
 * suppression interrompue ferait passer pour installé un paquet qui ne l'est plus.
 */
function manquantes(noms: readonly string[], racine: string): string[] {
  return noms.filter((nom) => !existsSync(join(racine, ...nom.split("/"), "package.json")));
}

describe("l'arbre des dépendances", () => {
  it("PORTE TOUT CE QUE LE DÉPÔT DÉCLARE, sans quoi la compilation ment", () => {
    const absentes = manquantes(declarees(), join(RACINE, "node_modules"));
    expect(absentes, [
      `Ces paquets sont déclarés dans package.json et absents de node_modules : ${absentes.join(", ")}.`,
      "Ni `tsc -b` ni la passe de tests ne les réclament quand seul un fichier `.cjs` les emploie :",
      "l'application fabriquée tomberait à l'exécution. Lancer `npm install`.",
    ].join("\n")).toEqual([]);
  });

  it("est lu depuis les déclarations, et il y en a", () => {
    // Sans ce cas, une lecture qui ne rendrait rien ferait passer le précédent sans rien vérifier.
    expect(declarees().length).toBeGreaterThan(20);
    expect(declarees()).toContain("electron-updater");
  });

  it("nomme ce qui manque, plutôt que de se contenter d'échouer", () => {
    const invente = "paquet-qui-ne-peut-pas-exister-dans-cet-arbre";
    expect(manquantes([invente], join(RACINE, "node_modules"))).toEqual([invente]);
  });

  it("ne prend pas un dossier vide pour un paquet installé", () => {
    // LE CAS QUI COMPTE : une suppression interrompue, ou un paquet à demi extrait, laisse le
    // dossier sans son `package.json`. Le chercher lui, et non le dossier, est ce qui distingue
    // les deux.
    const faux = mkdtempSync(join(tmpdir(), "attic-arbre-"));
    try {
      mkdirSync(join(faux, "coquille"));
      expect(manquantes(["coquille"], faux)).toEqual(["coquille"]);
      writeFileSync(join(faux, "coquille", "package.json"), "{}");
      expect(manquantes(["coquille"], faux)).toEqual([]);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });

  it("trouve aussi les paquets à portée, dont le nom porte une barre", () => {
    const portees = declarees().filter((n) => n.startsWith("@"));
    expect(portees.length, "le dépôt doit déclarer des paquets à portée").toBeGreaterThan(0);
    expect(manquantes(portees, join(RACINE, "node_modules"))).toEqual([]);
  });

  it("ne tolère aucune dépendance facultative tant que personne n'a décidé de leur sort", () => {
    // L'exclusion écrite plus haut ne vaut que tant qu'elle ne couvre rien. Le jour où le dépôt
    // déclare une dépendance facultative ou de pair, ce cas oblige à relire la règle.
    for (const champ of CHAMPS_TOLERES) {
      expect(Object.keys(PAQUET[champ] ?? {}), `${champ} est désormais déclaré`).toEqual([]);
    }
  });
});

// ─── UN PAQUET PEUT ÊTRE LÀ SANS SA CHARGE UTILE, et c'est une troisième faute. ───
//
// Les cas ci-dessus jugent la présence sur le `package.json` du paquet. Cela ne dit rien de ce
// qu'il a téléchargé à son installation. `electron` en est l'exemple : son dossier pèse quelques
// centaines de kilooctets, et le binaire de deux cent trente-huit mégaoctets qu'il va chercher
// vit sous `dist/`. `scripts/build-electron.cjs` met ce binaire de côté avant d'élaguer, puis le
// remet ; une reprise interrompue laisse le paquet complet en apparence et l'application
// impossible à lancer.
//
// MESURÉ EN ÉCARTANT LE BINAIRE : `tsc -b` rend zéro, les deux gardes de ce fichier et celui des
// imports passent, et aucun test du dépôt ne requiert `electron`. Rien ne le remarque.
//
// LA CONVENTION EST CHERCHÉE, PAS LE NOM. Un paquet qui désigne lui-même son exécutable le fait
// dans un `path.txt` à sa racine, que son `index.js` joint à `dist/` : c'est ce couple qui est
// cherché dans l'arbre entier. Aujourd'hui `electron` est le seul à le porter ; un autre qui
// adopterait la même convention serait gardé sans qu'on touche à ce fichier.
//
// ET LE PAQUET N'EST PAS CHARGÉ POUR LE VÉRIFIER, ce qui serait pourtant le plus direct. Relevé
// dans son `index.js` : quand le binaire manque, `getElectronPath` lance `install.js` et part le
// TÉLÉCHARGER. Un garde qui réparerait la faute qu'il cherche ne la signalerait jamais, et irait
// sur le réseau depuis une passe de tests.

/** Les charges utiles désignées par un `path.txt`, et celles qui manquent. */
export function chargesUtiles(racineModules: string): { paquet: string; chemin: string; present: boolean }[] {
  const trouves: { paquet: string; chemin: string; present: boolean }[] = [];
  const regarder = (dossier: string, nom: string) => {
    const designation = join(dossier, "path.txt");
    if (!existsSync(designation)) return;
    const designe = readFileSync(designation, "utf8").trim();
    if (!designe) return;
    const chemin = join(dossier, "dist", designe);
    // UN FICHIER VIDE N'EST PAS UNE CHARGE UTILE : un téléchargement coupé en laisse.
    const present = existsSync(chemin) && statSync(chemin).size > 0;
    trouves.push({ paquet: nom, chemin, present });
  };
  if (!existsSync(racineModules)) return trouves;
  for (const entree of readdirSync(racineModules, { withFileTypes: true })) {
    if (!entree.isDirectory()) continue;
    if (entree.name.startsWith("@")) {
      const portee = join(racineModules, entree.name);
      for (const sous of readdirSync(portee, { withFileTypes: true })) {
        if (sous.isDirectory()) regarder(join(portee, sous.name), `${entree.name}/${sous.name}`);
      }
      continue;
    }
    regarder(join(racineModules, entree.name), entree.name);
  }
  return trouves;
}

/**
 * Le lanceur dont l'application dépend pour démarrer, et son exécutable.
 *
 * POURQUOI `path.txt` NE SUFFIT PAS À LUI SEUL, et c'est ce qui a corrigé la première version de
 * ce fichier : il ne figure PAS dans le champ `files` du paquet npm, donc il n'arrive pas avec
 * lui. C'est `install.js` qui l'écrit, en même temps qu'il télécharge le binaire. Les deux
 * apparaissent et disparaissent ensemble, de sorte qu'un balayage qui cherche `path.txt` ne
 * trouve RIEN là où le binaire n'a jamais été pris, et passe à vide sur le cas même qu'il
 * surveille. L'absence de la désignation est donc un symptôme, pas une dispense.
 */
const LANCEUR = join(RACINE, "node_modules", "electron");

export function binaireDuLanceur(racineLanceur: string): { chemin: string | null; present: boolean } {
  const designation = join(racineLanceur, "path.txt");
  if (!existsSync(designation)) return { chemin: null, present: false };
  const designe = readFileSync(designation, "utf8").trim();
  if (!designe) return { chemin: null, present: false };
  const chemin = join(racineLanceur, "dist", designe);
  return { chemin, present: existsSync(chemin) && statSync(chemin).size > 0 };
}

describe("les charges utiles des paquets", () => {
  // L'INTÉGRATION NE LANCE JAMAIS L'APPLICATION, et son `npm ci` ne prend donc pas les deux cent
  // trente-huit mégaoctets du binaire. La publication, elle, en a besoin et le vérifie déjà par
  // son étape « Ensure Electron binary is present », qui lance `install.js`. Ce cas-ci sert le
  // poste de développement, où le binaire est mis de côté puis remis à chaque construction.
  const surUnPoste = !process.env.CI;

  it.skipIf(!surUnPoste)("LE LANCEUR PORTE SON EXÉCUTABLE, sans quoi l'application ne démarre pas", () => {
    const { chemin, present } = binaireDuLanceur(LANCEUR);
    expect(existsSync(LANCEUR), "le paquet du lanceur doit être installé").toBe(true);
    expect(present, [
      chemin
        ? `Le lanceur désigne ${chemin}, qui est absent ou vide.`
        : "Le lanceur ne désigne aucun exécutable : son `path.txt` manque, donc le binaire n'a jamais été pris.",
      "Le paquet est complet en apparence et l'application ne démarrera pas.",
      "Remède : `node node_modules/electron/install.js`.",
    ].join("\n")).toBe(true);
  });

  it("cherche la charge utile par sa convention, sur tout l'arbre", () => {
    // Le balayage sert aux paquets qui adoptent la même convention. Il peut légitimement ne rien
    // trouver, et c'est pourquoi il n'est pas ce qui garde le lanceur : les cas sur arbre
    // synthétique, plus bas, sont ce qui prouve qu'il voit ce qu'il doit voir.
    for (const charge of chargesUtiles(join(RACINE, "node_modules"))) {
      expect(charge.present, `${charge.paquet} désigne ${charge.chemin}, qui est absent ou vide`).toBe(true);
    }
  });

  it("comptent un fichier vide pour une charge utile absente", () => {
    const faux = mkdtempSync(join(tmpdir(), "attic-charge-"));
    try {
      mkdirSync(join(faux, "faux-electron", "dist"), { recursive: true });
      writeFileSync(join(faux, "faux-electron", "path.txt"), "machin.exe\n");
      expect(chargesUtiles(faux)).toEqual([
        { paquet: "faux-electron", chemin: join(faux, "faux-electron", "dist", "machin.exe"), present: false },
      ]);

      writeFileSync(join(faux, "faux-electron", "dist", "machin.exe"), "");
      expect(chargesUtiles(faux)[0].present, "un fichier vide ne compte pas").toBe(false);

      writeFileSync(join(faux, "faux-electron", "dist", "machin.exe"), "MZ");
      expect(chargesUtiles(faux)[0].present).toBe(true);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });

  it("ignore un paquet qui ne désigne aucun exécutable", () => {
    const faux = mkdtempSync(join(tmpdir(), "attic-charge-"));
    try {
      mkdirSync(join(faux, "paquet-ordinaire"));
      writeFileSync(join(faux, "paquet-ordinaire", "package.json"), "{}");
      expect(chargesUtiles(faux)).toEqual([]);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });

  it("tient l'absence de désignation pour un binaire jamais pris, et non pour une dispense", () => {
    // LE DÉFAUT QUE CE CAS EMPÊCHE, et c'est celui sur lequel la première version est tombée :
    // `path.txt` disparaît AVEC le binaire, puisque c'est `install.js` qui écrit les deux. Un
    // garde qui se tait quand la désignation manque se tait précisément quand il faut parler.
    const faux = mkdtempSync(join(tmpdir(), "attic-lanceur-"));
    try {
      mkdirSync(join(faux, "dist"), { recursive: true });
      expect(binaireDuLanceur(faux), "sans path.txt").toEqual({ chemin: null, present: false });

      writeFileSync(join(faux, "path.txt"), "   \n");
      expect(binaireDuLanceur(faux).present, "path.txt vide").toBe(false);

      writeFileSync(join(faux, "path.txt"), "truc.exe\n");
      expect(binaireDuLanceur(faux).present, "designe sans le fichier").toBe(false);

      writeFileSync(join(faux, "dist", "truc.exe"), "");
      expect(binaireDuLanceur(faux).present, "fichier vide").toBe(false);

      writeFileSync(join(faux, "dist", "truc.exe"), "MZ");
      expect(binaireDuLanceur(faux).present, "fichier reel").toBe(true);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });

  it("regarde aussi sous les portées", () => {
    const faux = mkdtempSync(join(tmpdir(), "attic-charge-"));
    try {
      mkdirSync(join(faux, "@une-portee", "un-paquet", "dist"), { recursive: true });
      writeFileSync(join(faux, "@une-portee", "un-paquet", "path.txt"), "truc");
      expect(chargesUtiles(faux).map((c) => c.paquet)).toEqual(["@une-portee/un-paquet"]);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });
});

describe("ce que ce fichier ne garde pas", () => {
  it("ne charge jamais electron pour le vérifier, car cela le réparerait en silence", () => {
    // Relevé dans `node_modules/electron/index.js` : `getElectronPath` lance `install.js` quand le
    // binaire manque. Ce cas tient la décision écrite plus haut, en montrant la ligne qui la
    // justifie plutôt qu'en la laissant à la mémoire de celui qui relira.
    const index = readFileSync(join(RACINE, "node_modules", "electron", "index.js"), "utf8");
    expect(index).toContain("downloadElectron");
  });
});
