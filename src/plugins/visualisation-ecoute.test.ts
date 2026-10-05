// plugins/visualisation-ecoute.test.ts — Les cinq fiches du parcours qui ne font qu'ÉCOUTER.
//
// POURQUOI CE FICHIER EST SÉPARÉ DE `visualisation.test.ts`. Des six fiches de `visualisation.ts`,
// une seule calcule vraiment du son : l'oscillateur, qui garde la batterie d'origine. Les cinq
// autres ne produisent rien — elles rendent l'audio qu'on leur donne, et ce qu'elles ajoutent est
// une MESURE ou un CHOIX. C'est un contrat d'une autre nature que celui d'une synthèse.
//
// QUATRE D'ENTRE ELLES SONT DES PASSE-PLATS : `analyseur-spectre`, `spectrogramme`, `vu-metre` et
// `colorsynth` rendent leur entrée telle quelle, la représentation étant calculée par la vue. Un
// passe-plat semble n'avoir rien à tester — il a en réalité trois contrats, et ce sont eux qui sont
// tenus ici :
//
//   1. IL NE TOUCHE PAS AU SON. La sortie doit être l'objet d'entrée lui-même, pas une copie : un
//      nœud d'analyse qui recopierait son tampon dépenserait la mémoire d'un son entier pour rien,
//      et un nœud qui le modifierait mentirait sur sa nature.
//   2. CE QU'IL ANNONCE EST VRAI. Le vu-mètre écrit huit mesures dans un texte ; le comparateur dit
//      lequel des deux signaux on entend et à quel niveau. Un chiffre faux y est un défaut au même
//      titre qu'un son faux, et c'est le seul niveau qui puisse le voir.
//   3. UNE ENTRÉE QUI N'EST PAS UN SON EST REFUSÉE comme une absence, avec un message.
//
// LE COMPARATEUR A/B PORTE LE CAS LE PLUS FORT : il promet une comparaison « honnête » en ramenant
// le signal écouté au même niveau crête. Un alignement qui ne tomberait pas juste rendrait le nœud
// pire qu'absent, puisqu'on lui confie précisément de retirer le biais du plus fort. Ses deux
// entrées sont par ailleurs FACULTATIVES, et un cas le tient : tant qu'elles ne l'étaient pas, le
// moteur refusait d'exécuter le nœud dès qu'un câble manquait, et tous les cas de repli ci-dessous
// portaient sur du code que l'application n'atteignait jamais.
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
 * Le moteur fait passer toute valeur de choix par `valeurCanoniqueChoix`, de sorte qu'un « Oui »
 * enregistré en français arrive à l'exécuteur sous la forme « yes ». Un contexte naïf
 * transmettrait « Oui » tel quel et mesurerait un comportement que l'application n'a jamais : ici,
 * l'alignement des niveaux se déciderait sur une comparaison qui échoue toujours.
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

const silence = (secondes = 1) =>
  new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * SR), sampleRate: SR });

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

/** Les quatre qui rendent l'audio reçu sans y toucher. */
const PASSE_PLATS = ["analyseur-spectre", "spectrogramme", "vu-metre", "colorsynth"];
/** Les cinq qui attendent du son ; `oscillateur` n'attend rien. */
const CONSOMMATEURS = ["analyseur-spectre", "spectrogramme", "comparateur-ab", "vu-metre", "colorsynth"];


// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("ce que les six fiches font d'une entrée absente ou fautive", () => {
  for (const id of CONSOMMATEURS) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const res = await lancer(id, [null, null]);
      expect(res.valeurs, "autant de valeurs que de sorties déclarées")
        .toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs.every((v) => v === null)).toBe(true);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    });

    it(`${id} : UNE ENTRÉE QUI N'EST PAS UN SON EST REFUSÉE COMME UNE ABSENCE`, async () => {
      // Le texte est le cas réel : ces nœuds voisinent dans la palette avec des fiches qui rendent
      // du texte, et un câble mal posé ne doit pas les faire tomber dans `getChannelData`.
      const res = await lancer(id, ["bonjour", "bonsoir"]);
      expect(res.valeurs.every((v) => v === null), `${id} a accepté du texte`).toBe(true);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    });
  }

  it("oscillateur n'attend rien et rend tout de même un son", async () => {
    const res = await lancer("oscillateur", []);
    expect(fiche("oscillateur").entrees).toHaveLength(0);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
    expect(pic(res.valeurs[0] as AudioBuffer)).toBeGreaterThan(0);
  });
});

describe("les quatre passe-plats rendent le son reçu SANS Y TOUCHER", () => {
  for (const id of PASSE_PLATS) {
    it(`${id} : la sortie EST l'entrée, et non une copie`, async () => {
      const source = tonalite(0.5, 440, 0.2);
      const res = await lancer(id, [source]);
      expect(res.valeurs[0] === source, `${id} a recopié ou modifié son tampon`).toBe(true);
    });
  }

  it("aucun des quatre ne déclare plus d'une entrée audio", () => {
    for (const id of PASSE_PLATS) {
      const e = fiche(id).entrees ?? [];
      expect(e, id).toHaveLength(1);
      expect(e[0].type, id).toBe("audio");
    }
  });
});

describe("comparateur-ab : une comparaison honnête", () => {
  // A et B portent des longueurs différentes : c'est ainsi qu'on sait LEQUEL des deux est sorti.
  const A = () => tonalite(0.5, 440, 1);
  const B = () => tonalite(0.25, 440, 2);

  it("« Écoute » CHOISIT L'ENTRÉE, et la longueur le prouve", async () => {
    const a = await lancer("comparateur-ab", [A(), B()], { "Écoute": "A" });
    const b = await lancer("comparateur-ab", [A(), B()], { "Écoute": "B" });
    expect((a.valeurs[0] as AudioBuffer).length).toBe(SR);
    expect((b.valeurs[0] as AudioBuffer).length).toBe(2 * SR);
  });

  it("« Aligner les niveaux » RAMÈNE LA CRÊTE À 0,9 EXACTEMENT, quelle que soit l'entrée", async () => {
    // C'est tout le propos du nœud : sans cela le plus fort des deux paraît le meilleur. Le chiffre
    // est en dur dans l'exécuteur (`cible = 0.9`) et c'est bien lui qu'on exige.
    for (const sel of ["A", "B"]) {
      for (const crete of [0.5, 0.25, 0.05, 1]) {
        const son = tonalite(crete, 440, 0.5);
        const res = await lancer("comparateur-ab", [son, son], { "Écoute": sel, "Aligner les niveaux": "Oui" });
        expect(pic(res.valeurs[0] as AudioBuffer), `écoute ${sel}, crête ${crete}`).toBeCloseTo(0.9, 5);
      }
    }
  });

  it("À « Non », LA SORTIE EST L'ENTRÉE ELLE-MÊME : aucune copie, aucun gain", async () => {
    // L'IDENTITÉ S'AFFIRME SUR UN BOOLÉEN, et non par `toBe` sur deux tampons. Planté, ce cas a mis
    // trois minutes à rendre son verdict : vitest s'était mis à comparer échantillon par
    // échantillon une seconde et deux secondes d'audio pour en imprimer la différence. Un cas qui
    // met trois minutes à dire non est un cas qu'on finit par ne plus lancer.
    const a = A(), b = B();
    const ra = await lancer("comparateur-ab", [a, b], { "Écoute": "A", "Aligner les niveaux": "Non" });
    const rb = await lancer("comparateur-ab", [a, b], { "Écoute": "B", "Aligner les niveaux": "Non" });
    expect(ra.valeurs[0] === a, "A a été recopié, ou ce n'est pas A qui est sorti").toBe(true);
    expect(rb.valeurs[0] === b, "B a été recopié, ou ce n'est pas B qui est sorti").toBe(true);
  });

  it("et à « Oui » elle ne l'est pas : le tampon est neuf", async () => {
    const a = A(), b = B();
    const res = await lancer("comparateur-ab", [a, b], { "Écoute": "A", "Aligner les niveaux": "Oui" });
    expect(res.valeurs[0] === a, "l'alignement a écrit dans le tampon d'entrée").toBe(false);
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.length, "mais il garde la longueur").toBe(a.length);
    expect(out.numberOfChannels, "et les canaux").toBe(a.numberOfChannels);
    expect(out.sampleRate).toBe(a.sampleRate);
  });

  it("LE MESSAGE PORTE LES DEUX CRÊTES EN DÉCIBELS, mesurées à la main", async () => {
    // Une crête de 0,5 vaut 20·log₁₀(0,5) = −6,0 dB ; 0,25 en vaut −12,0. Ce sont les deux chiffres
    // sur lesquels on compare à l'œil avant d'écouter : faux, ils égarent plus qu'ils n'aident.
    const res = await lancer("comparateur-ab", [A(), B()], { "Écoute": "A" });
    expect(res.message).toContain("-6.0 dB");
    expect(res.message).toContain("-12.0 dB");
    const lus = chiffres(res.message!);
    expect(lus).toContain(Number((20 * Math.log10(0.5)).toFixed(1)));
    expect(lus).toContain(Number((20 * Math.log10(0.25)).toFixed(1)));
  });

  it("le message dit « égalisés » quand il l'est, et se taît sinon", async () => {
    const oui = await lancer("comparateur-ab", [A(), B()], { "Aligner les niveaux": "Oui" });
    const non = await lancer("comparateur-ab", [A(), B()], { "Aligner les niveaux": "Non" });
    expect(oui.message).toContain("égalisés");
    expect(non.message).not.toContain("égalisés");
  });

  it("UNE ENTRÉE MUETTE S'ANNONCE « −∞ », et non comme un niveau très bas", async () => {
    // Un zéro passé à un logarithme donne −∞ ou NaN selon la route ; l'exécuteur le traite à part.
    // Afficher « −120 dB » laisserait croire à un signal présent et minuscule.
    const res = await lancer("comparateur-ab", [silence(0.5), B()], { "Écoute": "B" });
    expect(res.message).toContain("−∞");
    expect(res.message).not.toContain("NaN");
    expect(res.message).not.toContain("Infinity");
  });

  it("UNE SEULE DES DEUX ENTRÉES SUFFIT : l'autre prend le relais", async () => {
    const sansA = await lancer("comparateur-ab", [null, B()], { "Écoute": "A" });
    expect((sansA.valeurs[0] as AudioBuffer).length, "B est sorti à la place de A").toBe(2 * SR);
    const sansB = await lancer("comparateur-ab", [A(), null], { "Écoute": "B" });
    expect((sansB.valeurs[0] as AudioBuffer).length, "et A à la place de B").toBe(SR);
  });

  it("SES DEUX ENTRÉES SONT DÉCLARÉES FACULTATIVES, sans quoi tout le repli est mort", () => {
    // LE DÉFAUT QUE CE CAS CONTRACTUALISE, ET C'EST LA VÉRIFICATION DANS L'APPLICATION QUI L'A
    // TROUVÉ. `requis` vaut `true` par défaut : la fiche ne déclarant rien, le moteur refusait
    // d'exécuter le nœud dès qu'un câble manquait, avec « entrée obligatoire « A » non connectée ».
    // Trois pièces du même nœud se contredisaient — les ports exigeaient les deux entrées,
    // l'exécuteur avait un repli pour n'en avoir qu'une, le message promettait « Connectez A et/ou
    // B » — et tous les cas de repli ci-dessous portaient sur du code que l'application
    // n'atteignait jamais. Un test qui exerce un chemin mort est pire qu'absent : il rassure.
    for (const port of fiche("comparateur-ab").entrees ?? []) {
      expect(port.requis, `l'entrée « ${port.nom} » redevient obligatoire : le repli ne sert plus`)
        .toBe(false);
    }
  });

  it("ET LE MESSAGE ANNONCE ALORS CELLE QU'ON ENTEND, non celle qu'on a demandée", async () => {
    // LE DÉFAUT QUE CE CAS CONTRACTUALISE : sur repli, le message reprenait le réglage « Écoute »
    // tel quel et annonçait « Écoute A » pendant que B jouait. Sur un nœud dont l'objet même est de
    // dire lequel des deux on entend, c'est la seule chose qu'il ne pouvait pas dire faux. Le nom
    // annoncé et la longueur sortie se vérifient ensemble : ils doivent désigner la même entrée.
    const sansA = await lancer("comparateur-ab", [null, B()], { "Écoute": "A" });
    expect(sansA.message, `A est absente, c'est B qu'on entend : ${sansA.message}`)
      .toContain("Écoute B");
    expect((sansA.valeurs[0] as AudioBuffer).length, "et c'est bien B qui sort").toBe(2 * SR);

    const sansB = await lancer("comparateur-ab", [A(), null], { "Écoute": "B" });
    expect(sansB.message, `B est absente, c'est A qu'on entend : ${sansB.message}`)
      .toContain("Écoute A");
    expect((sansB.valeurs[0] as AudioBuffer).length).toBe(SR);

    // Et sans repli, il annonce toujours ce qu'on a demandé.
    for (const sel of ["A", "B"]) {
      const res = await lancer("comparateur-ab", [A(), B()], { "Écoute": sel });
      expect(res.message).toContain(`Écoute ${sel}`);
    }
  });

  it("LA MENTION « égalisés » SUIT LA LANGUE DE L'INTERFACE", async () => {
    // Même défaut que celui de l'oscillateur, et dans la même ligne : un littéral français passé en
    // argument d'un message traduit, de sorte que l'anglais lisait « Listen A · A -6.0 dB ·
    // B -12.0 dB · égalisés ». La mention a maintenant sa clé, et les deux langues sont exercées.
    const fr = await avecLangue("fr", async () =>
      (await lancer("comparateur-ab", [A(), B()], { "Aligner les niveaux": "Oui" })).message!);
    const en = await avecLangue("en", async () =>
      (await lancer("comparateur-ab", [A(), B()], { "Aligner les niveaux": "Oui" })).message!);
    expect(fr).toContain("Écoute A");
    expect(fr).toContain("égalisés");
    expect(en, "le gabarit anglais est bien celui employé").toContain("Listen A");
    expect(en, "et plus un mot de français dans la mention").not.toContain("égalisés");
    expect(en).toContain("levels matched");
    // À « Non », pas de mention — dans aucune des deux langues.
    for (const langue of ["fr", "en"]) {
      const m = await avecLangue(langue, async () =>
        (await lancer("comparateur-ab", [A(), B()], { "Aligner les niveaux": "Non" })).message!);
      expect(m, `${langue} : une mention est apparue sans alignement`).not.toContain("égalis");
      expect(m).not.toContain("matched");
    }
  });

  it("les deux absentes donnent un message, pas une exception", async () => {
    const res = await lancer("comparateur-ab", [null, null]);
    expect(res.valeurs).toEqual([null]);
    expect(res.message).toContain("A");
    expect(res.message).toContain("B");
  });

  it("il accepte le stéréo sans perdre un canal", async () => {
    const st = tonalite(0.5, 440, 0.5, 2);
    const res = await lancer("comparateur-ab", [st, null], { "Aligner les niveaux": "Oui" });
    const out = res.valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(pic(out)).toBeCloseTo(0.9, 5);
  });
});

describe("vu-mètre : le rapport porte, chiffre pour chiffre, ce que la mesure rend", () => {
  // CE QUI EST TESTÉ ICI EST LA PRISE, PAS LE CALCUL : `audio/vumetre.test.ts` tient déjà les deux
  // portes, la plage et les bornes de `mesurerNiveau`. Ce qui n'était tenu par rien, c'est le
  // passage de ces huit nombres dans un texte — l'ordre des lignes, les unités, et le cas du
  // silence. Un rapport qui écrirait le pic sur la ligne du RMS resterait vert partout ailleurs.
  it("LE RAPPORT EST ANCRÉ SUR mesurerNiveau : huit lignes, huit chiffres", async () => {
    const { mesurerNiveau } = await import("../audio");
    const src = tonalite(0.5, 440, 3);
    const res = await lancer("vu-metre", [src]);
    const m = mesurerNiveau(src);
    const lignes = (res.valeurs[1] as string).split("\n");
    expect(lignes).toHaveLength(8);
    expect(lignes[0]).toBe(`RMS: ${m.rmsDb.toFixed(1)} dBFS`);
    expect(lignes[1]).toBe(`Peak: ${m.peakDb.toFixed(1)} dBFS`);
    expect(lignes[2]).toBe(`True Peak: ${m.vraiPicDb.toFixed(1)} dBTP`);
    expect(lignes[3]).toBe(`LUFS: ${m.lufs.toFixed(1)}`);
    expect(lignes[4]).toBe(`Crest: ${m.crestFactorDb.toFixed(1)} dB`);
    expect(lignes[5]).toBe(`LRA: ${m.plageDynamiqueDb.toFixed(1)} dB`);
    expect(lignes[6]).toBe(`LUFS max: ${m.lufsMax.toFixed(1)}`);
    expect(lignes[7]).toBe(`LUFS min: ${m.lufsMin.toFixed(1)}`);
  });

  it("LES CHIFFRES D'UNE SINUSOÏDE À MOITIÉ SE VÉRIFIENT À LA MAIN", async () => {
    // Une sinusoïde de crête 0,5 : son niveau efficace vaut 0,5/√2, soit −9,0 dB, sa crête −6,0 dB,
    // et leur différence — le facteur de crête d'une sinusoïde — exactement 3,0 dB.
    const res = await lancer("vu-metre", [tonalite(0.5, 440, 3)]);
    const txt = res.valeurs[1] as string;
    expect(txt).toContain(`RMS: ${(20 * Math.log10(0.5 / Math.SQRT2)).toFixed(1)} dBFS`);
    expect(txt).toContain(`Peak: ${(20 * Math.log10(0.5)).toFixed(1)} dBFS`);
    expect(txt).toContain("Crest: 3.0 dB");
  });

  it("LA SONIE RESTE AU VOISINAGE DU NIVEAU EFFICACE, à tous les niveaux", async () => {
    // LE DÉFAUT QUE CE CAS CONTRACTUALISE : un son à −24 dB de niveau efficace s'est déjà annoncé
    // à −73 LUFS, parce que la moyenne des blocs se faisait sur des logarithmes. Deux chiffres qui
    // décrivent la même force ne peuvent pas différer de cinquante décibels. L'écart mesuré est de
    // −0,60 dB sur une tonalité à 440 Hz, et il ne bouge pas d'un niveau à l'autre : on exige donc
    // les deux choses, la petitesse ET l'invariance.
    const { mesurerNiveau } = await import("../audio");
    const ecarts: number[] = [];
    for (const crete of [1, 0.5, 0.25, 0.1, 0.05, 0.01]) {
      const m = mesurerNiveau(tonalite(crete, 440, 3));
      const ecart = m.lufs - m.rmsDb;
      expect(Math.abs(ecart), `crête ${crete} : ${m.rmsDb.toFixed(1)} dB annoncé ${m.lufs.toFixed(1)} LUFS`)
        .toBeLessThan(3);
      ecarts.push(ecart);
    }
    const etendue = Math.max(...ecarts) - Math.min(...ecarts);
    expect(etendue, "l'écart sonie/RMS ne doit pas dépendre du niveau").toBeLessThan(0.1);
  });

  it("LE SILENCE S'ÉCRIT « — », et non comme un chiffre", async () => {
    // Un bloc trop faible pour la porte absolue n'a pas de niveau ; en inventer un ferait croire à
    // une mesure. La ligne porte donc un tiret, et c'est ce que l'exécuteur décide (`> -119`).
    const res = await lancer("vu-metre", [silence(1)]);
    const txt = res.valeurs[1] as string;
    expect(txt).toContain("LUFS max: —");
    expect(txt).toContain("LUFS min: —");
    expect(txt).not.toContain("NaN");
    expect(txt).not.toContain("Infinity");
  });

  it("un son trop court pour un bloc de sonie ne rend pas un chiffre inventé", async () => {
    // Relevé : en-dessous d'environ quatre dixièmes de seconde, la sonie intégrée vaut sa borne
    // basse. Le rapport doit alors le DIRE, et non annoncer −120 LUFS comme une mesure.
    const res = await lancer("vu-metre", [tonalite(0.5, 440, 0.3)]);
    const txt = res.valeurs[1] as string;
    expect(txt).toContain("LUFS max: —");
    expect(txt, "le niveau efficace, lui, reste mesurable").toContain("RMS: -9.0 dBFS");
  });

  it("le message résume trois des huit chiffres, et ce sont les mêmes", async () => {
    const res = await lancer("vu-metre", [tonalite(0.5, 440, 3)]);
    const txt = res.valeurs[1] as string;
    for (const n of chiffres(res.message!)) {
      expect(txt, `le message annonce ${n}, que le rapport ne porte pas`).toContain(String(n));
    }
  });

  it("il rend DEUX sorties : le son intact, et le texte", async () => {
    const src = tonalite(0.5, 440, 1);
    const res = await lancer("vu-metre", [src]);
    expect(fiche("vu-metre").sorties).toHaveLength(2);
    expect(res.valeurs[0] === src, "le son n'est pas ressorti intact").toBe(true);
    expect(typeof res.valeurs[1]).toBe("string");
  });
});
