// ui/url-media.test.ts — Les deux moitiés du protocole doivent se répondre.
//
// LA FENÊTRE FABRIQUE L'ADRESSE, LE PROCESSUS PRINCIPAL LA DÉFAIT, et les deux calculs sont écrits
// dans deux fichiers parce que le préchargement est en bac à sable. Si l'un dérive, un film au nom
// accentué cesse de s'afficher sans que rien ne le dise : c'est ce test qui l'attrape.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { SCHEMA_MEDIA, urlMedia } from "./url-media";

const requerir = createRequire(import.meta.url);
const { SCHEMA, urlDeFichier, cheminDepuisUrl } = requerir("../../electron/plage-media.cjs");

const CHEMINS = [
  "E:/attic/video example/Dr. Jekyll and Mr. Hyde (1912).mp4",
  "E:\\attic\\video example\\Un chien andalou.mp4",
  "C:/Users/fcoup/Vidéos/été 2026 #1.mp4",
  "D:/films/question ? et virgule, point.mov",
  "E:/f/a+b&c=d.webm",
];

describe("les deux moitiés du protocole média", () => {
  it("le schéma est le même des deux côtés", () => {
    expect(SCHEMA_MEDIA).toBe(SCHEMA);
  });

  it("la fenêtre fabrique exactement l'adresse que le processus principal fabriquerait", () => {
    for (const c of CHEMINS) expect(urlMedia(c)).toBe(urlDeFichier(c));
  });

  it("le processus principal retrouve le chemin de départ", () => {
    for (const c of CHEMINS) {
      expect(cheminDepuisUrl(urlMedia(c)).replace(/\\/g, "/")).toBe(c.replace(/\\/g, "/"));
    }
  });

  it("l'adresse traverse l'analyseur d'URL sans être modifiée", () => {
    // Un élément vidéo normalise l'adresse avant de la demander : si la normalisation la changeait,
    // le chemin retrouvé ne serait plus celui du départ.
    for (const c of CHEMINS) expect(new URL(urlMedia(c)).href).toBe(urlMedia(c));
  });
});
