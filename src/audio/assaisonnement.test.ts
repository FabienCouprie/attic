// audio/assaisonnement.test.ts — Assaisonner déplace-t-il vraiment le son vers le goût visé ?
//
// C'EST LA SEULE QUESTION QUI COMPTE ICI, et elle se mesure : on assaisonne, on remesure avec
// `gout.ts`, et l'on regarde si la part du goût visé a monté. Un effet qui « sonne sucré » sans
// rapprocher le son de la région sucrée serait une décoration ; le test refuse cela.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import {
  assaisonner, assaisonnerVers, distanceAuPoint, doserAssaisonnement, doserVersPoint,
  porter, lier, desaccorder, adoucir,
} from "./assaisonnement";
import { pointDepuisDegustation, type ProfilDegustation } from "./accord-mets";
import { mesurer, REGIONS, type DimensionsGout, type Gout } from "./gout";

const SR = 44100;

function buffer(duree: number, f: (t: number) => number): AudioBuffer {
  const n = Math.round(duree * SR);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = b.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = f(i / SR);
  return b;
}

/** Un son quelconque : ni très haut ni très bas, tenu, plutôt consonant. */
const neutre = () => buffer(3, (t) => 0.25 * (Math.sin(2 * Math.PI * 330 * t) + 0.6 * Math.sin(2 * Math.PI * 495 * t)) / 1.6);

/** Des clics détachés : très loin du lié. */
const clics = () => buffer(3, (t) => {
  const p = t % 0.25;
  return p > 0.03 ? 0 : 0.6 * Math.exp(-p * 120) * Math.sin(2 * Math.PI * 500 * t);
});

const GOUTS: Gout[] = ["sucré", "acide", "amer", "salé"];

describe("doserAssaisonnement", () => {
  const milieu: DimensionsGout = { hauteur: 0.5, articulation: 0.5, vitesse: 0.5, consonance: 0.5, intensite: 0.5 };

  it("à dose nulle, aucun réglage ne bouge", async () => {
    const r = doserAssaisonnement(milieu, "sucré", 0);
    expect(r.demiTons).toBeCloseTo(0, 10);
    expect(r.vitesse).toBe(1);
    expect(r.porte).toBe(0);
    expect(r.queue).toBe(0);
    expect(r.desaccord).toBe(0);
    expect(r.coupure).toBe(0);
    expect(r.gainDb).toBeCloseTo(0, 10);
  });

  it("transpose vers le grave pour l'amer, vers l'aigu pour l'acide", () => {
    expect(doserAssaisonnement(milieu, "amer", 1).demiTons).toBeLessThan(-12 + 1e-9 + 0);
    expect(doserAssaisonnement(milieu, "acide", 1).demiTons).toBeGreaterThan(10);
  });

  it("creuse les silences pour le salé, les remplit pour le sucré", async () => {
    const sale = doserAssaisonnement({ ...milieu, articulation: 0.9 }, "salé", 1);
    expect(sale.porte).toBeGreaterThan(0.5);
    expect(sale.queue).toBe(0);
    const sucre = doserAssaisonnement({ ...milieu, articulation: 0.2 }, "sucré", 1);
    expect(sucre.queue).toBeGreaterThan(0.2);
    expect(sucre.porte).toBe(0);
  });

  it("désaccorde vers l'acide, adoucit vers le sucré", () => {
    expect(doserAssaisonnement({ ...milieu, consonance: 0.9 }, "acide", 1).desaccord).toBeGreaterThan(30);
    expect(doserAssaisonnement({ ...milieu, consonance: 0.2 }, "sucré", 1).coupure).toBeGreaterThan(1000);
    expect(doserAssaisonnement({ ...milieu, consonance: 0.2 }, "sucré", 1).coupure).toBeLessThan(16000);
  });

  it("la dose fait la moitié du chemin à 50 %", async () => {
    // Un son déjà proche du registre visé : l'écart tient dans l'octave, donc rien n'est borné.
    const proche: DimensionsGout = { ...milieu, hauteur: 0.8 };
    const plein = doserAssaisonnement(proche, "acide", 1);
    const moitie = doserAssaisonnement(proche, "acide", 0.5);
    expect(moitie.demiTons).toBeCloseTo(plein.demiTons / 2, 6);
    expect(moitie.gainDb).toBeCloseTo(plein.gainDb / 2, 6);
  });

  it("mais la transposition reste bornée à l'octave : au-delà, la dose ne double plus l'écart", () => {
    // Du grave vers l'acide, l'écart vaut vingt-quatre demi-tons : la dose pleine et la demi-dose
    // butent toutes deux sur la borne. C'est voulu — deux octaves de transposition ne laissent
    // rien d'un son —, et c'est dit dans la notice.
    const grave: DimensionsGout = { ...milieu, hauteur: 0.1 };
    expect(doserAssaisonnement(grave, "acide", 1).demiTons).toBe(12);
    expect(doserAssaisonnement(grave, "acide", 0.5).demiTons).toBe(12);
  });

  it("borne ce qui doit l'être : douze demi-tons, moitié ou double de vitesse, 24 dB", () => {
    const extreme: DimensionsGout = { hauteur: 0, articulation: 0, vitesse: 0, consonance: 0, intensite: 0 };
    const r = doserAssaisonnement(extreme, "acide", 1);
    expect(Math.abs(r.demiTons)).toBeLessThanOrEqual(12);
    expect(r.vitesse).toBeLessThanOrEqual(2);
    expect(r.vitesse).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(r.gainDb)).toBeLessThanOrEqual(24);
  });
});

describe("les gestes, un par un", () => {
  it("la porte creuse les silences : l'articulation baisse", () => {
    const avant = mesurer(neutre()).dimensions.articulation;
    const apres = mesurer(porter(buffer(3, (t) => (t % 0.5 < 0.25 ? 0.4 : 0.004) * Math.sin(2 * Math.PI * 330 * t)), 1)).dimensions.articulation;
    expect(apres).toBeLessThan(avant);
  });

  it("la queue de résonance remplit les silences : l'articulation monte", () => {
    const avant = mesurer(clics()).dimensions.articulation;
    const apres = mesurer(lier(clics(), 0.5)).dimensions.articulation;
    expect(apres).toBeGreaterThan(avant + 0.1);
  });

  it("la copie désaccordée bat contre l'original : la rugosité monte", () => {
    expect(mesurer(desaccorder(neutre(), 50)).rugosite).toBeGreaterThan(mesurer(neutre()).rugosite);
  });

  it("le filtre ôte l'aigu : le registre descend", () => {
    expect(mesurer(adoucir(neutre(), 400)).registre).toBeLessThan(mesurer(neutre()).registre);
  });

  it("aucun geste ne fabrique de valeur impossible", async () => {
    for (const son of [porter(neutre(), 1), lier(neutre(), 0.4), desaccorder(neutre(), 50), adoucir(neutre(), 800)]) {
      expect(son.getChannelData(0).every(Number.isFinite)).toBe(true);
    }
  });
});

describe("assaisonner", () => {
  it("rapproche le son du goût visé — les quatre goûts, mesure à l'appui", async () => {
    for (const gout of GOUTS) {
      const r = await assaisonner(neutre(), gout, 1);
      expect(r.partApres, `${gout} : ${(r.partAvant * 100).toFixed(0)} % → ${(r.partApres * 100).toFixed(0)} %`)
        .toBeGreaterThan(r.partAvant);
    }
  });

  it("à dose nulle, le son et sa place ne bougent pas", async () => {
    const r = await assaisonner(neutre(), "acide", 0);
    expect(r.partApres).toBeCloseTo(r.partAvant, 6);
    expect(r.son.length).toBe(neutre().length);
  });

  it("une demi-dose déplace moins qu'une dose pleine", async () => {
    const moitie = await assaisonner(neutre(), "amer", 0.5);
    const plein = await assaisonner(neutre(), "amer", 1);
    expect(plein.partApres).toBeGreaterThan(moitie.partApres);
  });

  it("rend de quoi vérifier : les réglages, et les dimensions avant et après", async () => {
    const r = await assaisonner(neutre(), "amer", 1);
    // L'amer est grave : la transposition descend, et le registre mesuré aussi.
    expect(r.reglages.demiTons).toBeLessThan(0);
    expect(r.apres.hauteur).toBeLessThan(r.avant.hauteur);
    expect(Object.keys(r.avant).sort()).toEqual(Object.keys(REGIONS["amer"]).sort());
  });

  it("ne rend jamais un son cassé", async () => {
    for (const gout of GOUTS) {
      const r = await assaisonner(clics(), gout, 1);
      expect(r.son.length, gout).toBeGreaterThan(0);
      expect(r.son.getChannelData(0).every(Number.isFinite), gout).toBe(true);
      let crete = 0;
      for (const v of r.son.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
      expect(crete, gout).toBeLessThanOrEqual(1);
    }
  });
});

// ── VISER UNE COMBINAISON, ET NON UN SEUL GOÛT ──
//
// DEMANDÉ PAR FABIEN : « il faut adapter l'assaisonnement pour les combinaisons sucré, salé, amer,
// acide, comme dans l'accord mets-musique ». Une dégustation n'est presque jamais d'un seul goût.
// Le barycentre des quatre régions existait déjà dans `accord-mets.ts` ; l'assaisonnement, lui, ne
// savait viser qu'un sommet, alors que son calcul ne lit de la région que ses cinq coordonnées.
//
// CE QUE CES CAS TIENNENT, ET DANS QUEL ORDRE. D'abord que la généralisation NE CHANGE RIEN au cas
// d'un goût pur, ce qui est la seule façon de savoir qu'on n'a rien cassé en élargissant. Ensuite
// que viser entre deux régions vise bien entre elles. Enfin ce que le dosage fait de cet écart.
describe("viser un point plutôt qu'une région", () => {
  const profilPur = (g: Gout): ProfilDegustation =>
    ({ "sucré": 0, "acide": 0, "amer": 0, "salé": 0, [g]: 100 }) as ProfilDegustation;

  it("UN PROFIL D'UN SEUL GOÛT TOMBE EXACTEMENT SUR SA RÉGION", () => {
    for (const g of GOUTS) expect(pointDepuisDegustation(profilPur(g)), g).toEqual(REGIONS[g]);
  });

  it("ET LE DOSAGE Y EST LE MÊME QUE PAR L'ANCIEN CHEMIN : la généralisation ne change rien", () => {
    // LE CAS QUI COMPTE LE PLUS. Élargir une fonction sans changer ce qu'elle faisait se vérifie,
    // il ne se suppose pas : les deux voies doivent rendre des réglages identiques au bit près.
    const actuel = mesurer(neutre()).dimensions;
    for (const g of GOUTS) {
      for (const dose of [0, 0.3, 0.7, 1]) {
        expect(doserVersPoint(actuel, REGIONS[g], dose), `${g} à ${dose}`)
          .toEqual(doserAssaisonnement(actuel, g, dose));
      }
    }
  });

  it("et le son rendu l'est aussi, réglages compris", async () => {
    const b = neutre();
    const ancien = await assaisonner(b, "salé", 0.6);
    const nouveau = await assaisonnerVers(b, pointDepuisDegustation(profilPur("salé"))!, 0.6);
    expect(nouveau.reglages).toEqual(ancien.reglages);
    expect(nouveau.apres).toEqual(ancien.apres);
  });

  it("SEULE LA PROPORTION COMPTE, non la somme des quatre parts", () => {
    const a = pointDepuisDegustation({ "sucré": 50, "acide": 0, "amer": 0, "salé": 50 });
    const b = pointDepuisDegustation({ "sucré": 30, "acide": 0, "amer": 0, "salé": 30 });
    const c = pointDepuisDegustation({ "sucré": 100, "acide": 0, "amer": 0, "salé": 100 });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("UN MÉLANGE TOMBE ENTRE LES DEUX RÉGIONS, et à égale distance quand les parts le sont", () => {
    const mix = pointDepuisDegustation({ "sucré": 50, "acide": 0, "amer": 0, "salé": 50 })!;
    const dSucre = distanceAuPoint(mix, REGIONS["sucré"]);
    const dSale = distanceAuPoint(mix, REGIONS["salé"]);
    expect(dSucre).toBeCloseTo(dSale, 9);
    // Et il est bien ENTRE : plus près de chacune que les deux ne le sont l'une de l'autre.
    const entreElles = distanceAuPoint(REGIONS["sucré"], REGIONS["salé"]);
    expect(dSucre).toBeLessThan(entreElles);
    expect(dSucre).toBeCloseTo(entreElles / 2, 9);
  });

  it("une part qui l'emporte rapproche le point de sa région", () => {
    const vers = (partSucre: number) => distanceAuPoint(
      pointDepuisDegustation({ "sucré": partSucre, "acide": 0, "amer": 0, "salé": 100 - partSucre })!,
      REGIONS["sucré"]);
    expect(vers(90)).toBeLessThan(vers(50));
    expect(vers(50)).toBeLessThan(vers(10));
  });

  it("LES QUATRE PARTS À ZÉRO NE DÉSIGNENT AUCUNE CIBLE, et viser le centre le cacherait", () => {
    expect(pointDepuisDegustation({ "sucré": 0, "acide": 0, "amer": 0, "salé": 0 })).toBeNull();
  });

  it("À DOSE NULLE, RIEN N'EST DEMANDÉ AU SON, quelle que soit la cible", () => {
    const actuel = mesurer(neutre()).dimensions;
    const mix = pointDepuisDegustation({ "sucré": 40, "acide": 30, "amer": 20, "salé": 10 })!;
    // `toBeCloseTo` plutôt que `toBe` : un écart négatif multiplié par une dose nulle rend `-0`,
    // que `Object.is` distingue de `+0`. C'est le zéro signé de la norme, non un reste de calcul.
    const r = doserVersPoint(actuel, mix, 0);
    expect(r.demiTons).toBeCloseTo(0, 10);
    expect(r.vitesse).toBeCloseTo(1, 10);
    expect(r.porte).toBeCloseTo(0, 10);
    expect(r.queue).toBeCloseTo(0, 10);
    expect(r.desaccord).toBeCloseTo(0, 10);
    expect(r.gainDb).toBeCloseTo(0, 10);
  });

  it("ET LE DOSAGE VISE LA CIBLE, non une autre : chaque geste va dans le bon sens", () => {
    // CE QUE CE CAS TIENT, ET CE QU'IL NE TIENT PAS. Il vérifie la DIRECTION du geste, non que le
    // son l'atteigne : ce qu'un traitement peut faire est borné, la notice le dit, et la consonance
    // d'un enregistrement ne se récrit pas. La direction, elle, doit être juste dans tous les cas.
    const actuel = mesurer(neutre()).dimensions;
    for (const p of [
      { "sucré": 100, "acide": 0, "amer": 0, "salé": 0 },
      { "sucré": 0, "acide": 0, "amer": 0, "salé": 100 },
      { "sucré": 50, "acide": 0, "amer": 0, "salé": 50 },
      { "sucré": 0, "acide": 60, "amer": 40, "salé": 0 },
      { "sucré": 25, "acide": 25, "amer": 25, "salé": 25 },
    ] as ProfilDegustation[]) {
      const cible = pointDepuisDegustation(p)!;
      const r = doserVersPoint(actuel, cible, 1);
      expect(Math.sign(r.demiTons), `hauteur vers ${JSON.stringify(p)}`)
        .toBe(Math.sign(Math.round((cible.hauteur - actuel.hauteur) * 1000)));
      expect(Math.sign(r.gainDb), `intensité vers ${JSON.stringify(p)}`)
        .toBe(Math.sign(Math.round((cible.intensite - actuel.intensite) * 1000)));
      // Une vitesse visée plus haute donne un facteur supérieur à un, et l'inverse.
      if (Math.abs(cible.vitesse - actuel.vitesse) > 0.01) {
        expect(r.vitesse > 1, `vitesse vers ${JSON.stringify(p)}`).toBe(cible.vitesse > actuel.vitesse);
      }
      // L'articulation ouvre la porte OU la queue, jamais les deux.
      expect(r.porte > 0 && r.queue > 0).toBe(false);
    }
  });

  it("la distance se mesure dans les cinq dimensions, et vaut zéro sur soi-même", () => {
    expect(distanceAuPoint(REGIONS["amer"], REGIONS["amer"])).toBe(0);
    expect(distanceAuPoint(REGIONS["sucré"], REGIONS["acide"])).toBeGreaterThan(0);
  });
});
