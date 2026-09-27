// audio/passage-zero.test.ts — La coupe tombe-t-elle là où l'onde ne vaut rien ?
//
// CE QUI SE VÉRIFIE ICI, ET QUE L'OREILLE NE DIRAIT QU'APRÈS COUP. Un clic de montage dure une
// fraction de milliseconde : on l'entend, on ne le localise pas. Les contrôles portent donc sur une
// onde dont on connaît exactement les passages par zéro, et l'on vérifie que la frontière y tombe,
// dans le bon sens, et qu'elle a bougé le moins possible.
//
// LE PIÈGE DE LA MESURE EST ICI LE ZÉRO FACILE. Sur un silence, toute coupe est déjà à zéro et tout
// marche : le témoin employé est une sinusoïde coupée à son sommet, là où la marche est maximale, et
// c'est le résidu avant et après qui juge.
import { describe, expect, it } from "vitest";

import { calerZones, passageLePlusProche, type Zone } from "./passage-zero";

const SR = 48000;

/** Une sinusoïde de `f` hertz : ses passages par zéro sont connus d'avance. */
const sinus = (f: number, secondes = 0.1, sr = SR): Float32Array =>
  Float32Array.from({ length: Math.round(secondes * sr) }, (_, i) => Math.sin((2 * Math.PI * f * i) / sr));

describe("le passage le plus proche", () => {
  const x = sinus(100);
  // À cent hertz et 48 kHz, une période fait 480 échantillons : zéro montant à 0, 480, 960 ;
  // zéro descendant à 240, 720.
  it("SUR UNE SINUSOÏDE, IL TOMBE OÙ L'ON SAIT QU'IL EST", () => {
    expect(passageLePlusProche(x, 470, 100, "montante")).toBe(480);
    expect(passageLePlusProche(x, 490, 100, "montante")).toBe(480);
    expect(passageLePlusProche(x, 250, 100, "descendante")).toBe(240);
  });

  it("LE SENS EST RESPECTÉ : un montant n'est pas rendu pour un descendant", () => {
    // La coupe est demandée à 240, qui EST un zéro, mais descendant. En cherchant un montant on
    // doit aller jusqu'à un vrai montant, et non se contenter de celui qu'on a sous la main.
    // 0 et 480 sont à égale distance : la règle est que l'antérieur l'emporte.
    expect(passageLePlusProche(x, 240, 300, "montante")).toBe(0);
    expect(passageLePlusProche(x, 260, 300, "montante")).toBe(480);
    expect(passageLePlusProche(x, 240, 300, "descendante")).toBe(240);
    expect(passageLePlusProche(x, 240, 300, "indifferente")).toBe(240);
  });

  it("IL BOUGE LE MOINS POSSIBLE, en cherchant des deux côtés", () => {
    // 700 est plus près de 720 que de 240 : c'est 720 qu'il faut, même si 240 est dans le rayon.
    expect(passageLePlusProche(x, 700, 600, "descendante")).toBe(720);
  });

  it("il rend l'échantillon le plus près de zéro, non le premier des deux", () => {
    // Une marche nette : −0,001 puis 0,9. C'est le premier qu'il faut couper.
    const marche = Float32Array.from([-0.5, -0.001, 0.9, 1]);
    expect(passageLePlusProche(marche, 2, 3, "montante")).toBe(1);
  });

  it("HORS DU RAYON, IL NE REND RIEN plutôt que d'aller chercher loin", () => {
    expect(passageLePlusProche(x, 300, 5, "montante")).toBeNull();
    expect(passageLePlusProche(x, 300, 500, "montante")).not.toBeNull();
  });

  it("une onde sans passage ne fait rien inventer", () => {
    const toujoursPositif = Float32Array.from({ length: 100 }, () => 0.5);
    expect(passageLePlusProche(toujoursPositif, 50, 50, "montante")).toBeNull();
  });
});

describe("le calage des zones", () => {
  const x = sinus(100, 0.2);
  const canaux = [x];
  const zone = (debut: number, duree: number): Zone => ({ debut, duree });

  it("LA MARCHE DISPARAÎT : c'est la mesure qui juge, non l'intention", () => {
    // Les deux frontières tombent au sommet de la sinusoïde, là où la marche vaut un.
    const auSommet = zone(120 / SR, 480 / SR);
    const { rapport } = calerZones(canaux, [auSommet], { sampleRate: SR, rayonMs: 5, pente: "montante" });
    expect(rapport.residuAvant).toBeGreaterThan(0.9);
    expect(rapport.residuApres).toBeLessThan(0.02);
  });

  it("LES DEUX FRONTIÈRES SONT CALÉES, pas seulement le début", () => {
    const { zones, rapport } = calerZones(canaux, [zone(0.0025, 0.005)],
      { sampleRate: SR, rayonMs: 5, pente: "montante" });
    expect(rapport.frontieres).toBe(2);
    expect(rapport.calees).toBe(2);
    // Début et fin tombent tous deux sur un multiple de la période, donc sur un zéro montant.
    expect(Math.round(zones[0].debut * SR) % 480).toBe(0);
    expect(Math.round((zones[0].debut + zones[0].duree) * SR) % 480).toBe(0);
  });

  it("TOUT CALER DANS LE MÊME SENS REND N'IMPORTE QUEL RACCORD PROPRE", () => {
    // Trois zones prises n'importe où : après calage, toutes leurs frontières sont des zéros
    // montants, donc la fin de l'une se raccorde à plat au début de n'importe quelle autre.
    const { zones } = calerZones(canaux, [zone(0.001, 0.004), zone(0.007, 0.003), zone(0.012, 0.005)],
      { sampleRate: SR, rayonMs: 5, pente: "montante" });
    for (const z of zones) {
      for (const t of [z.debut, z.debut + z.duree]) {
        const i = Math.round(t * SR);
        expect(Math.abs(x[i]), `à ${i}`).toBeLessThan(0.02);
        // Montant : l'échantillon suivant est au-dessus.
        expect(x[i + 1]).toBeGreaterThan(x[i]);
      }
    }
  });

  it("LE DÉPLACEMENT EST BORNÉ PAR LE RAYON, et le rapport le dit", () => {
    const { rapport } = calerZones(canaux, [zone(0.003, 0.004)],
      { sampleRate: SR, rayonMs: 5, pente: "montante" });
    expect(rapport.deplacementMaxMs).toBeLessThanOrEqual(5);
    expect(rapport.deplacementMoyenMs).toBeLessThanOrEqual(rapport.deplacementMaxMs);
  });

  it("une frontière sans passage dans le rayon reste où elle est, et se compte", () => {
    const plat = [Float32Array.from({ length: 4800 }, () => 0.5)];
    const { zones, rapport } = calerZones(plat, [zone(0.01, 0.02)],
      { sampleRate: SR, rayonMs: 1, pente: "montante" });
    expect(rapport.sansPassage).toBe(2);
    expect(rapport.calees).toBe(0);
    expect(zones[0].debut).toBeCloseTo(0.01, 6);
  });

  it("UNE ZONE RENVERSÉE PAR LE CALAGE EST ÉCARTÉE, non rendue à l'envers", () => {
    // Une zone plus courte que l'écart entre deux zéros : son début peut passer après sa fin.
    const { zones } = calerZones(canaux, [zone(470 / SR, 4 / SR)],
      { sampleRate: SR, rayonMs: 5, pente: "montante" });
    for (const z of zones) expect(z.duree).toBeGreaterThan(0);
  });

  it("EN STÉRÉO, LA RECHERCHE SE FAIT SUR LA SOMME, et le résidu restant est rendu", () => {
    // Deux voies décorrélées : aucun instant n'est zéro sur les deux, et le rapport doit le montrer
    // plutôt que de laisser croire que la coupe est parfaite partout.
    const g = sinus(100, 0.2);
    const d = sinus(137, 0.2);
    const { rapport } = calerZones([g, d], [zone(0.003, 0.004)],
      { sampleRate: SR, rayonMs: 5, pente: "montante" });
    expect(rapport.residuApres).toBeGreaterThan(0);
    expect(rapport.residuApres).toBeLessThan(rapport.residuAvant);
  });

  it("aucune zone ne donne un rapport vide plutôt qu'une erreur", () => {
    const { zones, rapport } = calerZones(canaux, [], { sampleRate: SR, rayonMs: 5, pente: "montante" });
    expect(zones).toEqual([]);
    expect(rapport.frontieres).toBe(0);
    expect(rapport.deplacementMoyenMs).toBe(0);
  });
});
