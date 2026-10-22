import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import {
  formaterInstant, formaterMots, formaterTours, fusionnerVoisins, garderIntervalles,
  locuteursDe, tranche, type Mot, type Tour,
} from "./parole-datee";

/** La plus basse cadence que la spécification accepte est 3 000 Hz ; celle-ci laisse de la marge. */
const SR = 4000;

/** Le rang d'échantillon d'un instant, pour que les attentes se lisent en secondes. */
const ech = (secondes: number) => Math.round(secondes * SR);

/** Un son dont chaque échantillon vaut un : ce qui est gardé se reconnaît à l'œil nu. */
function plat(secondes: number, canaux = 1): AudioBuffer {
  const b = new AudioBuffer({
    numberOfChannels: canaux, length: ech(secondes), sampleRate: SR,
  });
  for (let c = 0; c < canaux; c++) b.getChannelData(c).fill(1);
  return b;
}

describe("recoller les intervalles voisins", () => {
  it("joint ceux qui se touchent et laisse les autres", () => {
    const joints = fusionnerVoisins([
      { debut: 0, fin: 1 }, { debut: 1, fin: 2 }, { debut: 3, fin: 4 },
    ]);
    expect(joints).toEqual([{ debut: 0, fin: 2 }, { debut: 3, fin: 4 }]);
  });

  it("joint ceux qui se chevauchent, et garde la fin la plus tardive", () => {
    expect(fusionnerVoisins([{ debut: 0, fin: 3 }, { debut: 1, fin: 2 }]))
      .toEqual([{ debut: 0, fin: 3 }]);
  });

  it("joint jusqu'à l'écart donné, et pas au-delà", () => {
    const serres = [{ debut: 0, fin: 1 }, { debut: 1.2, fin: 2 }];
    expect(fusionnerVoisins(serres, 0.3)).toEqual([{ debut: 0, fin: 2 }]);
    expect(fusionnerVoisins(serres, 0.1)).toHaveLength(2);
  });

  it("jette ce qui n'est pas un intervalle : fin avant début, ou instant non fini", () => {
    expect(fusionnerVoisins([
      { debut: 2, fin: 1 }, { debut: NaN, fin: 1 }, { debut: 0, fin: Infinity },
      { debut: 5, fin: 6 },
    ])).toEqual([{ debut: 5, fin: 6 }]);
  });

  it("remet dans l'ordre ce qui arrive désordonné", () => {
    expect(fusionnerVoisins([{ debut: 3, fin: 4 }, { debut: 0, fin: 1 }]))
      .toEqual([{ debut: 0, fin: 1 }, { debut: 3, fin: 4 }]);
  });
});

describe("garder des intervalles d'un son", () => {
  it("à sa place : la longueur ne change pas, et le reste est exactement tu", () => {
    const sortie = garderIntervalles(plat(1), [{ debut: 0.2, fin: 0.4 }]);
    expect(sortie.length).toBe(ech(1));
    const x = sortie.getChannelData(0);
    expect(x[ech(0.3)]).toBe(1);
    // LE RESTE DOIT ÊTRE EXACTEMENT NUL et non petit : un reste atténué laisserait entendre les
    // autres locuteurs, ce qui est précisément ce qu'on demandait de retirer.
    expect(x[ech(0.1)]).toBe(0);
    expect(x[ech(0.5)]).toBe(0);
  });

  it("collé : la longueur vaut la somme des intervalles", () => {
    const sortie = garderIntervalles(
      plat(1), [{ debut: 0.1, fin: 0.2 }, { debut: 0.5, fin: 0.7 }], { coller: true });
    expect(sortie.length).toBe(ech(0.3));
    const x = sortie.getChannelData(0);
    expect([...x].every((v) => v === 1)).toBe(true);
  });

  it("le fondu descend aux bords du segment et laisse son milieu intact", () => {
    const sortie = garderIntervalles(plat(1), [{ debut: 0.2, fin: 0.4 }], { fonduMs: 20 });
    const x = sortie.getChannelData(0);
    expect(x[ech(0.2)]).toBeLessThan(0.05);
    expect(x[ech(0.4) - 1]).toBeLessThan(0.05);
    expect(x[ech(0.3)]).toBe(1);
  });

  it("DES MOTS QUI SE TOUCHENT NE RECOIVENT QU'UN SEUL FONDU, pas un chacun", () => {
    // LE CAS QUI JUSTIFIE LE RECOLLEMENT. Un aligneur rend des mots contigus : la fin de l'un est
    // le début du suivant. Sans recollement, chaque mot serait fondu à ses deux bords et la parole
    // serait creusée d'un trou par mot — ici quatre trous dans un son continu.
    const mots = [
      { debut: 0.1, fin: 0.2 }, { debut: 0.2, fin: 0.3 },
      { debut: 0.3, fin: 0.4 }, { debut: 0.4, fin: 0.5 },
    ];
    const x = garderIntervalles(plat(1), mots, { fonduMs: 20 }).getChannelData(0);
    // Entre les deux fondus de bord, rien ne doit descendre : un seul segment, deux fondus.
    let creux = 0;
    for (let i = ech(0.13); i < ech(0.47); i++) if (x[i] < 0.999) creux++;
    expect(creux).toBe(0);
  });

  it("la marge élargit chaque intervalle, sans sortir du son", () => {
    const x = garderIntervalles(plat(1), [{ debut: 0.5, fin: 0.6 }], { margeS: 0.05 })
      .getChannelData(0);
    expect(x[ech(0.46)]).toBe(1);
    expect(x[ech(0.64)]).toBe(1);
    expect(x[ech(0.44)]).toBe(0);
    // La marge au bord ne doit pas déborder : un intervalle collé au début reste dans le tampon.
    const bord = garderIntervalles(plat(1), [{ debut: 0, fin: 0.1 }], { margeS: 0.5 });
    expect(bord.length).toBe(ech(1));
  });

  it("tous les canaux sont traités, et aucun ne reste muet", () => {
    const sortie = garderIntervalles(plat(1, 6), [{ debut: 0.2, fin: 0.4 }]);
    expect(sortie.numberOfChannels).toBe(6);
    for (let c = 0; c < 6; c++) expect(sortie.getChannelData(c)[ech(0.3)]).toBe(1);
  });

  it("aucun intervalle gardé rend un échantillon tu, et non un tampon de longueur nulle", () => {
    const sortie = garderIntervalles(plat(1), [], { coller: true });
    expect(sortie.length).toBe(1);
    expect(sortie.getChannelData(0)[0]).toBe(0);
  });

  it("un intervalle qui dépasse la fin du son est tronqué, sans NaN", () => {
    const x = garderIntervalles(plat(0.5), [{ debut: 0.4, fin: 9 }]).getChannelData(0);
    expect([...x].every((v) => Number.isFinite(v))).toBe(true);
    expect(x[ech(0.45)]).toBe(1);
  });
});

describe("dire ce qui a été trouvé", () => {
  const tours: Tour[] = [
    { debut: 0.04, fin: 3.92, locuteur: "S01", texte: "Dans la salle vide" },
    { debut: 7.48, fin: 10.56, locuteur: "S02", texte: "une horloge" },
    { debut: 11.46, fin: 15.34, locuteur: "S01", texte: "marque les secondes" },
  ];

  it("les locuteurs sortent dans l'ordre où ils parlent, une fois chacun", () => {
    expect(locuteursDe(tours)).toEqual(["S01", "S02"]);
  });

  it("un instant s'écrit en minutes, secondes et centièmes", () => {
    expect(formaterInstant(0)).toBe("00:00.00");
    expect(formaterInstant(7.48)).toBe("00:07.48");
    expect(formaterInstant(125.5)).toBe("02:05.50");
  });

  it("chaque tour tient sur une ligne, avec son locuteur et son texte", () => {
    const lignes = formaterTours(tours).split("\n");
    expect(lignes).toHaveLength(3);
    expect(lignes[1]).toContain("00:07.48");
    expect(lignes[1]).toContain("S02");
    expect(lignes[1]).toContain("une horloge");
  });

  it("chaque mot porte son rang, pour que la tranche se désigne", () => {
    const mots: Mot[] = [
      { debut: 0.08, fin: 0.24, mot: "Le" }, { debut: 0.24, fin: 0.4, mot: "chat" },
    ];
    const lignes = formaterMots(mots).split("\n");
    expect(lignes[0]).toContain("1");
    expect(lignes[1]).toContain("2");
    expect(lignes[1]).toContain("chat");
  });
});

describe("la tranche demandée", () => {
  const dix = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("du troisième au cinquième, bornes comprises", () => {
    expect(tranche(dix, 3, 5)).toEqual([3, 4, 5]);
  });

  it("zéro à la fin veut dire jusqu'au dernier", () => {
    expect(tranche(dix, 8, 0)).toEqual([8, 9, 10]);
  });

  it("une fin au-delà du dernier s'arrête au dernier", () => {
    expect(tranche(dix, 9, 99)).toEqual([9, 10]);
  });

  it("un début au-delà du dernier rend une tranche VIDE, et non tout", () => {
    // Un appelant doit pouvoir dire « ce mot n'existe pas » ; rendre le son entier le ferait
    // passer pour un succès.
    expect(tranche(dix, 11, 0)).toEqual([]);
    expect(tranche(dix, 5, 2)).toEqual([]);
  });
});
