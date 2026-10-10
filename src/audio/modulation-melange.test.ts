// audio/modulation-melange.test.ts — Les mélanges sec/mouillé ouverts à une courbe.
//
// LA FAMILLE « MÉLANGE » DE `MODULABLES.md`, prise d'un bloc : onze composants dont le réglage à
// ouvrir est le même geste partout, l'équilibre entre le son d'entrée et le son traité. C'est ce
// qui permet de les traiter ensemble, et d'éprouver les deux invariants d'un seul banc.
//
// LES DEUX INVARIANTS SONT CEUX DE `modulation-effets.test.ts`, et ils ne changent pas d'un effet
// à l'autre :
//
// 1. SANS COURBE, PAS UN BIT NE BOUGE. Ouvrir un effet qui tourne déjà dans les graphes de
//    quelqu'un n'est acceptable qu'à cette condition. La faute que l'approximation cacherait n'est
//    pas une différence audible : c'est une différence d'un demi-LSB qui rendrait tout rendu
//    enregistre irreproductible sans que personne ne s'en aperçoive avant des mois.
// 2. LA COURBE DOIT COMMANDER VRAIMENT. Un port qui ne change rien serait pire qu'une absence de
//    port. Un mélange tenu à zéro doit rendre l'entrée, tenu à un doit rendre le son traité.
//
// LE TÉMOIN EMPLOYÉ POUR LE SECOND, et il est le même pour les quatre : un mélange constant à zéro
// doit rendre EXACTEMENT l'entrée, puisque c'est ce que le réglage à zéro a toujours fait. Deux
// constantes opposées donnent alors deux sons dont l'écart se mesure sans rien supposer du timbre
// de l'effet, ce qui serait faux pour un rotatif comme pour un modulateur en anneau.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { arcEnCiel } from "./arc-en-ciel";
import { constante } from "./courbe";
import { echoFlottant } from "./echo-flottant";
import { ringModulator } from "./effets-etirement";
import { beatRepeat, granularFreeze } from "./effets-grains";
import { vocoder } from "./effets-voix";
import { traiterFdn } from "./fdn";
import { reverberationHachee } from "./reverbes-etendues";
import { hautParleurRotatif, tremoloHarmonique } from "./rotatifs";
import { velourVoie } from "./velours";

const SR = 44100;

function bruit(n: number, graine = 5): AudioBuffer {
  let e = graine >>> 0;
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { e = (e * 1664525 + 1013904223) >>> 0; x[i] = 0.4 * (e / 4294967296 * 2 - 1); }
  b.copyToChannel(x, 0);
  return b;
}

/**
 * Une voie de bruit QUE CE BANC POSSÈDE, et non une vue sur un tampon qu'il ne garde pas.
 *
 * LE PIÈGE QUI A COÛTÉ UNE PASSE DE LA SUITE COMPLÈTE. `getChannelData` rend une vue sur de la
 * mémoire tenue par le tampon natif de `node-web-audio-api`. Écrire `bruit(n).getChannelData(0)` ne
 * garde donc AUCUNE référence sur le tampon : le ramasse-miettes peut le reprendre, et la vue
 * continue de pointer là où il était. Rien ne se plaint ; les valeurs changent seulement, et sous
 * charge. Trois blocs de ce banc, et eux seuls, étaient écrits ainsi : ils ont rendu cinq échecs
 * dans une passe complète après avoir passé six fois de suite lancés à part. Ceux qui gardaient
 * leur `AudioBuffer` dans une variable n'ont jamais bronché. Une copie possédée par JavaScript ne
 * peut pas pendre.
 */
const canal = (b: AudioBuffer, c = 0): Float32Array => Float32Array.from(b.getChannelData(c));

const voie = (n: number, graine: number): Float32Array => canal(bruit(n, graine));

const memes = (x: Float32Array, y: Float32Array): boolean => {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

/** L'écart quadratique moyen entre deux sons : une mesure qui ne suppose rien du timbre. */
const ecart = (x: Float32Array, y: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  return Math.sqrt(s / x.length);
};

/**
 * Une courbe constante, rendue en tableau de la longueur voulue, comme le fait l'exécuteur.
 *
 * ATTENTION AUX VALEURS EMPLOYÉES AVEC, et ce banc s'y est pris les pieds. Un `Float32Array`
 * QUANTIFIE ce qu'on y range : 0,8 y devient 0,800000011920929, et comparer le son qu'il donne à
 * celui d'un 0,8 en double précision mesure le format, non le code. Les comparaisons au bit près
 * se font donc sur des valeurs que le flottant simple tient EXACTEMENT, c'est-à-dire des fractions
 * dyadiques : 0,5 · 0,75 · 40 · 60. Ce n'est pas une faiblesse de l'invariant : en production,
 * `reglageModule` rend un NOMBRE quand aucune courbe n'est branchée, et la question ne se pose pas.
 */
const tenue = (valeur: number, n: number) => new Float32Array(n).fill(valeur);

describe("le modulateur en anneau ouvert à une courbe", () => {
  const x = bruit(SR / 2);

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    // Le scalaire traverse `valeurA` sans être transformé : la boucle a été réécrite, pas changée.
    expect(memes(
      canal(ringModulator(x, 400, 60)),
      canal(ringModulator(x, 400, tenue(60, x.length))),
    )).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(canal(ringModulator(x, 400, tenue(0, x.length))), x.getChannelData(0))).toBe(true);
  });

  it("deux tenues opposées donnent deux sons, et le port commande donc vraiment", () => {
    const sec = canal(ringModulator(x, 400, tenue(0, x.length)));
    const mouille = canal(ringModulator(x, 400, tenue(100, x.length)));
    expect(ecart(sec, mouille)).toBeGreaterThan(0.05);
  });
});

describe("le gel granulaire ouvert à une courbe", () => {
  const x = bruit(SR / 4, 11);

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(
      canal(granularFreeze(x, 50, 0, 0.25, 40)),
      canal(granularFreeze(x, 50, 0, 0.25, tenue(40, x.length))),
    )).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(canal(granularFreeze(x, 50, 0, 0.25, tenue(0, x.length))), x.getChannelData(0))).toBe(true);
  });

  it("une courbe qui monte de zéro à un ne rend NI l'un NI l'autre", () => {
    // Le cas qui attrape une lecture faite une seule fois, hors de la boucle : une rampe donnerait
    // alors le son de sa première valeur, donc l'entrée telle quelle.
    const rampe = new Float32Array(x.length);
    for (let i = 0; i < rampe.length; i++) rampe[i] = (100 * i) / rampe.length;
    const y = canal(granularFreeze(x, 50, 0, 0.25, rampe));
    expect(memes(y, x.getChannelData(0))).toBe(false);
    expect(memes(y, canal(granularFreeze(x, 50, 0, 0.25, 100)))).toBe(false);
  });
});

describe("le trémolo harmonique ouvert à une courbe", () => {
  const n = SR / 4;
  const canaux = [voie(n, 3)];
  const reglages = { vitesse: 5, profondeur: 0.7, coupure: 800 };

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(
      tremoloHarmonique(canaux, SR, { ...reglages, melange: 0.75 })[0],
      tremoloHarmonique(canaux, SR, { ...reglages, melange: tenue(0.75, n) })[0],
    )).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(tremoloHarmonique(canaux, SR, { ...reglages, melange: tenue(0, n) })[0], canaux[0])).toBe(true);
  });
});

describe("le haut-parleur rotatif ouvert à une courbe", () => {
  const n = SR / 4;
  const canaux = [voie(n, 7)];
  const reglages = {
    vitesseAigu: 6.7, vitesseGrave: 1.2, coupure: 800,
    profondeurAmplitude: 0.7, profondeurDoppler: 1, largeur: 1,
  };

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS, sur les deux canaux", () => {
    const fixe = hautParleurRotatif(canaux, SR, { ...reglages, melange: 0.5 });
    const tenu = hautParleurRotatif(canaux, SR, { ...reglages, melange: tenue(0.5, n) });
    expect(memes(fixe[0], tenu[0])).toBe(true);
    expect(memes(fixe[1], tenu[1])).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE sur les deux canaux", () => {
    // Un seul canal d'entrée : les deux micros reçoivent le même son sec.
    const sec = hautParleurRotatif(canaux, SR, { ...reglages, melange: tenue(0, n) });
    expect(memes(sec[0], canaux[0])).toBe(true);
    expect(memes(sec[1], canaux[0])).toBe(true);
  });

  it("et la courbe commande vraiment, ce qu'un port inerte ne ferait pas", () => {
    const sec = hautParleurRotatif(canaux, SR, { ...reglages, melange: tenue(0, n) })[0];
    const mouille = hautParleurRotatif(canaux, SR, { ...reglages, melange: tenue(1, n) })[0];
    expect(ecart(sec, mouille)).toBeGreaterThan(0.01);
  });
});

describe("l'arc-en-ciel acoustique ouvert à une courbe", () => {
  const x = bruit(SR / 4, 13);
  const o = {
    bandes: 8, grave: 200, aigu: 4000, sens: "grave-gauche" as const,
    ouverture: 100, courbure: 0, dispersion: 0.1, piegeage: 0.2,
  };

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS, sur les deux canaux", () => {
    const fixe = arcEnCiel(x, { ...o, mix: 60 });
    const tenu = arcEnCiel(x, { ...o, mix: tenue(60, x.length) });
    expect(memes(fixe.getChannelData(0), tenu.getChannelData(0))).toBe(true);
    expect(memes(fixe.getChannelData(1), tenu.getChannelData(1))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, la queue mise à part", () => {
    // LA SORTIE EST PLUS LONGUE QUE L'ENTRÉE, le trajet et la résonance s'ajoutant après la fin du
    // son : la comparaison porte donc sur la durée de l'entrée, et le reste doit être muet.
    const sec = arcEnCiel(x, { ...o, mix: tenue(0, x.length) });
    const entree = x.getChannelData(0);
    expect(memes(sec.getChannelData(0).subarray(0, entree.length), entree)).toBe(true);
    expect(sec.length).toBeGreaterThan(entree.length);
    const queue = sec.getChannelData(0).subarray(entree.length);
    expect(queue.every((v) => v === 0)).toBe(true);
  });

  it("et la courbe commande vraiment", () => {
    const sec = canal(arcEnCiel(x, { ...o, mix: tenue(0, x.length) }));
    const mouille = canal(arcEnCiel(x, { ...o, mix: tenue(100, x.length) }));
    expect(ecart(sec.subarray(0, x.length), mouille.subarray(0, x.length))).toBeGreaterThan(0.01);
  });
});

describe("le beat repeat ouvert à une courbe", () => {
  const x = bruit(SR / 2, 17);
  const applique = (mix: number | Float32Array) => canal(beatRepeat(x, 120, 4, 16, 4, 40, mix));

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(60), applique(tenue(60, x.length)))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(applique(tenue(0, x.length)), x.getChannelData(0))).toBe(true);
  });

  it("une courbe qui monte de zéro à un ne rend NI l'un NI l'autre", () => {
    const rampe = new Float32Array(x.length);
    for (let i = 0; i < rampe.length; i++) rampe[i] = (100 * i) / rampe.length;
    const y = applique(rampe);
    expect(memes(y, x.getChannelData(0))).toBe(false);
    expect(memes(y, applique(100))).toBe(false);
  });
});

describe("l'écho flottant ouvert à une courbe", () => {
  const x = bruit(SR / 4, 19);
  const o = { distance: 3, decroissance: 1, amortissement: 0.2 };
  const applique = (melange: number | Float32Array) => canal(echoFlottant(x, { ...o, melange }));

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(0.75), applique(tenue(0.75, x.length)))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(applique(tenue(0, x.length)), x.getChannelData(0))).toBe(true);
  });

  it("et la courbe commande vraiment", () => {
    expect(ecart(applique(tenue(0, x.length)), applique(tenue(1, x.length)))).toBeGreaterThan(0.01);
  });
});

describe("la réverbération hachée ouverte à une courbe", () => {
  const x = voie(SR / 4, 23);
  const o = {
    decroissanceSec: 1, maintienSec: 0.2, chuteSec: 0.01, seuilDb: -40,
    frequence: SR, graine: 3, densite: 400,
  };
  const applique = (melange: number | Float32Array) => reverberationHachee(x, { ...o, melange }).audio;

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(0.5), applique(tenue(0.5, x.length)))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, le prolongement mis à part", () => {
    // ELLE PROLONGE SON ENTRÉE DU MAINTIEN ET DE LA CHUTE, de sorte que la porte ait le temps de se
    // fermer après la dernière frappe : la comparaison porte donc sur la durée de l'entrée, et le
    // prolongement doit être muet.
    const sec = applique(tenue(0, x.length));
    expect(memes(sec.subarray(0, x.length), x)).toBe(true);
    expect(sec.length).toBeGreaterThan(x.length);
    expect(sec.subarray(x.length).every((v) => v === 0)).toBe(true);
  });

  it("et la courbe commande vraiment", () => {
    expect(ecart(applique(tenue(0, x.length)), applique(tenue(1, x.length)))).toBeGreaterThan(0.01);
  });
});

describe("la réverbération à réseau ouverte à une courbe", () => {
  const x = voie(SR / 4, 29);
  const o = { sampleRate: SR, rt60Bas: 1, rt60Haut: 0.5, queue: 0.3, lignes: 4 };

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS, sur les deux voies", () => {
    const fixe = traiterFdn(x, { ...o, melange: 0.5 });
    const tenu = traiterFdn(x, { ...o, melange: tenue(0.5, x.length) });
    expect(memes(fixe.gauche, tenu.gauche)).toBe(true);
    expect(memes(fixe.droite, tenu.droite)).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, la queue mise à part", () => {
    const sec = traiterFdn(x, { ...o, melange: tenue(0, x.length) });
    expect(memes(sec.gauche.subarray(0, x.length), x)).toBe(true);
    expect(sec.gauche.length).toBeGreaterThan(x.length);
    expect(sec.gauche.subarray(x.length).every((v) => v === 0)).toBe(true);
  });

  it("et la courbe commande vraiment", () => {
    const sec = traiterFdn(x, { ...o, melange: tenue(0, x.length) }).gauche;
    const mouille = traiterFdn(x, { ...o, melange: tenue(1, x.length) }).gauche;
    expect(ecart(sec, mouille)).toBeGreaterThan(0.01);
  });
});

describe("la réverbération velours ouverte à une courbe", () => {
  const x = voie(SR / 4, 31);
  const o = {
    duree: 0.5, sampleRate: SR, densite: 600, profil: "exponentielle" as const,
    rt60: 0.5, coude: 0.3, assombrissement: 0.25, graine: 5,
  };
  const applique = (melange: number | Float32Array) => velourVoie(x, { ...o, melange }, 0).melangee;

  it("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", () => {
    expect(memes(applique(0.5), applique(tenue(0.5, x.length)))).toBe(true);
  });

  it("ET UNE COURBE TENUE À ZÉRO REND L'ENTRÉE, exactement", () => {
    expect(memes(applique(tenue(0, x.length)), x)).toBe(true);
  });

  it("et la courbe commande vraiment", () => {
    expect(ecart(applique(tenue(0, x.length)), applique(tenue(1, x.length)))).toBeGreaterThan(0.01);
  });
});

describe("le vocoder ouvert à une courbe", () => {
  // SON BANC DE FILTRES PASSE PAR `OfflineAudioContext`, et c'est ce qui décide si ces cas tournent :
  // sans lui le composant ne peut pas être appelé du tout. Le dire par une condition écrite vaut
  // mieux qu'un silence.
  const dispo = typeof OfflineAudioContext !== "undefined";
  const siDispo = dispo ? it : it.skip;
  const modulateur = bruit(SR / 8, 37);
  const porteuse = bruit(SR / 8, 41);
  const n = Math.min(modulateur.length, porteuse.length);
  const applique = async (mix: number | Float32Array) =>
    canal(await vocoder(modulateur, porteuse, 4, 200, 4000, 2, mix));

  siDispo("SANS COURBE, LE SON EST IDENTIQUE AU BIT PRÈS", async () => {
    expect(memes(await applique(60), await applique(tenue(60, n)))).toBe(true);
  });

  siDispo("ET UNE COURBE TENUE À ZÉRO REND LE MODULATEUR, exactement", async () => {
    expect(memes(await applique(tenue(0, n)), modulateur.getChannelData(0))).toBe(true);
  });

  siDispo("et la courbe commande vraiment, ce qu'un port inerte ne ferait pas", async () => {
    expect(ecart(await applique(tenue(0, n)), await applique(tenue(100, n)))).toBeGreaterThan(0.001);
  });
});

describe("la convention de la courbe", () => {
  it("est bien celle du dépôt : des valeurs entre zéro et un", () => {
    // `constante` est ce que produisent les sources ; les bornes du consommateur la mettent en
    // forme. Le rappeler ici évite qu'un effet neuf attende des pour cent sur son port.
    const c = constante(0.25, 1);
    expect(c.valeurs.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
