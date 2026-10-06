// plugins/dictee-de-graphe.test.ts — La dictée à vocabulaire fermé, et son branchement.
//
// CE QUI EST TENU ICI N'EST PAS LA RECONNAISSANCE, mais ce qu'on lui donne et ce qu'on fait de ce
// qu'elle rend. Le double du moteur a la même raison d'être que dans `vosk-asr.test.ts`.
//
// LE VOCABULAIRE, LUI, EST ÉPROUVÉ SUR LE VRAI REGISTRE : c'est tout l'intérêt du nœud que sa liste
// vienne du catalogue installé, et une liste fabriquée pour le test ne prouverait rien de cela.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const espion = vi.hoisted(() => ({
  fichiers: [] as string[],
  grammaires: [] as (string[] | undefined)[],
  reponse: { texte: "", mots: [] as { word: string; start: number; end: number; conf: number }[] },
}));

vi.mock("./vosk-asr", async (original) => {
  const vrai = await original<typeof import("./vosk-asr")>();
  return {
    ...vrai,
    chargerModele: async (fichier: string) => { espion.fichiers.push(fichier); return {} as never; },
    transcrire: async (_m: never, _s: Float32Array, o?: { grammaire?: string[] }) => {
      espion.grammaires.push(o?.grammaire);
      return espion.reponse;
    },
  };
});

const {
  JETON_INCONNU, compterInconnus, fiches, grammaireChoisie, listeDictee,
} = await import("./dictee-de-graphe");
const { composantsNommes, vocabulaireDeDictee } = await import("./prompt-graphe");
const { MODELES } = await import("./vosk-asr");

const fiche = () => {
  const f = fiches.find((x) => x.id === "dictee-de-graphe");
  if (!f) throw new Error("fiche dictee-de-graphe introuvable");
  return f;
};

/** Une prise quelconque : le double du moteur ne la regarde pas, mais la fiche l'exige. */
const prise = () => new AudioBuffer({ numberOfChannels: 1, length: 8000, sampleRate: 16000 });

async function lancer(audio: AudioBuffer | null, r: Record<string, string | number> = {}) {
  const progres: string[] = [];
  const ctx = {
    entree: () => audio,
    paramTexte: (n: string, d: string) => String(r[n] ?? d),
    paramNombre: (n: string, d: number) => Number(r[n] ?? d),
    onProgress: (t: string) => progres.push(t),
  } as never;
  return { ...(await fiche().executer(ctx)), progres };
}

describe("la liste que le moteur reçoit", () => {
  const catalogue = ["entrée audio", "réverbération"];
  const liste = ["compresseur"];

  it("donne le catalogue, la liste, ou rien selon le mode", () => {
    expect(grammaireChoisie("catalogue", catalogue, liste)).toEqual(catalogue);
    expect(grammaireChoisie("liste", catalogue, liste)).toEqual(liste);
    // Rien veut dire le vocabulaire entier du modèle, ce que « Libre » demande.
    expect(grammaireChoisie("libre", catalogue, liste)).toBeUndefined();
  });

  it("revient au vocabulaire entier quand la liste demandée est vide", () => {
    // Une liste vide ne peut pas être une liste fermée : le moteur n'aurait rien à rendre.
    expect(grammaireChoisie("liste", catalogue, [])).toBeUndefined();
  });

  it("rend une copie, et non la liste d'origine", () => {
    const rendu = grammaireChoisie("catalogue", catalogue, liste)!;
    rendu.push("intrus");
    expect(catalogue).toEqual(["entrée audio", "réverbération"]);
  });
});

describe("la liste saisie", () => {
  it("se découpe sur les virgules et les retours à la ligne, et NON sur les espaces", () => {
    // Un nom de composant tient plusieurs mots : découper sur les espaces le mettrait en pièces.
    expect(listeDictee("entrée audio, sortie audio")).toEqual(["entrée audio", "sortie audio"]);
    expect(listeDictee("entrée audio\nréverbération")).toEqual(["entrée audio", "réverbération"]);
  });

  it("GARDE LES ACCENTS, parce que le lexique du modèle les porte", () => {
    expect(listeDictee("Réverbération, Délai")).toEqual(["réverbération", "délai"]);
  });

  it("met en minuscules, retire la ponctuation et resserre les espaces", () => {
    expect(listeDictee("Delay  (stéréo) !")).toEqual(["delay stéréo"]);
  });

  it("jette les entrées vides", () => {
    expect(listeDictee(" , ,\n")).toEqual([]);
    expect(listeDictee("")).toEqual([]);
  });
});

describe("les mots que le moteur n'a pas compris", () => {
  it("compte les jetons d'inconnu", () => {
    expect(compterInconnus(`entrée audio ${JETON_INCONNU} sortie audio ${JETON_INCONNU}`)).toBe(2);
    expect(compterInconnus("entrée audio sortie audio")).toBe(0);
    expect(compterInconnus("")).toBe(0);
  });

  it("ne compte que le jeton entier", () => {
    expect(compterInconnus("inconnu unk [unknown]")).toBe(0);
  });
});

describe("le vocabulaire tiré du catalogue", () => {
  it("porte les noms du registre, en minuscules et SANS perdre leurs accents", async () => {
    // C'est la mesure qui décide de ce nœud : une liste sans accents est inconnue du lexique
    // français, et le moteur recompose alors ce qu'il peut à partir du reste.
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

  it("NE PORTE PAS DEUX FOIS LE MÊME NOM, même quand le registre en porte deux", async () => {
    // LE CATALOGUE LIVRÉ N'EN A AUCUN, et c'est pourquoi le doublon est FABRIQUÉ ici : éprouver la
    // règle sur le seul catalogue ne prouvait rien, et le défaut planté passait sans qu'un cas
    // tombe. Le registre s'étend à l'exécution, par méta-composant ou par nœud installé : deux noms
    // identiques y sont donc atteignables.
    const { registre } = await import("../audio/adaptateur");
    const modele = registre.tousLesPlugins()[0] as { id: string; nom: string };
    const jumeau = { ...(modele as object), id: "essai-jumeau-dictee", nom: modele.nom } as never;
    registre.enregistrer(jumeau);
    try {
      const v = await vocabulaireDeDictee();
      expect(registre.tousLesPlugins().filter((d: { nom: string }) => d.nom === modele.nom))
        .toHaveLength(2);
      expect(new Set(v).size).toBe(v.length);
    } finally {
      registre.desenregistrer("essai-jumeau-dictee");
    }
  });

  it("écarte les identifiants internes du registre", async () => {
    // LA COMPARAISON SE FAIT SUR LA FORME NORMALISÉE, et non sur le nom brut. « Note d'instrument »
    // entre dans la liste sous « note d instrument » : chercher le nom brut ne le trouvait jamais,
    // de sorte que le cas passait même sans le filtre.
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
    const n = await composantsNommes("reverberation");
    expect(n.map((x) => x.ficheId)).toContain("reverberation");
  });
});

describe("la prise, de bout en bout", () => {
  it("rend la dictée puis les composants qu'elle nomme", async () => {
    espion.reponse = { texte: "entrée audio réverbération sortie audio", mots: [] };
    const r = await lancer(prise());
    expect(r.valeurs[0]).toBe("entrée audio réverbération sortie audio");
    expect(String(r.valeurs[1]).split("\n")).toContain("Réverbération");
  });

  it("DONNE AU MOTEUR LE CATALOGUE, et c'est ce qui ferme le vocabulaire", async () => {
    espion.reponse = { texte: "réverbération", mots: [] };
    espion.grammaires.length = 0;
    await lancer(prise(), { Vocabulaire: "catalogue" });
    const g = espion.grammaires[0]!;
    expect(g.length).toBeGreaterThan(400);
    expect(g).toContain("réverbération");
  });

  it("donne la liste saisie en vocabulaire « Liste donnée », et rien en « Libre »", async () => {
    espion.reponse = { texte: "réverbération", mots: [] };
    espion.grammaires.length = 0;
    await lancer(prise(), { Vocabulaire: "liste", Mots: "entrée audio, réverbération" });
    await lancer(prise(), { Vocabulaire: "libre", Mots: "entrée audio, réverbération" });
    expect(espion.grammaires[0]).toEqual(["entrée audio", "réverbération"]);
    expect(espion.grammaires[1]).toBeUndefined();
  });

  it("les mots saisis n'agissent qu'en vocabulaire « Liste donnée »", async () => {
    espion.reponse = { texte: "réverbération", mots: [] };
    espion.grammaires.length = 0;
    await lancer(prise(), { Vocabulaire: "catalogue", Mots: "compresseur" });
    expect(espion.grammaires[0]!.length).toBeGreaterThan(400);
  });

  it("choisit le fichier de modèle de la langue demandée, et son vocabulaire", async () => {
    espion.reponse = { texte: "reverberation", mots: [] };
    espion.fichiers.length = 0;
    espion.grammaires.length = 0;
    await lancer(prise(), { Langue: "en", Vocabulaire: "catalogue" });
    await lancer(prise(), { Langue: "fr", Vocabulaire: "catalogue" });
    expect(espion.fichiers).toEqual([MODELES.en.fichier, MODELES.fr.fichier]);
    expect(espion.grammaires[0]).toContain("audio input");
    expect(espion.grammaires[1]).toContain("entrée audio");
  });

  it("compte dans son message les composants nommés PUIS les mots non compris", async () => {
    // LES DEUX NOMBRES DIFFÈRENT, et c'est ce qui rend l'ordre observable : avec deux composants et
    // deux inconnus, les échanger ne se voyait pas et le défaut planté passait.
    espion.reponse = { texte: `réverbération compresseur ${JETON_INCONNU}`, mots: [] };
    const r = await lancer(prise());
    expect(r.message).toContain("2 composants nommés");
    expect(r.message).toContain("1 mots non compris");
  });

  it("refuse l'absence d'entrée audio, en rendant une valeur par sortie déclarée", async () => {
    const r = await lancer(null);
    expect(r.valeurs).toEqual([null, null]);
    expect(r.valeurs).toHaveLength(fiche().sorties.length);
  });

  it("le dit quand rien n'a été reconnu", async () => {
    espion.reponse = { texte: "", mots: [] };
    const r = await lancer(prise());
    expect(r.valeurs).toEqual([null, null]);
    expect(r.message).toContain("Rien n");
  });
});

describe("déclarations", () => {
  it("prend un audio et rend le texte puis les composants", () => {
    expect(fiche().entrees.map((e) => e.type)).toEqual(["audio"]);
    expect(fiche().sorties.map((s) => s.type)).toEqual(["texte", "texte"]);
    expect(fiche().sorties.map((s) => s.nom)).toEqual(["Texte", "Composants"]);
  });

  it("se branche sur « Prompt → graphe », qui prend bien un texte", async () => {
    // LE BRANCHEMENT EST LA RAISON D'ÊTRE DE CE NŒUD : sa sortie doit entrer là.
    const { fiches: fichesPrompt } = await import("./prompt-graphe");
    const cible = fichesPrompt.find((f) => f.id === "prompt-vers-graphe")!;
    expect(cible.entrees[0].type).toBe("texte");
    expect(fiche().sorties[0].type).toBe(cible.entrees[0].type);
  });

  it("nomme chacun de ses réglages dans son exécuteur, les traduit et les documente", () => {
    const source = fiche().executer.toString();
    for (const p of fiche().parametres) {
      expect(source.includes(`"${p.nom}"`), p.nom).toBe(true);
      expect(p.nomEn, p.nom).toBeTruthy();
      expect(p.doc, p.nom).toBeTruthy();
      expect(p.docEn, p.nom).toBeTruthy();
    }
  });

  it("écrit chacun de ses réglages et chacune de ses sorties dans sa notice, dans les deux langues", () => {
    for (const p of fiche().parametres) {
      expect(fiche().notice, p.nom).toContain(p.nom);
      expect(fiche().noticeEn, p.nomEn).toContain(p.nomEn!);
    }
    for (const s of fiche().sorties) {
      expect(fiche().notice, s.nom).toContain(s.nom);
    }
  });

  it("offre une langue par modèle livré, et pas une de plus", () => {
    expect(fiche().parametres.find((p) => p.nom === "Langue")?.optionIds).toEqual(Object.keys(MODELES));
  });

  it("et les deux modèles le portent au manifeste, sans quoi rien n'annoncerait leur téléchargement", () => {
    const manifeste = JSON.parse(readFileSync("scripts/modeles-manifest.json", "utf8"));
    for (const { id } of Object.values(MODELES)) {
      const entree = manifeste.modeles.find((m: { id: string }) => m.id === id);
      expect(entree?.noeuds, id).toContain("dictee-de-graphe");
    }
  });
});
