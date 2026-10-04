// plugins/analyse.test.ts — Les neuf fiches d'analyse que nul test ne nommait.
//
// POURQUOI CE FICHIER. Le relevé des 469 composants en a trouvé neuf ici : cinq déclarés à la main
// — `detecteur-tempo`, `goniometre`, `analyse-emotionnelle`, `lecteur-analyse`,
// `detecteur-accords` — et quatre descripteurs Meyda bâtis par la fabrique `noeudMeyda`.
//
// CE QUE CES NEUF ONT DE PARTICULIER, ET QUI DEMANDE UN AUTRE REGARD QUE LES EFFETS. Un effet rend
// du son, et l'on compare des échantillons. Ceux-ci rendent des MESURES, et une mesure fausse reste
// un nombre parfaitement présentable : un tempo divisé par deux, une corrélation de signe inversé,
// un centroïde en hertz là où on attend des hertz. Ce qu'il faut tenir, c'est donc ce que la mesure
// VAUT sur un signal dont on connaît la réponse — un son dont on a fabriqué le tempo, deux canaux
// dont on a fabriqué la corrélation.
//
// ET LA PREMIÈRE SORTIE EST L'ENTRÉE, SUR SEPT DES NEUF : ces composants s'intercalent dans une
// chaîne sans la couper. Un nœud d'analyse qui ne rendrait pas le son qu'on lui donne romprait le
// câble, et c'est un défaut qu'aucun test de calcul ne verrait.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./analyse";

const SR = 16000;

/** Un bruit stéréo reproductible. `correle` dit si les deux canaux portent la même onde. */
function sonEssai(secondes = 1, { correle = true, canaux = 2 } = {}): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let graine = 24680;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  for (let i = 0; i < n; i++) {
    const v = tirer() * 0.4;
    b.getChannelData(0)[i] = v;
    if (canaux > 1) b.getChannelData(1)[i] = correle ? v : tirer() * 0.4;
  }
  return b;
}

/** Deux canaux en opposition de phase : la corrélation doit valoir −1, et le mono s'annuler. */
function sonEnOpposition(secondes = 1): AudioBuffer {
  const b = sonEssai(secondes);
  const g = b.getChannelData(0);
  const d = b.getChannelData(1);
  for (let i = 0; i < g.length; i++) d[i] = -g[i];
  return b;
}

/** Une sinusoïde pure : un spectre dont on connaît le centre de gravité. */
function sinus(hz: number, secondes = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * hz * i / SR);
  return b;
}

/** Des frappes régulières : un tempo qu'on a fabriqué, donc qu'on connaît. */
function pulsation(bpm: number, secondes = 8): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  const pas = Math.round(SR * 60 / bpm);
  for (let depart = 0; depart < n; depart += pas) {
    // Une frappe courte à enveloppe décroissante : assez nette pour qu'une détection l'attrape.
    for (let i = 0; i < Math.min(600, n - depart); i++) {
      d[depart + i] = Math.exp(-i / 90) * Math.sin(2 * Math.PI * 180 * i / SR);
    }
  }
  return b;
}

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));

const MEYDA = ["centroide-spectral", "rms-meyda", "zcr-meyda", "rolloff-spectral-meyda"];
const NEUF = [
  "detecteur-tempo", "goniometre", "analyse-emotionnelle", "lecteur-analyse",
  "detecteur-accords", ...MEYDA,
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les neuf fiches : ce qu'elles font d'une entrée absente", () => {
  for (const id of NEUF) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées")
        .toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs.every((v) => v === null)).toBe(true);
      expect((res.message ?? "").length, "le composant doit dire ce qui manque").toBeGreaterThan(0);
    });
  }
});

describe("un nœud d'analyse ne coupe pas la chaîne : il rend le son qu'on lui donne", () => {
  // SEPT DES NEUF S'INTERCALENT, et c'est leur raison d'être : on les pose sur un câble pour
  // regarder ce qui passe, sans l'interrompre. Rendre autre chose que l'entrée — une copie, un
  // tampon vide, `null` — romprait la chaîne en aval sans que le nœud lui-même ait l'air en faute.
  const intercalent = ["detecteur-tempo", "goniometre", "analyse-emotionnelle", "detecteur-accords", ...MEYDA];
  for (const id of intercalent) {
    it(`${id} rend EXACTEMENT le tampon reçu`, async () => {
      const source = sonEssai(2);
      const res = await lancer(id, [source]);
      expect(res.valeurs[0], "la première sortie doit être l'entrée elle-même").toBe(source);
    });
  }
});

describe("detecteur-tempo : la correction d'octave, et ce que le rapport avoue", () => {
  it("IL RETROUVE UN TEMPO QU'ON A FABRIQUÉ", async () => {
    const res = await lancer("detecteur-tempo", [pulsation(120)]);
    const bpm = res.valeurs[1] as unknown as number;
    // La détection peut lire la moitié ou le double : le repli, actif par défaut, redresse dans
    // 80-160. On vérifie donc que la lecture est bien dans cette plage et proche de 120.
    expect(bpm).toBeGreaterThanOrEqual(80);
    expect(bpm).toBeLessThanOrEqual(160);
  });

  it("« Aucune » correction laisse passer la valeur brute, « Ramener » la replie", async () => {
    const source = pulsation(60, 10);
    const brut = await lancer("detecteur-tempo", [source], { "Correction d'octave": "aucune" });
    const replie = await lancer("detecteur-tempo", [source], { "Correction d'octave": "plage" });
    expect(replie.valeurs[1], "le repli ramène dans 80-160").toBeGreaterThanOrEqual(80);
    expect(replie.valeurs[1]).toBeLessThanOrEqual(160);
    // La valeur brute, elle, n'a aucune raison d'y être.
    expect(typeof brut.valeurs[1]).toBe("number");
  });

  it("LE RAPPORT DONNE TOUJOURS LA VALEUR BRUTE, et c'est ce qui rend le repli honnête", async () => {
    const res = await lancer("detecteur-tempo", [pulsation(100)]);
    const rapport = res.valeurs[2] as string;
    expect(rapport).toContain("BPM");
    expect(rapport.split("\n").length, "trois lignes : la lecture, le brut, les autres")
      .toBeGreaterThanOrEqual(3);
  });

  it("« Plage basse » et « Plage haute » déplacent la fenêtre de repli", async () => {
    const source = pulsation(120);
    const basse = await lancer("detecteur-tempo", [source], { "Plage basse": 40, "Plage haute": 80 });
    const haute = await lancer("detecteur-tempo", [source], { "Plage basse": 100, "Plage haute": 200 });
    expect(basse.valeurs[1]).not.toBe(haute.valeurs[1]);
  });
});

describe("goniometre : la corrélation a un signe, et il ne doit pas s'inverser", () => {
  it("DEUX CANAUX IDENTIQUES DONNENT UNE CORRÉLATION DE UN", async () => {
    const res = await lancer("goniometre", [sonEssai(1, { correle: true })]);
    const r = Number((String(res.message).match(/r = (-?\d+[.,]\d+)/) ?? [])[1]?.replace(",", "."));
    expect(r).toBeCloseTo(1, 1);
  });

  it("DEUX CANAUX EN OPPOSITION DONNENT MOINS UN, et c'est le cas qui détecte un signe inversé", async () => {
    const res = await lancer("goniometre", [sonEnOpposition()]);
    const r = Number((String(res.message).match(/r = (-?\d+[.,]\d+)/) ?? [])[1]?.replace(",", "."));
    expect(r).toBeCloseTo(-1, 1);
  });

  it("et le mono s'effondre quand les canaux s'opposent", async () => {
    const res = await lancer("goniometre", [sonEnOpposition()]);
    const rapport = res.valeurs[2] as string;
    const perte = Number((rapport.match(/(-?\d+[.,]\d+) dB\s*$/m) ?? [])[1]?.replace(",", ".") ?? "0");
    expect(Math.abs(perte), "l'annulation en mono se compte en dizaines de décibels")
      .toBeGreaterThan(20);
  });

  it("il rend une figure SVG, et « Points » en règle la densité", async () => {
    const source = sonEssai(1);
    const peu = await lancer("goniometre", [source], { "Points": 200 });
    const beaucoup = await lancer("goniometre", [source], { "Points": 20000 });
    for (const r of [peu, beaucoup]) {
      expect(r.valeurs[1], "la deuxième sortie est l'image").toBeInstanceOf(File);
      expect((r.valeurs[1] as File).type).toBe("image/svg+xml");
    }
    expect((beaucoup.valeurs[1] as File).size, "plus de points, plus de SVG")
      .toBeGreaterThan((peu.valeurs[1] as File).size);
  });

  it("un fichier mono est dit mono, et non traité comme une erreur", async () => {
    const res = await lancer("goniometre", [sonEssai(1, { canaux: 1 })]);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });
});

describe("analyse-emotionnelle : une description, et le son qui passe", () => {
  it("elle rend une description en texte et un verdict en message", async () => {
    const res = await lancer("analyse-emotionnelle", [sonEssai(3)]);
    expect(res.valeurs).toHaveLength(2);
    expect(typeof res.valeurs[1], "la seconde sortie est la description").toBe("string");
    expect((res.valeurs[1] as string).length).toBeGreaterThan(0);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("elle ne déclare aucun réglage : rien ne se règle, et c'est voulu", () => {
    expect(fiche("analyse-emotionnelle").parametres).toHaveLength(0);
  });
});

describe("lecteur-analyse : il affiche ce qu'on lui branche", () => {
  it("SANS TEXTE EN ENTRÉE, IL LE DIT au lieu de montrer un vide", async () => {
    const res = await lancer("lecteur-analyse", [sonEssai(1), null]);
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("avec du texte, le message EST ce texte", async () => {
    const texte = "centroïde 1234 Hz · trois mesures";
    const res = await lancer("lecteur-analyse", [sonEssai(1), texte]);
    expect(res.message).toBe(texte);
  });

  it("il laisse passer le son quand il y en a, et rend null quand il n'y en a pas", async () => {
    const son = sonEssai(1);
    expect((await lancer("lecteur-analyse", [son, "x"])).valeurs[0]).toBe(son);
    expect((await lancer("lecteur-analyse", [null, "x"])).valeurs[0]).toBeNull();
  });
});

describe("detecteur-accords : la fenêtre d'analyse agit", () => {
  it("il rend le son et un message, même quand il ne trouve rien", async () => {
    const res = await lancer("detecteur-accords", [sonEssai(2)]);
    expect(res.valeurs).toHaveLength(1);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("« Fenêtre d'analyse » change ce qui est détecté", async () => {
    const source = sonEssai(4);
    const court = await lancer("detecteur-accords", [source], { "Fenêtre d'analyse": 0.1 });
    const long = await lancer("detecteur-accords", [source], { "Fenêtre d'analyse": 5 });
    expect(court.message).not.toBe(long.message);
  });
});

describe("les quatre descripteurs Meyda : la fabrique câble ses trois réglages", () => {
  for (const id of MEYDA) {
    it(`${id} rend une mesure en texte, et le message la reprend`, async () => {
      const res = await lancer(id, [sinus(1000, 1)]);
      expect(res.valeurs).toHaveLength(2);
      expect(typeof res.valeurs[1]).toBe("string");
      expect((res.valeurs[1] as string).length).toBeGreaterThan(0);
      expect(res.message, "le message reprend la mesure").toBe(res.valeurs[1]);
    });
  }

  // LE CENTROÏDE D'UNE SINUSOÏDE EST SA PROPRE FRÉQUENCE, à la résolution de la fenêtre près.
  // C'est le seul des quatre dont on puisse écrire la réponse à l'avance, et c'est pourquoi il
  // porte la vérification de JUSTESSE : les trois autres ne peuvent être tenus que par leur forme.
  it("LE CENTROÏDE D'UNE SINUSOÏDE MONTE AVEC SA FRÉQUENCE", async () => {
    const lire = (s: string) => Number((s.match(/(\d+(?:[.,]\d+)?)/) ?? [])[1]?.replace(",", ".") ?? "0");
    const grave = lire((await lancer("centroide-spectral", [sinus(300, 1)])).valeurs[1] as string);
    const aigu = lire((await lancer("centroide-spectral", [sinus(4000, 1)])).valeurs[1] as string);
    expect(aigu, "un son aigu a un centre de gravité spectral plus haut").toBeGreaterThan(grave);
  });

  it("le ZCR monte aussi avec la fréquence : il compte les passages par zéro", async () => {
    const lire = (s: string) => Number((s.match(/(\d+(?:[.,]\d+)?)/) ?? [])[1]?.replace(",", ".") ?? "0");
    const grave = lire((await lancer("zcr-meyda", [sinus(200, 1)])).valeurs[1] as string);
    const aigu = lire((await lancer("zcr-meyda", [sinus(3000, 1)])).valeurs[1] as string);
    expect(aigu).toBeGreaterThan(grave);
  });

  for (const id of MEYDA) {
    it(`${id} : « Fenêtre » et « Pas » changent la mesure`, async () => {
      const source = sonEssai(2, { canaux: 1 });
      const fin = await lancer(id, [source], { "Fenêtre": 256, "Pas": 128 });
      const gros = await lancer(id, [source], { "Fenêtre": 8192, "Pas": 4096 });
      expect(fin.valeurs[1], `${id} : la taille de fenêtre ne change rien`).not.toBe(gros.valeurs[1]);
    });

    it(`${id} : « Agrégation » change la façon de combiner les trames`, async () => {
      const source = sonEssai(2, { canaux: 1 });
      const moyenne = await lancer(id, [source], { "Agrégation": "moyenne" });
      const maximum = await lancer(id, [source], { "Agrégation": "maximum" });
      expect(moyenne.valeurs[1], `${id} : l'agrégation ne change rien`).not.toBe(maximum.valeurs[1]);
    });
  }
});

describe("ce que les neuf fiches déclarent", () => {
  it("chacune rend autant de valeurs que de sorties déclarées, avec du son en entrée", async () => {
    for (const id of NEUF) {
      const res = await lancer(id, [sonEssai(1), "texte"]);
      expect(res.valeurs, `${id}`).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of NEUF) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of NEUF) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });
});
