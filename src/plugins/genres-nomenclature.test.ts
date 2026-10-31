// plugins/genres-nomenclature.test.ts — Le genre : un identifiant offert doit nommer une progression.
//
// LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER. « Générateur musical » écrivait ses neuf
// identifiants de genre à la main, avec « hip-hop », quand la clé de `PROGRESSIONS_GENRE` est
// « hiphop ». La lecture fait `PROGRESSIONS_GENRE[genre] || PROGRESSIONS_GENRE["pop"]`, de sorte
// que ce genre rendait la progression de POP sans qu'aucun message ne le dise : mesuré, le fichier
// MIDI de « hip-hop » était identique à celui de « pop », octet pour octet.
//
// LE GARDE CHERCHE LA FORME ET NON UN NOM DE RÉGLAGE. Un réglage à choix dont trois identifiants
// au moins nomment une progression EST un réglage de genre, quel que soit son nom ; tous ses
// identifiants doivent alors en nommer une. Chercher le nom « Genre » laisserait passer le même
// vocabulaire sous un autre nom, et c'est précisément ainsi que les tables divergent.
// Le rendu du composant passe par un `AudioBuffer`, que Node n'a pas de lui-même.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import { ctxDEssai } from "../core/contexte-essai";
import { toutesLesFiches } from "./index";
import { PROGRESSIONS_GENRE, genererDepuisScript, normaliserGenre } from "../audio/generation";

/** La progression personnalisée n'est pas un genre : elle dit « lis le champ d'à côté ». */
const HORS_TABLE = ["custom"];

interface Reglage { ou: string; ids: string[]; fr: string[]; en: string[] }

function reglagesDeGenre(): Reglage[] {
  const out: Reglage[] = [];
  for (const f of toutesLesFiches as { id: string; parametres?: unknown[] }[]) {
    for (const p of (f.parametres ?? []) as {
      nom: string; type?: string; options?: unknown[]; optionsEn?: unknown[]; optionIds?: string[];
    }[]) {
      const ids = (p.optionIds ?? (p.type === "choix" ? p.options : undefined) ?? []).map(String);
      const connus = ids.filter((x) => PROGRESSIONS_GENRE[x]).length;
      if (connus < 3) continue;
      out.push({
        ou: `${f.id}·${p.nom}`, ids,
        fr: (p.options ?? []).map(String), en: (p.optionsEn ?? []).map(String),
      });
    }
  }
  return out;
}

describe("le genre offert nomme une progression", () => {
  it("trois composants l'offrent, et le garde les trouve", () => {
    const trouves = reglagesDeGenre().map((r) => r.ou).sort();
    expect(trouves).toEqual([
      "boite-groove·Genre",
      "generateur-accords·Genre",
      "generateur-musical·Genre",
    ]);
  });

  it("TOUT IDENTIFIANT OFFERT NOMME UNE PROGRESSION, ou dit de lire le champ d'à côté", () => {
    const fautifs: string[] = [];
    for (const r of reglagesDeGenre()) {
      for (const id of r.ids) {
        if (PROGRESSIONS_GENRE[id] || HORS_TABLE.includes(id)) continue;
        fautifs.push(`${r.ou} : « ${id} » ne nomme aucune progression, le repli rendra pop`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("UN MÊME IDENTIFIANT PORTE LE MÊME LIBELLÉ PARTOUT", () => {
    // Trois orthographes du même genre coexistaient : « hip-hop » dans un composant, « hiphop »
    // dans un autre, « hip hop » en anglais dans le troisième. Un libellé se voit, et il
    // s'enregistre aussi dès qu'un composant n'a pas d'`optionIds`.
    const vus = new Map<string, { libelle: string; ou: string }>();
    const fautifs: string[] = [];
    for (const r of reglagesDeGenre()) {
      for (const [rang, id] of r.ids.entries()) {
        for (const [langue, libelles] of [["fr", r.fr], ["en", r.en]] as const) {
          const libelle = libelles[rang];
          if (libelle === undefined) continue;
          const cle = `${langue}·${id}`;
          const deja = vus.get(cle);
          if (!deja) { vus.set(cle, { libelle, ou: r.ou }); continue; }
          if (deja.libelle !== libelle) {
            fautifs.push(`${cle} : « ${deja.libelle} » dans ${deja.ou}, « ${libelle} » dans ${r.ou}`);
          }
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});

describe("relire une valeur enregistrée", () => {
  it("les trois écritures du hip-hop se lisent", () => {
    // La valeur qu'un projet enregistré avant la réparation porte encore.
    expect(normaliserGenre("hip-hop")).toBe("hiphop");
    expect(normaliserGenre("hip hop")).toBe("hiphop");
    expect(normaliserGenre("Hip-Hop")).toBe("hiphop");
    expect(normaliserGenre("hiphop")).toBe("hiphop");
  });

  it("et ce qui ne nomme aucun genre le dit", () => {
    expect(normaliserGenre("")).toBe(null);
    expect(normaliserGenre("salsa")).toBe(null);
    expect(normaliserGenre("custom")).toBe(null);
  });
});

describe("le genre change ce qui est rendu", () => {
  const script = (genre: string) =>
    `genre = ${genre}\ntempo = 120\ncle = Do\ngamme = majeur\nduree = 8\ninstr1 = 0\ninstr2 = 0\ninstr3 = 0`;
  const memeFichier = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((x, i) => x === b[i]);

  it("LE HIP-HOP NE REND PLUS LE FICHIER DE POP", async () => {
    // C'est la propriété qui était violée, et la mesure qui l'a prouvée : les deux fichiers
    // étaient identiques à l'octet près. Le témoin jazz montre que la comparaison peut distinguer.
    const [avecTrait, sans, pop, jazz] = await Promise.all(
      ["hip-hop", "hiphop", "pop", "jazz"].map((g) => genererDepuisScript(script(g))),
    );
    expect(memeFichier(avecTrait.midiBytes, sans.midiBytes),
      "« hip-hop » et « hiphop » doivent rendre le même fichier").toBe(true);
    expect(memeFichier(sans.midiBytes, pop.midiBytes),
      "le hip-hop ne doit pas rendre la progression de pop").toBe(false);
    expect(memeFichier(jazz.midiBytes, pop.midiBytes), "témoin : jazz non plus").toBe(false);
  });

  it("ET LE COMPOSANT LUI-MÊME REND LA BONNE PROGRESSION", async () => {
    // Le câblage complet, fiche comprise : le réglage est lu par l'exécuteur, versé dans le script,
    // et la progression ressort dans la description que le nœud rend. Les deux progressions se
    // distinguent à l'œil : « I – IV – V – VI » pour le hip-hop, « I – VI – IV – V » pour la pop.
    const { registre } = await import("../audio/adaptateur");
    const fiche = registre.trouverDef("generateur-musical")!;
    const lancer = (genre: string) => fiche.executer(
      ctxDEssai([], { Genre: genre }) as never,
    ) as Promise<{ valeurs: unknown[]; message?: string }>;

    // La description sort par le MESSAGE du nœud, ses quatre sorties portant l'audio et trois
    // fichiers MIDI.
    const hiphop = await lancer("hiphop");
    const pop = await lancer("pop");
    expect(hiphop.message).toContain("I – IV – V – VI");
    expect(pop.message).toContain("I – VI – IV – V");
  });

  it("et un genre inconnu retombe sur pop, ce qui reste le seul repli possible", async () => {
    const [inconnu, pop] = await Promise.all(
      ["salsa", "pop"].map((g) => genererDepuisScript(script(g))),
    );
    expect(memeFichier(inconnu.midiBytes, pop.midiBytes)).toBe(true);
  });
});
