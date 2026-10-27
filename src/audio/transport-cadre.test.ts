// audio/transport-cadre.test.ts — Ce qui traverse la frontiere du cadre isole, et ce qu'on y transfere.
//
// ═══ LE DEFAUT, RELEVE PAR UNE REVUE LE 2026-10-27 ═══
//
// « Les tampons sont copies a travers le cadre, et non transferes. `postMessage` est appele sans
// liste de transfert. » Une heure de stereo pese 1,27 Go : la traduction en fabriquait une copie,
// et le clonage une seconde.
//
// ═══ LA REGLE QUE CES CAS TIENNENT, ET LA FAUTE QU'ELLE EMPECHE ═══
//
// ON NE TRANSFERE QUE CE QUE LA TRADUCTION VIENT DE FABRIQUER. Transferer DETACHE la memoire de
// son cote : un tableau type recu tel quel d'un autre noeud est aussi celui que le cache de ce
// noeud garde, et le transferer le viderait en silence -- l'aval suivant lirait zero echantillon.
// Les canaux d'un tampon, eux, sont des copies neuves que personne d'autre ne tient.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import "./adaptateur";
import { servicesDomaine } from "../core/services-domaine";

function tampon(canaux: number, longueur: number): AudioBuffer {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: longueur, sampleRate: 44100 });
  for (let c = 0; c < canaux; c++) b.getChannelData(c).fill(0.25 * (c + 1));
  return b;
}

describe("la traversee d'un tampon vers le cadre isole", () => {
  it("TRANSFERE LES CANAUX DE LA TRADUCTION, un par canal, et ce sont ceux de la valeur posee", () => {
    const t = servicesDomaine().versTransport(tampon(2, 1000));
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const v = t.valeur as { canaux: Float32Array[] };
    expect(t.transferables, "aucune memoire nommee : le cadre recopierait tout").toHaveLength(2);
    expect(t.transferables).toEqual(v.canaux.map((c) => c.buffer));
  });

  it("LE TAMPON D'ORIGINE GARDE SA MEMOIRE apres un vrai transfert", () => {
    const b = tampon(2, 1000);
    const t = servicesDomaine().versTransport(b);
    if (!t.ok) throw new Error("traduction refusee");
    // LE TRANSFERT EST FAIT POUR DE VRAI, par un canal de messages : c'est lui qui detache.
    const { port1 } = new MessageChannel();
    port1.postMessage(t.valeur, t.transferables ?? []);
    port1.close();
    const v = t.valeur as { canaux: Float32Array[] };
    expect(v.canaux[0].length, "le transfert n'a pas eu lieu : le cas ne prouverait rien").toBe(0);
    expect(b.getChannelData(0).length, "le tampon d'origine a ete vide par le transfert").toBe(1000);
    expect(b.getChannelData(1)[500]).toBeCloseTo(0.5, 6);
  });

  it("UN TABLEAU TYPE PASSE TEL QUEL NE SE TRANSFERE JAMAIS : il appartient encore a son producteur", () => {
    const tenuParLeCache = new Float32Array([1, 2, 3]);
    const t = servicesDomaine().versTransport(tenuParLeCache);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.valeur).toBe(tenuParLeCache);
    expect(t.transferables ?? [], "transferer cette memoire viderait la valeur du cache amont").toHaveLength(0);
  });

  it("UNE VALEUR SIMPLE NE DECLARE AUCUNE MEMOIRE", () => {
    for (const v of [null, 3, "texte", { a: 1 }, [1, 2]]) {
      const t = servicesDomaine().versTransport(v);
      expect(t.ok).toBe(true);
      if (t.ok) expect(t.transferables ?? []).toHaveLength(0);
    }
  });
});
