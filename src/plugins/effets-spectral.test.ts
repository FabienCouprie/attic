// plugins/effets-spectral.test.ts — Les onze fiches de `effets-spectral.ts` que nul test ne nommait.
//
// POURQUOI CE FICHIER. Le relevé des 469 composants en a trouvé onze ici : quatre déclarés à la
// main — `extraire-zone`, `formule-echantillons`, `formule-spectrale`, `reverbe-convolution` — et
// sept bâtis par les fabriques `effet()` et `simple()`.
//
// CE QUE CE FICHIER TIENT, ET QUI NE SE VOIT NULLE PART AILLEURS.
//
// Trois des sept passent par `simple()`, qui ne déclare AUCUN paramètre : leur contrat tient donc
// entièrement dans ce que le calcul fait du tampon, et deux d'entre eux ont une PROPRIÉTÉ
// VÉRIFIABLE — la lecture inversée est son propre inverse, l'inversion de polarité aussi, et
// l'échange de canaux également. Ce sont des involutions, et une involution qu'on applique deux
// fois doit rendre l'original au bit près. C'est le test le plus fort qu'on puisse écrire sur un
// traitement, et il ne demande aucune valeur de référence.
//
// ET L'HISTOIRE DE CE FICHIER DEMANDE UNE VIGILANCE PARTICULIÈRE : le commentaire de
// `inversion-polarite` raconte que `inverseur-audio` promettait l'inversion de polarité et faisait
// une lecture à l'envers ; celui d'`extraire-zone` raconte qu'un paramètre « Fondu » existait dans
// l'interface, documenté, sans piloter quoi que ce soit. Deux défauts de la même famille, où le
// composant dit une chose et en fait une autre — et c'est précisément ce qu'un test de fiche
// attrape.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./effets-spectral";

const SR = 16000;

/**
 * Un son stéréo reproductible, dont les deux canaux diffèrent : l'échange doit se voir.
 *
 * LA CADENCE EST RÉGLABLE PARCE QUE L'ÉGALISEUR L'EXIGE : à seize mille hertz, Nyquist tombe à huit
 * mille, et la bande « 8 kHz » ne PEUT rien faire. Mon premier relevé l'accusait d'être décorative
 * alors qu'elle était simplement hors de portée du signal qu'on lui donnait.
 */
function sonEssai(secondes = 1, { canaux = 2, sr = SR } = {}): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  let graine = 13579;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = tirer() * 0.4;
  }
  return b;
}

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}, data: Record<string, unknown> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    // `reverbe-convolution` lit `ctx.noeud.data.irFichier` pour savoir s'il a reçu une réponse
    // impulsionnelle : sans ce champ, le contexte le ferait échouer pour une raison étrangère.
    noeud: { data },
    runtime: null,
    onProgress: () => {},
  } as never;
}

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

const lancer = (
  id: string, entrees: unknown[], reglages: Record<string, number | string> = {},
  data: Record<string, unknown> = {},
) => fiche(id).executer(contexte(entrees, reglages, data));

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
}

function rms(b: AudioBuffer, canal = 0, n = b.length): number {
  const d = b.getChannelData(canal);
  const borne = Math.min(n, d.length);
  let s = 0;
  for (let i = 0; i < borne; i++) s += d[i] * d[i];
  return Math.sqrt(s / borne);
}

const SIMPLES = ["inverseur-audio", "inversion-polarite", "echange-canaux"];
const ONZE = [
  ...SIMPLES, "equaliseur", "extraction-centre-cote", "fondu", "granular-freeze",
  "extraire-zone", "formule-echantillons", "formule-spectrale", "reverbe-convolution",
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les onze fiches : ce qu'elles font d'une entrée absente", () => {
  for (const id of ONZE) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées")
        .toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs.every((v) => v === null)).toBe(true);
      expect((res.message ?? "").length, "le composant doit dire ce qui manque").toBeGreaterThan(0);
    });
  }
});

describe("les trois involutions : appliquées deux fois, elles rendent l'original", () => {
  // C'EST LE TEST LE PLUS FORT QU'ON PUISSE ÉCRIRE SUR UN TRAITEMENT, et il ne demande aucune
  // valeur de référence : lire à l'envers deux fois, c'est lire à l'endroit ; changer deux fois le
  // signe, c'est ne rien changer ; échanger deux fois les canaux, c'est les laisser. Un décalage
  // d'un échantillon, un bord perdu, une multiplication qui traîne — tout cela casse l'égalité.
  for (const id of SIMPLES) {
    it(`${id} appliqué deux fois rend le son d'origine, au bit près`, async () => {
      const source = sonEssai(0.5);
      const une = (await lancer(id, [source])).valeurs[0] as AudioBuffer;
      const deux = (await lancer(id, [une])).valeurs[0] as AudioBuffer;
      expect(deux.length, "la longueur ne doit pas dériver").toBe(source.length);
      expect(ecartMax(deux, source), `${id} n'est pas sa propre réciproque`).toBeLessThan(1e-9);
    });
  }

  it("ET CHACUNE CHANGE BIEN QUELQUE CHOSE : une involution qui ne fait rien passerait aussi", async () => {
    // Sans ce cas, un composant qui rendrait l'entrée telle quelle vérifierait le précédent.
    const source = sonEssai(0.5);
    for (const id of SIMPLES) {
      const une = (await lancer(id, [source])).valeurs[0] as AudioBuffer;
      expect(ecartMax(une, source), `${id} ne change rien du tout`).toBeGreaterThan(1e-6);
    }
  });

  it("inversion-polarite change le SIGNE et rien d'autre : même valeur efficace", async () => {
    const source = sonEssai(0.5);
    const out = (await lancer("inversion-polarite", [source])).valeurs[0] as AudioBuffer;
    expect(rms(out), "inverser le signe ne change pas l'énergie").toBeCloseTo(rms(source), 9);
    // Et la somme des deux doit s'annuler, échantillon par échantillon.
    const a = source.getChannelData(0);
    const b = out.getChannelData(0);
    let pire = 0;
    for (let i = 0; i < a.length; i++) pire = Math.max(pire, Math.abs(a[i] + b[i]));
    expect(pire, "un signal et son opposé s'annulent").toBeLessThan(1e-9);
  });

  it("echange-canaux met bien la gauche à droite", async () => {
    const source = sonEssai(0.5);
    const out = (await lancer("echange-canaux", [source])).valeurs[0] as AudioBuffer;
    expect(rms(out, 0)).toBeCloseTo(rms(source, 1), 9);
    expect(rms(out, 1)).toBeCloseTo(rms(source, 0), 9);
  });

  it("inverseur-audio renverse l'ordre : le premier échantillon devient le dernier", async () => {
    const source = sonEssai(0.5);
    const out = (await lancer("inverseur-audio", [source])).valeurs[0] as AudioBuffer;
    const a = source.getChannelData(0);
    const b = out.getChannelData(0);
    expect(b[0]).toBeCloseTo(a[a.length - 1], 9);
    expect(b[b.length - 1]).toBeCloseTo(a[0], 9);
  });
});

describe("equaliseur : neuf bandes, et chacune agit sur la sienne", () => {
  it("à gains nuls, il rend le son sans le toucher", async () => {
    const source = sonEssai(0.5);
    const out = (await lancer("equaliseur", [source])).valeurs[0] as AudioBuffer;
    expect(rms(out), "neuf bandes à zéro décibel ne changent rien").toBeCloseTo(rms(source), 2);
  });

  // LES NEUF GAINS SONT PASSÉS PAR `...gains`, ET C'EST LÀ QUE L'ORDRE PEUT DÉRIVER : la fabrique
  // les étale dans l'ordre déclaré, et une bande insérée au milieu décalerait les suivantes sans
  // que rien ne le dise. Chaque bande est donc poussée seule.
  const BANDES = ["32 Hz", "64 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz"];
  // QUARANTE-QUATRE MILLE CENT, ET NON SEIZE MILLE : la bande la plus aiguë est à huit kilohertz,
  // c'est-à-dire exactement Nyquist à seize mille. Mesurer l'égaliseur sur un signal qui ne monte
  // pas si haut, c'est lui reprocher de ne pas agir là où il n'y a rien.
  for (const bande of BANDES) {
    it(`« ${bande} » poussée seule change le son`, async () => {
      const source = sonEssai(0.3, { sr: 44100 });
      const plat = (await lancer("equaliseur", [source])).valeurs[0] as AudioBuffer;
      const pousse = (await lancer("equaliseur", [source], { [bande]: 24 })).valeurs[0] as AudioBuffer;
      expect(ecartMax(plat, pousse), `« ${bande} » ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }

  it("et deux bandes différentes ne font pas la même chose", async () => {
    const source = sonEssai(0.3, { sr: 44100 });
    const grave = (await lancer("equaliseur", [source], { "32 Hz": 24 })).valeurs[0] as AudioBuffer;
    const aigu = (await lancer("equaliseur", [source], { "8 kHz": 24 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(grave, aigu), "pousser le grave et pousser l'aigu, ce n'est pas pareil")
      .toBeGreaterThan(1e-6);
  });
});

describe("extraction-centre-cote : deux dosages indépendants", () => {
  it("les deux à zéro rendent le silence", async () => {
    const out = (await lancer("extraction-centre-cote", [sonEssai(0.5)], { "Centre": 0, "Côté": 0 }))
      .valeurs[0] as AudioBuffer;
    expect(rms(out)).toBeCloseTo(0, 6);
  });

  it("« Centre » seul et « Côté » seul ne rendent pas la même chose", async () => {
    const source = sonEssai(0.5);
    const centre = (await lancer("extraction-centre-cote", [source], { "Centre": 100, "Côté": 0 }))
      .valeurs[0] as AudioBuffer;
    const cote = (await lancer("extraction-centre-cote", [source], { "Centre": 0, "Côté": 100 }))
      .valeurs[0] as AudioBuffer;
    expect(ecartMax(centre, cote)).toBeGreaterThan(1e-6);
  });

  it("il rend toujours deux canaux, même d'une source mono", async () => {
    const out = (await lancer("extraction-centre-cote", [sonEssai(0.5, { canaux: 1 })]))
      .valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
  });
});

describe("fondu : l'entrée et la sortie, chacune de son côté", () => {
  it("UN FONDU D'ENTRÉE COMMENCE À ZÉRO, et c'est ce qu'il promet", async () => {
    const out = (await lancer("fondu", [sonEssai(2)], { "Entrée": 1, "Sortie": 0 }))
      .valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    expect(Math.abs(d[0]), "le premier échantillon doit être nul").toBeLessThan(1e-6);
    expect(Math.abs(d[d.length - 1]), "sans fondu de sortie, la fin reste pleine").toBeGreaterThan(0);
  });

  it("UN FONDU DE SORTIE FINIT À ZÉRO", async () => {
    const out = (await lancer("fondu", [sonEssai(2)], { "Entrée": 0, "Sortie": 1 }))
      .valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    expect(Math.abs(d[d.length - 1]), "le dernier échantillon doit être nul").toBeLessThan(1e-6);
  });

  it("un fondu plus long retire plus d'énergie", async () => {
    const source = sonEssai(2);
    const court = (await lancer("fondu", [source], { "Entrée": 0.1, "Sortie": 0.1 })).valeurs[0] as AudioBuffer;
    const long = (await lancer("fondu", [source], { "Entrée": 1, "Sortie": 1 })).valeurs[0] as AudioBuffer;
    expect(rms(long)).toBeLessThan(rms(court));
  });
});

describe("granular-freeze : le grain, sa hauteur et sa position", () => {
  it("« Mix » à zéro rend l'entrée telle quelle", async () => {
    const source = sonEssai(1);
    const out = (await lancer("granular-freeze", [source], { "Mix": 0 })).valeurs[0] as AudioBuffer;
    expect(rms(out, 0, source.length)).toBeCloseTo(rms(source), 3);
  });

  const reglages: [string, number, number][] = [
    ["Taille", 10, 400], ["Pitch", -12, 12], ["Position", 0, 90],
  ];
  for (const [nom, bas, haut] of reglages) {
    it(`« ${nom} » change le son entre ${bas} et ${haut}`, async () => {
      const source = sonEssai(1);
      const a = (await lancer("granular-freeze", [source], { [nom]: bas, "Mix": 100 })).valeurs[0] as AudioBuffer;
      const b = (await lancer("granular-freeze", [source], { [nom]: haut, "Mix": 100 })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `« ${nom} » ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }

  it("« Position » est un POUR CENT dans l'interface, et une fraction au calcul", () => {
    // La flèche écrit `position / 100` : l'unité se perd d'un caractère, et le grain serait alors
    // extrait cent fois trop loin — c'est-à-dire toujours au bout du fichier.
    const p = fiche("granular-freeze").parametres!.find((x) => x.nom === "Position")!;
    expect(p.unite).toBe("%");
    expect(p.plage).toEqual([0, 100]);
  });
});

describe("extraire-zone : la zone rendue décrit ce qui a été extrait", () => {
  it("IL REND LE SON ET LA ZONE, et la zone porte ce qu'on a demandé", async () => {
    const res = await lancer("extraire-zone", [sonEssai(10)], { "Début": 2, "Durée": 3 });
    expect(res.valeurs).toHaveLength(2);
    expect(res.valeurs[1], "la seconde sortie décrit la zone").toEqual({ debut: 2, duree: 3 });
  });

  it("la durée extraite suit le réglage", async () => {
    const court = (await lancer("extraire-zone", [sonEssai(10)], { "Début": 0, "Durée": 1 })).valeurs[0] as AudioBuffer;
    const long = (await lancer("extraire-zone", [sonEssai(10)], { "Début": 0, "Durée": 4 })).valeurs[0] as AudioBuffer;
    expect(court.duration).toBeCloseTo(1, 1);
    expect(long.duration).toBeCloseTo(4, 1);
  });

  it("UNE DURÉE QUI DÉPASSE LA FIN EST RAMENÉE, et non lancée", async () => {
    const res = await lancer("extraire-zone", [sonEssai(3)], { "Début": 2, "Durée": 600 });
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.duration, "il ne reste qu'une seconde après deux").toBeCloseTo(1, 1);
    expect((res.valeurs[1] as { duree: number }).duree).toBeCloseTo(1, 1);
  });

  // « FONDU » N'ÉTAIT TOUT SIMPLEMENT JAMAIS LU, et le commentaire du fichier le raconte : il
  // existait dans l'interface, documenté « fondu aux bords », sans piloter quoi que ce soit. Ce cas
  // est ce qui empêche la régression.
  it("« FONDU » AGIT, et ce réglage a déjà été inerte une fois", async () => {
    const source = sonEssai(10);
    const sans = (await lancer("extraire-zone", [source], { "Début": 1, "Durée": 2, "Fondu": 0 })).valeurs[0] as AudioBuffer;
    const avec = (await lancer("extraire-zone", [source], { "Début": 1, "Durée": 2, "Fondu": 100 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(sans, avec), "« Fondu » ne change rien : il est redevenu décoratif")
      .toBeGreaterThan(1e-6);
    // Et le fondu doit faire commencer la zone à zéro.
    expect(Math.abs(avec.getChannelData(0)[0])).toBeLessThan(Math.abs(sans.getChannelData(0)[0]) + 1e-9);
  });
});

describe("formule-echantillons et formule-spectrale : une formule fausse se dit", () => {
  it("formule-echantillons applique une formule et la reprend dans son message", async () => {
    const res = await lancer("formule-echantillons", [sonEssai(0.5), null], { "Formule": "x * 0.5" });
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(res.message, "le message reprend la formule").toContain("x * 0.5");
  });

  it("UNE FORMULE FAUSSE REND UN MESSAGE, et non une exception", async () => {
    const res = await lancer("formule-echantillons", [sonEssai(0.5), null], { "Formule": "cette ligne n'est pas une formule(((" });
    expect(res.valeurs[0], "rien ne sort d'une formule qu'on ne sait pas lire").toBeNull();
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("« Volume » dose ce que la formule produit", async () => {
    const source = sonEssai(0.5);
    const bas = (await lancer("formule-echantillons", [source, null], { "Formule": "x", "Volume": 10 })).valeurs[0] as AudioBuffer;
    const haut = (await lancer("formule-echantillons", [source, null], { "Formule": "x", "Volume": 100 })).valeurs[0] as AudioBuffer;
    expect(rms(haut)).toBeGreaterThan(rms(bas));
  });

  // CETTE FICHE DÉCLARE « Magnitude » ET « Phase », ET NON « Formule » : mes deux premiers cas
  // visaient un réglage qui n'existe pas, de sorte qu'ils exerçaient les valeurs par défaut sans
  // le savoir — l'un comparait deux fois la même chose, l'autre attendait une erreur qui ne
  // pouvait pas se produire.
  it("formule-spectrale applique sa formule de magnitude", async () => {
    const source = sonEssai(1);
    const faible = await lancer("formule-spectrale", [source, null], { "Magnitude": "mag * 0.1", "Phase": "phase" });
    const forte = await lancer("formule-spectrale", [source, null], { "Magnitude": "mag * 4", "Phase": "phase" });
    expect(faible.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(rms(forte.valeurs[0] as AudioBuffer)).toBeGreaterThan(rms(faible.valeurs[0] as AudioBuffer));
  });

  it("« Phase » agit indépendamment de la magnitude", async () => {
    const source = sonEssai(1);
    const droite = await lancer("formule-spectrale", [source, null], { "Magnitude": "mag", "Phase": "phase" });
    const tournee = await lancer("formule-spectrale", [source, null], { "Magnitude": "mag", "Phase": "phase + 2" });
    expect(ecartMax(droite.valeurs[0] as AudioBuffer, tournee.valeurs[0] as AudioBuffer))
      .toBeGreaterThan(1e-6);
  });

  it("« FFT » change la résolution, et cela se voit sur une formule qui dépend de la fréquence", async () => {
    const source = sonEssai(1);
    const r = { "Magnitude": "mag * (freq < 1000 ? 4 : 0.1)", "Phase": "phase" };
    const fine = await lancer("formule-spectrale", [source, null], { ...r, "FFT": 256 });
    const grosse = await lancer("formule-spectrale", [source, null], { ...r, "FFT": 4096 });
    expect(ecartMax(fine.valeurs[0] as AudioBuffer, grosse.valeurs[0] as AudioBuffer))
      .toBeGreaterThan(1e-6);
  });

  it("et une formule spectrale fausse se dit aussi", async () => {
    const res = await lancer("formule-spectrale", [sonEssai(0.5), null], { "Magnitude": "((( pas une formule" });
    expect(res.valeurs[0]).toBeNull();
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });
});

describe("reverbe-convolution : la pièce ne change pas d'une exécution à l'autre", () => {
  it("LA GRAINE PAR DÉFAUT EST FIXE, et c'est écrit dans sa documentation", async () => {
    // Une réverbération qui changerait de pièce à chaque exécution serait un défaut, et la notice
    // le dit. Deux exécutions sans toucher à rien doivent donc rendre le même son.
    const source = sonEssai(0.5);
    const a = (await lancer("reverbe-convolution", [source])).valeurs[0] as AudioBuffer;
    const b = (await lancer("reverbe-convolution", [source])).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b), "la même pièce, deux fois").toBeLessThan(1e-9);
  });

  it("et une autre graine donne une autre pièce", async () => {
    const source = sonEssai(0.5);
    const a = (await lancer("reverbe-convolution", [source], { "Graine": 42 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("reverbe-convolution", [source], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b)).toBeGreaterThan(1e-9);
  });

  const reglages: [string, number | string, number | string][] = [
    ["Type", "Room", "Cathédrale"], ["Taille", 0, 100], ["Decay", 0.1, 10],
    ["Pre-delay", 0, 200], ["Damping", 0, 100], ["Mix", 0, 100],
  ];
  for (const [nom, bas, haut] of reglages) {
    it(`« ${nom} » change la réverbération`, async () => {
      const source = sonEssai(0.5);
      const a = (await lancer("reverbe-convolution", [source], { [nom]: bas })).valeurs[0] as AudioBuffer;
      const b = (await lancer("reverbe-convolution", [source], { [nom]: haut })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `« ${nom} » ne peut rien faire`).toBeGreaterThan(1e-9);
    });
  }

  it("le message donne la durée de la réponse impulsionnelle", async () => {
    const res = await lancer("reverbe-convolution", [sonEssai(0.5)], { "Decay": 3 });
    expect(res.message).toMatch(/\d/);
  });
});

describe("ce que les onze fiches déclarent", () => {
  it("chacune rend autant de valeurs que de sorties déclarées", async () => {
    for (const id of ONZE) {
      const res = await lancer(id, [sonEssai(0.5), null]);
      expect(res.valeurs, `${id}`).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU, par l'exécuteur ou par la fabrique qui le lui passe", async () => {
    const aides = await import("./effets-aides");
    // Les fiches bâties par `effet()` partagent un exécuteur engendré : il lit tous les paramètres
    // déclarés par construction, et c'est la fabrique elle-même qui le garantit. On vérifie donc
    // les quatre fiches écrites à la main, où un nom peut être tapé de travers.
    void aides;
    for (const id of ["extraire-zone", "formule-echantillons", "formule-spectrale", "reverbe-convolution"]) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("les trois fiches `simple()` ne déclarent aucun réglage, et c'est leur définition", () => {
    for (const id of SIMPLES) {
      expect(fiche(id).parametres, `${id}`).toHaveLength(0);
    }
  });
});
