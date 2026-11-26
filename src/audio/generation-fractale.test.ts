// audio/generation-fractale.test.ts — Le timbre de la musique fractale, et sa quatrième forme.
//
// CE MOTEUR EST LE SECOND, ET IL N'ÉTAIT PAS MESURÉ. `koch.test.ts` tient le timbre de
// `rendreSequence`, qui sert l'arpège de Koch et le mappeur de Mandelbrot ; la musique fractale,
// elle, monte son propre contexte hors ligne et associe à chaque caractère un type d'oscillateur.
// Le réglage « Timbre » n'y avait donc aucun garde, dans aucune de ses valeurs.
//
// ET LE SINUS N'Y ÉTAIT PAS OFFERT, par une borne qui n'était pas celle qu'on croyait. Le réglage
// n'offrait que trois caractères, avec sa raison écrite à côté : le moteur n'avait pas de branche
// pour une sinusoïde. C'était vrai de la table des formes, qui en déclarait trois ; ce n'était pas
// vrai de l'oscillateur, dont l'API porte le type « sine » depuis toujours. La borne tenait à une
// ligne manquante, et non à une limite du rendu.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { genererMusiqueFractale } from "./generation-fractale";
import { CARACTERES_CHOIX } from "./timbres";
import { degresDeGamme } from "./gammes";
import { GAMMES_MELODIE_IDS } from "./generation-melodie";

// Court, et à profondeur deux : le dépliage est exponentiel, et ce qui est mesuré ici est la forme
// d'onde d'une note, non la structure du motif. Neuf doubles croches à 120 BPM, sous une durée
// maximale qui les laisse toutes.
const rendre = (timbre: string) =>
  genererMusiqueFractale("Triade M", "0,3,7,10", 2, 60, 120, 0.25, "Do", "Majeur", timbre);

const crete = (x: Float32Array) => {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m;
};

const ecart = (a: Float32Array, b: Float32Array) => {
  let e = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) e = Math.max(e, Math.abs(a[i] - b[i]));
  return e;
};

describe("le timbre de la musique fractale", () => {
  it("CHAQUE CARACTÈRE OFFERT DONNE UN SON DIFFÉRENT DES AUTRES, les quatre", async () => {
    // LA LISTE VIENT DE LA TABLE, et non d'une énumération écrite ici : un caractère ajouté là
    // arrive dans ce cas sans que personne y pense, et doit alors se distinguer comme les autres.
    const rendus = new Map<string, Float32Array>();
    for (const id of CARACTERES_CHOIX.ids) {
      const { audio } = await rendre(id);
      const canal = audio.getChannelData(0);
      expect(crete(canal), `« ${id} » ne rend pas de son`).toBeGreaterThan(0.01);
      rendus.set(id, Float32Array.from(canal));
    }
    const ids = [...rendus.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(ecart(rendus.get(ids[i])!, rendus.get(ids[j])!), `« ${ids[i]} » et « ${ids[j]} » rendent le même son`)
          .toBeGreaterThan(0.05);
      }
    }
  });

  it("ET LE SINUS EST ATTEIGNABLE SOUS SES TROIS ÉCRITURES, sans retomber sur « douce »", async () => {
    // LE REPLI SILENCIEUX ÉTAIT LE DÉFAUT À ARRÊTER. Le moteur lisait son réglage par une fonction
    // dont le type de retour excluait le sinus : la valeur tombait sur « douce » sans que rien ne le
    // dise, et le réglage aurait été offert sans effet.
    const douce = Float32Array.from((await rendre("douce")).audio.getChannelData(0));
    for (const ecriture of ["pur", "Sinus", "Sine"]) {
      const sinus = (await rendre(ecriture)).audio.getChannelData(0);
      expect(ecart(sinus, douce), `« ${ecriture} » rend le même son que « douce »`).toBeGreaterThan(0.05);
    }
    // Et les trois écritures sont bien le même son.
    const pur = Float32Array.from((await rendre("pur")).audio.getChannelData(0));
    for (const ecriture of ["Sinus", "Sine"]) {
      const autre = (await rendre(ecriture)).audio.getChannelData(0);
      expect(ecart(pur, autre), `« ${ecriture} » ne rend pas le son de « pur »`).toBeLessThan(1e-6);
    }
  });

  it("une valeur inconnue tombe sur « douce », plutôt que de ne rien rendre", async () => {
    const douce = Float32Array.from((await rendre("douce")).audio.getChannelData(0));
    const inconnu = (await rendre("n'importe quoi")).audio.getChannelData(0);
    expect(ecart(inconnu, douce)).toBeLessThan(1e-6);
  });

  it("les notes rendues suivent la gamme et le motif, quel que soit le timbre", async () => {
    // LE TIMBRE NE TOUCHE QUE LA FORME D'ONDE : la suite de notes doit être la même, sans quoi le
    // réglage déplacerait la musique au lieu de la colorer.
    const { notes: avec } = await rendre("pur");
    const { notes: sans } = await rendre("percutante");
    expect(avec.length, "le dépliage doit produire des notes").toBeGreaterThan(1);
    expect(avec.map((n) => n.note)).toEqual(sans.map((n) => n.note));
  });
});

describe("le motif, écrit en demi-tons, est posé sur la gamme", () => {
  // LE DÉFAUT, relevé le 2026-11-14 par la passe de croisement des nomenclatures : chaque valeur
  // dépliée du motif, écrite en demi-tons, était lue comme un RANG de degré. « Triade M » jouait do,
  // sol, do, et à la profondeur 3 seuls quatre degrés sonnaient : vingt-cinq gammes, quatre musiques.
  const notes = async (motif: string, gamme: string, profondeur = 3) =>
    (await genererMusiqueFractale(motif, "0,3,7,10", profondeur, 60, 120, 0.25, "C", gamme, "pur")).notes.map((n) => n.note);

  it("« Triade M » en do majeur joue do, mi, sol ; « Triade m » en do mineur, do, mi♭, sol", async () => {
    expect((await notes("Triade M", "majeur", 1)).map((n) => n % 12)).toEqual([0, 4, 7]);
    expect((await notes("Triade m", "mineur", 1)).map((n) => n % 12)).toEqual([0, 3, 7]);
  });

  for (const [a, b] of [["majeur", "dorien"], ["majeur", "lydien"], ["mineur", "mineur-harmonique"],
    ["phrygien", "phrygien-dominant"], ["locrien", "alteree"]]) {
    it(`${a} et ${b}, que la passe trouvait identiques, s'entendent autrement`, async () => {
      expect(await notes("Triade M", a)).not.toEqual(await notes("Triade M", b));
    });
  }

  for (const id of GAMMES_MELODIE_IDS) {
    it(`${id} : chaque note rendue appartient à la gamme`, async () => {
      const permises = new Set(degresDeGamme(id));
      const classes = [...new Set((await notes("Triade M", id)).map((n) => n % 12))];
      expect(classes.filter((c) => !permises.has(c)), id).toEqual([]);
    });
  }
});

describe("la durée borne la mélodie, sans la recaler", () => {
  // LE DÉFAUT, relevé le 2026-11-26 : la mélodie entière était recalée pour remplir la durée, ce qui
  // annulait le tempo. La durée est désormais une longueur maximale, et les notes gardent la valeur
  // que le tempo leur donne. Le tempo lui-même est tenu par `plugins/tempo-deplace-les-notes.test.ts`.
  it("« DURÉE » NE JOUE QUE LES NOTES QUI Y TIENNENT ENTIÈRES, et dit combien le motif en donnait", async () => {
    // « Triade M » à la profondeur 2 donne neuf notes ; à 120 BPM une croche dure 0,25 s, et deux
    // secondes en tiennent huit.
    const r = await genererMusiqueFractale("Triade M", "", 2, 2, 120, 0.5, "C", "majeur", "pur");
    expect(r.depliees, "le motif déplié ne donne pas neuf notes").toBe(9);
    expect(r.notes.length, "la durée ne coupe pas la mélodie").toBe(8);
    expect(r.notes.map((n) => n.fin - n.debut), "les notes sont recalées sur la durée").toEqual(Array(8).fill(0.25));
    expect(r.audio.duration).toBeCloseTo(2, 3);
  });

  it("ET UNE MÉLODIE QUI TIENT EST JOUÉE ENTIÈRE, à la valeur demandée", async () => {
    const r = await genererMusiqueFractale("Triade M", "", 2, 60, 120, 0.5, "C", "majeur", "pur");
    expect(r.notes.length).toBe(9);
    expect(r.audio.duration, "la mélodie est étirée sur la durée maximale").toBeCloseTo(2.25, 3);
  });
});
