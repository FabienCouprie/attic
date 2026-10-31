// audio/sfz-aller-retour.test.ts — Un SFZ écrit puis relu rend-il ce qu'on lui avait donné ?
//
// LE DÉFAUT QUE CE FICHIER A ATTRAPÉ. Le désaccord d'une zone traversait deux étages sur trois. Le
// lecteur comprend `tune` et le range dans `zone.accord` ; la lecture l'applique, `parametresLecture`
// le portant dans son rapport de rééchantillonnage ; et l'écriture le JETAIT. Lire un SFZ
// microtonal, l'entendre juste, puis l'exporter rendait un instrument tempéré, sans que rien ne le
// signale puisque le fichier reste valide.
//
// POURQUOI UN FICHIER À PART, ET NON UN CAS DE PLUS DANS `clavier-banque.test.ts`. Celui-ci est en
// dette de taille, à quatre cent trente-neuf lignes, et la norme du dépôt dit que ce qu'on ajoute à
// un fichier trop gros va ailleurs. La banque y est donc montée à la main plutôt que par
// `construireBanque` : trois zones et un tampon de huit échantillons suffisent, l'écriture ne
// lisant que les métadonnées.
//
// ET LE CAS RELIT SA PROPRE SORTIE, ce qui est la preuve et non le texte. Vérifier la chaîne écrite
// dirait seulement qu'on a écrit quelque chose ; la faire relire par l'analyseur du dépôt dit qu'on a
// écrit la bonne chose, et dans l'unité que le lecteur attend.
import { describe, expect, it } from "vitest";

import { versSfz, type Banque, type Zone } from "./clavier-banque";
import { analyserSfz } from "./sfz";

/** Un tampon minuscule : l'écriture ne lit que les métadonnées d'une zone. */
const son = (): AudioBuffer => new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 44100 });

const zone = (racine: number, accord?: number): Zone =>
  ({ racine, basse: racine - 1, haute: racine + 1, audio: son(), accord });

/** Trois zones : une désaccordée vers le bas, une d'un nombre fractionnaire, une juste. */
const banqueDesaccordee = (): Banque => ({
  zones: [zone(60, -25), zone(63, 33.5), zone(66)],
  racineSource: 60, largeur: 1, noteBasse: 59, noteHaute: 67,
});

describe("l'écriture d'un SFZ", () => {
  it("ÉCRIT LE DÉSACCORD D'UNE ZONE, sans quoi un aller-retour perd l'accordage", () => {
    const blocs = versSfz(banqueDesaccordee(), { dossier: "b" }).split("<region>").slice(1);
    expect(blocs.length).toBe(3);
    expect(blocs[0]).toMatch(/tune=-25\b/);
    // Les cents gardent leurs fractions : un tempérament à dix-neuf degrés les place à 63,16 cents
    // d'écart, et arrondir coûterait jusqu'à un demi-cent par degré.
    expect(blocs[1]).toMatch(/tune=33\.5\b/);
  });

  it("N'ÉCRIT RIEN POUR UNE ZONE JUSTE, `tune=0` étant le défaut du format", () => {
    // Même raison que pour les bornes de vélocité, que cet écrivain omet déjà quand elles sont
    // celles du format : une ligne qui ne dit rien sur chaque région se lit moins bien.
    const blocs = versSfz(banqueDesaccordee(), { dossier: "b" }).split("<region>").slice(1);
    expect(blocs[2]).not.toMatch(/tune=/);
  });

  it("ET L'ALLER-RETOUR BOUCLE : relu, chaque région rend le désaccord qu'on lui avait donné", () => {
    const banque = banqueDesaccordee();
    const relu = analyserSfz(versSfz(banque, { dossier: "b" }));
    const parRacine = new Map(relu.regions.map((r) => [r.racine, r.accord]));
    for (const z of banque.zones) {
      expect(parRacine.get(z.racine), `zone ${z.racine}`).toBeCloseTo(z.accord ?? 0, 6);
    }
  });

  it("garde les trois champs de clavier d'une zone au passage", () => {
    // Sans ce cas, le précédent pourrait passer sur une sortie qui aurait perdu les touches : un
    // désaccord juste sur une région mal placée ne vaut rien.
    const banque = banqueDesaccordee();
    const relu = analyserSfz(versSfz(banque, { dossier: "b" }));
    for (const z of banque.zones) {
      const r = relu.regions.find((x) => x.racine === z.racine);
      expect(r, `zone ${z.racine}`).toBeDefined();
      expect(r!.lokey).toBe(z.basse);
      expect(r!.hikey).toBe(z.haute);
    }
  });
});
