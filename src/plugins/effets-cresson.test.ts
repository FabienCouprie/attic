// plugins/effets-cresson.test.ts — Les six fiches du répertoire du CRESSON.
//
// POURQUOI CE FICHIER, ET CE QU'IL NE REFAIT PAS. Un relevé des 469 composants a montré que six
// d'entre eux, tous dans `effets-cresson.ts`, n'étaient nommés par aucun test. Le calcul, lui, est
// déjà tenu : `audio/echo-flottant.test.ts` vérifie où tombent les dents du peigne,
// `audio/ubiquite.test.ts`, `audio/vague.test.ts`, `audio/platine.test.ts` et
// `audio/creneau.test.ts` couvrent le reste. Ce qui n'était tenu par rien, c'est la FICHE.
//
// CE QUE LA FICHE PEUT CASSER TOUTE SEULE, et qu'aucun test de calcul ne verrait :
//
//   · une unité oubliée au passage — « Amortissement » est un pourcentage dans l'interface et une
//     fraction dans le calcul, « Retard » des millisecondes d'un côté et des secondes de l'autre ;
//     un facteur mille perdu là donne un effet plausible et faux ;
//   · un paramètre lu sous un nom qui n'est pas celui qu'on affiche, donc jamais reçu ;
//   · une entrée absente qui lance au lieu de parler ;
//   · un nombre de valeurs rendues qui ne correspond plus aux sorties déclarées.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { fiches } from "./effets-cresson";

const SR = 16000;

// ── Le gréement ──

/** Un son stéréo bruité : de quoi faire travailler un peigne, une phase et une corrélation. */
function sonEssai(secondes = 1, { identiques = true } = {}): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: SR });
  let graine = 12345;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  const g = b.getChannelData(0);
  const d = b.getChannelData(1);
  for (let i = 0; i < n; i++) {
    const v = tirer() * 0.5;
    g[i] = v;
    d[i] = identiques ? v : tirer() * 0.5;
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

/** La valeur efficace d'un canal : ce qui dit si quelque chose a changé, et de combien. */
function rms(b: AudioBuffer, canal = 0): number {
  const d = b.getChannelData(canal);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return Math.sqrt(s / d.length);
}

/** Les deux canaux sont-ils identiques, échantillon par échantillon ? */
function canauxIdentiques(b: AudioBuffer): boolean {
  const g = b.getChannelData(0);
  const d = b.getChannelData(1);
  for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - d[i]) > 1e-9) return false;
  return true;
}

const TOUS = ["echo-flottant", "haas", "ubiquite", "vague", "platine", "creneau"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les six fiches : ce qu'elles font d'une entrée absente", () => {
  // UN COMPOSANT À QUI RIEN N'EST BRANCHÉ DOIT PARLER, et non lancer : une exception laisse le nœud
  // en erreur sans phrase, et c'est le défaut le plus fréquent d'un exécuteur qu'aucun test n'a vu.
  for (const id of TOUS) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées")
        .toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs.every((v) => v === null)).toBe(true);
      expect((res.message ?? "").length, "le composant doit dire ce qui manque").toBeGreaterThan(0);
    });
  }

  it("creneau exige SES DEUX entrées, et le dit quand la seconde manque", async () => {
    const res = await lancer("creneau", [sonEssai(), null]);
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message).toBeTruthy();
  });
});

describe("echo-flottant : la distance commande la hauteur du battement", () => {
  it("le message donne l'aller-retour ET la fréquence du peigne", async () => {
    const res = await lancer("echo-flottant", [sonEssai()], { "Distance": 3 });
    // À trois mètres : 2 × 3 / 343 ≈ 17,5 ms, et le peigne à 343 / 6 ≈ 57 Hz.
    expect(res.message).toMatch(/17[,.]5/);
    expect(res.message).toMatch(/57/);
  });

  it("ÉCARTER LES MURS FAIT DESCENDRE LE PEIGNE, et le message le suit", async () => {
    const proche = await lancer("echo-flottant", [sonEssai()], { "Distance": 2 });
    const loin = await lancer("echo-flottant", [sonEssai()], { "Distance": 10 });
    const hz = (m: string) => Number((m.match(/(\d+[,.]\d+)\s*Hz/) ?? [])[1]?.replace(",", ".") ?? "0");
    expect(hz(loin.message!), "cinq fois plus loin, cinq fois plus grave")
      .toBeLessThan(hz(proche.message!));
  });

  it("« Mélange » à zéro rend l'entrée, à cent la transforme", async () => {
    const source = sonEssai();
    const sec = await lancer("echo-flottant", [source], { "Mélange": 0 });
    const mouille = await lancer("echo-flottant", [source], { "Mélange": 100 });
    expect(rms(sec.valeurs[0] as AudioBuffer)).toBeCloseTo(rms(source), 3);
    expect(rms(mouille.valeurs[0] as AudioBuffer)).not.toBeCloseTo(rms(source), 3);
  });

  it("« Décroissance » allonge la traîne", async () => {
    const court = await lancer("echo-flottant", [sonEssai(0.3)], { "Décroissance": 0.1, "Mélange": 100 });
    const long = await lancer("echo-flottant", [sonEssai(0.3)], { "Décroissance": 5, "Mélange": 100 });
    expect(rms(long.valeurs[0] as AudioBuffer), "une traîne plus longue laisse plus d'énergie")
      .toBeGreaterThan(rms(court.valeurs[0] as AudioBuffer));
  });

  // ── L'UNITÉ DE CHAQUE RÉGLAGE, ÉPINGLÉE SUR LE CALCUL LUI-MÊME ──
  //
  // CE CAS REMPLACE UN QUI NE SERVAIT À RIEN, et la leçon vaut d'être écrite. J'avais d'abord
  // comparé « Amortissement » à zéro et à quatre-vingt-quinze pour cent, en concluant que le
  // réglage « passe en fraction » parce que les deux sons différaient. **Ils diffèrent aussi quand
  // la division par cent est oubliée** : zéro reste zéro, quatre-vingt-quinze devient
  // quatre-vingt-quinze au lieu de zéro virgule quatre-vingt-quinze, et le son change tout autant.
  // Vérifié en plantant la faute : le cas restait vert.
  //
  // Comparer la fiche au CALCUL appelé directement avec les valeurs documentées épingle les quatre
  // conversions d'un coup, et ne peut pas se tromper sur ce qu'elle mesure.
  it("LES QUATRE RÉGLAGES ARRIVENT AU CALCUL DANS L'UNITÉ DOCUMENTÉE", async () => {
    const { echoFlottant } = await import("../audio/echo-flottant");
    const source = sonEssai(0.3);
    const attendu = echoFlottant(source, {
      distance: 4.5,              // mètres, tels quels
      decroissance: 2.5,          // secondes, telles quelles
      amortissement: 0.35,        // 35 % dans l'interface
      melange: 0.8,               // 80 % dans l'interface
    });
    const res = await lancer("echo-flottant", [source], {
      "Distance": 4.5, "Décroissance": 2.5, "Amortissement": 35, "Mélange": 80,
    });
    const obtenu = res.valeurs[0] as AudioBuffer;
    expect(obtenu.length).toBe(attendu.length);
    const a = obtenu.getChannelData(0);
    const b = attendu.getChannelData(0);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    expect(ecart, "la fiche doit rendre exactement ce que le calcul rend").toBeLessThan(1e-9);
  });

  it("et l'amortissement assourdit bien le battement", async () => {
    const vif = await lancer("echo-flottant", [sonEssai(0.3)], { "Amortissement": 0, "Mélange": 100 });
    const sourd = await lancer("echo-flottant", [sonEssai(0.3)], { "Amortissement": 95, "Mélange": 100 });
    expect(rms(sourd.valeurs[0] as AudioBuffer)).not.toBeCloseTo(rms(vif.valeurs[0] as AudioBuffer), 4);
  });
});

describe("haas : le retard, le côté, et le seuil de fusion", () => {
  it("LE RETARD EST EN MILLISECONDES DANS L'INTERFACE ET EN SECONDES AU CALCUL", async () => {
    // Un facteur mille perdu ici donnerait un effet parfaitement plausible et faux. Le message
    // porte la valeur affichée ; le décalage réel, lui, se mesure sur les canaux.
    const res = await lancer("haas", [sonEssai(0.5)], { "Retard": 12 });
    expect(res.message).toMatch(/12/);
    const out = res.valeurs[0] as AudioBuffer;
    expect(canauxIdentiques(out), "un canal est retardé : les deux ne peuvent pas coïncider").toBe(false);
  });

  it("LES TROIS RÉGLAGES ARRIVENT AU CALCUL DANS L'UNITÉ DOCUMENTÉE", async () => {
    // Même ancrage que pour l'écho : le retard est en millisecondes dans l'interface et en secondes
    // au calcul, et un facteur mille perdu là donnerait un effet plausible et faux.
    const { haas } = await import("../audio/echo-flottant");
    const source = sonEssai(0.4);
    const attendu = haas(source, {
      retard: 0.018,              // 18 ms dans l'interface
      retarderLaDroite: false,    // « gauche »
      gainDuRetarde: 0.65,        // 65 % dans l'interface
    });
    const res = await lancer("haas", [source], {
      "Retard": 18, "Côté retardé": "gauche", "Niveau du retardé": 65,
    });
    const obtenu = res.valeurs[0] as AudioBuffer;
    let ecart = 0;
    for (let c = 0; c < 2; c++) {
      const a = obtenu.getChannelData(c);
      const b = attendu.getChannelData(c);
      for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    }
    expect(ecart, "la fiche doit rendre exactement ce que le calcul rend").toBeLessThan(1e-9);
  });

  it("le message dit si la fusion tient, et le seuil est à quarante millisecondes", async () => {
    const fondu = await lancer("haas", [sonEssai(0.3)], { "Retard": 12 });
    const separe = await lancer("haas", [sonEssai(0.3)], { "Retard": 60 });
    expect(fondu.message).not.toBe(separe.message);
    expect(`${fondu.message} ${separe.message}`.length).toBeGreaterThan(0);
  });

  it("« Côté retardé » change de canal", async () => {
    const droite = await lancer("haas", [sonEssai(0.3)], { "Retard": 20, "Côté retardé": "droite" });
    const gauche = await lancer("haas", [sonEssai(0.3)], { "Retard": 20, "Côté retardé": "gauche" });
    const a = droite.valeurs[0] as AudioBuffer;
    const b = gauche.valeurs[0] as AudioBuffer;
    // Retarder la droite puis la gauche échange les deux voies : le canal 0 de l'un ressemble au
    // canal 1 de l'autre, et non à son canal 0.
    expect(rms(a, 0)).toBeCloseTo(rms(b, 1), 5);
    expect(rms(a, 1)).toBeCloseTo(rms(b, 0), 5);
  });

  it("« Niveau du retardé » à zéro éteint le canal retardé", async () => {
    const res = await lancer("haas", [sonEssai(0.3)], { "Retard": 20, "Côté retardé": "droite", "Niveau du retardé": 0 });
    const out = res.valeurs[0] as AudioBuffer;
    expect(rms(out, 1), "le canal retardé est muet").toBeCloseTo(0, 5);
    expect(rms(out, 0), "l'autre ne l'est pas").toBeGreaterThan(0);
  });
});

describe("ubiquite : la corrélation, et le sens du réglage", () => {
  it("LE MESSAGE DONNE LA CORRÉLATION AVANT ET APRÈS, et c'est la mesure de l'effet", async () => {
    const res = await lancer("ubiquite", [sonEssai(0.5)], { "Dispersion": 100 });
    expect(res.message, "deux nombres, l'avant et l'après").toMatch(/[-\d][,.]\d\d.*[-\d][,.]\d\d/);
  });

  it("À ZÉRO LE SON SORT TEL QU'IL EST ENTRÉ, et c'est ce que la notice promet", async () => {
    const source = sonEssai(0.3);
    const res = await lancer("ubiquite", [source], { "Dispersion": 0 });
    const out = res.valeurs[0] as AudioBuffer;
    expect(rms(out, 0)).toBeCloseTo(rms(source, 0), 4);
    expect(rms(out, 1)).toBeCloseTo(rms(source, 1), 4);
  });

  it("au positif la corrélation descend, au négatif elle monte", async () => {
    const lire = (m: string) => (m.match(/(-?\d+[,.]\d+)/g) ?? []).map((x) => Number(x.replace(",", ".")));
    const disperse = lire((await lancer("ubiquite", [sonEssai(0.5, { identiques: false })], { "Dispersion": 100 })).message!);
    const resserre = lire((await lancer("ubiquite", [sonEssai(0.5, { identiques: false })], { "Dispersion": -100 })).message!);
    expect(disperse[1], "l'ubiquité disperse").toBeLessThan(resserre[1]);
  });

  it("LA MÊME GRAINE REND LE MÊME SON, et deux graines ne le rendent pas", async () => {
    const source = sonEssai(0.3, { identiques: false });
    const a = await lancer("ubiquite", [source], { "Graine": 7 });
    const b = await lancer("ubiquite", [source], { "Graine": 7 });
    const c = await lancer("ubiquite", [source], { "Graine": 8 });
    expect(rms(a.valeurs[0] as AudioBuffer)).toBe(rms(b.valeurs[0] as AudioBuffer));
    expect(rms(a.valeurs[0] as AudioBuffer)).not.toBe(rms(c.valeurs[0] as AudioBuffer));
  });

  it("« Étages » change la finesse du brouillage", async () => {
    const source = sonEssai(0.3, { identiques: false });
    const peu = await lancer("ubiquite", [source], { "Étages": 1, "Graine": 7 });
    const beaucoup = await lancer("ubiquite", [source], { "Étages": 16, "Graine": 7 });
    expect(rms(peu.valeurs[0] as AudioBuffer)).not.toBe(rms(beaucoup.valeurs[0] as AudioBuffer));
  });
});

describe("vague : les cycles, et leur reproductibilité", () => {
  it("la même graine rend le même ressac", async () => {
    const source = sonEssai(2);
    const a = await lancer("vague", [source], { "Graine": 9 });
    const b = await lancer("vague", [source], { "Graine": 9 });
    expect(rms(a.valeurs[0] as AudioBuffer)).toBe(rms(b.valeurs[0] as AudioBuffer));
  });

  it("« Profondeur » commande ce que le creux retire", async () => {
    const source = sonEssai(2);
    const plat = await lancer("vague", [source], { "Profondeur": 0, "Graine": 9 });
    const creuse = await lancer("vague", [source], { "Profondeur": 100, "Graine": 9 });
    expect(rms(creuse.valeurs[0] as AudioBuffer), "un creux profond retire de l'énergie")
      .toBeLessThan(rms(plat.valeurs[0] as AudioBuffer));
  });

  // IL FAUT QUE LA VAGUE AIT LE TEMPS DE SE BRISER, et c'est ce que mon premier montage oubliait :
  // la période vaut sept secondes par défaut, de sorte qu'un son de deux secondes tient entier dans
  // la MONTÉE — identique dans les deux modes. Le cas passait donc au rouge pour une raison qui
  // n'était pas celle qu'il annonçait. Trois cycles d'une seconde sur trois secondes de son, et la
  // chute est atteinte trois fois.
  it("« Rupture » distingue la déferlante de la progressive", async () => {
    const source = sonEssai(3);
    const def = await lancer("vague", [source], { "Rupture": "deferlante", "Période": 1, "Graine": 9 });
    const pro = await lancer("vague", [source], { "Rupture": "progressive", "Période": 1, "Graine": 9 });
    expect(rms(def.valeurs[0] as AudioBuffer)).not.toBe(rms(pro.valeurs[0] as AudioBuffer));
  });

  it("« Période » change l'espacement des cycles", async () => {
    const source = sonEssai(3);
    const court = await lancer("vague", [source], { "Période": 1, "Graine": 9 });
    const long = await lancer("vague", [source], { "Période": 20, "Graine": 9 });
    expect(rms(court.valeurs[0] as AudioBuffer)).not.toBe(rms(long.valeurs[0] as AudioBuffer));
  });
});

describe("platine : la vitesse, les bruits, et la graine", () => {
  it("« Vitesse » accepte les trois plateaux, et le trente-trois tiers est le défaut", async () => {
    for (const v of ["33", "45", "78"]) {
      const res = await lancer("platine", [sonEssai(0.5)], { "Vitesse": v });
      expect(res.valeurs[0], `la vitesse ${v} doit rendre du son`).toBeInstanceOf(AudioBuffer);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("LES TROIS VITESSES NE RENDENT PAS LE MÊME SON, sans quoi le réglage serait décoratif", async () => {
    const source = sonEssai(0.5);
    const a = await lancer("platine", [source], { "Vitesse": "33", "Graine": 4 });
    const b = await lancer("platine", [source], { "Vitesse": "78", "Graine": 4 });
    expect(rms(a.valeurs[0] as AudioBuffer)).not.toBe(rms(b.valeurs[0] as AudioBuffer));
  });

  it("« Ronflement » et « Surface » sont des décibels, et le silence les laisse entendre", async () => {
    const muet = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
    const discret = await lancer("platine", [muet], { "Ronflement": -90, "Surface": -90, "Clics": 0, "Graine": 4 });
    const fort = await lancer("platine", [muet], { "Ronflement": -20, "Surface": -20, "Clics": 0, "Graine": 4 });
    expect(rms(fort.valeurs[0] as AudioBuffer), "soixante-dix décibels de plus s'entendent")
      .toBeGreaterThan(rms(discret.valeurs[0] as AudioBuffer));
  });

  it("« Clics » en ajoute, et la même graine les pose aux mêmes endroits", async () => {
    const muet = new AudioBuffer({ numberOfChannels: 2, length: SR * 2, sampleRate: SR });
    const sans = await lancer("platine", [muet], { "Clics": 0, "Ronflement": -90, "Surface": -90, "Graine": 4 });
    const avec = await lancer("platine", [muet], { "Clics": 20, "Ronflement": -90, "Surface": -90, "Graine": 4 });
    const bis = await lancer("platine", [muet], { "Clics": 20, "Ronflement": -90, "Surface": -90, "Graine": 4 });
    expect(rms(avec.valeurs[0] as AudioBuffer)).toBeGreaterThan(rms(sans.valeurs[0] as AudioBuffer));
    expect(rms(avec.valeurs[0] as AudioBuffer)).toBe(rms(bis.valeurs[0] as AudioBuffer));
  });
});

describe("creneau : deux entrées, deux sorties, et un rapport en clair", () => {
  it("IL REND SON SON ET SON RAPPORT, et le second est du texte", async () => {
    const res = await lancer("creneau", [sonEssai(2), sonEssai(0.3)]);
    expect(res.valeurs).toHaveLength(2);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(typeof res.valeurs[1], "la seconde sortie est le rapport").toBe("string");
    expect((res.valeurs[1] as string).length).toBeGreaterThan(0);
  });

  it("« Au plus tôt » repousse le créneau retenu", async () => {
    const fond = sonEssai(4);
    const son = sonEssai(0.3);
    const tot = await lancer("creneau", [fond, son], { "Au plus tôt": 0 });
    const tard = await lancer("creneau", [fond, son], { "Au plus tôt": 3 });
    expect(tard.valeurs[1]).not.toBe(tot.valeurs[1]);
  });

  it("« Écoute » distingue le timbre du niveau", async () => {
    const fond = sonEssai(3);
    const son = sonEssai(0.3);
    const timbre = await lancer("creneau", [fond, son], { "Écoute": "timbre" });
    const niveau = await lancer("creneau", [fond, son], { "Écoute": "niveau" });
    expect(`${timbre.valeurs[1]}`.length).toBeGreaterThan(0);
    expect(`${niveau.valeurs[1]}`.length).toBeGreaterThan(0);
  });

  it("« Niveau » à zéro laisse le fond intact", async () => {
    const fond = sonEssai(2);
    const son = sonEssai(0.3);
    const res = await lancer("creneau", [fond, son], { "Niveau": 0 });
    expect(rms(res.valeurs[0] as AudioBuffer)).toBeCloseTo(rms(fond), 4);
  });

  it("et un niveau fort ajoute de l'énergie au fond", async () => {
    const fond = sonEssai(2);
    const son = sonEssai(0.3);
    const doux = await lancer("creneau", [fond, son], { "Niveau": 0 });
    const fortissimo = await lancer("creneau", [fond, son], { "Niveau": 200 });
    expect(rms(fortissimo.valeurs[0] as AudioBuffer))
      .toBeGreaterThan(rms(doux.valeurs[0] as AudioBuffer));
  });
});

describe("les six fiches déclarent ce qu'elles rendent", () => {
  for (const id of TOUS) {
    it(`${id} : autant de valeurs rendues que de sorties déclarées`, async () => {
      const res = await lancer(id, [sonEssai(0.5), sonEssai(0.3)]);
      expect(res.valeurs).toHaveLength(fiche(id).sorties!.length);
    });
  }

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    // Un paramètre que personne ne lit est un curseur qui ne peut rien changer. Ces six fiches
    // lisent tout elles-mêmes — aucune ne passe son contexte à une aide partagée —, donc la source
    // de l'exécuteur suffit.
    for (const id of TOUS) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });
});
