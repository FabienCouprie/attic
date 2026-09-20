// ui/barre-outils-groupes.test.ts — La barre d'outils se range et s'annonce pareil.
//
// Elle était une rangée d'icônes sans étiquette, dans l'ordre où elles avaient été
// ajoutées ; deux d'entre elles étaient des disques qu'on confondait, et les survols ne
// se ressemblaient pas — « Thème » et « Dossier » sont des noms, « Sauvegarder
// l'en-cours » une phrase, et le SoundFont annonçait « SF2: » suivi d'un nom de fichier,
// jamais traduit. Ces tests tiennent la forme : une famille pour chaque outil, une
// étiquette bâtie pareil, et rien de muet dans l'une des deux langues.
import { describe, expect, it } from "vitest";
import { CLES_CONNUES, traduireDans } from "../i18n";
import {
  FAMILLES, OUTILS, etiquetteFamille, etiquetteOutil, outil, outilsDe,
} from "./barre-outils-groupes";

const t = (cle: string) => traduireDans("fr", cle);
const tEn = (cle: string) => traduireDans("en", cle);

describe("table des outils", () => {
  it("donne à chacun un identifiant unique", () => {
    const ids = OUTILS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("range chaque outil dans une famille connue, et n'en laisse aucune vide", () => {
    for (const o of OUTILS) expect(FAMILLES, o.id).toContain(o.famille);
    for (const f of FAMILLES) expect(outilsDe(f).length, f).toBeGreaterThan(0);
  });

  it("garde les familles dans l'ordre de la barre, de gauche à droite", () => {
    expect([...FAMILLES]).toEqual(["fichier", "edition", "ressources", "affichage", "application", "execution"]);
    // Les outils sont déclarés dans cet ordre : la table se lit comme la barre.
    const ordre = OUTILS.map((o) => FAMILLES.indexOf(o.famille));
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
  });

  it("refuse un identifiant inconnu plutôt que de rendre une étiquette vide", () => {
    expect(() => outil("inexistant")).toThrow(/inconnu/);
  });
});

describe("étiquettes", () => {
  it("existent dans les deux langues, pour les outils comme pour les familles", () => {
    for (const o of OUTILS) {
      expect(CLES_CONNUES.has(o.cle), `${o.id} : clé ${o.cle} absente du dictionnaire`).toBe(true);
      // `traduireDans` renvoie la clé elle-même quand la traduction manque.
      expect(t(o.cle), o.id).not.toBe(o.cle);
      expect(tEn(o.cle), o.id).not.toBe(o.cle);
    }
    for (const f of FAMILLES) {
      expect(CLES_CONNUES.has(`barre.groupe.${f}`), f).toBe(true);
      expect(etiquetteFamille(f, t), f).not.toBe(`barre.groupe.${f}`);
      expect(etiquetteFamille(f, tEn), f).not.toBe(`barre.groupe.${f}`);
    }
  });

  it("commencent toutes par un verbe à l'infinitif — la forme est la même partout", () => {
    // En français, l'infinitif des verbes de la barre finit par -er, -ir ou -re.
    for (const o of OUTILS) {
      const premier = t(o.cle).split(" ")[0];
      expect(premier, `${o.id} : « ${t(o.cle)} » ne commence pas par un verbe`).toMatch(/(er|ir|re)$/);
    }
  });

  it("portent le raccourci entre parenthèses, à la fin", () => {
    expect(etiquetteOutil("sauvegarder", t)).toBe("Sauvegarder l'en-cours (Ctrl+S)");
    expect(etiquetteOutil("lancer", t)).toBe("Lancer l'exécution (Espace)");
    expect(etiquetteOutil("cadre", t)).toBe("Ajouter un cadre");
  });

  it("traduisent le nom des touches : « Maj » et « Espace » restaient français en anglais", () => {
    expect(etiquetteOutil("exporter", t)).toBe("Exporter le projet (Ctrl+Maj+S)");
    expect(etiquetteOutil("exporter", tEn)).toBe("Export the project (Ctrl+Shift+S)");
    expect(etiquetteOutil("lancer", tEn)).toBe("Run the graph (Space)");
    // Une touche au nom identique dans les deux langues n'est pas traduite pour rien.
    expect(etiquetteOutil("importer", tEn)).toBe("Import a project (Ctrl+O)");
  });

  it("ne laissent aucune étiquette anglaise en français", () => {
    const ACCENTS = /[àâäçéèêëîïôöùûüÿœæ]/i;
    for (const o of OUTILS) {
      expect(ACCENTS.test(etiquetteOutil(o.id, tEn)), `${o.id} : « ${etiquetteOutil(o.id, tEn)} »`).toBe(false);
    }
    for (const f of FAMILLES) expect(ACCENTS.test(etiquetteFamille(f, tEn)), f).toBe(false);
  });

  it("ajoutent l'état du moment après un tiret, sans seconde phrase", () => {
    expect(etiquetteOutil("soundfont", t, "FluidR3.sf2")).toBe("Charger un SoundFont — FluidR3.sf2");
    expect(etiquetteOutil("sauvegarder", t, "mon-projet.json"))
      .toBe("Sauvegarder l'en-cours — mon-projet.json (Ctrl+S)");
  });

  it("ne se répètent pas d'un outil à l'autre : deux boutons ne portent pas le même nom", () => {
    for (const langue of [t, tEn]) {
      const etiquettes = OUTILS.map((o) => etiquetteOutil(o.id, langue));
      expect(new Set(etiquettes).size).toBe(etiquettes.length);
    }
  });

  it("distinguent le thème de la mise à jour, les deux boutons qu'on confondait", () => {
    expect(etiquetteOutil("theme", t)).not.toBe(etiquetteOutil("maj", t));
    expect(etiquetteOutil("theme", tEn)).not.toBe(etiquetteOutil("maj", tEn));
  });
});
