// plugins/dictee-catalogue.test.ts — Le vocabulaire que la dictée tire du catalogue vivant.
//
// IL EST ÉPROUVÉ SUR LE VRAI REGISTRE, et c'est tout l'intérêt de la chose : la liste vient du
// catalogue installé et se tient à jour d'elle-même, un composant ajouté devenant dictable sans
// qu'on règle quoi que ce soit. Une liste fabriquée pour le test ne prouverait rien de cela.
//
// LA LANGUE DES COMMANDES, elle, se tient sans le registre : `ui/dictee/commandes-dictee.test.ts`.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { composantsNommes, nomsDeDictee, vocabulaireDeDictee } from "./prompt-graphe";

describe("le vocabulaire tiré du catalogue", () => {
  it("porte les noms du registre, en minuscules et SANS perdre leurs accents", async () => {
    // C'est la mesure qui décide de tout : une liste sans accents est inconnue du lexique français,
    // et le moteur recompose alors ce qu'il peut. Relevé sur une phrase dite, la liste accentuée
    // rend le texte exact, la liste sans accents rend « reverb rotation » pour « réverbération ».
    const v = await vocabulaireDeDictee();
    expect(v.length).toBeGreaterThan(400);
    expect(v).toContain("réverbération");
    expect(v).toContain("entrée audio");
    expect(v.every((m) => m === m.toLowerCase()), "tout en minuscules").toBe(true);
  });

  it("donne les noms anglais quand on les demande", async () => {
    const en = await vocabulaireDeDictee(true);
    expect(en).toContain("audio input");
    expect(en).not.toContain("entrée audio");
  });

  it("ne porte pas de ponctuation", async () => {
    expect((await vocabulaireDeDictee()).filter((m) => /[^\p{L}\p{N} ]/u.test(m))).toEqual([]);
  });

  it("rend l'identifiant de fiche à côté du nom, pour que la dictée sache quoi poser", async () => {
    const noms = await nomsDeDictee();
    const reverb = noms.find((n) => n.nom === "réverbération");
    expect(reverb?.ficheId).toBe("reverberation");
    expect(noms.length).toBe((await vocabulaireDeDictee()).length);
  });

  it("NE PORTE PAS DEUX FOIS LE MÊME NOM, même quand le registre en porte deux", async () => {
    // LE CATALOGUE LIVRÉ N'EN A AUCUN, et c'est pourquoi le doublon est FABRIQUÉ ici : éprouver la
    // règle sur le seul catalogue ne prouvait rien, et le défaut planté passait sans qu'un cas
    // tombe. Le registre s'étend à l'exécution, par méta-composant ou par nœud installé : deux noms
    // identiques y sont donc atteignables. Deux composants de même nom ne se distinguant pas à la
    // voix, le premier l'emporte.
    const { registre } = await import("../audio/adaptateur");
    const modele = registre.tousLesPlugins()[0] as { id: string; nom: string };
    registre.enregistrer({ ...(modele as object), id: "essai-jumeau-dictee" } as never);
    try {
      expect(registre.tousLesPlugins().filter((d: { nom: string }) => d.nom === modele.nom))
        .toHaveLength(2);
      const noms = await nomsDeDictee();
      expect(new Set(noms.map((n) => n.nom)).size).toBe(noms.length);
      expect(noms.filter((n) => n.ficheId === "essai-jumeau-dictee")).toEqual([]);
    } finally {
      registre.desenregistrer("essai-jumeau-dictee");
    }
  });

  it("écarte les identifiants internes du registre", async () => {
    // LA COMPARAISON SE FAIT SUR LA FORME NORMALISÉE, et non sur le nom brut. « Note d'instrument »
    // entrerait dans la liste sous « note d instrument » : chercher le nom brut ne le trouvait
    // jamais, de sorte que le cas passait même sans le filtre.
    const { registre } = await import("../audio/adaptateur");
    const forme = (s: string) =>
      s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
    const internes = registre.tousLesPlugins()
      .filter((d: { id: string }) => d.id.startsWith("__") || d.id.startsWith("frontiere"));
    expect(internes.length, "le registre en porte bien").toBeGreaterThan(0);
    const v = await vocabulaireDeDictee();
    for (const d of internes as { nom: string }[]) expect(v, d.nom).not.toContain(forme(d.nom));
  });
});

describe("les composants qu'un texte nomme", () => {
  it("les rend tous, sans ajouter de source ni de sortie", async () => {
    // C'est ce qui le distingue du parseur de prompt, qui complète le graphe pour qu'il tienne
    // debout : ici on veut le relevé seul.
    const n = await composantsNommes("réverbération et compresseur");
    expect(n.map((x) => x.ficheId)).toContain("reverberation");
    expect(n.map((x) => x.ficheId)).toContain("compresseur");
    expect(n.map((x) => x.ficheId)).not.toContain("entree-audio");
    expect(n.map((x) => x.ficheId)).not.toContain("sortie-audio");
  });

  it("rend une liste vide quand rien n'est nommé", async () => {
    expect(await composantsNommes("xyzzy plugh")).toEqual([]);
  });

  it("reconnaît un nom dicté sans ses accents", async () => {
    expect((await composantsNommes("reverberation")).map((x) => x.ficheId))
      .toContain("reverberation");
  });
});
