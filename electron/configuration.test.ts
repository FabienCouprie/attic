// electron/configuration.test.ts — Le fichier de configuration, sous Windows et sous Linux injectés.
//
// CE QUI DOIT ÊTRE TENU, chaque règle de `configuration.cjs` par un cas :
//   - un fichier absent ou vide rend les défauts, sans problème ;
//   - le BOM est retiré, les fins de ligne CRLF passent, une erreur de syntaxe donne sa ligne ;
//   - la section de ce système complète la partie commune et l'emporte sur elle ; celle de l'autre
//     système est ignorée sans un mot ;
//   - une clé inconnue, du mauvais type, hors de ses bornes ou propre à l'autre système est nommée,
//     et le défaut s'applique ;
//   - un chemin Windows s'écrit avec des barres obliques, `~/` désigne le dossier personnel, et un
//     chemin qui n'est pas absolu pour ce système est refusé ;
//   - l'environnement l'emporte sur le fichier, et une liste s'y sépare comme un `PATH` ;
//   - sous Linux, un fichier inscriptible par le groupe ou par tous n'est pas appliqué ;
//   - un fichier absent, illisible ou refusé ne fait jamais échouer le chargement.
// Le système est INJECTÉ : la CI tourne sous Windows, et les cas Linux doivent y passer aussi.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { posix, win32 } from "node:path";

const require_ = createRequire(import.meta.url);
const { SCHEMA, lireConfiguration, chargerConfiguration, fichierAppliquable, formulerProbleme, proposition } = require_("./configuration.cjs");

/**
 * Un schéma d'essai : un exemple de chaque type, une variable d'environnement, une clé propre à
 * Linux, et un chemin dont le défaut se calcule depuis ce que l'installeur a posé.
 */
const SCHEMA_ESSAI = {
  plafond: { type: "nombre", defaut: 1, min: 0.25, max: 3.5, env: "ATTIC_PLAFOND" },
  modeles: { type: "chemin", defaut: null },
  outils: { type: "chemin", defaut: (c: { systeme: string; ressources: string }) => (c.systeme === "windows" ? win32 : posix).join(c.ressources, "bin") },
  racines: { type: "chemins", defaut: [], env: "ATTIC_RACINES" },
  affichage: { type: "choix", valeurs: ["auto", "x11", "wayland"], defaut: "auto", systemes: ["linux"] },
  horsLigne: { type: "booleen", defaut: false, env: "ATTIC_HORS_LIGNE" },
};
/** Les deux machines cibles, avec ce que l'installeur y pose : un NSIS par personne, un AppImage monté. */
const WINDOWS = {
  plateforme: "win32", home: "C:\\Users\\f", userData: "C:\\Users\\f\\AppData\\Roaming\\attic",
  ressources: "C:\\Users\\f\\AppData\\Local\\Programs\\attic\\resources", schema: SCHEMA_ESSAI,
};
const LINUX = {
  plateforme: "linux", home: "/home/f", userData: "/home/f/.config/attic",
  ressources: "/tmp/.mount_atticX1/resources", schema: SCHEMA_ESSAI,
};
const codes = (r: { problemes: { code: string; cle?: string }[] }) => r.problemes.map((p) => (p.cle ? `${p.code}:${p.cle}` : p.code));

describe("le fichier de configuration, sous Windows et sous Linux", () => {
  it("LE SCHÉMA PORTE LES CLÉS DES PIÈCES LIVRÉES, et seulement elles", () => {
    // C0 n'en portait aucune ; C1 ajoute le plafond du paquet.
    expect(Object.keys(SCHEMA)).toEqual(["plafondPaquetMio"]);
  });

  it("UN FICHIER ABSENT OU VIDE REND LES DÉFAUTS, sans problème", () => {
    for (const systeme of [WINDOWS, LINUX]) {
      for (const texte of [undefined, "", "  \n"]) {
        const r = lireConfiguration({ ...systeme, texte });
        expect(r.valeurs).toMatchObject({ plafond: 1, modeles: null, racines: [], affichage: "auto", horsLigne: false });
        expect(new Set(Object.values(r.sources))).toEqual(new Set(["defaut"]));
        expect(r.problemes).toEqual([]);
      }
    }
  });

  it("LE BOM EST RETIRÉ, LE CRLF PASSE, et une erreur de syntaxe donne sa ligne", () => {
    const r = lireConfiguration({ ...WINDOWS, texte: "\uFEFF{\r\n  \"plafond\": 2\r\n}\r\n" });
    expect(r.problemes).toEqual([]);
    expect(r.valeurs.plafond).toBe(2);
    const faux = lireConfiguration({ ...LINUX, texte: "{\n  \"plafond\": 2,\n  \"horsLigne\" true\n}" });
    expect(faux.problemes[0]).toMatchObject({ code: "syntaxe", ligne: 3 });
    expect(faux.valeurs.plafond, "un fichier illisible n'applique rien de lui").toBe(1);
    expect(codes(lireConfiguration({ ...LINUX, texte: "[1, 2]" }))).toEqual(["racine"]);
  });

  it("LA SECTION DE CE SYSTÈME L'EMPORTE SUR LA PARTIE COMMUNE, et celle de l'autre est ignorée sans un mot", () => {
    const texte = JSON.stringify({
      plafond: 1.5,
      windows: { plafond: 2, modeles: "E:/modeles" },
      linux: { plafond: 3, modeles: "/mnt/modeles", affichage: "x11" },
    });
    const w = lireConfiguration({ ...WINDOWS, texte });
    expect(w.problemes).toEqual([]);
    expect(w.valeurs).toMatchObject({ plafond: 2, modeles: "E:\\modeles", affichage: "auto" });
    const l = lireConfiguration({ ...LINUX, texte });
    expect(l.problemes).toEqual([]);
    expect(l.valeurs).toMatchObject({ plafond: 3, modeles: "/mnt/modeles", affichage: "x11" });
    expect(codes(lireConfiguration({ ...LINUX, texte: JSON.stringify({ linux: [1] }) }))).toEqual(["section:linux"]);
  });

  it("UNE CLÉ INCONNUE, FAUSSE OU PROPRE À L'AUTRE SYSTÈME EST NOMMÉE, et le défaut s'applique", () => {
    const texte = JSON.stringify({ plafon: 2, plafond: 9, horsLigne: "oui", affichage: "x11", windows: { mystere: 1 } });
    const w = lireConfiguration({ ...WINDOWS, texte });
    expect(codes(w)).toEqual(["inconnue:plafon", "bornes:plafond", "type:horsLigne", "autre-systeme:affichage", "inconnue:mystere"]);
    expect(w.valeurs).toMatchObject({ plafond: 1, horsLigne: false, affichage: "auto" });
    const l = lireConfiguration({ ...LINUX, texte: JSON.stringify({ affichage: "mir" }) });
    expect(codes(l)).toEqual(["choix:affichage"]);
  });

  it("UN CHEMIN EST ABSOLU POUR CE SYSTÈME : barres obliques sous Windows, `~/` partout, et rien d'autre", () => {
    const w = (modeles: string) => lireConfiguration({ ...WINDOWS, texte: JSON.stringify({ modeles }) });
    expect(w("E:/modeles/attic").valeurs.modeles).toBe("E:\\modeles\\attic");
    expect(w("E:\\modeles").valeurs.modeles).toBe("E:\\modeles");
    expect(w("~/modeles").valeurs.modeles).toBe("C:\\Users\\f\\modeles");
    expect(w("\\\\serveur\\partage\\modeles").valeurs.modeles).toBe("\\\\serveur\\partage\\modeles");
    // `\modeles` serait « absolu » pour `path.win32`, mais résolu contre le lecteur courant.
    for (const faux of ["\\modeles", "modeles", "E:modeles", "/home/f/modeles"]) expect(codes(w(faux)), faux).toEqual(["chemin:modeles"]);
    const l = (modeles: string) => lireConfiguration({ ...LINUX, texte: JSON.stringify({ modeles }) });
    expect(l("/mnt/donnees/../modeles").valeurs.modeles).toBe("/mnt/modeles");
    expect(l("~/modeles").valeurs.modeles).toBe("/home/f/modeles");
    for (const faux of ["modeles", "E:/modeles", ""]) expect(codes(l(faux)), faux).toEqual(["chemin:modeles"]);
  });

  it("L'ENVIRONNEMENT L'EMPORTE SUR LE FICHIER, et une liste s'y sépare comme un `PATH`", () => {
    const texte = JSON.stringify({ plafond: 2, racines: ["E:/a"] });
    const w = lireConfiguration({ ...WINDOWS, texte, env: { ATTIC_PLAFOND: "3", ATTIC_RACINES: "E:\\x;F:/y", ATTIC_HORS_LIGNE: "1" } });
    expect(w.valeurs).toMatchObject({ plafond: 3, racines: ["E:\\x", "F:\\y"], horsLigne: true });
    expect(w.sources).toMatchObject({ plafond: "environnement", racines: "environnement", modeles: "defaut" });
    const l = lireConfiguration({ ...LINUX, env: { ATTIC_RACINES: "/srv/a:/srv/b" } });
    expect(l.valeurs.racines).toEqual(["/srv/a", "/srv/b"]);
    // UNE VARIABLE FAUSSE EST NOMMÉE, et la valeur du fichier reste.
    const faux = lireConfiguration({ ...LINUX, texte: JSON.stringify({ plafond: 2 }), env: { ATTIC_PLAFOND: "beaucoup" } });
    expect(faux.problemes).toEqual([{ code: "type", cle: "plafond", section: "environnement", detail: "ATTIC_PLAFOND" }]);
    expect(faux.valeurs.plafond).toBe(2);
  });

  it("SOUS LINUX, UN FICHIER INSCRIPTIBLE PAR LE GROUPE OU PAR TOUS N'EST PAS APPLIQUÉ", () => {
    expect(fichierAppliquable({ plateforme: "linux", mode: 0o100644 })).toBe(true);
    expect(fichierAppliquable({ plateforme: "linux", mode: 0o100600 })).toBe(true);
    expect(fichierAppliquable({ plateforme: "linux", mode: 0o100664 })).toBe(false);
    expect(fichierAppliquable({ plateforme: "linux", mode: 0o100646 })).toBe(false);
    expect(fichierAppliquable({ plateforme: "win32", mode: 0o100666 }), "sous Windows, le profil en tient lieu").toBe(true);
  });

  it("LE CHARGEMENT N'ÉCHOUE JAMAIS : absent, illisible ou refusé, il rend les défauts et l'environnement", () => {
    const absent = Object.assign(new Error("absent"), { code: "ENOENT" });
    const charge = (o: Record<string, unknown>) => chargerConfiguration({ chemin: "/home/f/.config/attic/config.json", ...LINUX, ...o });
    const a = charge({ statut: () => { throw absent; }, lire: () => "" });
    expect(a).toMatchObject({ fichier: "absent", problemes: [] });
    const i = charge({ statut: () => { throw Object.assign(new Error("x"), { code: "EACCES" }); }, lire: () => "" });
    expect(i.fichier).toBe("illisible");
    expect(codes(i)).toEqual(["illisible"]);
    const r = charge({ statut: () => ({ mode: 0o100666 }), lire: () => JSON.stringify({ plafond: 3 }), env: { ATTIC_HORS_LIGNE: "1" } });
    expect(r.fichier).toBe("refuse");
    expect(r.problemes[0]).toEqual({ code: "mode", detail: "666" });
    expect(r.valeurs, "le fichier refusé n'applique rien ; l'environnement, si").toMatchObject({ plafond: 1, horsLigne: true });
    const lu = charge({ statut: () => ({ mode: 0o100644 }), lire: () => JSON.stringify({ plafond: 3 }) });
    expect(lu).toMatchObject({ fichier: "lu", problemes: [] });
    expect(lu.valeurs.plafond).toBe(3);
  });

  it("UN DÉFAUT DE CHEMIN EST CELUI DE CETTE MACHINE, calculé depuis ce que l'installeur a posé", () => {
    expect(lireConfiguration(WINDOWS).valeurs.outils).toBe("C:\\Users\\f\\AppData\\Local\\Programs\\attic\\resources\\bin");
    expect(lireConfiguration(LINUX).valeurs.outils).toBe("/tmp/.mount_atticX1/resources/bin");
    // L'AppImage se monte ailleurs au lancement suivant : le défaut suit, rien n'est figé.
    expect(lireConfiguration({ ...LINUX, ressources: "/tmp/.mount_atticY2/resources" }).valeurs.outils).toBe("/tmp/.mount_atticY2/resources/bin");
  });

  it("LE FICHIER PROPOSÉ PORTE LES VALEURS EN VIGUEUR DE CE SYSTÈME, ET SE RELIT SANS UN PROBLÈME", () => {
    for (const systeme of [WINDOWS, LINUX]) {
      const texte = JSON.stringify(systeme === WINDOWS
        ? { plafond: 2, windows: { modeles: "E:/modeles" } }
        : { plafond: 2, linux: { modeles: "/mnt/modeles", affichage: "x11" } });
      const enVigueur = lireConfiguration({ ...systeme, texte });
      const propose = proposition({ valeurs: enVigueur.valeurs, plateforme: systeme.plateforme, schema: SCHEMA_ESSAI });
      const nom = systeme === WINDOWS ? "windows" : "linux";
      expect(Object.keys(propose), "une seule section, celle de ce système").toEqual([nom]);
      if (systeme === WINDOWS) expect("affichage" in propose.windows, "une clé propre à Linux n'est pas proposée sous Windows").toBe(false);
      const relu = lireConfiguration({ ...systeme, texte: JSON.stringify(propose) });
      expect(relu.problemes).toEqual([]);
      expect(relu.valeurs).toEqual(enVigueur.valeurs);
    }
    // UNE VALEUR ABSENTE N'EST PAS ÉCRITE : `null` serait du mauvais type à la relecture.
    expect("modeles" in proposition({ valeurs: lireConfiguration(LINUX).valeurs, plateforme: "linux", schema: SCHEMA_ESSAI }).linux).toBe(false);
  });

  it("CHAQUE PROBLÈME SE DIT EN UNE PHRASE, pour le journal du processus principal", () => {
    const tous = [
      ...lireConfiguration({ ...WINDOWS, texte: "{ faux" }).problemes,
      ...lireConfiguration({ ...WINDOWS, texte: "[]" }).problemes,
      ...lireConfiguration({ ...WINDOWS, texte: JSON.stringify({ x: 1, plafond: 9, horsLigne: 2, affichage: "x11", modeles: "a", windows: 3 }) }).problemes,
      ...lireConfiguration({ ...LINUX, texte: JSON.stringify({ affichage: "mir" }) }).problemes,
      { code: "illisible", detail: "EACCES" }, { code: "mode", detail: "666" }, { code: "schema", cle: "k" },
    ];
    expect(new Set(tous.map((p) => p.code))).toEqual(new Set(["syntaxe", "racine", "inconnue", "bornes", "type", "autre-systeme", "chemin", "section", "choix", "illisible", "mode", "schema"]));
    for (const p of tous) expect(formulerProbleme(p), p.code).not.toMatch(/^problème /);
    expect(formulerProbleme({ code: "jamais-vu" })).toBe("problème jamais-vu");
  });
});
