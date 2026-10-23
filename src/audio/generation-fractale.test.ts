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

// Court, et à profondeur deux : le dépliage est exponentiel, et ce qui est mesuré ici est la forme
// d'onde d'une note, non la structure du motif.
const rendre = (timbre: string) =>
  genererMusiqueFractale("Triade M", "0,3,7,10", 2, 2, 120, "Do", "Majeur", timbre);

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
