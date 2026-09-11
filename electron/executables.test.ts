// electron/executables.test.ts — Interrogation d'un exécutable externe.
//
// Deux défauts couverts ici, tous deux dans la même ligne de main.cjs :
//
//     execSync(`${CHEMIN_PYTHON} --version`, …).toString().trim()
//
// Le chemin n'était pas cité alors qu'`execSync` passe par un shell, et l'appel
// vivait dans le littéral d'objet retourné, donc sans try/catch.
//
// Le piège du correctif est ce que ces tests protègent vraiment : citer partout
// aurait cassé « py -3 », que la détection Python stocke tel quel. On distingue
// donc un chemin d'une commande en interrogeant le DISQUE, pas en devinant
// d'après la forme — les deux contiennent une espace.
//
// Aucun test ne lance de processus : `executer` et `existe` sont injectés.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { commandeVersion, infoExecutable } = require_("./executables.cjs");

/** Faux `fs.existsSync` : la liste des chemins réputés présents. */
const disque = (...presents: string[]) => (p: string) => presents.includes(p);
const rien = () => false;

const PYTHON_ESPACES = "C:\\Program Files\\Python313\\python.exe";

describe("commandeVersion", () => {
  it("traite un chemin comme un seul fichier, espaces comprises", () => {
    // Le cas qui cassait : le shell lisait « C:\\Program » comme la commande.
    expect(commandeVersion(PYTHON_ESPACES, disque(PYTHON_ESPACES)))
      .toEqual({ fichier: PYTHON_ESPACES, args: ["--version"] });
  });

  it("découpe une commande suivie d'arguments", () => {
    // « py -3 » n'est pas un fichier : la détection Python le stocke tel quel
    // quand le lanceur Windows répond. Citer aurait fait chercher un fichier
    // nommé « py -3 ».
    expect(commandeVersion("py -3", rien))
      .toEqual({ fichier: "py", args: ["-3", "--version"] });
  });

  it("distingue les deux par le disque, pas par la forme", () => {
    // Même chaîne, deux interprétations selon qu'elle existe ou non : c'est
    // exactement pourquoi aucune règle syntaxique ne pouvait trancher.
    const ambigu = "C:\\mes outils\\python.exe";
    expect(commandeVersion(ambigu, disque(ambigu)).args).toEqual(["--version"]);
    expect(commandeVersion(ambigu, rien).fichier).toBe("C:\\mes");
  });

  it("accepte une commande nue", () => {
    expect(commandeVersion("python3", rien)).toEqual({ fichier: "python3", args: ["--version"] });
  });

  it("ignore les espaces de bordure", () => {
    expect(commandeVersion("  julia  ", rien)).toEqual({ fichier: "julia", args: ["--version"] });
  });

  it("rend null sur une valeur inexploitable", () => {
    for (const v of [null, undefined, "", "   ", 42, {}]) {
      expect(commandeVersion(v as any, rien), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("infoExecutable", () => {
  it("rend la version, débarrassée du retour à la ligne", () => {
    const r = infoExecutable("python3", () => "Python 3.13.1\n", rien);
    expect(r).toEqual({ disponible: true, chemin: "python3", version: "Python 3.13.1" });
  });

  it("passe au lanceur un fichier et des arguments séparés", () => {
    // La vérification qui garantit l'absence de shell : ce qui sort d'ici va
    // dans execFile, donc aucune citation n'est à faire nulle part.
    let recu: unknown[] = [];
    infoExecutable(PYTHON_ESPACES, (f: string, a: string[]) => { recu = [f, a]; return "Python 3.13.1"; }, disque(PYTHON_ESPACES));
    expect(recu).toEqual([PYTHON_ESPACES, ["--version"]]);
  });

  it("ne lève JAMAIS quand l'exécutable a disparu", () => {
    // Le second défaut : l'appel vivait dans le littéral retourné, donc une
    // erreur rejetait la promesse IPC au lieu de rendre « indisponible ».
    const r = infoExecutable("python3", () => { throw new Error("ENOENT"); }, rien);
    expect(r.disponible).toBe(false);
    expect(r.version).toBeNull();
    expect(r.erreur).toContain("ENOENT");
  });

  it("conserve le chemin en cas d'échec", () => {
    // Savoir QUEL exécutable a échoué aide à le reconfigurer ; « indisponible »
    // tout court n'aide pas.
    const r = infoExecutable(PYTHON_ESPACES, () => { throw new Error("x"); }, disque(PYTHON_ESPACES));
    expect(r.chemin).toBe(PYTHON_ESPACES);
  });

  it("rend indisponible sans rien lancer quand aucun exécutable n'est configuré", () => {
    let lance = false;
    const r = infoExecutable(null, () => { lance = true; return ""; }, rien);
    expect(r).toEqual({ disponible: false, chemin: null, version: null });
    expect(lance).toBe(false);
  });

  it("accepte une sortie non textuelle sans se plaindre", () => {
    // execFileSync rend un Buffer quand on oublie .toString() : le module ne
    // doit pas dépendre de la discipline de son appelant.
    const r = infoExecutable("julia", () => Buffer.from("julia version 1.11.2\n"), rien);
    expect(r.version).toBe("julia version 1.11.2");
  });
});
