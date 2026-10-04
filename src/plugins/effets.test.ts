// plugins/effets.test.ts — Les onze effets de `effets.ts` que nul test ne nommait.
//
// POURQUOI CE FICHIER, ET CE QU'IL TIENT QUE RIEN D'AUTRE NE TIENT.
//
// Les vingt-et-un effets de ce fichier sont construits par la fabrique `effet()`, qui associe les
// paramètres déclarés aux arguments de la fonction de calcul **PAR POSITION** :
//
//     const args = parametres.map(p => ctx.paramNombre(p.nom, p.defaut));
//     return { valeurs: [await fn(audio, ...args)] };
//
// C'EST LÀ QUE VIT LE DÉFAUT QUE PERSONNE NE VOIT. Les fonctions de calcul ont leurs propres tests,
// et ces tests les appellent correctement : ils ne peuvent donc rien dire d'un ORDRE qui dérive
// entre la déclaration et l'appel. Or l'ordre n'est pas toujours celui qu'on croit — « Chorus » et
// « Flanger » déclarent `[Mix, Vitesse, Profondeur]` et appellent `(a, v, p, mix)`, une permutation
// délibérée ; « Réverbération fractale » divise son atténuation par cent dans la flèche elle-même.
// Un paramètre inséré au milieu d'une liste décale tout ce qui suit, en silence, et l'effet reste
// parfaitement plausible.
//
// LA MÉTHODE EST DONC L'ANCRAGE : la fiche doit rendre, échantillon par échantillon, exactement ce
// que la fonction de calcul rend quand on l'appelle à la main avec les valeurs documentées. Un
// seul cas par effet épingle l'ordre ET les unités, et ne peut pas se tromper sur ce qu'il mesure —
// une leçon tirée de `effets-cresson.test.ts`, où un cas qui comparait deux réglages différents
// restait vert alors qu'une division par cent avait disparu.
// LE PORTAGE COMPLET, ET NON LE SEUL CONTENEUR. Six des onze effets — chorus, flanger, delay,
// distorsion, compresseur multibande, réverbération fractale — passent par un `OfflineAudioContext`,
// que `polyfill-audiobuffer.ts` ne fournit pas : il ne donne que le tampon, exprès, pour éviter de
// charger un module natif dans les soixante-quatre fichiers qui n'en ont pas besoin. Ici on en a
// besoin, et c'est le cas que son en-tête prévoit.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./effets";
import {
  appliquerChorus, appliquerDelay, appliquerDistorsion, appliquerFlanger, changerTonalite,
  compresserMultiBande, glissandoTonalite, harmoniser, reverberationFractale, ringModulator,
  supprimerClics,
} from "../audio";

const SR = 16000;

/** Un son stéréo reproductible : du bruit, qui fait travailler tous les traitements. */
function sonEssai(secondes = 0.5): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  let graine = 987654321;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = tirer() * 0.4;
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

/**
 * L'écart maximal entre deux tampons, tous canaux confondus.
 *
 * `b` EST ATTENDU, et peut être une promesse : les fonctions de calcul de `audio/` sont
 * asynchrones, et les comparer sans les attendre donnait un objet sans longueur — « expected 8000
 * to be undefined », ce qui ressemble à une faute de câblage et n'en est pas une.
 */
function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  // LA LONGUEUR N'EST PAS EXIGÉE ÉGALE, et c'est ce que le delay m'a appris : plus de feedback
  // donne une traîne plus longue — 56 000 échantillons contre 248 000 entre deux réglages. Exiger
  // l'égalité faisait échouer un cas qui voulait seulement savoir si le son change. On compare donc
  // la partie commune, et chaque ancrage vérifie la longueur de son côté quand elle doit coïncider.
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
}

/**
 * La valeur efficace d'un canal, sur `n` échantillons au plus.
 *
 * LA BORNE COMPTE DÈS QU'IL Y A UNE TRAÎNE : comparer un son de huit mille échantillons à sa
 * version traitée qui en fait onze mille dilue la seconde dans sa queue silencieuse, et deux sons
 * identiques paraissent différents. On mesure donc sur la même durée des deux côtés.
 */
function rms(b: AudioBuffer, canal = 0, n = b.length): number {
  const d = b.getChannelData(canal);
  const borne = Math.min(n, d.length);
  let s = 0;
  for (let i = 0; i < borne; i++) s += d[i] * d[i];
  return Math.sqrt(s / borne);
}

const ONZE = [
  "changement-tonalite", "chorus", "compresseur-multibande", "delay-stereo", "distorsion",
  "flanger", "glissando-tonalite", "harmonizer", "reverb-fractale", "ring-modulator",
  "suppression-clics",
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les onze effets : ce qu'ils font d'une entrée absente", () => {
  for (const id of ONZE) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null]);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length, "le composant doit dire ce qui manque").toBeGreaterThan(0);
    });
  }

  // UNE TRAÎNE EST UN RÉSULTAT, ET NON UN DÉBORDEMENT : j'avais d'abord exigé la même longueur en
  // sortie qu'en entrée, et quatre effets l'ont démentie — le delay rend 11 200 échantillons pour
  // 8 000, la réverbération fractale 74 000. C'est leur métier : couper la queue d'un écho serait
  // le défaut. Ce qui doit tenir, c'est que rien ne RACCOURCIT et que la cadence ne change pas.
  for (const id of ONZE) {
    it(`${id} : avec du son, il rend un tampon d'au moins la longueur de l'entrée`, async () => {
      const source = sonEssai();
      const res = await lancer(id, [source]);
      expect(res.valeurs).toHaveLength(1);
      expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
      const out = res.valeurs[0] as AudioBuffer;
      expect(out.length, "un effet ne raccourcit pas ce qu'on lui donne")
        .toBeGreaterThanOrEqual(source.length);
      expect(out.sampleRate, "la cadence ne change pas").toBe(source.sampleRate);
    });
  }
});

// ── L'ANCRAGE : chaque fiche contre son calcul, aux valeurs documentées ──

describe("chaque effet câble ses paramètres dans le bon ordre et la bonne unité", () => {
  it("delay-stereo : [Temps G, Temps D, Feedback, Mix] → (a, tg, td, fb, mix)", async () => {
    const a = sonEssai();
    const res = await lancer("delay-stereo", [a],
      { "Temps G": 120, "Temps D": 310, "Feedback": 55, "Mix": 45 });
    const attendu = await appliquerDelay(a, 120, 310, 55, 45);
    expect(ecartMax(res.valeurs[0] as AudioBuffer, attendu)).toBeLessThan(1e-9);
  });

  it("distorsion : [Gain] → (a, gain)", async () => {
    const a = sonEssai();
    const res = await lancer("distorsion", [a], { "Gain": 73 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await appliquerDistorsion(a, 73))).toBeLessThan(1e-9);
  });

  // LA PERMUTATION EST DÉLIBÉRÉE, ET C'EST POURQUOI CE CAS EXISTE : la fiche déclare
  // [Mix, Vitesse, Profondeur] et appelle (a, vitesse, profondeur, mix). Trois valeurs distinctes
  // sont donc indispensables — avec des valeurs égales, une permutation ne se verrait pas.
  it("chorus : [Mix, Vitesse, Profondeur] → (a, vitesse, profondeur, mix), permuté", async () => {
    const a = sonEssai();
    const res = await lancer("chorus", [a], { "Mix": 37, "Vitesse": 1.3, "Profondeur": 6 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await appliquerChorus(a, 1.3, 6, 37))).toBeLessThan(1e-9);
  });

  it("flanger : [Mix, Vitesse, Profondeur] → (a, vitesse, profondeur, mix), permuté", async () => {
    const a = sonEssai();
    const res = await lancer("flanger", [a], { "Mix": 62, "Vitesse": 0.9, "Profondeur": 4 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await appliquerFlanger(a, 0.9, 4, 62))).toBeLessThan(1e-9);
  });

  it("ring-modulator : [Fréquence, Mix] → (a, freq, mix)", async () => {
    const a = sonEssai();
    const res = await lancer("ring-modulator", [a], { "Fréquence": 440, "Mix": 80 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await ringModulator(a, 440, 80))).toBeLessThan(1e-9);
  });

  it("suppression-clics : [Seuil, Fenêtre] → (a, seuil, fenetre)", async () => {
    const a = sonEssai();
    const res = await lancer("suppression-clics", [a], { "Seuil": 12, "Fenêtre": 8 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await supprimerClics(a, 12, 8))).toBeLessThan(1e-9);
  });

  it("changement-tonalite : [Demi-tons] → (a, demiTons)", async () => {
    const a = sonEssai();
    const res = await lancer("changement-tonalite", [a], { "Demi-tons": -5 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await changerTonalite(a, -5))).toBeLessThan(1e-9);
  });

  it("glissando-tonalite : [Début, Fin] → (a, debut, fin)", async () => {
    const a = sonEssai();
    const res = await lancer("glissando-tonalite", [a], { "Début": -3, "Fin": 9 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await glissandoTonalite(a, -3, 9))).toBeLessThan(1e-9);
  });

  it("harmonizer : [Voix 1, Mix 1, Voix 2, Mix 2] → (a, v1, m1, v2, m2)", async () => {
    const a = sonEssai();
    const res = await lancer("harmonizer", [a],
      { "Voix 1": 7, "Mix 1": 42, "Voix 2": -8, "Mix 2": 19 });
    expect(ecartMax(res.valeurs[0] as AudioBuffer, await harmoniser(a, 7, 42, -8, 19))).toBeLessThan(1e-9);
  });

  // ONZE PARAMÈTRES DANS L'ORDRE, et c'est l'effet où une insertion au milieu passerait le plus
  // facilement inaperçue : un seuil et un ratio se ressemblent, et trois bandes se suivent.
  it("compresseur-multibande : les onze paramètres arrivent dans l'ordre déclaré", async () => {
    const a = sonEssai();
    const r = {
      "Seuil Low": -24, "Ratio Low": 3, "Seuil Mid": -18, "Ratio Mid": 6,
      "Seuil High": -30, "Ratio High": 2.5, "Attaque": 8, "Relâchement": 140,
      "Fréq Low": 300, "Fréq High": 3500,
    };
    const res = await lancer("compresseur-multibande", [a], r);
    const attendu = await compresserMultiBande(a, -24, 3, -18, 6, -30, 2.5, 8, 140, 300, 3500);
    expect(ecartMax(res.valeurs[0] as AudioBuffer, attendu)).toBeLessThan(1e-9);
  });

  // L'ATTÉNUATION EST DIVISÉE PAR CENT DANS LA FLÈCHE ELLE-MÊME, et la graine y est figée à 42 :
  // deux détails qui ne vivent nulle part ailleurs que dans cette ligne.
  it("reverb-fractale : huit paramètres, dont une atténuation en fraction et une graine figée", async () => {
    const a = sonEssai();
    const r = {
      "Decay": 2, "Pré-delay": 15, "Densité": 4, "Atténuation": 60,
      "Diffusion": 50, "Damping": 25, "Mix": 55,
    };
    const res = await lancer("reverb-fractale", [a], r);
    const attendu = await reverberationFractale(a, {
      decay: 2, preDelay: 15, densite: 4, gainDecay: 0.6, diffusion: 50, damping: 25, graine: 42,
    }, 55);
    expect(ecartMax(res.valeurs[0] as AudioBuffer, attendu)).toBeLessThan(1e-9);
  });
});

// ── Et les réglages agissent, ce que l'ancrage seul ne dit pas ──

describe("les réglages ne sont pas décoratifs", () => {
  // UN ANCRAGE PASSERAIT MÊME SI LE CALCUL IGNORAIT SON ARGUMENT : il compare la fiche au calcul,
  // tous deux appelés pareil. Ces cas-ci vérifient l'autre moitié — que changer la valeur change le
  // son — et c'est la condition qu'un curseur doit remplir pour mériter d'être à l'écran.
  const variations: [string, string, number, number][] = [
    ["distorsion", "Gain", 5, 95],
    ["ring-modulator", "Fréquence", 50, 4000],
    ["changement-tonalite", "Demi-tons", -12, 12],
    ["glissando-tonalite", "Fin", -12, 12],
    ["harmonizer", "Voix 1", 3, 12],
    ["chorus", "Vitesse", 0.2, 4],
    ["flanger", "Profondeur", 1, 10],
    ["delay-stereo", "Feedback", 0, 90],
    ["reverb-fractale", "Mix", 0, 100],
    ["compresseur-multibande", "Seuil Low", -60, 0],
    ["suppression-clics", "Seuil", 1, 50],
  ];

  for (const [id, nom, bas, haut] of variations) {
    it(`${id} : « ${nom} » change le son entre ${bas} et ${haut}`, async () => {
      const a = sonEssai();
      const x = await lancer(id, [a], { [nom]: bas });
      const y = await lancer(id, [a], { [nom]: haut });
      expect(ecartMax(x.valeurs[0] as AudioBuffer, y.valeurs[0] as AudioBuffer),
        `« ${nom} » ne change rien : c'est un curseur qui ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }

  it("« Mix » à zéro rend l'entrée telle quelle, sur les effets qui en portent un", async () => {
    const a = sonEssai();
    for (const id of ["delay-stereo", "chorus", "flanger", "ring-modulator", "reverb-fractale"]) {
      const res = await lancer(id, [a], { "Mix": 0 });
      expect(rms(res.valeurs[0] as AudioBuffer, 0, a.length),
        `${id} : à zéro pour cent, le son doit sortir intact`).toBeCloseTo(rms(a), 3);
    }
  });
});

describe("ce que les onze fiches déclarent", () => {
  it("chacune déclare une entrée audio et une sortie audio", () => {
    for (const id of ONZE) {
      const f = fiche(id);
      expect(f.entrees?.[0]?.type, `${id} : première entrée`).toBe("audio");
      expect(f.sorties, `${id} : une seule sortie`).toHaveLength(1);
      expect(f.sorties![0].type).toBe("audio");
    }
  });

  it("chacune déclare au moins un paramètre, et chacun porte sa documentation bilingue", () => {
    for (const id of ONZE) {
      const f = fiche(id);
      expect(f.parametres?.length, `${id} : aucun paramètre déclaré`).toBeGreaterThan(0);
      for (const p of f.parametres!) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });
});
