// audio/video-montage.test.ts — Ce qu'un son posé sur un film doit respecter.
// @vitest-environment jsdom
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";

import {
  ajusterALaVideo, extensionLisible, imageDepuisSecondes, plansDepuisPistes, secondesDepuisImage,
} from "./video-montage";

/** La cadence du film d'essai : 30000/1001, et non trente. */
const NTSC = 30000 / 1001;

const tampon = (secondes: number, valeur = 0.5, sr = 48000): AudioBuffer => {
  const b = new AudioBuffer({ numberOfChannels: 1, length: Math.round(secondes * sr), sampleRate: sr });
  b.getChannelData(0).fill(valeur);
  return b;
};

describe("les images et les secondes", () => {
  it("UNE IMAGE N'EST PAS UN TRENTIÈME DE SECONDE", () => {
    // Trente-quatre millisecondes d'écart dès la millième image, et une seconde à dix minutes.
    expect(secondesDepuisImage(1000, NTSC)).toBeCloseTo(33.3667, 4);
    expect(secondesDepuisImage(1000, 30)).toBeCloseTo(33.3333, 4);
    expect(secondesDepuisImage(18000, NTSC) - secondesDepuisImage(18000, 30)).toBeCloseTo(0.6, 2);
  });

  it("elles se retrouvent l'une l'autre", () => {
    for (const image of [0, 1, 25, 1000, 17982]) {
      expect(imageDepuisSecondes(secondesDepuisImage(image, NTSC), NTSC)).toBe(image);
    }
  });

  it("une cadence absente ne fait pas diviser par zéro", () => {
    expect(secondesDepuisImage(100, 0)).toBe(0);
    expect(imageDepuisSecondes(10, 0)).toBe(0);
  });
});

describe("l'ajustement à la durée de la vidéo", () => {
  it("LA VIDÉO COMMANDE : un mélange trop long est coupé à sa durée", () => {
    const r = ajusterALaVideo(tampon(5), 3);
    expect(r.length).toBe(3 * 48000);
  });

  it("un mélange trop court est complété de silence", () => {
    const r = ajusterALaVideo(tampon(2), 5);
    expect(r.length).toBe(5 * 48000);
    expect(r.getChannelData(0)[4 * 48000]).toBe(0);
  });

  it("LA COUPE PORTE UN FONDU : sans lui, la dernière image claque", () => {
    const r = ajusterALaVideo(tampon(5, 0.5), 3, 100);
    const d = r.getChannelData(0);
    expect(d[0]).toBeCloseTo(0.5, 5);
    // Le dernier échantillon est éteint, celui d'avant le fondu ne l'est pas.
    expect(Math.abs(d[d.length - 1])).toBeLessThan(0.02);
    expect(d[d.length - 1 - Math.round(0.1 * 48000)]).toBeCloseTo(0.5, 2);
  });

  it("UN MÉLANGE PLUS COURT NE REÇOIT AUCUN FONDU : il se termine de lui-même", () => {
    const r = ajusterALaVideo(tampon(2, 0.5), 5, 100);
    const d = r.getChannelData(0);
    // La fin du son est intacte ; c'est le silence qui suit, non un fondu.
    expect(d[2 * 48000 - 1]).toBeCloseTo(0.5, 5);
  });

  it("la fréquence et le nombre de canaux sont conservés", () => {
    const b = new AudioBuffer({ numberOfChannels: 2, length: 1000, sampleRate: 44100 });
    const r = ajusterALaVideo(b, 0.5);
    expect(r.numberOfChannels).toBe(2);
    expect(r.sampleRate).toBe(44100);
  });
});

describe("les pistes converties en plans", () => {
  it("les débuts passent des images aux secondes, à la cadence réelle", () => {
    const son = tampon(1);
    const plans = plansDepuisPistes([
      { piste: 0, son, image: 0, gainDb: 0, fonduEntreeMs: 10, fonduSortieMs: 10 },
      { piste: 3, son, image: 1000, gainDb: -6, fonduEntreeMs: 5, fonduSortieMs: 20 },
    ], NTSC);
    expect(plans[0].debut).toBe(0);
    expect(plans[1].debut).toBeCloseTo(33.3667, 4);
    expect(plans[1].gainDb).toBe(-6);
  });
});

describe("les conteneurs acceptés", () => {
  it("ceux que la bibliothèque ouvre", () => {
    for (const f of ["film.mp4", "PRISE.MOV", "essai.webm", "a.mkv", "b.m4v"]) {
      expect(extensionLisible(f)).toBe(true);
    }
  });

  it("LE WMV N'EN EST PAS, et le composant doit pouvoir le dire avant d'essayer", () => {
    for (const f of ["film.wmv", "film.asf", "film.avi", "film.flv"]) {
      expect(extensionLisible(f)).toBe(false);
    }
  });
});
