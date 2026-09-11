// @vitest-environment jsdom
//
// plugins/reinserer-zone.test.ts — Deux défauts trouvés sur signalement, et de
// natures opposées.
//
// Le premier était bruyant et trompeur : le nœud refusait une liste de zones et
// répondait « Zone non connectée » alors que l'arête était bien là. Le port
// « Zone » et la sortie « Zones » du sélecteur multi-zones ont le même type de
// flux `controle`, donc l'interface autorise la connexion — seule la forme de
// la charge différait.
//
// Le second était muet : le nœud divisait le fondu par 1000 avant de le passer
// à `reinsererZone`, qui attend des millisecondes et divise à nouveau. Un
// réglage de 15 ms valait 0,015 ms, ramené à 1 échantillon par le garde-fou de
// la fonction. On ne le voyait pas, on l'entendait — un clic à la jointure.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

const SR = 44100;

function ctx(entrees: unknown[], params: Record<string, number> = {}) {
  return {
    entree: (i: number) => entrees[i] ?? null,
    entrees: () => entrees,
    paramTexte: (_n: string, d: string) => d,
    paramNombre: (n: string, d: number) => (n in params ? params[n] : d),
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
    repertoireTravail: "",
  };
}

/** Signal constant : toute variation dans le résultat vient du montage. */
function constante(valeur: number, dureeS: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(dureeS * SR), sampleRate: SR });
  b.getChannelData(0).fill(valeur);
  return b;
}

async function reinserer(entrees: unknown[], params: Record<string, number> = {}) {
  const f = registre.trouverDef("reinserer-zone")!;
  const r = await f.executer(ctx(entrees, params) as any);
  return { buffer: r.valeurs[0] as AudioBuffer | null, message: r.message ?? "" };
}

const PISTE = () => constante(1, 2);
const TRAITEE = () => constante(-1, 0.5);

describe("réinsérer une zone — forme de l'entrée Zone", () => {
  it("accepte un objet zone unique", async () => {
    const r = await reinserer([PISTE(), TRAITEE(), { debut: 0.5, duree: 0.5 }]);
    expect(r.buffer).toBeInstanceOf(AudioBuffer);
  });

  it("accepte une LISTE de zones — ce que produit le sélecteur multi-zones", async () => {
    // Le cas signalé. Avant correction : « Zone non connectée » alors que
    // l'arête existait et que le sélecteur avait terminé.
    const r = await reinserer([PISTE(), TRAITEE(), [{ debut: 0.5, duree: 0.5 }]]);
    expect(r.buffer).toBeInstanceOf(AudioBuffer);
  });

  it("avec plusieurs zones, retient la première ET le dit", async () => {
    // Choisir en silence serait pire que refuser : le nœud réinsère UN tampon
    // à UNE position, l'utilisateur doit savoir laquelle a servi.
    const r = await reinserer([PISTE(), TRAITEE(), [{ debut: 0.5, duree: 0.5 }, { debut: 1.2, duree: 0.3 }]]);
    expect(r.buffer).toBeInstanceOf(AudioBuffer);
    expect(r.message).toContain("0.50");
    expect(r.message).toMatch(/2 zones/);
  });

  it("ignore les entrées mal formées d'une liste", async () => {
    const r = await reinserer([PISTE(), TRAITEE(), [null, { debut: "x" }, { debut: 0.5, duree: 0.5 }]]);
    expect(r.buffer).toBeInstanceOf(AudioBuffer);
    expect(r.message).toContain("0.50");
  });
});

describe("réinsérer une zone — messages d'échec", () => {
  it("distingue « non connectée » de « inexploitable »", async () => {
    // C'est cette confusion qui a fait chercher un défaut de câblage là où le
    // câblage était bon.
    const absente = await reinserer([PISTE(), TRAITEE(), null]);
    expect(absente.buffer).toBeNull();
    expect(absente.message).toMatch(/non connectée/i);

    const inexploitable = await reinserer([PISTE(), TRAITEE(), []]);
    expect(inexploitable.buffer).toBeNull();
    expect(inexploitable.message).toMatch(/inexploitable/i);
    expect(inexploitable.message).not.toMatch(/non connectée/i);
  });

  it("ne confond plus la piste et la zone traitée manquantes", async () => {
    const sansPiste = await reinserer([null, TRAITEE(), { debut: 0, duree: 0.5 }]);
    expect(sansPiste.message).toMatch(/piste/i);
    const sansTraitee = await reinserer([PISTE(), null, { debut: 0, duree: 0.5 }]);
    expect(sansTraitee.message).toMatch(/traitée/i);
  });
});

describe("réinsérer une zone — durée du fondu", () => {
  /**
   * NOMBRE d'échantillons en transition entre piste (+1) et zone (−1).
   *
   * On COMPTE, on ne mesure pas l'écart entre le premier et le dernier : la
   * zone a deux bords, un fondu entrant et un fondu sortant, séparés par sa
   * durée entière. Mesurer l'écart rendait donc la longueur de la ZONE (22 050
   * échantillons ici) quel que soit le fondu — une première version de ce test
   * s'y est laissé prendre et passait le contrôle absolu tout en étant aveugle
   * au défaut. Le compte vaut deux fois la longueur d'un fondu.
   */
  function echantillonsEnTransition(b: AudioBuffer): number {
    const d = b.getChannelData(0);
    let n = 0;
    for (let i = 0; i < d.length; i++) if (Math.abs(Math.abs(d[i]) - 1) > 1e-6) n++;
    return n;
  }

  it("un fondu de 50 ms dure bien ~50 ms, et non 1 échantillon", async () => {
    // Le défaut muet : la double division par 1000 ramenait tout fondu à
    // 1 échantillon, quel que soit le réglage — soit 2 échantillons comptés.
    const r = await reinserer([PISTE(), TRAITEE(), { debut: 0.5, duree: 0.5 }], { Fondu: 50 });
    const parFondu = 0.05 * SR;                      // 2205 échantillons
    const mesure = echantillonsEnTransition(r.buffer!);
    expect(mesure).toBeGreaterThan(parFondu * 1.5);  // les deux bords
    expect(mesure).toBeLessThan(parFondu * 2.5);
  });

  it("doubler le réglage double la transition", async () => {
    // Le contrôle qui tient même si la forme de la courbe change : c'est la
    // PROPORTIONNALITÉ au réglage qui était perdue, pas une valeur absolue.
    const court = await reinserer([PISTE(), TRAITEE(), { debut: 0.5, duree: 0.5 }], { Fondu: 20 });
    const long = await reinserer([PISTE(), TRAITEE(), { debut: 0.5, duree: 0.5 }], { Fondu: 40 });
    const rapport = echantillonsEnTransition(long.buffer!) / echantillonsEnTransition(court.buffer!);
    expect(rapport).toBeGreaterThan(1.7);
    expect(rapport).toBeLessThan(2.3);
  });
});
