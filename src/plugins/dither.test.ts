// plugins/dither.test.ts — La prise : chaque réglage agit au run, et le message dit ce qui a été fait.
//
// Le calcul est tenu par `audio/dither-mise-en-forme.test.ts`. Ici, ce que la fiche en fait : les
// réglages lus sous leurs noms et leurs identifiants d'option, un tampon de la forme de l'entrée, une
// graine à zéro résolue et annoncée, et le message.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { ctxDEssai } from "../core/contexte-essai";
import { FILTRES, gainDePuissance } from "../audio/dither-mise-en-forme";
import { fiches } from "./dither";

const fiche = fiches.find((f) => f.id === "dither")!;

/** Deux canaux différents, une demi-seconde : un sinus faible à gauche, un plus fort à droite. */
function son(fe = 44100): AudioBuffer {
  const a = new AudioBuffer({ numberOfChannels: 2, length: fe / 2, sampleRate: fe });
  const g = a.getChannelData(0), d = a.getChannelData(1);
  for (let i = 0; i < a.length; i++) {
    g[i] = 0.01 * Math.sin((2 * Math.PI * 440 * i) / fe);
    d[i] = 0.4 * Math.sin((2 * Math.PI * 997 * i) / fe);
  }
  return a;
}

const lancer = (reglages: Record<string, string | number> = {}, entree: AudioBuffer | null = son()) =>
  fiche.executer(ctxDEssai([entree], reglages, { ficheId: fiche.id }) as never);

const sortie = async (reglages: Record<string, string | number> = {}, entree?: AudioBuffer) =>
  (await lancer(reglages, entree ?? son())).valeurs[0] as AudioBuffer;

const ecart = (a: AudioBuffer, b: AudioBuffer) => {
  let s = 0;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < x.length; i++) s += (x[i] - y[i]) ** 2;
  }
  return Math.sqrt(s);
};

describe("le composant Dither", () => {
  it("déclare une entrée et une sortie audio, et quatre réglages", () => {
    expect(fiche.entrees.map((p) => p.nom)).toEqual(["Audio"]);
    expect(fiche.sorties.map((p) => [p.nom, p.type])).toEqual([["Audio", "audio"]]);
    expect(fiche.parametres.map((p) => p.nom)).toEqual(["Bits", "Dither", "Mise en forme", "Graine"]);
  });

  it("les identifiants des options sont ceux du calcul, et les défauts ceux que Fabien a choisis", () => {
    const [bits, dither, forme, graine] = fiche.parametres;
    expect(bits.defaut).toBe(16);
    expect(dither.defaut).toBe("Triangulaire");
    expect(forme.defaut).toBe("E 5 coef.");
    expect(graine.defaut).toBe(1);
    expect(graine.graine).toBe(true);
    expect(forme.optionIds).toEqual(Object.keys(FILTRES));
  });

  it("sans entrée, rend une valeur nulle et se déclare en erreur", async () => {
    const r = await lancer({}, null);
    expect(r.valeurs).toEqual([null]);
    expect(r.erreur).toBe(true);
  });

  it("rend un tampon de la forme de l'entrée, chaque valeur sur la grille demandée", async () => {
    const s = await sortie({ Bits: 8 });
    expect([s.numberOfChannels, s.length, s.sampleRate]).toEqual([2, 22050, 44100]);
    for (let c = 0; c < 2; c++) {
      for (const y of s.getChannelData(c)) expect(Math.abs(y * 127 - Math.round(y * 127))).toBeLessThan(1e-4);
    }
  });

  it("CHAQUE RÉGLAGE AGIT AU RUN : changer sa valeur change le son", async () => {
    const base = await sortie();
    expect(ecart(base, await sortie({ Bits: 12 }))).toBeGreaterThan(0);
    expect(ecart(base, await sortie({ Dither: "aucun" }))).toBeGreaterThan(0);
    expect(ecart(base, await sortie({ Dither: "triangulaire-passe-haut" }))).toBeGreaterThan(0);
    expect(ecart(base, await sortie({ "Mise en forme": "f-9" }))).toBeGreaterThan(0);
    expect(ecart(base, await sortie({ Graine: 2 }))).toBeGreaterThan(0);
    expect(ecart(base, await sortie({ Graine: 1 }))).toBe(0);
  });

  it("le message dit la profondeur, le dither, la mise en forme, le bruit relevé et la graine", async () => {
    const r = await lancer({ Bits: 16, Dither: "triangulaire", "Mise en forme": "e-5", Graine: 7 });
    expect(r.message).toMatch(/^16 bits · Triangulaire · E 5 coef\. · bruit -\d+,\d dBFS · graine 7$/);
    // Le bruit annoncé est celui que la théorie donne : un quart de LSB² mis en forme, −84,1 dBFS.
    const annonce = Number(/bruit (-\d+,\d) dBFS/.exec(r.message!)![1].replace(",", "."));
    const theorie = 20 * Math.log10(Math.sqrt(0.25 * gainDePuissance(FILTRES["e-5"])) / 32767);
    expect(Math.abs(annonce - theorie)).toBeLessThan(0.3);
  });

  it("une graine à zéro est tirée au sort, et le message donne celle qui a été jouée", async () => {
    const r = await lancer({ Graine: 0 });
    const graine = Number(/graine (\d+)$/.exec(r.message!)![1]);
    expect(graine).toBeGreaterThan(0);
    const rejoue = await sortie({ Graine: graine });
    expect(ecart(r.valeurs[0] as AudioBuffer, rejoue)).toBe(0);
  });

  it("hors de 44,1 kHz à plus de 5 %, une courbe pondérée le dit ; un filtre d'ordre fixe, non", async () => {
    expect((await lancer({}, son(44100))).message).not.toMatch(/courbe calculée/);
    expect((await lancer({}, son(48000))).message).toMatch(/ · courbe calculée pour 44,1 kHz$/);
    expect((await lancer({ "Mise en forme": "second-ordre" }, son(48000))).message).not.toMatch(/courbe calculée/);
  });

  it("un son saturé est borné, et le message compte les échantillons ramenés", async () => {
    const fort = son();
    fort.getChannelData(1).forEach((v, i, x) => { x[i] = v * 3; });
    const r = await lancer({ "Mise en forme": "f-9" }, fort);
    expect(r.message).toMatch(/ · [\d  ]+ échantillons bornés/);
    const s = r.valeurs[0] as AudioBuffer;
    for (const y of s.getChannelData(1)) expect(Math.abs(y)).toBeLessThanOrEqual(1);
  });
});
