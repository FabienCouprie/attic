// plugins/visualisation.test.ts — L'oscillateur du parcours « voir le son », et ce que les six
// fiches du fichier déclarent.
//
// POURQUOI CE FICHIER NE TIENT QU'UNE FICHE SUR SIX. Des six que porte `visualisation.ts`, une
// seule calcule vraiment du son. Les cinq autres ne font qu'écouter — elles rendent l'audio qu'on
// leur donne, et ce qu'elles ajoutent est une mesure ou un choix : elles ont leur batterie dans
// `visualisation-ecoute.test.ts`. Deux d'entre elles ont en outre des réglages que leur exécuteur
// ne lit pas, parce que c'est la VUE qui les lit ; cette frontière-là n'exerce aucun audio et a son
// propre fichier, `visualisation-vues.test.ts`.
//
// CE QUI RESTE ICI EST UNE PROMESSE VÉRIFIABLE. `oscillateur` dit de lui-même faire une « synthèse
// ADDITIVE band-limitée », « séries de Fourier des ondes idéales — aucun aliasing, spectre exact ».
// Le présent fichier la vérifie au lieu de la croire : on mesure l'amplitude à chaque harmonique et
// on la compare à la loi de la forme d'onde (sinus : une seule raie ; carré : harmoniques impaires
// en 1/h ; triangle : impaires en 1/h² ; dent de scie : toutes en 1/h), puis on va écouter
// l'endroit exact où un repliement se poserait s'il y en avait un.
//
// LE MODE DE PANNE DE L'OSCILLATEUR EST LE SILENCE, ce qui vaut un garde à lui seul : son exécuteur
// compare la forme reçue à quatre chaînes (« sine », « square »…) et, si aucune ne correspond, ne
// retient AUCUNE harmonique — le nœud rend alors un tampon parfaitement muet, de la bonne longueur,
// avec un message d'allure normale. Or la fiche déclare ses options en français (`defaut: "Sinus"`)
// et ses identifiants en anglais : tout ce qui sépare ce nœud du silence est la canonisation faite
// par `paramTexte`. D'où le contexte d'essai ci-dessous, qui canonise COMME LE MOTEUR : un contexte
// qui ne le ferait pas prouverait quelque chose que l'application ne fait jamais.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { valeurCanoniqueChoix } from "../i18n";
import { fiches } from "./visualisation";

const SR = 44100;

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

/**
 * Le contexte d'essai, qui canonise les « choix » comme `useExecutionGraphe` le fait.
 *
 * C'est la pièce qui donne leur valeur aux cas de l'oscillateur : le moteur fait passer toute
 * valeur de choix par `valeurCanoniqueChoix`, de sorte qu'un « Sinus » enregistré en français
 * arrive à l'exécuteur sous la forme « sine ». Un contexte naïf transmettrait « Sinus » tel quel et
 * mesurerait un silence qui n'arrive jamais en vrai — ou, pire, laisserait passer une fiche dont
 * les identifiants ne correspondent plus aux chaînes que son exécuteur compare.
 */
function contexte(id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) {
  const defs = fiche(id).parametres ?? [];
  const canon = (nom: string, valeur: string): string => {
    const p = defs.find((x) => x.nom === nom);
    return p ? String(valeurCanoniqueChoix(p, valeur)) : valeur;
  };
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) => {
      const brut = reglages[nom];
      // Le moteur canonise AUSSI le défaut déclaré par la fiche, et c'est ce qui sauve
      // l'oscillateur : son `defaut` est le libellé français « Sinus ».
      const def = defs.find((x) => x.nom === nom);
      if (typeof brut === "string") return canon(nom, brut);
      return def?.defaut !== undefined ? canon(nom, String(def.defaut)) : defaut;
    },
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(id, entrees, reglages));

function pic(b: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
}

/**
 * L'amplitude du signal à UNE fréquence donnée, par corrélation directe avec une sinusoïde.
 *
 * Sur une seconde à 44 100 Hz, les fréquences entières tombent exactement sur un bin : pas de
 * fenêtrage, pas de fuite, et un chiffre qu'on peut comparer à la main à un coefficient de Fourier.
 */
function ampA(b: AudioBuffer, f: number): number {
  const d = b.getChannelData(0);
  let re = 0, im = 0;
  for (let i = 0; i < d.length; i++) {
    const a = 2 * Math.PI * f * i / b.sampleRate;
    re += d[i] * Math.cos(a);
    im -= d[i] * Math.sin(a);
  }
  return 2 * Math.hypot(re, im) / d.length;
}

/** Une sinusoïde de crête connue : de quoi lire un niveau à la main. */
function tonalite(crete: number, f = 440, secondes = 3, canaux = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = crete * Math.sin(2 * Math.PI * f * i / SR);
  }
  return b;
}

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/**
 * Exécute quelque chose avec l'interface dans une langue donnée.
 *
 * `langueCourante` lit `localStorage`, absent sous vitest, et rend « fr » par défaut : sans ce
 * détour, le chemin anglais de ces deux messages n'est jamais emprunté par un test — et c'est
 * précisément là que deux libellés français se cachaient. Même procédé que
 * `audio/abc-contraintes.test.ts`, qui a eu le même besoin.
 */
async function avecLangue<T>(langue: string, f: () => Promise<T>): Promise<T> {
  const avant = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (c: string) => (c === "attic-lang" ? langue : null), setItem: () => {} },
    configurable: true, writable: true,
  });
  try { return await f(); } finally {
    if (avant) Object.defineProperty(globalThis, "localStorage", avant);
    else delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
}

/** Les six du fichier : le dernier bloc les tient toutes, l'oscillateur ayant seul sa batterie. */
const SIX = ["analyseur-spectre", "spectrogramme", "oscillateur", "comparateur-ab", "vu-metre", "colorsynth"];


// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("oscillateur : la synthèse additive est bien celle qu'elle annonce", () => {
  // LE NOMBRE D'HARMONIQUES SE COMPTE À LA MAIN. La boucle retient h tant que h·f < 22 050 Hz, soit
  // h ≤ 100 à 220 Hz. Le sinus n'en garde qu'une ; le carré et le triangle les impaires, donc
  // cinquante ; la dent de scie toutes, donc cent. Le message annonce ce compte, et c'est la seule
  // chose que l'utilisateur voit du spectre avant d'ouvrir la vue.
  const comptes: [string, number, number][] = [
    ["sine", 220, 1], ["square", 220, 50], ["triangle", 220, 50], ["sawtooth", 220, 100],
    // À 4 000 Hz, h·4000 < 22 050 donne h ≤ 5 : cinq harmoniques, dont trois impaires.
    ["sawtooth", 4000, 5], ["square", 4000, 3],
  ];
  for (const [forme, freq, attendu] of comptes) {
    it(`${forme} à ${freq} Hz annonce ${attendu} harmonique(s)`, async () => {
      const res = await lancer("oscillateur", [], { "Forme": forme, "Fréquence": freq, "Durée": 1 });
      const lus = chiffres(res.message!);
      expect(lus, `le message porte la fréquence demandée : ${res.message}`).toContain(freq);
      expect(lus, `le message porte le compte d'harmoniques : ${res.message}`).toContain(attendu);
    });
  }

  it("LE SINUS NE PORTE QU'UNE RAIE : rien sur les harmoniques", async () => {
    const b = (await lancer("oscillateur", [], { "Forme": "sine", "Fréquence": 220, "Durée": 1 })).valeurs[0] as AudioBuffer;
    expect(ampA(b, 220), "la fondamentale porte presque tout le volume").toBeGreaterThan(0.75);
    for (const h of [440, 660, 880]) {
      expect(ampA(b, h), `un sinus ne peut rien avoir à ${h} Hz`).toBeLessThan(1e-3);
    }
  });

  // LES TROIS LOIS DE FOURIER DES ONDES IDÉALES, mesurées et non supposées. C'est ici que la
  // promesse « spectre exact » de l'en-tête se vérifie : un rapport qui s'écarterait de la loi
  // dirait que la série est fausse, et une harmonique paire présente sur un carré dirait que la
  // parité est inversée — deux défauts parfaitement inaudibles sur un seul son tenu.
  it("LE CARRÉ NE PORTE QUE LES IMPAIRES, EN 1/h", async () => {
    const b = (await lancer("oscillateur", [], { "Forme": "square", "Fréquence": 220, "Durée": 1 })).valeurs[0] as AudioBuffer;
    expect(ampA(b, 440), "la deuxième harmonique doit être absente").toBeLessThan(1e-3);
    expect(ampA(b, 880), "la quatrième aussi").toBeLessThan(1e-3);
    expect(ampA(b, 220) / ampA(b, 660), "la troisième vaut le tiers de la fondamentale").toBeCloseTo(3, 1);
    expect(ampA(b, 220) / ampA(b, 1100), "la cinquième, le cinquième").toBeCloseTo(5, 1);
  });

  it("LE TRIANGLE NE PORTE QUE LES IMPAIRES, EN 1/h²", async () => {
    const b = (await lancer("oscillateur", [], { "Forme": "triangle", "Fréquence": 220, "Durée": 1 })).valeurs[0] as AudioBuffer;
    expect(ampA(b, 440), "la deuxième harmonique doit être absente").toBeLessThan(1e-3);
    expect(ampA(b, 220) / ampA(b, 660), "la troisième vaut le neuvième : 1/3²").toBeCloseTo(9, 0);
    expect(ampA(b, 220) / ampA(b, 1100), "la cinquième, le vingt-cinquième").toBeCloseTo(25, 0);
  });

  it("LA DENT DE SCIE PORTE TOUTES LES HARMONIQUES, EN 1/h", async () => {
    const b = (await lancer("oscillateur", [], { "Forme": "sawtooth", "Fréquence": 220, "Durée": 1 })).valeurs[0] as AudioBuffer;
    const f = ampA(b, 220);
    for (const h of [2, 3, 4, 5]) {
      expect(f / ampA(b, 220 * h), `la ${h}ᵉ harmonique vaut 1/${h}`).toBeCloseTo(h, 1);
    }
  });

  it("LA BANDE EST VRAIMENT LIMITÉE : rien là où un repliement se poserait", async () => {
    // À 4 000 Hz, la cinquième harmonique tombe à 20 000 Hz et la sixième, à 24 000 Hz, passerait
    // au-dessus de Nyquist : une synthèse naïve la replierait sur 44 100 − 24 000 = 20 100 Hz. La
    // synthèse additive, elle, l'écarte. On écoute donc les deux endroits côte à côte : si l'un des
    // deux chiffres bougeait, c'est que l'« aucun aliasing » de l'en-tête serait devenu faux.
    const b = (await lancer("oscillateur", [], { "Forme": "sawtooth", "Fréquence": 4000, "Durée": 1 })).valeurs[0] as AudioBuffer;
    const vraie = ampA(b, 20000);
    const image = ampA(b, 20100);
    expect(vraie, "la cinquième harmonique est bien là").toBeGreaterThan(0.01);
    expect(image, "et son image repliée n'y est pas").toBeLessThan(1e-3);
    expect(vraie / image, "l'écart entre les deux se compte en centaines").toBeGreaterThan(100);
  });

  // TOUT CE QUI SÉPARE CE NŒUD DU SILENCE. Son exécuteur compare la forme reçue à quatre chaînes
  // anglaises ; sa fiche déclare ses options en français et son défaut est « Sinus ». Que l'on
  // renomme une option, qu'on retire un `optionIds`, ou qu'on écrive « saw » au lieu de
  // « sawtooth », et le nœud rend un tampon muet avec un message d'allure normale.
  it("CHAQUE ORTHOGRAPHE DÉCLARÉE REND DU SON — française, anglaise, ou identifiant", async () => {
    const p = fiche("oscillateur").parametres!.find((x) => x.nom === "Forme")!;
    const orthographes = [...(p.options ?? []), ...(p.optionsEn ?? []), ...(p.optionIds ?? [])].map(String);
    expect(orthographes.length, "les trois listes sont déclarées").toBe(12);
    for (const brut of orthographes) {
      const res = await lancer("oscillateur", [], { "Forme": brut, "Durée": 0.3 });
      const b = res.valeurs[0] as AudioBuffer;
      expect(pic(b), `« ${brut} » rend un son muet : aucune harmonique n'a été retenue`)
        .toBeGreaterThan(0.1);
      expect(chiffres(res.message!), `« ${brut} » n'annonce aucune harmonique`).not.toContain(0);
    }
  });

  it("LE MESSAGE NOMME LA FORME DANS LA LANGUE DE L'INTERFACE", async () => {
    // LE DÉFAUT QUE CE CAS CONTRACTUALISE : l'exécuteur portait sa PROPRE table des quatre libellés,
    // en français, à côté des `options` et des `optionsEn` de la fiche. Un troisième exemplaire
    // d'une liste qui existait déjà deux fois, et c'est lui qui annonçait « Sinus · 220 Hz ·
    // 1 harmonic(s) » à une interface en anglais. Les quatre formes sont vérifiées dans les deux
    // langues, et les libellés attendus sont ceux que LA FICHE déclare — non une quatrième copie
    // écrite ici, qui ramènerait le défaut dans le test.
    const p = fiche("oscillateur").parametres!.find((x) => x.nom === "Forme")!;
    for (const [i, id] of (p.optionIds ?? []).entries()) {
      const fr = await avecLangue("fr", async () =>
        (await lancer("oscillateur", [], { "Forme": String(id), "Durée": 0.3 })).message!);
      const en = await avecLangue("en", async () =>
        (await lancer("oscillateur", [], { "Forme": String(id), "Durée": 0.3 })).message!);
      expect(fr, `« ${id} » en français`).toContain(String(p.options![i]));
      expect(en, `« ${id} » en anglais`).toContain(String(p.optionsEn![i]));
      expect(en, "le message anglais a bien changé de gabarit").toContain("harmonic(s)");
    }
  });

  it("LE DÉFAUT DE LA FICHE REND DU SON, lui aussi", async () => {
    // Le cas qui attrape un `defaut` français laissé sans `optionIds` : l'oscillateur posé et jamais
    // réglé est le premier que l'on entend du parcours.
    const res = await lancer("oscillateur", []);
    expect(pic(res.valeurs[0] as AudioBuffer)).toBeCloseTo(0.8, 5);
    expect(res.message).toContain("Sinus");
  });

  it("SINUS ET TRIANGLE ATTEIGNENT LE VOLUME PLEIN, carré et dent de scie non", async () => {
    // La normalisation divise par la somme des amplitudes des harmoniques. Pour le sinus (un seul
    // terme) et pour le triangle (dont les termes s'alignent à l'apex), la crête vaut donc
    // exactement le volume ; pour le carré et la dent de scie, les termes ne s'alignent nulle part
    // et la crête reste basse. Le relevé donne 1,000 · 1,000 · 0,315 · 0,354 à volume 100.
    const crete = async (forme: string) =>
      pic((await lancer("oscillateur", [], { "Forme": forme, "Durée": 1, "Volume": 100 })).valeurs[0] as AudioBuffer);
    expect(await crete("sine"), "un sinus normalisé atteint exactement un").toBeCloseTo(1, 5);
    expect(await crete("triangle"), "le triangre s'aligne à son apex").toBeCloseTo(1, 3);
    expect(await crete("square")).toBeLessThan(0.4);
    expect(await crete("sawtooth")).toBeLessThan(0.4);
    expect(await crete("square"), "aucune des deux ne sature non plus").toBeGreaterThan(0.2);
    expect(await crete("sawtooth")).toBeGreaterThan(0.2);
  });

  it("« Volume » EST UN POURCENTAGE : quarante donne la moitié de quatre-vingts", async () => {
    const a = pic((await lancer("oscillateur", [], { "Volume": 80, "Durée": 0.5 })).valeurs[0] as AudioBuffer);
    const b = pic((await lancer("oscillateur", [], { "Volume": 40, "Durée": 0.5 })).valeurs[0] as AudioBuffer);
    expect(a).toBeCloseTo(0.8, 5);
    expect(a / b, "le rapport est exactement deux").toBeCloseTo(2, 5);
    expect(pic((await lancer("oscillateur", [], { "Volume": 0, "Durée": 0.2 })).valeurs[0] as AudioBuffer))
      .toBe(0);
  });

  it("« Durée » EST EN SECONDES, au rang de l'échantillon près", async () => {
    for (const d of [0.2, 1.5, 5]) {
      const b = (await lancer("oscillateur", [], { "Durée": d })).valeurs[0] as AudioBuffer;
      expect(b.length, `${d} s`).toBe(Math.floor(SR * d));
      expect(b.sampleRate).toBe(SR);
      expect(b.numberOfChannels, "l'oscillateur est mono").toBe(1);
      // Et la plus courte des trois n'est pas mangée par ses propres fondus : `nf` est borné par
      // la moitié de la longueur, de sorte que les deux rampes ne se rejoignent jamais.
      expect(pic(b), `${d} s : le son est mangé par ses fondus`).toBeGreaterThan(0.7);
    }
  });

  it("« Fréquence » EST EN HERTZ : la raie se déplace là où on la demande", async () => {
    // LA MESURE SE FAIT EN RAPPORT, ET NON EN VALEUR ABSOLUE. Mon premier seuil était un chiffre en
    // dur à 10⁻³, et il tombait à 110 Hz : le fondu de 5 ms module l'amplitude et étale un peu
    // d'énergie autour de chaque raie — 0,0012 relevé à 220 Hz, soit la jupe du fondu et non une
    // harmonique. Ce qui doit tenir, c'est que la fondamentale écrase de plusieurs ordres ce qui
    // traîne à l'octave ; le chiffre absolu, lui, dépend de la durée et du fondu.
    for (const f of [110, 220, 440, 1000]) {
      const b = (await lancer("oscillateur", [], { "Forme": "sine", "Fréquence": f, "Durée": 1 })).valeurs[0] as AudioBuffer;
      expect(ampA(b, f), `rien à ${f} Hz`).toBeGreaterThan(0.75);
      expect(ampA(b, f) / ampA(b, f * 2), `une raie parasite à ${f * 2} Hz`).toBeGreaterThan(300);
    }
  });

  it("LE FONDU DE CINQ MILLISECONDES EST BIEN AUX DEUX BOUTS, et il est linéaire", async () => {
    const b = (await lancer("oscillateur", [], { "Forme": "sine", "Fréquence": 220, "Durée": 1, "Volume": 80 })).valeurs[0] as AudioBuffer;
    const d = b.getChannelData(0);
    const nf = Math.floor(SR * 0.005); // 220 échantillons
    expect(nf).toBe(220);
    // ON COMPARE DES VALEURS ABSOLUES : le dernier échantillon vaut −0, parce que la rampe
    // multiplie par zéro une valeur négative, et `toBe(0)` sépare −0 de +0. Ce n'est pas un défaut
    // du nœud — un −0 s'entend comme un zéro — mais c'est un piège pour qui écrit le cas.
    expect(Math.abs(d[0]), "le premier échantillon est exactement nul").toBe(0);
    expect(Math.abs(d[b.length - 1]), "le dernier aussi").toBe(0);
    // Au milieu du fondu, la rampe vaut la moitié — comparé à ce que le calcul donne à la main.
    const attendu = Math.sin(2 * Math.PI * 220 * 110 / SR) * 0.8 * (110 / nf);
    expect(d[110]).toBeCloseTo(attendu, 5);
    // Et passé le fondu, plus de rampe du tout.
    expect(Math.abs(d[nf * 4]) / 0.8).toBeCloseTo(Math.abs(Math.sin(2 * Math.PI * 220 * nf * 4 / SR)), 5);
  });

});

describe("ce que les six fiches déclarent", () => {
  it("chacune rend autant de valeurs que de sorties déclarées", async () => {
    const entrees: Record<string, unknown[]> = {
      "analyseur-spectre": [tonalite(0.5, 440, 0.2)],
      "spectrogramme": [tonalite(0.5, 440, 0.2)],
      "oscillateur": [],
      "comparateur-ab": [tonalite(0.5, 440, 0.2), tonalite(0.25, 440, 0.2)],
      "vu-metre": [tonalite(0.5, 440, 1)],
      "colorsynth": [tonalite(0.5, 440, 0.2)],
    };
    for (const id of SIX) {
      const res = await lancer(id, entrees[id]);
      expect(res.valeurs, id).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("LES PARAMÈTRES DES QUATRE AUTRES SONT LUS PAR LEUR EXÉCUTEUR", () => {
    // Les deux fiches spectrales sont traitées dans `visualisation-vues.test.ts` : leur lecteur
    // est la vue, et ce garde-ci ne peut rien dire d'elles.
    for (const id of ["oscillateur", "comparateur-ab", "vu-metre", "colorsynth"]) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of SIX) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });

  it("le défaut d'un choix figure parmi ses options", () => {
    for (const id of SIX) {
      for (const p of fiche(id).parametres ?? []) {
        if (p.type !== "choix") continue;
        expect(p.options, `${id} · ${p.nom}`).toContain(String(p.defaut));
        if (p.defautEn) expect(p.optionsEn, `${id} · ${p.nom}`).toContain(String(p.defautEn));
      }
    }
  });

  it("les six identifiants sont uniques, et il y en a bien six", () => {
    expect(fiches).toHaveLength(6);
    expect(new Set(fiches.map((f) => f.id)).size).toBe(6);
    expect(fiches.map((f) => f.id).sort()).toEqual([...SIX].sort());
  });
});
