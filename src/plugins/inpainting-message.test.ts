// plugins/inpainting-message.test.ts — Ce que le message de « Remplissage de trou » compte.
//
// LE DÉFAUT, RELEVÉ LE 2026-11-22. Le message divisait par le nombre de canaux ce que chaque canal
// avait bouché : dix millisecondes rebouchées sur un seul canal de deux s'annonçaient « 1 trou(s)
// bouché(s) · 5 ms reconstruits », et deux trous à deux endroits, un par canal, « 1 trou ». Les
// silences se détectent voie par voie, de sorte que le cas n'a rien d'exotique : un décrochage qui
// n'a touché qu'une voie est celui que la détection automatique est faite pour trouver.
//
// LES CAS PASSENT PAR LE NŒUD, `lancerFiche` et le contexte du moteur, parce que c'est le message
// affiché qui était faux, non le calcul d'un canal. Deux témoins tiennent ce qui n'a pas à bouger :
// un trou au même endroit sur les deux canaux, et des zones branchées, qui valent pour tous les canaux.
import { describe, expect, it } from "vitest";
import { lancerFiche } from "../audio/lancer-fiche";
import { traduire } from "../i18n";
import { fiches } from "./inpainting";

const fiche = fiches[0];
const SR = 44100;

/** Une seconde de deux partiels en stéréo ; chaque trou met dix millisecondes à zéro sur ses canaux. */
function son(trous: { debut: number; canaux: number[] }[]): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 2, length: SR, sampleRate: SR });
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < SR; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / SR) + 0.1 * Math.sin(2 * Math.PI * 660 * i / SR + c);
    for (const t of trous) {
      if (!t.canaux.includes(c)) continue;
      const i0 = Math.round(t.debut * SR);
      d.fill(0, i0, i0 + Math.round(0.01 * SR));
    }
  }
  return b;
}

const silences = { Trous: "silences" };

describe("le message de « Remplissage de trou » compte les trous dans le temps", () => {
  it("un trou sur un seul canal de deux s'annonce à sa durée entière", async () => {
    const entree = son([{ debut: 0.5, canaux: [1] }]);
    const r = await lancerFiche(fiche, silences, { entrees: [entree, null] });
    expect(r.message).toBe(traduire("msg.trou.bouches", "1", "10"));
    // Le canal sans trou ressort tel quel, au bit près.
    expect((r.valeurs[0] as AudioBuffer).getChannelData(0)).toEqual(entree.getChannelData(0));
  });

  it("deux trous à deux endroits, un par canal, sont deux trous", async () => {
    const r = await lancerFiche(fiche, silences, {
      entrees: [son([{ debut: 0.3, canaux: [0] }, { debut: 0.6, canaux: [1] }]), null],
    });
    expect(r.message).toBe(traduire("msg.trou.bouches", "2", "20"));
  });

  // DEUX TROUS LAISSÉS ET NON UN : avec un seul, l'ancienne moyenne rendait 1/2, que `Math.round`
  // arrondit à un, et le cas passait sur le code fautif.
  it("deux trous laissés, un par canal, sont deux trous laissés", async () => {
    const r = await lancerFiche(fiche, { ...silences, "Trou max": 5 }, {
      entrees: [son([{ debut: 0.3, canaux: [0] }, { debut: 0.6, canaux: [1] }]), null],
    });
    expect(r.message).toBe(traduire("msg.trou.bouchesEtRenonces", "0", "0", "2"));
  });

  it("témoin : un trou au même endroit sur les deux canaux reste un trou", async () => {
    const r = await lancerFiche(fiche, silences, { entrees: [son([{ debut: 0.5, canaux: [0, 1] }]), null] });
    expect(r.message).toBe(traduire("msg.trou.bouches", "1", "10"));
  });

  it("témoin : des zones branchées valent pour tous les canaux et se comptent une fois chacune", async () => {
    const entree = son([{ debut: 0.3, canaux: [0, 1] }, { debut: 0.6, canaux: [0, 1] }]);
    const r = await lancerFiche(fiche, { Trous: "zones" }, {
      entrees: [entree, [{ debut: 0.3, duree: 0.01 }, { debut: 0.6, duree: 0.01 }]],
    });
    expect(r.message).toBe(traduire("msg.trou.bouches", "2", "20"));
  });
});
