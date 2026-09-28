// audio/lecture-vive.test.ts — Ce qui sonne, ce qui se reprend, et où en est la tête.
//
// CE QUE CES CAS ATTRAPENT. Le rognage d'un début négatif, d'abord : confondu avec une reprise en
// cours de lecture, il ferait entendre le son entier là où le rendu en ôte le commencement, et l'on
// placerait la piste au son d'un mensonge. Puis la distinction du niveau : si un changement de gain
// passait par une reprogrammation, tout le montage hoquetterait à chaque réglage, ce qui est
// précisément le défaut qu'on répare.
import { describe, expect, it } from "vitest";
import {
  departDeLecture, differencePistes, finDeMontage, positionVive, segmentSonnant, suiteAuChangement,
  type EtatPiste,
} from "./lecture-vive";

const etat = (r: Partial<EtatPiste> = {}): EtatPiste => ({
  son: "a", debutSec: 0, dureeSec: 4, gainDb: 0, fonduEntreeSec: 0.01, fonduSortieSec: 0.01, ...r,
});

describe("le segment sonnant", () => {
  it("d'une piste posee apres zero est la piste entiere", () => {
    expect(segmentSonnant({ debutSec: 2, dureeSec: 5 })).toEqual({ debutSec: 2, dureeSec: 5, rogneSec: 0 });
  });

  it("d'un debut negatif commence a zero, rogne d'autant", () => {
    // LE CAS QUI COMPTE : la piste commence une seconde et demie avant zéro, donc elle sonne à zéro,
    // il lui reste deux secondes et demie, et le son est entamé à une seconde et demie.
    expect(segmentSonnant({ debutSec: -1.5, dureeSec: 4 })).toEqual({
      debutSec: 0, dureeSec: 2.5, rogneSec: 1.5,
    });
  });

  it("est nul quand la piste est entierement avant zero", () => {
    expect(segmentSonnant({ debutSec: -5, dureeSec: 4 })).toBeNull();
    expect(segmentSonnant({ debutSec: -4, dureeSec: 4 })).toBeNull();
  });

  it("est nul quand la piste ne dure rien", () => {
    expect(segmentSonnant({ debutSec: 1, dureeSec: 0 })).toBeNull();
  });
});

describe("la suite a donner a un changement", () => {
  it("est rien quand rien n'a bouge", () => {
    expect(suiteAuChangement(etat(), etat())).toBe("rien");
  });

  it("est le niveau quand seul le gain a bouge", () => {
    // C'EST CE CAS QUI REND LE RÉGLAGE UTILISABLE : un gain se pose sans interrompre la source.
    expect(suiteAuChangement(etat(), etat({ gainDb: -6 }))).toBe("niveau");
  });

  it("est une reprogrammation pour un debut, une duree, un fondu", () => {
    expect(suiteAuChangement(etat(), etat({ debutSec: 1 }))).toBe("reprogrammer");
    expect(suiteAuChangement(etat(), etat({ dureeSec: 3 }))).toBe("reprogrammer");
    expect(suiteAuChangement(etat(), etat({ fonduEntreeSec: 0.5 }))).toBe("reprogrammer");
    expect(suiteAuChangement(etat(), etat({ fonduSortieSec: 0.5 }))).toBe("reprogrammer");
  });

  it("est une reprogrammation quand le son lui-meme a change", () => {
    // Une piste rebranchée sur un autre générateur : le gain seul serait posé sur l'ancien son.
    expect(suiteAuChangement(etat(), etat({ son: "b" }))).toBe("reprogrammer");
  });

  it("prefere la reprogrammation quand le gain a bouge lui aussi", () => {
    expect(suiteAuChangement(etat(), etat({ debutSec: 1, gainDb: -6 }))).toBe("reprogrammer");
  });
});

describe("la difference entre deux etats", () => {
  const carte = (e: Record<number, EtatPiste>) => new Map(Object.entries(e).map(([k, v]) => [Number(k), v]));

  it("ne touche que ce qui a bouge", () => {
    const avant = carte({ 0: etat(), 1: etat({ son: "b" }), 2: etat({ son: "c" }) });
    const apres = carte({ 0: etat(), 1: etat({ son: "b", gainDb: -3 }), 3: etat({ son: "d" }) });
    expect(differencePistes(avant, apres)).toEqual({
      aDemarrer: [3], aArreter: [2], aReprogrammer: [], aRegler: [1],
    });
  });

  it("ne demande rien quand rien n'a bouge", () => {
    // LE CAS QUI PROTÈGE L'ÉCOUTE : une relance du nœud qui redonne les mêmes tampons ne doit pas
    // couper le son. C'est l'identité des sons et l'égalité des réglages qui le décident.
    const a = etat(), b = etat({ son: "b", debutSec: 3 });
    const d = differencePistes(carte({ 0: a, 1: b }), carte({ 0: { ...a }, 1: { ...b } }));
    expect(d).toEqual({ aDemarrer: [], aArreter: [], aReprogrammer: [], aRegler: [] });
  });

  it("demarre tout au premier etat, et arrete tout au dernier", () => {
    const deux = carte({ 0: etat(), 1: etat({ son: "b" }) });
    expect(differencePistes(new Map(), deux).aDemarrer).toEqual([0, 1]);
    expect(differencePistes(deux, new Map()).aArreter).toEqual([0, 1]);
  });
});

describe("la fin du montage", () => {
  it("est celle de la derniere piste qui sonne", () => {
    expect(finDeMontage([
      { debutSec: 0, dureeSec: 4, gainDb: 0, fonduEntreeSec: 0, fonduSortieSec: 0 },
      { debutSec: 10, dureeSec: 2.5, gainDb: 0, fonduEntreeSec: 0, fonduSortieSec: 0 },
    ])).toBe(12.5);
  });

  it("compte une piste rognee sur ce qu'il lui reste", () => {
    expect(finDeMontage([
      { debutSec: -1, dureeSec: 4, gainDb: 0, fonduEntreeSec: 0, fonduSortieSec: 0 },
    ])).toBe(3);
  });

  it("est nulle sans piste", () => {
    expect(finDeMontage([])).toBe(0);
  });
});

describe("la tete de lecture", () => {
  it("avance comme l'horloge du contexte, depuis l'instant vise", () => {
    expect(positionVive({ t0: 5, auCtx: 100 }, 102.5)).toBe(7.5);
  });

  it("ne recule pas avant son depart", () => {
    // Une lecture programmée un peu en avant : l'horloge n'y est pas encore, et la tête attend.
    expect(positionVive({ t0: 5, auCtx: 100.02 }, 100)).toBe(5);
  });

  it("ne passe pas la fin du montage", () => {
    // CE QUE CE CAS ATTRAPE : l'horloge du contexte ne s'arrête jamais, et ce qui arrête la lecture
    // est un minuteur qui a sa marge. Sans la borne, le temps affiché dépassait le dernier son.
    expect(positionVive({ t0: 0, auCtx: 100 }, 108, 7)).toBe(7);
    expect(positionVive({ t0: 0, auCtx: 100 }, 103, 7)).toBe(3);
  });
});

describe("le depart d'une lecture", () => {
  it("est l'instant demande quand il tombe dans le montage", () => {
    expect(departDeLecture(3, 7)).toBe(3);
  });

  it("repart du debut quand la tete est a la fin ou au-dela", () => {
    // LE DÉFAUT RELEVÉ PAR FABIEN : « joue une fois puis reviens à 0, le temps ne cesse de croître
    // après un premier jeu ». Une lecture lancée passé le dernier son n'a rien à jouer, donc rien
    // qui l'arrête, et le temps grandissait sans fin.
    expect(departDeLecture(7, 7)).toBe(0);
    expect(departDeLecture(12, 7)).toBe(0);
  });

  it("ne va pas avant zero", () => {
    expect(departDeLecture(-2, 7)).toBe(0);
  });

  it("repart du debut quand il n'y a rien a jouer", () => {
    expect(departDeLecture(0, 0)).toBe(0);
  });
});
