// @vitest-environment jsdom
// plugins/spectrogramme-image.test.ts — Les quatre passages entre un son, un spectrogramme et une
// image, que nul test ne nommait.
//
// CE QUE CE FICHIER TIENT, ET QUI NE SE VOIT NULLE PART AILLEURS. Les calculs sont déjà couverts :
// `audio/spectrogramme-mel.test.ts` tient le banc de mels, l'analyse, la synthèse et l'écriture en
// pixels. Ce qui n'était tenu par rien, c'est la CHAÎNE — quatre fiches qui se branchent l'une à
// l'autre, et dont l'en-tête du fichier dit pourquoi elle a été coupée en quatre : « c'était sept
// réglages à accorder à la main d'un bout à l'autre, et une seule valeur fausse déplaçait toutes
// les hauteurs ».
//
// D'OÙ LE CONTRAT CENTRAL, QUI EST STRUCTUREL : le paramétrage de l'échelle n'est déclaré QU'À
// L'ANALYSE. Il voyage ensuite AVEC la matrice, de sorte que la synthèse et l'écriture d'image
// n'ont plus à le répéter ; seule « Image → spectrogramme » le redemande, une image ne portant pas
// le sien. Qu'un de ces sept réglages reparaisse sur un nœud du milieu, et l'on retombe dans ce que
// la coupe en quatre a précisément supprimé : deux valeurs à accorder à la main, et des hauteurs
// qui se déplacent en silence. Un cas le tient, et il ne compte pas les réglages d'un côté — il
// vérifie des deux que chacun est là où il doit être, et nulle part ailleurs.
//
// L'ALLER-RETOUR EST LA PREUVE DE BOUT EN BOUT, et elle ne demande aucune valeur de référence : un
// son d'une hauteur connue, analysé puis resynthétisé, doit revenir à CETTE hauteur. Mesuré, 220 Hz
// revient à 225, 440 à 442 et 880 à 882 — deux pour cent, la résolution d'une bande de mels. Une
// échelle mal relue, un paramétrage qui ne voyagerait plus, une matrice transposée : tout cela
// déplacerait la hauteur sans rien casser d'autre.
//
// CE QUE CE FICHIER NE PEUT PAS TENIR, ET POURQUOI C'EST ÉCRIT ICI. `Image → spectrogramme` décode
// son entrée avec `new Image()`, `drawImage` et `getImageData` : il lui faut un vrai navigateur, et
// le paquet `canvas` n'est pas installé. Sous jsdom, aucune image ne se charge jamais — ni `onload`
// ni `onerror` ne se déclenchent — et la promesse ne se résout pas. Seuls son refus d'une entrée
// qui n'est pas une image et ce qu'il déclare sont donc tenus ici ; son décodage se vérifie dans
// l'application. `Spectrogramme → image`, lui, passe par un canevas que l'on simule : le contrat
// vérifié est alors ce que la fiche REMET au canevas, taille comprise, ce qui est exactement sa
// part du travail.
import "node-web-audio-api/polyfill.js";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiches } from "./spectrogramme-image";

const SR = 22050;

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

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

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));

/** Une sinusoïde de hauteur connue : c'est elle qu'on doit retrouver au retour. */
function tonalite(f: number, secondes = 0.3, canaux = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    const freq = canaux > 1 && c === 1 ? f * 2 : f;
    for (let i = 0; i < n; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * freq * i / SR);
  }
  return b;
}

/**
 * La hauteur dominante, cherchée sur une FENÊTRE COURTE.
 *
 * Le balayage complet d'une seconde d'audio au pas d'un hertz coûtait dix minutes et faisait
 * expirer le relevé : quatre mille échantillons suffisent à placer une sinusoïde tenue.
 */
function dominante(b: AudioBuffer, bas: number, haut: number, pas = 2): number {
  const d = b.getChannelData(0);
  const n = Math.min(d.length, 4096);
  let meilleur = bas, max = -1;
  for (let f = bas; f <= haut; f += pas) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * f * i / b.sampleRate;
      re += d[i] * Math.cos(a);
      im -= d[i] * Math.sin(a);
    }
    const m = re * re + im * im;
    if (m > max) { max = m; meilleur = f; }
  }
  return meilleur;
}

const pic = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
};

function ecartAudio(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
}

/** L'écart maximal entre deux matrices de mels : de quoi voir un réglage agir sur le contenu. */
function ecartMatrice(a: Mel, b: Mel): number {
  let m = 0;
  for (let c = 0; c < Math.min(a.canaux.length, b.canaux.length); c++) {
    const x = a.canaux[c], y = b.canaux[c];
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      for (let j = 0; j < Math.min(x[i].length, y[i].length); j++) {
        m = Math.max(m, Math.abs(x[i][j] - y[i][j]));
      }
    }
  }
  return m;
}

type Mel = { canaux: Float32Array[][] | number[][][]; parametres: Record<string, number> };
const melDe = (v: unknown) => v as unknown as Mel;
const colonnes = (m: Mel) => m.canaux[0].length;
const bandes = (m: Mel) => (m.canaux[0][0] as ArrayLike<number>).length;

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/** Les six réglages de l'échelle, qui ne doivent être déclarés qu'aux deux bouts de la chaîne. */
const ECHELLE = ["Bandes", "Pas", "Fenêtre", "Bourrage", "Fréquence min", "Fréquence max"];
const QUATRE = ["son-spectrogramme", "spectrogramme-son", "spectrogramme-image", "image-spectrogramme"];

/**
 * Le son d'essai et son spectrogramme, calculés UNE FOIS pour tout le fichier.
 *
 * L'analyse et surtout la synthèse coûtent cher — un premier relevé qui refaisait le tour complet
 * à chaque mesure a expiré au bout de dix minutes sans rien écrire. Ils sont donc posés ici plutôt
 * que par le premier cas : un `it` qui en prépare un autre fait dépendre la batterie de son ordre,
 * et un cas isolé ne tournerait plus.
 */
let SOURCE: AudioBuffer;
let REFERENCE: Mel;

beforeAll(async () => {
  SOURCE = tonalite(440);
  REFERENCE = melDe((await lancer("son-spectrogramme", [SOURCE])).valeurs[0]);
}, 120000);

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("son → spectrogramme : l'analyse, et le paramétrage qui voyage avec elle", () => {
  it("rend une matrice dont le message donne la taille et la durée", async () => {
    const res = await lancer("son-spectrogramme", [SOURCE]);
    expect(colonnes(REFERENCE), "trois dixièmes de seconde au pas de dix millisecondes").toBe(30);
    expect(bandes(REFERENCE), "le défaut de la référence").toBe(512);
    const lus = chiffres(res.message!);
    expect(lus, "le message porte le nombre de colonnes").toContain(30);
    expect(lus, "et le nombre de bandes").toContain(512);
    expect(lus, "et la durée couverte").toContain(0.3);
  });

  it("LE PARAMÉTRAGE VOYAGE AVEC LA MATRICE, et c'est tout l'objet de la coupe en quatre", async () => {
    // L'en-tête du fichier le dit : sans cela, « c'était sept réglages à accorder à la main d'un
    // bout à l'autre, et une seule valeur fausse déplaçait toutes les hauteurs ». Les sept champs
    // sont donc exigés nommément, et l'échantillonnage doit être celui du son reçu — c'est lui qui
    // décide à quelle hauteur chaque ligne se retrouve.
    const p = REFERENCE.parametres;
    expect(Object.keys(p).sort()).toEqual(
      ["bandes", "bourrageMs", "echantillonnage", "fMax", "fMin", "fenetreMs", "pasMs"]);
    expect(p.echantillonnage, "l'échantillonnage vient du son, non d'un réglage").toBe(SR);
    expect(p).toMatchObject({ bandes: 512, pasMs: 10, fenetreMs: 100, bourrageMs: 400, fMin: 0, fMax: 10000 });
  });

  it("« Bandes » FIXE LA HAUTEUR, « Pas » LE NOMBRE DE COLONNES", async () => {
    const moins = melDe((await lancer("son-spectrogramme", [SOURCE], { "Bandes": 128 })).valeurs[0]);
    expect(bandes(moins)).toBe(128);
    expect(colonnes(moins), "le nombre de colonnes ne dépend pas des bandes").toBe(30);
    const lent = melDe((await lancer("son-spectrogramme", [SOURCE], { "Pas": 20 })).valeurs[0]);
    expect(colonnes(lent), "deux fois moins de colonnes, au cadrage près").toBe(16);
    expect(bandes(lent)).toBe(512);
  });

  it("LES QUATRE AUTRES NE CHANGENT PAS LES DIMENSIONS, ILS CHANGENT LE CONTENU", async () => {
    // LE PIÈGE DE CE FICHIER. « Fenêtre », « Bourrage », « Fréquence min » et « Fréquence max »
    // laissent la matrice exactement de la même taille : un cas qui ne comparerait que les
    // dimensions les tiendrait tous les quatre pour inertes. Mesuré, l'écart sur le contenu va de
    // 289 à 714 quand la plus grande valeur de la matrice de référence est 607 — ce n'est pas une
    // nuance, c'est un autre spectrogramme.
    for (const [nom, valeur] of [["Fenêtre", 50], ["Bourrage", 200], ["Fréquence min", 100], ["Fréquence max", 8000]] as [string, number][]) {
      const autre = melDe((await lancer("son-spectrogramme", [SOURCE], { [nom]: valeur })).valeurs[0]);
      expect(colonnes(autre), `${nom} ne doit pas changer les colonnes`).toBe(colonnes(REFERENCE));
      expect(bandes(autre), `${nom} ne doit pas changer les bandes`).toBe(bandes(REFERENCE));
      expect(ecartMatrice(REFERENCE, autre), `« ${nom} » ne change rien au contenu`).toBeGreaterThan(50);
    }
  });

  it("« Canaux » : stéréo garde deux voies, et une source mono n'en invente pas une seconde", async () => {
    const deux = melDe((await lancer("son-spectrogramme", [tonalite(440, 0.3, 2)], { "Canaux": "stereo" })).valeurs[0]);
    expect(deux.canaux).toHaveLength(2);
    const une = melDe((await lancer("son-spectrogramme", [SOURCE], { "Canaux": "stereo" })).valeurs[0]);
    expect(une.canaux, "le réglage ne peut pas créer un canal qui n'existe pas").toHaveLength(1);
    expect(melDe((await lancer("son-spectrogramme", [tonalite(440, 0.3, 2)])).valeurs[0]).canaux,
      "et le défaut reste mono").toHaveLength(1);
  });

  it("LES BANDES VIDES SONT ANNONCÉES, et c'est un avertissement et non une erreur", async () => {
    // Mille vingt-quatre bandes à répartir sous deux kilohertz : la grille de la transformée n'est
    // pas assez fine, et certains triangles ne couvrent aucun point. Le nœud le DIT plutôt que de
    // rendre un spectrogramme à trous sans rien signaler.
    const res = await lancer("son-spectrogramme", [SOURCE], { "Bandes": 1024, "Fréquence max": 2000 });
    expect(res.valeurs[0], "il rend tout de même sa matrice").toBeTruthy();
    expect(res.message, `${res.message}`).toMatch(/vides|empty/);
    const sain = await lancer("son-spectrogramme", [SOURCE]);
    expect(sain.message, "et il se tait quand il n'y en a pas").not.toMatch(/vides|empty/);
  });

  it("une entrée qui n'est pas un son est refusée comme une absence", async () => {
    for (const entree of [null, "bonjour", 42]) {
      const res = await lancer("son-spectrogramme", [entree]);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("spectrogramme → son : la phase, la graine, et la normalisation", () => {
  it("LA LONGUEUR SUIT LE PAS ET LE NOMBRE DE COLONNES", async () => {
    // La formule est dans l'exécuteur : (colonnes − 1) × pas × échantillonnage. Elle est la seule
    // chose qui rattache la durée rendue à ce que le spectrogramme décrit, et elle se vérifie à la
    // main — trente colonnes au pas de dix millisecondes font 0,29 seconde, soit 6 395 échantillons.
    const res = await lancer("spectrogramme-son", [REFERENCE], { "Tours": 1, "Graine": 7 });
    const out = res.valeurs[0] as AudioBuffer;
    const p = REFERENCE.parametres;
    expect(out.length).toBe(Math.round((colonnes(REFERENCE) - 1) * (p.pasMs / 1000) * p.echantillonnage));
    expect(out.length).toBe(6395);
    expect(out.sampleRate, "l'échantillonnage vient du spectrogramme").toBe(SR);
    expect(out.numberOfChannels).toBe(1);
  });

  it("LA SORTIE EST NORMALISÉE À 0,95, le niveau absolu ne se gardant pas", async () => {
    // C'est ce que la notice annonce, et c'est une décision : rendre une échelle arbitraire serait
    // pire. Le chiffre est en dur dans l'exécuteur, et c'est bien lui qu'on exige.
    for (const tours of [0, 2]) {
      const out = (await lancer("spectrogramme-son", [REFERENCE], { "Tours": tours, "Graine": 7 })).valeurs[0] as AudioBuffer;
      expect(pic(out), `à ${tours} tours`).toBeCloseTo(0.95, 6);
    }
  });

  it("LA MÊME GRAINE REND LE MÊME SON, AU BIT PRÈS — sa notice le pose en contrat", async () => {
    const a = (await lancer("spectrogramme-son", [REFERENCE], { "Tours": 1, "Graine": 7 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("spectrogramme-son", [REFERENCE], { "Tours": 1, "Graine": 7 })).valeurs[0] as AudioBuffer;
    expect(ecartAudio(a, b), "deux exécutions de même graine diffèrent").toBe(0);
    const c = (await lancer("spectrogramme-son", [REFERENCE], { "Tours": 1, "Graine": 99 })).valeurs[0] as AudioBuffer;
    expect(ecartAudio(a, c), "deux graines rendent le même son").toBeGreaterThan(0.1);
  });

  it("UNE GRAINE À MOINS UN EN TIRE UNE, ET LE MESSAGE LA DONNE", async () => {
    // La convention du dépôt : zéro ou moins veut dire « tire au sort ». Sans le message, un son
    // qu'on vient d'obtenir serait irretrouvable — c'est à cela que sert de l'annoncer.
    const a = await lancer("spectrogramme-son", [REFERENCE], { "Tours": 0, "Graine": -1 });
    const b = await lancer("spectrogramme-son", [REFERENCE], { "Tours": 0, "Graine": -1 });
    const [grA] = chiffres(a.message!).slice(-1);
    const [grB] = chiffres(b.message!).slice(-1);
    expect(grA, "la graine tirée doit être annoncée").toBeGreaterThan(0);
    expect(grA, "et deux tirages ne doivent pas tomber sur la même").not.toBe(grB);
    // Et la graine annoncée est bien celle qui a servi : la rejouer rend le même son.
    const rejoue = (await lancer("spectrogramme-son", [REFERENCE], { "Tours": 0, "Graine": grA })).valeurs[0] as AudioBuffer;
    expect(ecartAudio(a.valeurs[0] as AudioBuffer, rejoue),
      "la graine annoncée ne rejoue pas le son qu'elle a produit").toBe(0);
  });

  it("le message porte la durée, les tours et la graine", async () => {
    const res = await lancer("spectrogramme-son", [REFERENCE], { "Tours": 3, "Graine": 42 });
    const lus = chiffres(res.message!);
    expect(lus, "les tours demandés").toContain(3);
    expect(lus, "la graine retenue").toContain(42);
    expect(lus, "la durée").toContain(0.29);
  });

  it("IL NE DÉCLARE AUCUN RÉGLAGE D'ÉCHELLE : ils voyagent avec la matrice", () => {
    const noms = (fiche("spectrogramme-son").parametres ?? []).map((p) => p.nom);
    for (const e of ECHELLE) {
      expect(noms, `« ${e} » reparaît sur la synthèse : les hauteurs se déplaceront en silence`)
        .not.toContain(e);
    }
    expect(noms).toEqual(["Tours", "Graine"]);
  });

  it("ce qui n'est pas un spectrogramme est refusé, un son compris", async () => {
    for (const entree of [null, tonalite(440, 0.05), { canaux: [] }, { parametres: {} }]) {
      const res = await lancer("spectrogramme-son", [entree]);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("L'ALLER-RETOUR : une hauteur donnée doit revenir à cette hauteur", () => {
  // C'est la preuve de bout en bout, et elle ne demande aucune valeur de référence : on donne un
  // son dont on sait la hauteur, on l'analyse, on le resynthétise, et on cherche où il est revenu.
  // Une échelle mal relue, un paramétrage qui cesserait de voyager, une matrice transposée : tout
  // cela déplacerait la hauteur sans rien casser d'autre, et rien d'autre ne le verrait.
  // Mesuré : 220 revient à 225, 440 à 442, 880 à 882.
  for (const hauteur of [220, 440, 880]) {
    it(`${hauteur} Hz revient à ${hauteur} Hz, à la bande de mels près`, async () => {
      const mel = melDe((await lancer("son-spectrogramme", [tonalite(hauteur)])).valeurs[0]);
      const out = (await lancer("spectrogramme-son", [mel], { "Tours": 2, "Graine": 7 })).valeurs[0] as AudioBuffer;
      const trouve = dominante(out, Math.round(hauteur * 0.75), Math.round(hauteur * 1.3));
      expect(Math.abs(trouve - hauteur) / hauteur,
        `${hauteur} Hz est revenu à ${trouve} Hz`).toBeLessThan(0.04);
    });
  }
});

describe("spectrogramme → image : ce que la fiche remet au canevas", () => {
  // LE CANEVAS EST SIMULÉ, et le contrat vérifié est la part du travail qui appartient à la fiche :
  // la taille qu'elle donne au canevas, les pixels qu'elle lui remet, et le fichier qu'elle rend.
  // L'encodage PNG lui-même est le travail du navigateur, et le calcul des pixels celui de
  // `audio/spectrogramme-pixels.ts`, déjà couvert.
  let capture: { canevas?: Record<string, number>; img?: { width: number; height: number; data: Uint8ClampedArray } };
  let vraiCreerElement: typeof document.createElement;

  beforeEach(() => {
    capture = {};
    vraiCreerElement = document.createElement.bind(document);
    // jsdom de ce dépôt ne fournit pas `ImageData` : la fiche en construit un, il faut donc le
    // donner. Ce n'est pas un contournement du contrat, c'est l'absence d'un objet du navigateur.
    (globalThis as unknown as { ImageData: unknown }).ImageData = class {
      data: Uint8ClampedArray; width: number; height: number;
      constructor(d: Uint8ClampedArray, w: number, h: number) { this.data = d; this.width = w; this.height = h; }
    };
    (document as unknown as { createElement: unknown }).createElement = (tag: string) => {
      if (tag !== "canvas") return vraiCreerElement(tag);
      const faux = {
        width: 0, height: 0,
        getContext: (t: string) => (t === "2d"
          ? { putImageData: (img: typeof capture.img) => { capture.img = img; } } : null),
        toBlob: (cb: (b: Blob | null) => void) => cb(new Blob([new Uint8Array(2048)], { type: "image/png" })),
      };
      capture.canevas = faux as unknown as Record<string, number>;
      return faux;
    };
  });

  afterEach(() => {
    (document as unknown as { createElement: unknown }).createElement = vraiCreerElement;
  });

  it("LE CANEVAS A LA TAILLE DU SPECTROGRAMME : une colonne par pixel, une bande par ligne", async () => {
    const res = await lancer("spectrogramme-image", [REFERENCE], { "Puissance": 0.25 });
    expect(capture.canevas!.width, "le temps va en largeur").toBe(colonnes(REFERENCE));
    expect(capture.canevas!.height, "les bandes vont en hauteur").toBe(bandes(REFERENCE));
    expect(capture.img!.width).toBe(colonnes(REFERENCE));
    expect(capture.img!.height).toBe(bandes(REFERENCE));
    expect(capture.img!.data.length, "quatre octets par pixel")
      .toBe(colonnes(REFERENCE) * bandes(REFERENCE) * 4);
    const lus = chiffres(res.message!);
    expect(lus, "le message porte la largeur").toContain(colonnes(REFERENCE));
    expect(lus, "et la hauteur").toContain(bandes(REFERENCE));
  });

  it("il rend un PNG nommé, et non un tampon nu", async () => {
    const f = (await lancer("spectrogramme-image", [REFERENCE])).valeurs[0] as File;
    expect(f).toBeInstanceOf(File);
    expect(f.type).toBe("image/png");
    expect(f.name).toMatch(/\.png$/);
  });

  it("« Puissance » change ce qui est écrit, et c'est tout ce qu'elle fait", async () => {
    await lancer("spectrogramme-image", [REFERENCE], { "Puissance": 1 });
    const lineaire = Uint8ClampedArray.from(capture.img!.data);
    await lancer("spectrogramme-image", [REFERENCE], { "Puissance": 0.05 });
    const comprime = capture.img!.data;
    expect(lineaire.length).toBe(comprime.length);
    let ecart = 0;
    for (let i = 0; i < lineaire.length; i++) ecart = Math.max(ecart, Math.abs(lineaire[i] - comprime[i]));
    expect(ecart, "l'exposant ne change rien aux pixels").toBeGreaterThan(100);
  });

  it("UN CANEVAS QUI NE RÉPOND PAS SE CONCLUT, et par une erreur nommée", async () => {
    // LES DEUX SEULES FAÇONS DONT LE NAVIGATEUR PEUT SE DÉROBER, et l'exécuteur les traite toutes
    // deux. Sans cela, un `null` partirait en aval sous la forme d'un fichier.
    //
    // CE QUI EST EXIGÉ D'ABORD, C'EST QUE LA PROMESSE SE CONCLUE. Planté — la garde du contexte 2D
    // retirée — la fonction sort sans ni résoudre ni rejeter, et le cas tombait en soixante
    // secondes de délai plutôt qu'en une erreur. Soixante secondes pour dire non, c'est un cas
    // qu'on finit par ne plus lancer ; et pour le nœud, c'est pire qu'une erreur : le graphe reste
    // « en cours » sans fin, sans rien à lire. L'attente est donc bornée ici, et le dépassement
    // est lui-même le défaut qu'on signale.
    const borne = async (promesse: Promise<unknown>, quoi: string) => {
      const tenu = Symbol("délai");
      let minuteur: ReturnType<typeof setTimeout>;
      const attente = new Promise((r) => { minuteur = setTimeout(() => r(tenu), 2000); });
      const issue = await Promise.race([promesse.then(() => "résolue").catch((e) => e), attente]);
      clearTimeout(minuteur!);
      expect(issue, `${quoi} : la promesse ne se conclut pas, le nœud resterait « en cours »`)
        .not.toBe(tenu);
      expect(issue, `${quoi} : conclue sans erreur, un fichier vide partirait en aval`)
        .toBeInstanceOf(Error);
      return issue as Error;
    };

    (document as unknown as { createElement: unknown }).createElement = (tag: string) =>
      (tag === "canvas" ? { width: 0, height: 0, getContext: () => null, toBlob: () => {} } : vraiCreerElement(tag));
    expect((await borne(lancer("spectrogramme-image", [REFERENCE]), "sans contexte 2D")).message)
      .toMatch(/2D/);

    (document as unknown as { createElement: unknown }).createElement = (tag: string) =>
      (tag === "canvas"
        ? { width: 0, height: 0, getContext: () => ({ putImageData: () => {} }), toBlob: (cb: (b: null) => void) => cb(null) }
        : vraiCreerElement(tag));
    expect((await borne(lancer("spectrogramme-image", [REFERENCE]), "toBlob rendant null")).message)
      .toMatch(/toBlob/);
  });

  it("ce qui n'est pas un spectrogramme est refusé", async () => {
    for (const entree of [null, tonalite(440, 0.05)]) {
      const res = await lancer("spectrogramme-image", [entree]);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("image → spectrogramme : ce qu'une image ne porte pas", () => {
  it("une entrée qui n'est pas une image est refusée comme une absence", async () => {
    for (const entree of [null, tonalite(440, 0.05), "x.png"]) {
      const res = await lancer("image-spectrogramme", [entree]);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("IL REDEMANDE L'ÉCHELLE, PARCE QU'UNE IMAGE NE LA PORTE PAS — mais pas les bandes", () => {
    // Le seul des quatre à redéclarer ces réglages, et c'est voulu : « Bandes » en est pourtant
    // exclu, la hauteur de l'image le donnant. Le redéclarer offrirait un réglage qui ne peut rien
    // faire, puisque la lecture l'écrase par la hauteur des pixels.
    const noms = (fiche("image-spectrogramme").parametres ?? []).map((p) => p.nom);
    for (const e of ECHELLE.filter((x) => x !== "Bandes")) {
      expect(noms, `« ${e} » manque : l'échelle ne pourra pas être relue`).toContain(e);
    }
    expect(noms, "« Bandes » est donné par la hauteur de l'image").not.toContain("Bandes");
    expect(noms, "et l'échantillonnage, qu'une image ne porte pas non plus").toContain("Échantillonnage");
    expect(noms, "et la puissance d'écriture, à accorder avec l'aller").toContain("Puissance");
  });

  it("« Échantillonnage » n'offre que des valeurs qu'un son peut avoir", () => {
    // Un choix de texte converti par `Number(...) || 44100` : une option non numérique retomberait
    // silencieusement sur le défaut, et la hauteur de chaque ligne serait fausse sans rien dire.
    const p = (fiche("image-spectrogramme").parametres ?? []).find((x) => x.nom === "Échantillonnage")!;
    for (const o of p.options ?? []) {
      const n = Number(o);
      expect(Number.isFinite(n) && n > 0, `« ${o} » n'est pas un échantillonnage`).toBe(true);
    }
    expect(p.options, "le défaut doit figurer parmi les options").toContain(String(p.defaut));
  });
});

describe("ce que les quatre fiches déclarent, et la chaîne qu'elles forment", () => {
  it("LES QUATRE SE BRANCHENT BOUT À BOUT : la sortie de l'une est l'entrée de la suivante", () => {
    // Le type de flux est ce qui rend la coupe en quatre possible : le spectrogramme est porté par
    // un câble. Un type qui changerait d'un nœud à l'autre rendrait la chaîne inassemblable, sans
    // qu'aucun calcul ne soit faux.
    const chaine: [string, string, string][] = [
      ["son-spectrogramme", "audio", "spectrogramme"],
      ["spectrogramme-son", "spectrogramme", "audio"],
      ["spectrogramme-image", "spectrogramme", "image"],
      ["image-spectrogramme", "image", "spectrogramme"],
    ];
    for (const [id, entree, sortie] of chaine) {
      const f = fiche(id);
      expect((f.entrees ?? []).map((e) => e.type), `${id} : entrée`).toEqual([entree]);
      expect((f.sorties ?? []).map((s) => s.type), `${id} : sortie`).toEqual([sortie]);
    }
  });

  it("LE PARAMÉTRAGE DE L'ÉCHELLE N'EST DÉCLARÉ QU'AUX DEUX BOUTS", () => {
    // Le contrat central du fichier, vérifié des deux côtés : l'analyse le pose, la lecture d'image
    // le redemande, et les deux nœuds du milieu n'en portent aucun. Qu'un seul reparaisse au milieu,
    // et l'on retombe dans les sept réglages à accorder à la main que la coupe a supprimés.
    const porte = (id: string) => new Set((fiche(id).parametres ?? []).map((p) => p.nom));
    const analyse = porte("son-spectrogramme");
    for (const e of ECHELLE) expect(analyse, `l'analyse doit déclarer « ${e} »`).toContain(e);
    for (const id of ["spectrogramme-son", "spectrogramme-image"]) {
      const noms = porte(id);
      for (const e of ECHELLE) {
        expect(noms, `${id} ne doit pas déclarer « ${e} »`).not.toContain(e);
      }
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU — par l'exécuteur OU par une aide du module", () => {
    // LE GARDE HABITUEL SERAIT AVEUGLE ICI, et c'est pourquoi il est écrit autrement. Les six
    // réglages de l'échelle ne sont pas lus par les exécuteurs mais par `echelleLue`, et « Canaux »
    // par `estStereo` — deux fonctions du module. Le garde cherche donc une FORME dans la source
    // entière : un appel à `paramNombre` ou `paramTexte` portant ce nom, où qu'il soit écrit.
    const source = readFileSync("src/plugins/spectrogramme-image.ts", "utf-8");
    for (const f of fiches) {
      for (const p of f.parametres ?? []) {
        expect(source, `${f.id} : le réglage « ${p.nom} » n'est lu nulle part`)
          .toMatch(new RegExp(String.raw`param(?:Nombre|Texte)\("${p.nom}"`));
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of QUATRE) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });

  it("chacune porte une notice dans les deux langues, et un résumé anglais distinct", () => {
    for (const id of QUATRE) {
      const f = fiche(id) as unknown as { notice?: string; noticeEn?: string; resume: string; resumeEn: string };
      expect(f.notice, `${id} : pas de notice française`).toBeTruthy();
      expect(f.noticeEn, `${id} : pas de notice anglaise`).toBeTruthy();
      expect(f.resumeEn, `${id} : le résumé anglais est le français`).not.toBe(f.resume);
    }
  });
});
