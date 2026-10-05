// plugins/deplacement.test.ts — Les quatre fiches de `deplacement.ts` que nul test ne nommait.
//
// POURQUOI CE FICHIER. L'en-tête de `deplacement.ts` dit lui-même ce qu'il est : « la logique est
// dans `audio/deplacement.ts`, `audio/ducking.ts` et `audio/ambisonique.ts`, testées ; ce fichier
// n'est que la prise ». La prise, justement, n'était tenue par rien.
//
// CE QUE CES QUATRE FICHES ONT DE PARTICULIER : elles portent des MESSAGES qui sont des mesures.
// Le doppler annonce les deux hauteurs d'une référence à 440 Hz ; l'ambisonie annonce la part
// directionnelle, l'écart des canaux avant et après, et le rapport de niveau. Ces chiffres ne sont
// pas décoratifs — le commentaire de l'ambisonie raconte que le nœud « est resté muet une fois de
// trop », et que sans ces trois chiffres la seule façon de s'apercevoir qu'une prise mono n'a rien
// à tourner était de ne rien entendre et de douter du nœud. Un message faux est donc un défaut au
// même titre qu'un son faux, et c'est ce niveau-ci qui peut le voir.
//
// DEUX CHIFFRES SONT VÉRIFIABLES À LA MAIN, et ils portent les cas les plus forts : l'effet Doppler
// suit f·c/(c∓v), une formule qu'on peut écrire ; et l'ambisonie doit rendre un son INCHANGÉ quand
// on ne la fait pas tourner.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { fiches } from "./deplacement";

const SR = 16000;

/** Un son stéréo reproductible, dont les deux canaux diffèrent : une scène à tourner. */
function sonEssai(secondes = 1, { canaux = 2, identiques = false } = {}): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let graine = 86420;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  for (let i = 0; i < n; i++) {
    const v = tirer() * 0.4;
    b.getChannelData(0)[i] = v;
    if (canaux > 1) b.getChannelData(1)[i] = identiques ? v : tirer() * 0.4;
  }
  return b;
}

/** Un son qui alterne fort et silence : de quoi faire travailler un ducking. */
function declencheur(secondes = 2): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const fort = Math.floor(i / (SR / 2)) % 2 === 0;
    d[i] = fort ? 0.8 * Math.sin(2 * Math.PI * 200 * i / SR) : 0;
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

function rms(b: AudioBuffer, canal = 0): number {
  const d = b.getChannelData(canal);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

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

/**
 * Les nombres d'un message, dans l'ordre.
 *
 * ATTENTION AU PREMIER : le message du doppler commence par « un la 440 s'entend… », de sorte que
 * le 440 de référence est en tête et les deux hauteurs calculées suivent. Mon premier relevé lisait
 * l'indice zéro et comparait donc 440 à 440.
 */
const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

const QUATRE = ["doppler", "magnetophone", "ducking", "ambisonique"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les quatre fiches : ce qu'elles font d'une entrée absente", () => {
  for (const id of QUATRE) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées")
        .toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs.every((v) => v === null)).toBe(true);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    });
  }

  it("ducking exige SES DEUX entrées, et le dit quand le déclencheur manque", async () => {
    const res = await lancer("ducking", [sonEssai(1, { canaux: 1 }), null]);
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });
});

describe("doppler : les deux hauteurs annoncées suivent la formule", () => {
  // f·c/(c−v) À L'APPROCHE, f·c/(c+v) À L'ÉLOIGNEMENT. C'est le chiffre qu'on peut vérifier à
  // l'oreille sur un son tenu, et c'est ce que le message promet. Une célérité ou une vitesse qui
  // arriverait de travers donnerait deux nombres plausibles et faux.
  const attendu = (v: number, c: number) => [
    Math.round(440 * c / (c - v)), Math.round(440 * c / (c + v)),
  ];

  it("À TRENTE MÈTRES PAR SECONDE, 440 Hz devient 482 puis 405", async () => {
    const res = await lancer("doppler", [sonEssai(0.5, { canaux: 1 })], { "Vitesse": 30, "Célérité": 343 });
    const [approche, eloigne] = attendu(30, 343);
    expect(approche).toBe(482);
    expect(eloigne).toBe(405);
    const lus = chiffres(res.message!);
    expect(lus, "le message porte les deux hauteurs").toContain(approche);
    expect(lus).toContain(eloigne);
  });

  it("une vitesse plus grande écarte davantage les deux hauteurs", async () => {
    const lent = chiffres((await lancer("doppler", [sonEssai(0.5, { canaux: 1 })], { "Vitesse": 5 })).message!);
    const vite = chiffres((await lancer("doppler", [sonEssai(0.5, { canaux: 1 })], { "Vitesse": 120 })).message!);
    const ecart = (l: number[]) => Math.max(...l) - Math.min(...l);
    expect(ecart(vite)).toBeGreaterThan(ecart(lent));
  });

  it("« Célérité » entre bien dans la formule", async () => {
    // Les hauteurs calculées sont aux indices 1 et 2 : l'indice 0 est le 440 de référence.
    const air = chiffres((await lancer("doppler", [sonEssai(0.5, { canaux: 1 })], { "Vitesse": 30, "Célérité": 343 })).message!);
    const dense = chiffres((await lancer("doppler", [sonEssai(0.5, { canaux: 1 })], { "Vitesse": 30, "Célérité": 500 })).message!);
    expect(air[0], "le message s'ouvre sur la référence").toBe(440);
    expect(dense[1], "dans un milieu plus rapide, le décalage est moindre").toBeLessThan(air[1]);
    expect(dense[2], "et de même en s'éloignant").toBeGreaterThan(air[2]);
  });

  it("il rend DEUX canaux d'une source mono : le passage est une trajectoire", async () => {
    const out = (await lancer("doppler", [sonEssai(0.5, { canaux: 1 })])).valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.length).toBe(Math.round(0.5 * SR));
  });

  it("« Atténuation » à « non » laisse plus d'énergie qu'à « oui »", async () => {
    const source = sonEssai(0.5, { canaux: 1 });
    const avec = (await lancer("doppler", [source], { "Atténuation": "oui" })).valeurs[0] as AudioBuffer;
    const sans = (await lancer("doppler", [source], { "Atténuation": "non" })).valeurs[0] as AudioBuffer;
    expect(rms(sans)).toBeGreaterThan(rms(avec));
  });

  it("« Distance » change le résultat", async () => {
    const source = sonEssai(0.5, { canaux: 1 });
    const pres = (await lancer("doppler", [source], { "Distance": 0.5 })).valeurs[0] as AudioBuffer;
    const loin = (await lancer("doppler", [source], { "Distance": 100 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(pres, loin)).toBeGreaterThan(1e-6);
  });
});

describe("magnetophone : sept réglages, et une graine qui tient", () => {
  it("LA MÊME GRAINE REND LE MÊME RUBAN, et deux graines ne le rendent pas", async () => {
    const source = sonEssai(1);
    const a = (await lancer("magnetophone", [source], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("magnetophone", [source], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const c = (await lancer("magnetophone", [source], { "Graine": 8 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b), "la même bande, deux fois").toBeLessThan(1e-9);
    expect(ecartMax(a, c)).toBeGreaterThan(1e-9);
  });

  it("TOUT À ZÉRO, LE RUBAN EST TRANSPARENT : un magnétophone neuf ne s'entend pas", async () => {
    const source = sonEssai(1);
    const out = (await lancer("magnetophone", [source], {
      "Pleurage": 0, "Scintillement": 0, "Saturation": 0, "Décrochages": 0, "Souffle": 0,
    })).valeurs[0] as AudioBuffer;
    expect(rms(out)).toBeCloseTo(rms(source), 2);
  });

  const reglages: [string, number, number][] = [
    ["Pleurage", 0, 60], ["Pleurage Hz", 0.1, 3], ["Scintillement", 0, 30],
    ["Scintillement Hz", 4, 25], ["Saturation", 0, 12], ["Décrochages", 0, 20], ["Souffle", 0, 5],
  ];
  for (const [nom, bas, haut] of reglages) {
    it(`« ${nom} » change le son entre ${bas} et ${haut}`, async () => {
      const source = sonEssai(1);
      // Les deux vitesses de modulation n'agissent que si leur profondeur est non nulle : les
      // exercer à profondeur zéro reviendrait à leur reprocher de ne rien faire là où il n'y a
      // rien à moduler.
      const socle = { "Graine": 3, "Pleurage": 30, "Scintillement": 15 };
      const a = (await lancer("magnetophone", [source], { ...socle, [nom]: bas })).valeurs[0] as AudioBuffer;
      const b = (await lancer("magnetophone", [source], { ...socle, [nom]: haut })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `« ${nom} » ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }

  it("« Souffle » est un POUR CENT dans l'interface, et une fraction au calcul", () => {
    // L'exécuteur écrit `ctx.paramNombre("Souffle", 0.5) / 100` : un facteur cent perdu ferait
    // d'un demi pour cent de souffle un demi de pleine échelle, c'est-à-dire un bruit assourdissant.
    const p = fiche("magnetophone").parametres!.find((x) => x.nom === "Souffle")!;
    expect(p.unite).toBe("%");
    expect(fiche("magnetophone").executer.toString()).toMatch(/"Souffle"[^)]*\)\s*\/\s*100/);
  });
});

describe("ducking : la cible baisse quand le déclencheur parle", () => {
  it("LE SON SORT MOINS FORT QU'IL N'EST ENTRÉ, puisque c'est tout l'objet", async () => {
    const cible = sonEssai(2, { canaux: 1 });
    const out = (await lancer("ducking", [cible, declencheur(2)])).valeurs[0] as AudioBuffer;
    expect(rms(out)).toBeLessThan(rms(cible));
  });

  it("« Réduction » à zéro laisse la cible intacte", async () => {
    const cible = sonEssai(2, { canaux: 1 });
    const out = (await lancer("ducking", [cible, declencheur(2)], { "Réduction": 0 }))
      .valeurs[0] as AudioBuffer;
    expect(rms(out)).toBeCloseTo(rms(cible), 3);
  });

  it("et une réduction plus forte baisse davantage", async () => {
    const cible = sonEssai(2, { canaux: 1 });
    const decl = declencheur(2);
    const douce = (await lancer("ducking", [cible, decl], { "Réduction": 3 })).valeurs[0] as AudioBuffer;
    const forte = (await lancer("ducking", [cible, decl], { "Réduction": 40 })).valeurs[0] as AudioBuffer;
    expect(rms(forte)).toBeLessThan(rms(douce));
  });

  it("UN SEUIL AU PLAFOND NE DÉCLENCHE RIEN : rien ne passe au-dessus de zéro décibel", async () => {
    const cible = sonEssai(2, { canaux: 1 });
    const out = (await lancer("ducking", [cible, declencheur(2)], { "Seuil": 0, "Réduction": 40 }))
      .valeurs[0] as AudioBuffer;
    expect(rms(out), "aucun déclenchement, donc aucune baisse").toBeCloseTo(rms(cible), 2);
  });

  const enveloppe: [string, number, number][] = [
    ["Attaque", 0.001, 0.5], ["Relâchement", 0.01, 2], ["Maintien", 0, 1],
  ];
  for (const [nom, bas, haut] of enveloppe) {
    it(`« ${nom} » change la forme de la baisse`, async () => {
      const cible = sonEssai(2, { canaux: 1 });
      const decl = declencheur(2);
      const a = (await lancer("ducking", [cible, decl], { [nom]: bas })).valeurs[0] as AudioBuffer;
      const b = (await lancer("ducking", [cible, decl], { [nom]: haut })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `« ${nom} » ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }
});

describe("ambisonique : le message dit ce que le nœud a reçu", () => {
  // CE MESSAGE EXISTE PARCE QUE LE NŒUD EST RESTÉ MUET UNE FOIS DE TROP, et son commentaire le
  // raconte : une prise mono n'a pas de scène à tourner, et sans ces chiffres la seule façon de
  // s'en apercevoir était de ne rien entendre et de douter du nœud.
  // CE QUI DÉCLENCHE L'AVERTISSEMENT EST UN CHAMP SANS DIRECTION, et non une prise mono : mesuré,
  // une stéréo donne 1,01, une prise mono 0,71, et seul le silence tombe à 0,00. J'avais d'abord
  // écrit que le mono serait signalé — c'était une supposition, et la mesure la dément. Le mono a
  // bien une direction : les deux canaux identiques se placent au centre, ce qui EST une direction.
  it("UN CHAMP SANS DIRECTION EST SIGNALÉ, et le silence en est un", async () => {
    const silence = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
    const res = await lancer("ambisonique", [silence, null]);
    expect(chiffres(res.message!)[0], "aucune direction").toBeCloseTo(0, 2);
    expect(res.message, "et le nœud le dit en toutes lettres").toMatch(/rien à tourner|nothing to rotate/i);
  });

  it("une scène stéréo et une prise mono ont toutes deux une direction", async () => {
    const stereo = chiffres((await lancer("ambisonique", [sonEssai(1), null])).message!)[0];
    const mono = chiffres((await lancer("ambisonique", [sonEssai(1, { identiques: true }), null])).message!)[0];
    expect(stereo, "une vraie scène est fortement directionnelle").toBeGreaterThan(0.9);
    expect(mono, "deux canaux identiques se placent au centre, ce qui est une direction")
      .toBeGreaterThan(0.5);
    expect(mono, "mais moins marquée qu'une scène étalée").toBeLessThan(stereo);
  });

  it("LE MESSAGE PORTE QUATRE CHIFFRES : la part, les deux écarts, le niveau", async () => {
    const res = await lancer("ambisonique", [sonEssai(1), null]);
    expect(chiffres(res.message!).length).toBeGreaterThanOrEqual(4);
  });

  it("SANS ROTATION, LES DEUX CANAUX RESTENT ÉQUILIBRÉS", async () => {
    // L'aller-retour par le champ ambisonique n'est PAS l'identité — mesuré, le niveau sort à ×1,11
    // à rotation nulle, et mon premier cas exigeait ×1,00 sur une supposition. Ce qui doit tenir,
    // c'est l'équilibre : sans rotation, la scène ne penche d'aucun côté.
    const res = await lancer("ambisonique", [sonEssai(1), null],
      { "Rotation": 0, "Écart des sources": 90, "Ouverture": 90 });
    const out = res.valeurs[0] as AudioBuffer;
    expect(rms(out, 0)).toBeCloseTo(rms(out, 1), 2);
    const [, , apres] = chiffres(res.message!);
    expect(apres, "l'écart G−D annoncé doit être nul").toBeCloseTo(0, 1);
  });

  // +90° ET −90° SONT SYMÉTRIQUES, et c'est le contrat fort de ce nœud : tourner la scène d'un
  // quart de tour à droite doit donner, canal pour canal, ce que donne un quart de tour à gauche en
  // les échangeant. Mesuré : G 0,258 / D 0,116 d'un côté, G 0,116 / D 0,259 de l'autre.
  it("UN QUART DE TOUR À DROITE EST LE MIROIR D'UN QUART DE TOUR À GAUCHE", async () => {
    const source = sonEssai(1);
    const droite = (await lancer("ambisonique", [source, null], { "Rotation": 90 })).valeurs[0] as AudioBuffer;
    const gauche = (await lancer("ambisonique", [source, null], { "Rotation": -90 })).valeurs[0] as AudioBuffer;
    expect(rms(droite, 0)).toBeCloseTo(rms(gauche, 1), 2);
    expect(rms(droite, 1)).toBeCloseTo(rms(gauche, 0), 2);
  });

  // −180° ET +180° SONT LE MÊME ANGLE : mon premier cas les comparait et trouvait un écart de
  // 4,5·10⁻⁸, ce qu'il prenait pour un réglage inerte. C'était la trigonométrie, pas le code.
  const angles: [string, number, number][] = [
    ["Rotation", 0, 90], ["Écart des sources", 30, 180], ["Ouverture", 30, 180],
  ];
  for (const [nom, bas, haut] of angles) {
    it(`« ${nom} » change le son entre ${bas}° et ${haut}°`, async () => {
      const source = sonEssai(1);
      const a = (await lancer("ambisonique", [source, null], { [nom]: bas })).valeurs[0] as AudioBuffer;
      const b = (await lancer("ambisonique", [source, null], { [nom]: haut })).valeurs[0] as AudioBuffer;
      expect(ecartMax(a, b), `« ${nom} » ne peut rien faire`).toBeGreaterThan(1e-6);
    });
  }

  it("il rend deux canaux de la longueur de l'entrée", async () => {
    const source = sonEssai(1);
    const out = (await lancer("ambisonique", [source, null])).valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.length).toBe(source.length);
  });
});

describe("ce que les quatre fiches déclarent", () => {
  it("chacune rend autant de valeurs que de sorties déclarées", async () => {
    const entrees: Record<string, unknown[]> = {
      "doppler": [sonEssai(0.5, { canaux: 1 })],
      "magnetophone": [sonEssai(0.5)],
      "ducking": [sonEssai(1, { canaux: 1 }), declencheur(1)],
      "ambisonique": [sonEssai(0.5), null],
    };
    for (const id of QUATRE) {
      const res = await lancer(id, entrees[id]);
      expect(res.valeurs, `${id}`).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of QUATRE) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
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
});
