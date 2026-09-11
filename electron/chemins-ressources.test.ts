// electron/chemins-ressources.test.ts — Résolution des chemins de ressources.
//
// Ce que ces tests protègent : la différence entre le développement et
// l'application empaquetée. C'est la classe de défaut qui a coûté la v3.1.4 —
// le worker Sherpa marchait en développement, où Vite sert la racine, et
// pointait vers la racine du disque une fois l'application chargée en `file://`.
// Le symptôme est toujours le même : ça marche ici, pas là-bas, et on ne le
// découvre qu'après avoir publié un installeur.
//
// Sept copies de ce calcul vivaient dans main.cjs, dont UNE SEULE avec le repli
// `public/` du développement. Un même chemin relatif se résolvait donc par un
// gestionnaire et pas par un autre.
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { resoudreRessource } = require_("./chemins-ressources.cjs");

const RESSOURCES = join("C:", "Program Files", "Attic", "resources");
const PROJET = join("E:", "attic");

const empaquete = (existe = () => false) =>
  ({ empaquete: true, racineRessources: RESSOURCES, racineProjet: PROJET, existe });
const dev = (existe = () => false) =>
  ({ empaquete: false, racineRessources: RESSOURCES, racineProjet: PROJET, existe });

/** Faux `existsSync` : la liste des chemins réputés présents. */
const presents = (...p: string[]) => (c: string) => p.includes(c);

describe("chemin absolu", () => {
  it("est rendu tel quel, dans les deux environnements", () => {
    // Un chemin absolu vient de l'utilisateur — un fichier choisi dans un
    // dialogue — pas des ressources de l'application. Le préfixer serait un bug.
    const abs = join("D:", "musique", "piste.wav");
    expect(resoudreRessource(abs, empaquete())).toBe(abs);
    expect(resoudreRessource(abs, dev())).toBe(abs);
  });
});

describe("application empaquetée", () => {
  it("résout depuis resourcesPath", () => {
    expect(resoudreRessource("oonx/demucs/model.onnx", empaquete()))
      .toBe(join(RESSOURCES, "oonx/demucs/model.onnx"));
  });

  it("ne cherche JAMAIS dans public/", () => {
    // À la construction, le contenu de public/ est copié à la racine des
    // ressources : c'est `resources/oonx/…`, pas `resources/public/oonx/…`.
    // Chercher public/ ici ne trouverait rien et masquerait la vraie cause
    // d'un échec derrière un second chemin également faux.
    const versPublic = join(RESSOURCES, "public", "sf2/banque.sf2");
    const resolu = resoudreRessource("sf2/banque.sf2", empaquete(presents(versPublic)));
    expect(resolu).toBe(join(RESSOURCES, "sf2/banque.sf2"));
    expect(resolu).not.toContain("public");
  });
});

describe("développement", () => {
  it("résout depuis la racine du projet quand le fichier y est", () => {
    const direct = join(PROJET, "bin/songsee/songsee.exe");
    expect(resoudreRessource("bin/songsee/songsee.exe", dev(presents(direct)))).toBe(direct);
  });

  it("se rabat sur public/ quand le fichier n'est pas à la racine", () => {
    // Le repli qui n'existait que dans UN gestionnaire sur sept : en
    // développement, public/ n'est pas encore aplati à la racine.
    const dansPublic = join(PROJET, "public", "sf2/banque.sf2");
    expect(resoudreRessource("sf2/banque.sf2", dev(presents(dansPublic)))).toBe(dansPublic);
  });

  it("préfère la racine à public/ quand les deux existent", () => {
    // Ordre voulu : la racine d'abord, public/ en secours. L'inverse ferait
    // gagner une copie oubliée dans public/ sur le fichier réellement à jour.
    const direct = join(PROJET, "sf2/banque.sf2");
    const dansPublic = join(PROJET, "public", "sf2/banque.sf2");
    expect(resoudreRessource("sf2/banque.sf2", dev(presents(direct, dansPublic)))).toBe(direct);
  });

  it("rend le chemin racine quand rien n'existe, pour que l'erreur soit lisible", () => {
    // Échouer en nommant le chemin attendu vaut mieux que rendre null : le
    // message d'erreur des gestionnaires cite ce chemin.
    expect(resoudreRessource("absent/x.bin", dev())).toBe(join(PROJET, "absent/x.bin"));
  });
});

describe("entrées refusées", () => {
  it("rend null sur une valeur inexploitable", () => {
    for (const v of [null, undefined, "", 42, {}]) {
      expect(resoudreRessource(v as any, dev()), JSON.stringify(v)).toBeNull();
    }
  });

  it("rend null quand la racine applicable manque", () => {
    // `process.resourcesPath` est undefined hors d'Electron : mieux vaut null
    // qu'un `path.join(undefined, …)` qui lève.
    expect(resoudreRessource("x.bin", { empaquete: true, racineProjet: PROJET })).toBeNull();
    expect(resoudreRessource("x.bin", { empaquete: false, racineRessources: RESSOURCES })).toBeNull();
  });
});
