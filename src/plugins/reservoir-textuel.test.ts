// plugins/reservoir-textuel.test.ts — Le composant rend-il ce que son réglage annonce ?
//
// POURQUOI CE FICHIER EXISTE. Le composant n'avait aucun test, et c'est ce qui a laissé passer le
// défaut le plus visible : « Mots » à vingt rendait cent soixante mots, à cinquante quatre cents.
// Le compteur portait le nom d'un compte de pas et n'était incrémenté qu'à l'écriture d'un mot,
// si bien que la borne valait huit fois trop. Personne ne compte les mots d'un texte engendré.
//
// CE QUE CES TESTS ONT MAINTENANT LE DROIT D'EXIGER. Le mappage n'atteignait jamais l'espace, si
// bien que tous les mots sortaient à la longueur de coupure, douze lettres, et que seule la moitié
// de l'alphabet était employée. La lecture est désormais ramenée sur l'étendue qu'elle occupe
// vraiment, et les consonnes alternent avec les voyelles : les longueurs varient, tout l'alphabet
// sert, et les mots se prononcent. Ce sont trois choses qu'un test peut tenir, et qu'il tient.
import { describe, expect, it } from "vitest";

import { fiches } from "./textgen";

const fiche = fiches.find((f) => f.id === "reservoir-textuel")!;

function contexte(sur: Record<string, string | number> = {}) {
  const v = new Map<string, string | number>();
  for (const p of fiche.parametres) {
    v.set(p.nom, p.type === "choix" ? (p.optionIds?.[0] ?? String(p.defaut)) : p.defaut as string | number);
  }
  for (const [k, x] of Object.entries(sur)) v.set(k, x);
  return {
    entree: () => undefined,
    onProgress: () => {},
    paramTexte: (n: string, d = "") => String(v.get(n) ?? d),
    paramNombre: (n: string, d = 0) => Number(v.get(n) ?? d),
    paramChoix: (n: string, d = "") => String(v.get(n) ?? d),
    param: (n: string, d?: unknown) => v.get(n) ?? d,
    noeud: { data: {} as Record<string, unknown> },
  };
}

const motsDe = async (sur: Record<string, string | number> = {}): Promise<string[]> => {
  const r: any = await fiche.executer!(contexte(sur) as any);
  return String(r.valeurs[0]).split(/\s+/).filter(Boolean);
};

describe("le réservoir textuel rend ce qu'on lui demande", () => {
  it("« MOTS » DONNE EXACTEMENT SON COMPTE, et il en donnait huit fois trop", async () => {
    for (const combien of [1, 5, 20, 50]) {
      expect((await motsDe({ Graine: 11, Mots: combien })).length, `${combien} demandés`).toBe(combien);
    }
  });

  it("le message annonce le même compte que le texte", async () => {
    const r: any = await fiche.executer!(contexte({ Graine: 11, Mots: 7 }) as any);
    const compte = String(r.valeurs[0]).split(/\s+/).filter(Boolean).length;
    expect(r.message).toContain(String(compte));
  });

  it("LA MÊME GRAINE REDONNE LE MÊME TEXTE, ce qui est la condition pour garder un résultat", async () => {
    const a: any = await fiche.executer!(contexte({ Graine: 4242, Mots: 12 }) as any);
    const b: any = await fiche.executer!(contexte({ Graine: 4242, Mots: 12 }) as any);
    expect(a.valeurs[0]).toBe(b.valeurs[0]);
  });

  it("deux graines donnent deux textes", async () => {
    const a: any = await fiche.executer!(contexte({ Graine: 1, Mots: 12 }) as any);
    const b: any = await fiche.executer!(contexte({ Graine: 2, Mots: 12 }) as any);
    expect(a.valeurs[0]).not.toBe(b.valeurs[0]);
  });

  it("le mot amorce ouvre le texte, et compte pour lui-même", async () => {
    const mots = await motsDe({ Graine: 11, Mots: 5, "Mot amorce": "bonjour" });
    expect(mots[0]).toBe("bonjour");
  });

  it("l'alphabet choisi est le seul employé", async () => {
    const mots = await motsDe({ Graine: 11, Mots: 10, Alphabet: "abcdefghijklmnopqrstuvwxyz" });
    expect(mots.join("")).toMatch(/^[a-z]+$/);
  });

  it("l'alphabet français emploie ses accents", async () => {
    const mots = await motsDe({ Graine: 3, Mots: 60, Alphabet: "abcdefghijklmnopqrstuvwxyzéèêëàâïîôûùç" });
    expect(mots.join("")).toMatch(/[éèêëàâïîôûùç]/);
  });

  it("LES ALPHABETS SONT NOMMÉS DANS LES DEUX LANGUES, et non montrés en clair", async () => {
    // Le menu français affichait les chaînes brutes : les identifiants tenaient lieu de libellés.
    const p = fiche.parametres.find((x) => x.nom === "Alphabet")!;
    for (const libelle of [...(p.options ?? []), ...(p.optionsEn ?? [])]) {
      expect(String(libelle).length, String(libelle)).toBeLessThan(30);
    }
    // Deux et non trois : « Voyelles en tête » portait les mêmes lettres que l'alphabet latin, et
    // les classes étant séparées avant le tirage, les deux listes ressortaient identiques.
    expect(p.optionIds).toHaveLength(2);
    expect(new Set(p.optionIds)).toHaveProperty("size", 2);
  });

  it("ne rend jamais de mot vide ni d'espaces en double", async () => {
    const r: any = await fiche.executer!(contexte({ Graine: 8, Mots: 30 }) as any);
    const t = String(r.valeurs[0]);
    expect(t).not.toMatch(/\s\s/);
    expect(t).toBe(t.trim());
  });

  it("UN RESTE DE MOT N'EST PAS ÉCRIT DEUX FOIS : la même ligne l'ajoutait deux fois de suite", async () => {
    // Le doublon ne se déclenchait qu'en sortant sur la borne d'itérations. Le contrôle porte donc
    // sur ce qui se voit toujours : aucun mot ne dépasse la longueur de coupure.
    const mots = await motsDe({ Graine: 8, Mots: 40 });
    for (const mot of mots) expect(mot.length, mot).toBeLessThanOrEqual(12);
  });
});

describe("le texte ressemble à des mots", () => {
  const VOYELLES = "aeiouy";

  it("LES LONGUEURS VARIENT, là où tous les mots faisaient douze lettres sans exception", async () => {
    const mots = await motsDe({ Graine: 11, Mots: 120 });
    const longueurs = new Set(mots.map((m) => m.length));
    expect(longueurs.size).toBeGreaterThan(2);
    expect(Math.min(...longueurs)).toBeLessThan(6);
  });

  it("TOUT L'ALPHABET SERT, là où la moitié était hors d'atteinte", async () => {
    const lettres = new Set((await motsDe({ Graine: 11, Mots: 200 })).join(""));
    expect(lettres.size).toBe(26);
  });

  it("CONSONNES ET VOYELLES ALTERNENT, et un mot finit sur une voyelle", async () => {
    // C'est ce qui fait qu'un mot inventé se prononce. Sans cette alternance, la lecture glissait
    // le long de l'alphabet et rendait des suites du genre « bcccbbaaaaaa ».
    for (const mot of await motsDe({ Graine: 11, Mots: 60 })) {
      const classes = [...mot].map((c) => VOYELLES.includes(c));
      for (let i = 1; i < classes.length; i++) {
        expect(classes[i], `${mot} : deux lettres de même classe à la suite`).not.toBe(classes[i - 1]);
      }
      expect(VOYELLES.includes(mot[mot.length - 1]), `${mot} ne finit pas sur une voyelle`).toBe(true);
    }
  });

  it("aucun mot d'une seule lettre : deux au moins, donc une syllabe entière", async () => {
    for (const mot of await motsDe({ Graine: 5, Mots: 80 })) expect(mot.length).toBeGreaterThanOrEqual(2);
  });
});

describe("les réglages agissent, et aucun ne tue le composant", () => {
  const distincts = async (sur: Record<string, string | number>) => {
    const mots = await motsDe({ Graine: 11, Mots: 200, ...sur });
    return new Set(mots).size / mots.length;
  };

  it("« MÉMOIRE » FAIT CE QUE SON NOM DIT, et il faisait l'inverse", async () => {
    // Le nombre passé au calcul est le taux de fuite : à zéro l'état ne bouge plus jamais, et comme
    // il part de zéro il y reste. « Mémoire » à zéro rendait deux cents mots de douze lettres tirés
    // de deux lettres en tout. Une mémoire haute ralentit désormais le réseau ; une mémoire basse
    // le renouvelle à chaque pas.
    const sansMemoire = await distincts({ "Mémoire": 0 });
    const avecMemoire = await distincts({ "Mémoire": 100 });
    expect(sansMemoire).toBeGreaterThan(avecMemoire);
    expect(sansMemoire).toBeGreaterThan(0.5);
  });

  it("AUCUN RÉGLAGE EXTRÊME NE FIGE LE TEXTE, ce que « Mémoire » à zéro faisait", async () => {
    const extremes: Record<string, number>[] = [
      { "Mémoire": 0 }, { "Mémoire": 100 }, { "Connectivité": 0 }, { "Connectivité": 100 },
      { Neurones: 5 }, { Neurones: 50 },
    ];
    for (const sur of extremes) {
      const mots = await motsDe({ Graine: 11, Mots: 60, ...sur });
      const lettres = new Set(mots.join(""));
      expect(lettres.size, JSON.stringify(sur)).toBeGreaterThan(4);
      expect(new Set(mots).size, JSON.stringify(sur)).toBeGreaterThan(3);
    }
  });

  it("le réservoir se comporte encore à cinq neurones comme à cinquante", async () => {
    // La matrice était normalisée en norme de Frobenius : chaque poids rétrécissait quand le réseau
    // grandissait, et le réglage « Neurones » agissait à l'envers. Le rayon spectral ne dépend pas
    // de la taille, et les deux tailles rendent maintenant un texte également vivant.
    for (const n of [5, 15, 50]) {
      expect(await distincts({ Neurones: n }), `${n} neurones`).toBeGreaterThan(0.15);
    }
  });
});
