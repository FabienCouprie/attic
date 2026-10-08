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
    // LE SEUIL EST BAS PARCE QUE LA LISTE EST FILTRÉE : les noms que le modèle ne sait pas
    // prononcer n'y entrent plus, et ils sont nombreux. Ce qui compte ici est qu'elle porte
    // bien le catalogue et non une poignée de noms.
    expect(v.length).toBeGreaterThan(250);
    expect(v).toContain("réverbération");
    expect(v).toContain("entrée audio");
    expect(v.every((m) => m === m.toLowerCase()), "tout en minuscules").toBe(true);
  });

  it("ET CE QUE LE MOTEUR NE SAIT PAS PRONONCER N'Y EST PAS, relevé par Fabien", async () => {
    // « La réverbération à convolution ne doit pas être dans le vocabulaire, elle ne ressort pas
    // à l'oral. » Le moteur le dit lui-même à la construction de la grammaire : « convolution »
    // n'est pas dans le lexique du modèle français, et le mot est JETÉ. La phrase n'est pas
    // retirée pour autant, elle reste amputée : « réverbération à » concurrence alors
    // « réverbération », qui est un composant bien réel.
    const v = await vocabulaireDeDictee();
    expect(v).not.toContain("réverbération à convolution");
    expect(v.filter((m) => m.split(" ").includes("convolution"))).toEqual([]);
    // ET LES DEUX CÔTÉS DE LA RÈGLE : ce qui se prononce reste, et c'est la majorité.
    expect(v).toContain("compresseur");
    expect(v).toContain("sortie audio");
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

describe("la ressemblance ne s'applique qu'à la parole", () => {
  // LES TRANSCRIPTIONS SONT DES RELEVÉS, prises dans l'application le 2026-10-07 : ce que Vosk rend
  // en vocabulaire libre sur des prises dites par la synthèse vocale.
  const ECORCHEES: [string, string][] = [
    ["entrée audio granulats de spectre grammes sortie audio", "spectrogramme"],
    ["entrée audio vos codeur de face puis compresseur", "vocoder"],
    ["lecture granulés réverbération à qu'on volution export audio", "reverbe-convolution"],
  ];

  it("FERMÉE, elle laisse perdre le nom écorché, comme avant", async () => {
    for (const [texte, cible] of ECORCHEES) {
      expect((await composantsNommes(texte)).map((x) => x.ficheId), texte).not.toContain(cible);
    }
  });

  it("OUVERTE, elle le retrouve, sur le catalogue entier", async () => {
    for (const [texte, cible] of ECORCHEES) {
      expect((await composantsNommes(texte, true)).map((x) => x.ficheId), texte).toContain(cible);
    }
  });

  it("et elle ne désigne rien dans de la parole qui ne nomme aucun composant", async () => {
    // Le garde qui rend la chose posable : ouverte sur 470 noms, elle doit rester muette.
    expect(await composantsNommes("je voudrais savoir si le train de huit heures est à l'heure", true))
      .toEqual([]);
    expect(await composantsNommes("bonjour comment allez vous depuis la dernière fois", true))
      .toEqual([]);
  });

  it("UN TEXTE TAPÉ N'EN REÇOIT PAS, et garde le relevé qu'il avait", async () => {
    // Relevé : ouverte sur cette invite tapée, la ressemblance ajoute quatre composants de trop,
    // tous nés d'une fenêtre contenant un mot déjà apparié exactement.
    const tapee = "delay stéréo avec feedback court sur une réverbération hall puis compresseur et sortie";
    const ferme = (await composantsNommes(tapee)).map((x) => x.ficheId);
    const ouvert = (await composantsNommes(tapee, true)).map((x) => x.ficheId);
    expect(ferme).toContain("delay-stereo");
    expect(ferme).toContain("reverberation");
    expect(ouvert.length).toBeGreaterThan(ferme.length);
  });
});
