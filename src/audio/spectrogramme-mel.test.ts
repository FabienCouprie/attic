// audio/spectrogramme-mel.test.ts — L'aller-retour son ⇄ image, et ce qu'il coûte en fidélité.
//
// CE QUE CES CAS TIENNENT. Deux composants se font face : l'un écrit une image, l'autre la relit.
// Rien ne garantit qu'ils se parlent, sauf de les faire se parler. Les cas vont donc du plus petit
// au plus grand : l'échelle, la banque, l'orientation de l'image, puis l'aller-retour complet
// mesuré en convergence spectrale.
//
// LES CHIFFRES ÉCRITS ICI SONT DES CHIFFRES RELEVÉS, et non des seuils choisis au confort. Chacun a
// été mesuré avant d'être écrit, et la marge est dite quand il y en a une.
import { describe, expect, it } from "vitest";

import {
  PARAMETRES_RIFFUSION, bancMel, bandesVides, casesDe, hzVersMel, melVersHz, tailleTransformee,
  type ParametresMel,
} from "./mel";
import {
  aplatirCanal, melDepuisSignal, reflechir, signalDepuisMel, synthetiserVoie, tramesDe,
} from "./spectrogramme-mel";
import { imageDepuisMel, melDepuisImage } from "./spectrogramme-pixels";
import { convergenceSpectrale } from "./pghi";
import { creerAleatoire } from "../core/hasard";

/** Un paramétrage plus petit que celui de Riffusion, pour que les cas tournent en une seconde. */
const PETIT: ParametresMel = { ...PARAMETRES_RIFFUSION, echantillonnage: 16000, fenetreMs: 32, bourrageMs: 64, bandes: 64, fMax: 8000 };

function sinus(frequence: number, duree: number, sr: number, amplitude = 0.5): Float32Array {
  const x = new Float32Array(Math.round(duree * sr));
  for (let i = 0; i < x.length; i++) x[i] = amplitude * Math.sin((2 * Math.PI * frequence * i) / sr);
  return x;
}

/** La bande la plus forte, toutes trames confondues. */
function bandeDominante(mel: readonly Float32Array[]): number {
  const somme = new Float64Array(mel[0].length);
  for (const t of mel) for (let m = 0; m < t.length; m++) somme[m] += t[m];
  let arg = 0;
  for (let m = 1; m < somme.length; m++) if (somme[m] > somme[arg]) arg = m;
  return arg;
}

/** La fréquence au centre d'une bande, telle que la banque la place. */
function centreDeBande(p: ParametresMel, m: number): number {
  const mMin = hzVersMel(p.fMin), mMax = hzVersMel(Math.min(p.fMax, p.echantillonnage / 2));
  return melVersHz(mMin + ((mMax - mMin) * (m + 1)) / (p.bandes + 1));
}

describe("l'échelle des mels", () => {
  it("se renverse exactement", () => {
    for (const hz of [0, 20, 100, 440, 1000, 5000, 10000, 20000]) {
      expect(melVersHz(hzVersMel(hz))).toBeCloseTo(hz, 6);
    }
  });

  it("est bien celle de HTK : mille hertz tombent à mille mels", () => {
    // La coïncidence est la définition de la formule : 2595·log10(1 + 1000/700) vaut 1000,0.
    expect(hzVersMel(1000)).toBeCloseTo(1000, 0);
    // Celle de Slaney y mettrait 15 mels, son découpage valant 200/3 hertz par mel sous mille.
    expect(hzVersMel(1000)).toBeGreaterThan(100);
  });

  it("ET CE N'EST PAS CELLE DE SLANEY, qui est DROITE sous mille hertz", () => {
    // LE CAS QUI SÉPARE LES DEUX, et la notice l'annonce désormais. Sous mille hertz, l'échelle de
    // Slaney est une droite : deux intervalles de deux cents hertz y occupent la même hauteur, donc
    // leur rapport vaut un. Celle de HTK est un logarithme partout, et le grave y est plus étalé.
    const ecart = (a: number, b: number) => hzVersMel(b) - hzVersMel(a);
    const rapport = ecart(200, 400) / ecart(600, 800);
    // Relevé : 1,4023. Une échelle de Slaney rendrait exactement 1.
    expect(rapport).toBeCloseTo(1.4023, 4);
  });

  it("ET LES TRIANGLES NE SONT PAS NORMALISÉS EN AIRE, l'autre sens du mot « slaney »", () => {
    // `norm=None` de la référence. Avec la normalisation de Slaney, chaque filtre serait divisé par
    // sa largeur, et les bandes aiguës, plus larges, en sortiraient affaiblies d'autant. Ici le
    // sommet de chaque triangle vaut un, quelle que soit sa largeur.
    const banque = bancMel(PARAMETRES_RIFFUSION, tailleTransformee(PARAMETRES_RIFFUSION));
    for (const m of [100, 300, 500]) {
      let sommet = 0;
      for (const p of banque[m].poids) sommet = Math.max(sommet, p);
      expect(sommet).toBeGreaterThan(0.5);
      expect(sommet).toBeLessThanOrEqual(1);
    }
  });
});

describe("la taille de la transformée", () => {
  it("arrondit le bourrage de Riffusion à 16 384, et dit sa grille", () => {
    // 400 ms à 44,1 kHz demandent 17 640 points ; la puissance de deux la plus proche est 16 384.
    expect(tailleTransformee(PARAMETRES_RIFFUSION)).toBe(16384);
    const grille = PARAMETRES_RIFFUSION.echantillonnage / 16384;
    expect(grille).toBeCloseTo(2.69, 2);
    // Celle de la référence : 2,50 Hz. L'écart est de sept pour cent.
    expect(Math.abs(grille - 44100 / 17640) / (44100 / 17640)).toBeLessThan(0.08);
  });

  it("NE DESCEND JAMAIS SOUS LA FENÊTRE, sans quoi la trame serait tronquée", () => {
    // Bourrage plus court que la fenêtre : la demande est absurde, la taille doit tenir quand même.
    const serre: ParametresMel = { ...PARAMETRES_RIFFUSION, fenetreMs: 100, bourrageMs: 10 };
    expect(tailleTransformee(serre)).toBeGreaterThanOrEqual(Math.round(0.1 * 44100));
  });
});

describe("la banque de filtres", () => {
  it("rend une bande par bande demandée, et garde ses poids creux", () => {
    const taille = tailleTransformee(PARAMETRES_RIFFUSION);
    const banque = bancMel(PARAMETRES_RIFFUSION, taille);
    expect(banque.length).toBe(512);
    const poids = banque.reduce((n, b) => n + b.poids.length, 0);
    // Creux par construction : deux fois les cases au plus, contre 512 × 8193 pour une matrice pleine.
    expect(poids).toBeLessThan(3 * casesDe(taille));
  });

  it("LAISSE DES BANDES VIDES EN BAS, et c'est une propriété du paramétrage, non un défaut", () => {
    // Cinq cent douze bandes depuis zéro hertz donnent des triangles plus étroits qu'une case :
    // relevé, aucune ne reste vide à 16 384 points, mais une grille deux fois plus grossière en
    // viderait. Le cas tient le relevé dans les deux sens pour que le jour où il change se voie.
    expect(bandesVides(bancMel(PARAMETRES_RIFFUSION, 16384))).toBe(0);
    expect(bandesVides(bancMel(PARAMETRES_RIFFUSION, 2048))).toBeGreaterThan(0);
  });
});

describe("le bordage par réflexion", () => {
  it("ne répète pas l'échantillon du bord", () => {
    const x = Float32Array.from([1, 2, 3, 4]);
    const borde = reflechir(x, 2);
    expect([...borde]).toEqual([3, 2, 1, 2, 3, 4, 3, 2]);
  });

  it("supporte un signal d'un seul échantillon", () => {
    expect([...reflechir(Float32Array.from([7]), 2)]).toEqual([7, 7, 7, 7, 7]);
  });
});

describe("l'analyse en mels", () => {
  it("place un sinus dans la bande dont le centre porte sa fréquence", () => {
    const mel = melDepuisSignal(sinus(1000, 0.4, PETIT.echantillonnage), PETIT);
    const centre = centreDeBande(PETIT, bandeDominante(mel));
    // Une bande de large est la précision que l'échelle permet à cette hauteur.
    expect(Math.abs(centre - 1000)).toBeLessThan(120);
  });

  it("rend une trame de plus que la division du signal par le saut", () => {
    const x = sinus(440, 1, PETIT.echantillonnage);
    const mel = melDepuisSignal(x, PETIT);
    expect(mel.length).toBe(tramesDe(x.length, PETIT));
    expect(mel[0].length).toBe(PETIT.bandes);
  });
});

describe("la convention d'image", () => {
  it("MET LE GRAVE EN BAS, et le fort en sombre", () => {
    const mel = melDepuisSignal(sinus(200, 0.3, PETIT.echantillonnage), PETIT);
    const image = imageDepuisMel([mel], 0.25);
    const moyenne = (debut: number, fin: number) => {
      let somme = 0, n = 0;
      for (let y = debut; y < fin; y++) {
        for (let x = 0; x < image.largeur; x++) { somme += image.rgba[(y * image.largeur + x) * 4]; n++; }
      }
      return somme / n;
    };
    const haut = moyenne(0, Math.floor(image.hauteur / 4));
    const bas = moyenne(Math.floor((3 * image.hauteur) / 4), image.hauteur);
    // Deux cents hertz est dans le quart bas de l'échelle : c'est là que l'image doit être sombre.
    expect(bas).toBeLessThan(haut);
  });

  it("se relit à la quantification près", () => {
    const mel = melDepuisSignal(sinus(1000, 0.3, PETIT.echantillonnage), PETIT);
    const image = imageDepuisMel([mel], 0.25);
    const relu = melDepuisImage(
      { width: image.largeur, height: image.hauteur, data: image.rgba }, 0.25, false,
    );
    expect(bandeDominante(relu[0])).toBe(bandeDominante(mel));
    // Les deux spectrogrammes ne partagent pas leur échelle : on compare leurs formes.
    const forme = (m: readonly Float32Array[]) => {
      const t = m[Math.floor(m.length / 2)];
      let max = 0;
      for (let i = 0; i < t.length; i++) max = Math.max(max, t[i]);
      return Array.from(t, (v) => v / (max || 1));
    };
    const a = forme(mel), b = forme(relu[0]);
    let ecart = 0;
    for (let i = 0; i < a.length; i++) ecart = Math.max(ecart, Math.abs(a[i] - b[i]));
    // Relevé : l'écart maximal tient sous deux centièmes, ce que 256 niveaux et la racine
    // quatrième permettent.
    expect(ecart).toBeLessThan(0.02);
  });

  it("garde les deux canaux séparés, le rouge marquant la stéréo", () => {
    const gauche = melDepuisSignal(sinus(300, 0.3, PETIT.echantillonnage), PETIT);
    const droite = melDepuisSignal(sinus(3000, 0.3, PETIT.echantillonnage), PETIT);
    const image = imageDepuisMel([gauche, droite], 0.25);
    for (let i = 0; i < image.rgba.length; i += 4) expect(image.rgba[i]).toBe(0);
    const relu = melDepuisImage(
      { width: image.largeur, height: image.hauteur, data: image.rgba }, 0.25, true,
    );
    expect(bandeDominante(relu[0])).toBe(bandeDominante(gauche));
    expect(bandeDominante(relu[1])).toBe(bandeDominante(droite));
  });
});

describe("l'aller-retour complet", () => {
  it("REND UN SON DONT LE SPECTROGRAMME EST CELUI DE DÉPART, et la mesure le dit", () => {
    const x = sinus(440, 0.5, PETIT.echantillonnage);
    const mel = melDepuisSignal(x, PETIT);
    const y = signalDepuisMel(mel, PETIT, x.length, 24, creerAleatoire(1));
    const convergence = convergenceSpectrale(mel, melDepuisSignal(y, PETIT));
    // RELEVÉ, ET NON CHOISI : −10,85 dB en vingt-quatre tours sur ce paramétrage réduit. Le seuil
    // est posé une marge en dessous. Sur le paramétrage de Riffusion et un signal mêlé, le même
    // calcul donne −10,91 dB en quatre tours et −14,56 en trente-deux.
    //
    // Comparer les signaux échantillon par échantillon n'aurait pas de sens : la phase n'est pas
    // dans l'image, et deux sons de phases différentes s'entendent pareil.
    expect(convergence).toBeLessThan(-9);
  });

  it("LES TOURS DE GRIFFIN-LIM SERVENT, mesuré contre la phase tirée au sort", () => {
    const x = sinus(440, 0.3, PETIT.echantillonnage);
    const mel = melDepuisSignal(x, PETIT);
    const sans = convergenceSpectrale(mel, melDepuisSignal(signalDepuisMel(mel, PETIT, x.length, 0, creerAleatoire(2)), PETIT));
    const avec = convergenceSpectrale(mel, melDepuisSignal(signalDepuisMel(mel, PETIT, x.length, 24, creerAleatoire(2)), PETIT));
    expect(avec).toBeLessThan(sans - 3);
  });

  it("LE CHEMIN DU WORKER REND EXACTEMENT LE MÊME SON que le chemin direct", () => {
    // CE QUE CE CAS GARDE. Le calcul part dans un worker, qui ne reçoit que ce qui se sérialise :
    // le spectrogramme y voyage APLATI, une trame après l'autre, et la graine y voyage en nombre
    // plutôt qu'en générateur. Si le dépliage se trompait d'une trame, le son rendu changerait sans
    // que rien ne le dise, et seul ce cas le verrait.
    const x = sinus(440, 0.3, PETIT.echantillonnage);
    const mel = melDepuisSignal(x, PETIT);
    const direct = signalDepuisMel(mel, PETIT, x.length, 4, creerAleatoire(5));
    const parWorker = synthetiserVoie(aplatirCanal(mel), {
      parametres: PETIT, bandes: PETIT.bandes, longueur: x.length, iterations: 4, graine: 5,
    }).signal;
    expect([...parWorker]).toEqual([...direct]);
  });

  it("ET LA GRAINE SE DÉCALE DU NUMÉRO DE CANAL, sinon une stéréo se resserrerait au milieu", () => {
    const x = sinus(440, 0.2, PETIT.echantillonnage);
    const o = { parametres: PETIT, bandes: PETIT.bandes, longueur: x.length, iterations: 2, graine: 5 };
    const plat = aplatirCanal(melDepuisSignal(x, PETIT));
    const gauche = synthetiserVoie(plat, o, 0).signal;
    const droite = synthetiserVoie(plat, o, 1).signal;
    expect([...gauche]).not.toEqual([...droite]);
  });

  it("rend exactement la longueur demandée, et du silence sur du silence", () => {
    const n = 4000;
    const mel = melDepuisSignal(new Float32Array(n), PETIT);
    const y = signalDepuisMel(mel, PETIT, n, 4, creerAleatoire(3));
    expect(y.length).toBe(n);
    let pic = 0;
    for (let i = 0; i < y.length; i++) pic = Math.max(pic, Math.abs(y[i]));
    expect(pic).toBeLessThan(1e-6);
  });
});
