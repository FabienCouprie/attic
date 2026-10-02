// audio/creneau.test.ts — La place se cherche-t-elle dans le timbre, ou seulement dans le niveau ?
//
// CE QUE CE FICHIER DOIT PROUVER, ET C'EST TOUT LE SUJET. Un détecteur de silence rendrait un
// composant parfaitement utilisable : il poserait le son dans les creux du fond, et l'on trouverait
// cela juste. Mais ce n'est pas l'effet. Le répertoire dit que le créneau opère « sur chaque
// composante du son : intensité, hauteur, timbre, rythme », et un fond qui ne faiblit JAMAIS peut
// laisser toute la place à un son dont il n'occupe pas la bande.
//
// LE CAS QUI TRANCHE EST BÂTI POUR QUE LE NIVEAU NE PUISSE PAS RÉPONDRE : deux moitiés de fond de
// MÊME ÉNERGIE, l'une chargée dans le grave, l'autre dans l'aigu. Un son aigu n'a qu'une place, et
// une recherche qui ne regarderait que le niveau la trouverait une fois sur deux, au hasard du
// tirage.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";

import {
  centresDeBandes, enUneVoie, meilleurCreneau, poserDansLeCreneau, profilDeBandes,
} from "./creneau";

const SR = 8000;

/** Une sinusoïde, en échantillons. */
function sinus(hz: number, n: number, niveau = 0.5, depart = 0): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * hz * ((i + depart) / SR)) * niveau);
}

/** Un son monocanal, à partir d'échantillons. */
function tampon(x: Float32Array): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: x.length, sampleRate: SR });
  b.getChannelData(0).set(x);
  return b;
}

const BASE = { fenetre: 0.05, auPlusTot: 0, parLeTimbre: true };

describe("le profil de bandes", () => {
  it("MET LE POIDS LÀ OÙ LE SON EST, et nulle part ailleurs", () => {
    const centres = centresDeBandes(SR);
    const aigu = profilDeBandes(sinus(2000, SR), SR);
    const grave = profilDeBandes(sinus(100, SR), SR);
    const bandeLaPlusForte = (p: Float32Array) => p.indexOf(Math.max(...Array.from(p)));
    expect(centres[bandeLaPlusForte(aigu)]).toBeGreaterThan(1000);
    expect(centres[bandeLaPlusForte(grave)]).toBeLessThan(200);
  });

  it("ET IL EST NORMALISÉ : un son fort et un son faible de même timbre ont le même profil", () => {
    // Sans cela, la force du son l'emporterait sur sa répartition, et deux sons de même timbre
    // chercheraient leur place à deux endroits différents.
    const fort = profilDeBandes(sinus(800, SR, 0.9), SR);
    const faible = profilDeBandes(sinus(800, SR, 0.05), SR);
    for (let b = 0; b < fort.length; b++) expect(faible[b], `bande ${b}`).toBeCloseTo(fort[b], 5);
    let somme = 0;
    for (const v of fort) somme += v;
    expect(somme).toBeCloseTo(1, 5);
  });
});

describe("la recherche du créneau", () => {
  /**
   * Un fond en deux moitiés de MÊME ÉNERGIE : grave d'abord, aigu ensuite.
   *
   * C'est la pièce maîtresse du fichier. Les deux moitiés ayant la même énergie totale, aucune
   * mesure de niveau ne peut les départager : seule la répartition les distingue.
   */
  function fondDeuxMoities(secondes: number): Float32Array {
    const n = Math.round(secondes * SR);
    const moitie = Math.floor(n / 2);
    const x = new Float32Array(n);
    for (let i = 0; i < moitie; i++) x[i] = Math.sin(2 * Math.PI * 120 * (i / SR)) * 0.5;
    for (let i = moitie; i < n; i++) x[i] = Math.sin(2 * Math.PI * 2400 * (i / SR)) * 0.5;
    return x;
  }

  it("LES DEUX MOITIÉS DU FOND PORTENT LA MÊME ÉNERGIE, sans quoi le cas ne prouverait rien", () => {
    const f = fondDeuxMoities(8);
    const moitie = Math.floor(f.length / 2);
    const rms = (d: number, fin: number) => {
      let s = 0;
      for (let i = d; i < fin; i++) s += f[i] * f[i];
      return Math.sqrt(s / (fin - d));
    };
    expect(rms(0, moitie)).toBeCloseTo(rms(moitie, f.length), 3);
  });

  it("ET LE SON AIGU VA DANS LA MOITIÉ GRAVE, qui est la seule à lui laisser sa bande", () => {
    // LA PREUVE QUI COMPTE. Le fond ne faiblit jamais ; la place existe pourtant, et elle est dans
    // la première moitié, où rien n'occupe l'aigu.
    const fond = fondDeuxMoities(8);
    const son = sinus(2400, Math.round(1.5 * SR));
    const c = meilleurCreneau(fond, son, SR, BASE);
    expect(c.instant).toBeLessThan(2.5);
    expect(c.occupation).toBeLessThan(c.moyenne / 2);
  });

  it("ET LE SON GRAVE VA DANS LA MOITIÉ AIGUË, ce qui est le même cas retourné", () => {
    const fond = fondDeuxMoities(8);
    const son = sinus(120, Math.round(1.5 * SR));
    const c = meilleurCreneau(fond, son, SR, BASE);
    expect(c.instant).toBeGreaterThan(4);
  });

  it("ET SANS LE TIMBRE, LA RECHERCHE NE SAIT PLUS CHOISIR", () => {
    // LE TÉMOIN. Il montre que le cas précédent mesure bien le timbre : la même recherche, privée
    // des poids, pose les deux sons au MÊME endroit, puisqu'elle ne voit plus qu'un niveau constant.
    const fond = fondDeuxMoities(8);
    const aigu = meilleurCreneau(fond, sinus(2400, Math.round(1.5 * SR)), SR, { ...BASE, parLeTimbre: false });
    const grave = meilleurCreneau(fond, sinus(120, Math.round(1.5 * SR)), SR, { ...BASE, parLeTimbre: false });
    expect(aigu.instant).toBe(grave.instant);
  });

  it("ET LE SON TIENT ENTIER DANS LA PLACE TROUVÉE, sans déborder du fond", () => {
    // La recherche glisse le son entier : le dernier départ possible laisse encore sa durée devant.
    const fond = fondDeuxMoities(8);
    const son = sinus(2400, Math.round(3 * SR));
    const c = meilleurCreneau(fond, son, SR, BASE);
    expect(c.instant + 3).toBeLessThanOrEqual(8.01);
  });

  it("ET « AU PLUS TÔT » REPOUSSE LE DÉPART SANS LE CASSER", () => {
    const fond = fondDeuxMoities(8);
    const son = sinus(2400, Math.round(1 * SR));
    expect(meilleurCreneau(fond, son, SR, { ...BASE, auPlusTot: 5 }).instant).toBeGreaterThanOrEqual(5);
  });
});

describe("la pose", () => {
  it("AJOUTE LE SON SANS TOUCHER AU FOND, qui ménage la place au lieu de la céder", () => {
    // Le répertoire décrit une place que le contexte LAISSE : baisser le fond serait un autre geste.
    const fond = tampon(sinus(120, 4 * SR));
    const son = tampon(sinus(2400, SR));
    const out = poserDansLeCreneau(fond, son, 2, 1);
    const f = fond.getChannelData(0);
    const y = out.getChannelData(0);
    for (let i = 0; i < Math.round(1.9 * SR); i += 31) expect(y[i], `avant, ${i}`).toBeCloseTo(f[i], 6);
    // L'écart se mesure sur une TRANCHE et non sur un échantillon : à l'indice choisi d'abord, le
    // fond et le son passaient tous deux par zéro, et la comparaison ne disait rien.
    const ecart = (d: number, fin: number) => {
      let s = 0;
      for (let i = d; i < fin; i++) s += (y[i] - f[i]) ** 2;
      return Math.sqrt(s / (fin - d));
    };
    expect(ecart(2 * SR, 2.5 * SR)).toBeGreaterThan(0.1);
  });

  it("ET LA SORTIE S'ALLONGE SI LE SON DÉPASSE LA FIN DU FOND", () => {
    const fond = tampon(sinus(120, 2 * SR));
    const son = tampon(sinus(2400, 2 * SR));
    expect(poserDansLeCreneau(fond, son, 1.5, 1).length).toBe(Math.round(3.5 * SR));
  });

  it("ET UNE PRISE STÉRÉO GARDE SES DEUX CANAUX", () => {
    const fond = new AudioBuffer({ numberOfChannels: 2, length: 2 * SR, sampleRate: SR });
    fond.getChannelData(0).set(sinus(120, 2 * SR));
    fond.getChannelData(1).set(sinus(140, 2 * SR));
    const out = poserDansLeCreneau(fond, tampon(sinus(2400, SR)), 0.5, 1);
    expect(out.numberOfChannels).toBe(2);
    expect(enUneVoie(out).length).toBe(out.length);
  });
});
