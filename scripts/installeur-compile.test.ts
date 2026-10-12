// scripts/installeur-compile.test.ts — `build/installer.nsh` se compile, et pas seulement se lit.
//
// LE DÉFAUT QUE CE CAS EMPÊCHE A FAIT ÉCHOUER UNE RELEASE. `installeur-arbre-de-sources.test.ts`
// tient ce que le fichier DIT : le refus posé aux deux endroits, les quatre marques sondées.
// Il ne pouvait rien dire de ce que NSIS en pense. La construction de la v5.0.1 est tombée sur :
//
//   Error: could not resolve label "Attic will not uninstall from here.
//
// `/SD` était écrit avant le texte du `MessageBox` au lieu d'après. La ligne était présente et
// bien formée pour une lecture humaine ; elle était fausse pour NSIS. Et NSIS ne tournait nulle
// part ailleurs que dans le workflow de release, donc APRÈS le tag : la faute se découvrait une
// fois de trop, tag posé et release manquée.
//
// CE CAS S'IGNORE QUAND `makensis` N'EST PAS LÀ, et c'est volontaire : un poste de développement
// n'a aucune raison d'avoir NSIS installé, et un cas qui exigerait de l'avoir rendrait la suite
// inlançable. Il tourne chez qui a déjà construit un installeur — electron-builder met NSIS en
// cache — et dans l'intégration continue, où le workflow installe le paquet exprès. Sans cela le
// garde serait une intention de plus.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const RACINE = join(__dirname, "..");
const HARNAIS = join(__dirname, "harnais-installeur.nsi");

/** Le premier `makensis` trouvé sous une racine, quelle que soit la version du paquet. */
function chercherSous(racine: string, profondeur = 4): string | null {
  if (profondeur < 0 || !existsSync(racine)) return null;
  let entrees: string[];
  try { entrees = readdirSync(racine); } catch { return null; }
  for (const entree of entrees) {
    const chemin = join(racine, entree);
    if (/^makensis(\.exe|\.cmd)?$/i.test(entree)) return chemin;
    let estDossier = false;
    try { estDossier = statSync(chemin).isDirectory(); } catch { /* lien mort */ }
    if (estDossier) {
      const trouve = chercherSous(chemin, profondeur - 1);
      if (trouve) return trouve;
    }
  }
  return null;
}

/**
 * Où `makensis` peut se trouver, dans l'ordre où l'on regarde.
 *
 * LE CACHE D'ELECTRON-BUILDER EN PREMIER, parce que c'est le NSIS qui construit RÉELLEMENT nos
 * installeurs : s'il existe sur ce poste, c'est lui qu'on veut éprouver, et non une version
 * système qui pourrait en différer.
 */
function trouverMakensis(): string | null {
  const cache = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "electron-builder", "Cache")
    : join(process.env.HOME ?? "", ".cache", "electron-builder");
  const dansCache = chercherSous(cache, 5);
  if (dansCache) return dansCache;
  for (const commande of ["makensis", "makensis.exe"]) {
    try {
      execFileSync(commande, ["/VERSION"], { stdio: "ignore", shell: true });
      return commande;
    } catch { /* pas sur le chemin */ }
  }
  return null;
}

const MAKENSIS = trouverMakensis();

describe("le script de l'installeur", () => {
  it("le harnais existe et désigne le fichier à compiler", () => {
    // Un harnais qui n'inclurait plus rien compilerait très bien, et ne dirait rien.
    expect(existsSync(HARNAIS)).toBe(true);
    expect(existsSync(join(RACINE, "build", "installer.nsh"))).toBe(true);
  });

  it.skipIf(!MAKENSIS)("SE COMPILE, et pas seulement se lit", () => {
    // `/V2` : les avertissements, pas le détail. `/WX` les rend bloquants — un avertissement de
    // NSIS désigne presque toujours une instruction qui ne fera pas ce qu'on croit.
    // La sortie va dans un dossier temporaire : cet exécutable n'installe rien et ne sert à rien.
    let sortie = "";
    try {
      sortie = execFileSync(MAKENSIS!, ["/V2", "/WX", HARNAIS], {
        cwd: join(tmpdir()),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: MAKENSIS!.endsWith(".cmd"),
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      expect.fail([
        "makensis refuse build/installer.nsh. C'est exactement ce qui a fait échouer la release",
        "v5.0.1, et ce qu'aucune lecture du fichier ne pouvait attraper.",
        "",
        String(e.stdout ?? ""),
        String(e.stderr ?? ""),
      ].join("\n"));
    }
    expect(sortie).not.toMatch(/\berror\b/i);
  });

  it.skipIf(!process.env.CI)("ET L'INTÉGRATION CONTINUE EN A UN, sinon le cas ci-dessus se tairait", () => {
    // L'ANGLE MORT D'UN CAS QUI S'IGNORE : il ne distingue pas « pas de NSIS sur ce poste », qui
    // est normal, de « l'étape qui installe NSIS a disparu du workflow », qui vide le garde sans
    // qu'aucune suite ne rougisse. Ici, sur la machine d'intégration, son absence est une faute.
    //
    // ET LE MESSAGE NOMME LES DEUX CAUSES, parce qu'il n'en nommait qu'une et que c'était la
    // mauvaise le jour où il a parlé. Le 2026-10-12 il a réclamé d'ajouter une étape DÉJÀ
    // PRÉSENTE : le dépôt Chocolatey avait rendu un 504, `choco install` était sorti en zéro en
    // n'installant rien, et l'étape s'était déclarée réussie.
    expect(MAKENSIS, [
      "makensis est introuvable sur la machine d'intégration, et il y a deux causes possibles :",
      "  · l'étape « Install NSIS » a disparu de .github/workflows/ci.yml ;",
      "  · elle y est, mais elle n'a rien installé — `choco install` sort en zéro quand le dépôt",
      "    est injoignable. L'étape vérifie désormais le binaire ; si ce message apparaît malgré",
      "    tout, c'est que cette vérification a été retirée.",
    ].join("\n")).toBeTruthy();
  });

  it("ET L'ÉTAPE QUI L'INSTALLE VÉRIFIE SON BINAIRE, sans quoi elle réussit sans rien faire", () => {
    // CE CAS GARDE LA FORME DE L'ÉTAPE, et non son effet : il tourne partout, y compris sur un
    // poste sans NSIS, là où les deux cas ci-dessus s'en remettent à la machine d'intégration.
    //
    // `choco install` SORT EN ZÉRO QUAND IL N'INSTALLE RIEN, ce qui rend l'étape silencieuse sur
    // sa propre panne : relevé le 2026-10-12, le dépôt a rendu un 504 Gateway Timeout, le journal
    // a dit « Chocolatey installed 0/0 packages », et l'étape a réussi. L'échec n'est apparu que
    // trois minutes plus tard, ailleurs, et sous un message qui désignait la mauvaise cause.
    const ci = readFileSync(join(RACINE, ".github", "workflows", "ci.yml"), "utf8");
    const etape = ci.slice(ci.indexOf("- name: Install NSIS"));
    const corps = etape.slice(0, etape.indexOf("- name: Test"));
    expect(corps, "l'étape « Install NSIS » est introuvable dans ci.yml").toContain("choco install nsis");
    expect(corps, "l'étape doit vérifier que makensis.exe existe après l'installation")
      .toMatch(/Test-Path/);
    expect(corps, "et lever quand il est absent, sans quoi la vérification ne sert à rien")
      .toMatch(/throw/);
  });
});
