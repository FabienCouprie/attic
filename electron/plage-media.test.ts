// electron/plage-media.test.ts — Le protocole qui sert un film par morceaux.
//
// CE QUI EST VÉRIFIÉ ICI NE PEUT PAS L'ÊTRE À L'ÉCRAN : une plage mal analysée donne une image qui
// saute ou un déplacement qui échoue, sans message, et le défaut se confond avec un film abîmé.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const requerir = createRequire(import.meta.url);
const { SCHEMA, urlDeFichier, cheminDepuisUrl, typeMedia, analyserPlage } = requerir("./plage-media.cjs");

describe("adresse d'un fichier servi", () => {
  it("l'aller-retour garde le chemin, espaces et parenthèses compris", () => {
    const chemin = "E:/attic/video example/Dr. Jekyll and Mr. Hyde (1912).mp4";
    expect(cheminDepuisUrl(urlDeFichier(chemin))).toBe("E:\\attic\\video example\\Dr. Jekyll and Mr. Hyde (1912).mp4");
  });

  it("les accents et le dièse d'un nom de film traversent l'adresse", () => {
    const chemin = "E:/films/Un chien andalou #1 été.mp4";
    expect(cheminDepuisUrl(urlDeFichier(chemin))).toBe("E:\\films\\Un chien andalou #1 été.mp4");
  });

  it("refuse ce qui n'est pas de ce schéma, ou n'est pas absolu", () => {
    expect(cheminDepuisUrl("file:///E:/films/a.mp4")).toBeNull();
    expect(cheminDepuisUrl(`${SCHEMA}://f/films/a.mp4`)).toBeNull();
    expect(cheminDepuisUrl(`${SCHEMA}://f/`)).toBeNull();
    expect(cheminDepuisUrl("")).toBeNull();
  });

  it("refuse une remontée de dossier", () => {
    expect(cheminDepuisUrl(`${SCHEMA}://f/E:/films/../../secret.mp4`)).toBeNull();
  });
});

describe("type servi", () => {
  it("rend le type des conteneurs acceptés", () => {
    expect(typeMedia("a.mp4")).toBe("video/mp4");
    expect(typeMedia("A.MOV")).toBe("video/quicktime");
    expect(typeMedia("a.webm")).toBe("video/webm");
  });

  it("refuse tout le reste, un protocole n'ayant pas à servir n'importe quel fichier", () => {
    expect(typeMedia("a.wmv")).toBeNull();
    expect(typeMedia("a.txt")).toBeNull();
    expect(typeMedia("a.exe")).toBeNull();
    expect(typeMedia("")).toBeNull();
  });
});

describe("plage demandée", () => {
  const TAILLE = 1000;

  it("sans en-tête, c'est le fichier entier", () => {
    expect(analyserPlage(undefined, TAILLE)).toBeNull();
    expect(analyserPlage(null, TAILLE)).toBeNull();
  });

  it("« bytes=0- » demande tout à partir du début", () => {
    expect(analyserPlage("bytes=0-", TAILLE)).toEqual({ debut: 0, fin: 999, longueur: 1000 });
  });

  it("une plage fermée est rendue telle quelle", () => {
    expect(analyserPlage("bytes=100-199", TAILLE)).toEqual({ debut: 100, fin: 199, longueur: 100 });
  });

  it("une fin au-delà du fichier est ramenée au dernier octet", () => {
    expect(analyserPlage("bytes=900-5000", TAILLE)).toEqual({ debut: 900, fin: 999, longueur: 100 });
  });

  it("« bytes=-500 » rend les derniers octets, ce que demande l'index d'un MP4", () => {
    expect(analyserPlage("bytes=-500", TAILLE)).toEqual({ debut: 500, fin: 999, longueur: 500 });
  });

  it("un début hors du fichier est invalide, et non silencieusement corrigé", () => {
    expect(analyserPlage("bytes=1000-", TAILLE)).toEqual({ invalide: true });
    expect(analyserPlage("bytes=500-100", TAILLE)).toEqual({ invalide: true });
    expect(analyserPlage("bytes=abc", TAILLE)).toEqual({ invalide: true });
    expect(analyserPlage("bytes=-", TAILLE)).toEqual({ invalide: true });
    expect(analyserPlage("bytes=-0", TAILLE)).toEqual({ invalide: true });
  });
});
