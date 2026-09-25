// ui/fichiers-deposes.test.ts — Reconnaître un son lâché sur le canevas.
//
// CE QUI SE VÉRIFIE ICI EST CE QUI ÉCHOUERAIT EN SILENCE : un son que l'on ne reconnaît pas ne
// produit rien, et l'utilisateur ne voit qu'un geste sans effet, sans savoir si c'est son fichier,
// son geste ou l'application qui est en cause.
import { describe, it, expect } from "vitest";
import { estFichierAudio, estFichierMidi, positionsEnCascade, sorteDeposee } from "./fichiers-deposes";

describe("reconnaître un fichier son", () => {
  it("accepte les formats courants par leur extension", () => {
    for (const n of ["prise.wav", "MIX.MP3", "concert.flac", "voix.ogg", "note.m4a", "piano.aiff"]) {
      expect(estFichierAudio(n), n).toBe(true);
    }
  });

  it("accepte aussi sur le type quand l'extension est inconnue", () => {
    expect(estFichierAudio("enregistrement", "audio/wav")).toBe(true);
  });

  it("ACCEPTE UN FLAC AU TYPE VIDE, ce qu'un test sur le seul type raterait", () => {
    // C'est le cas réel : l'explorateur de Windows ne donne pas de type aux formats qu'il ne
    // connaît pas, et ce sont justement les plus soignés.
    expect(estFichierAudio("prise.flac", "")).toBe(true);
  });

  it("refuse ce qui n'est pas un son", () => {
    for (const n of ["photo.png", "notes.txt", "film.mp4", "projet.json", ""]) {
      expect(estFichierAudio(n), n).toBe(false);
    }
  });

  it("ne se laisse pas prendre par une extension au milieu du nom", () => {
    expect(estFichierAudio("la.wav.txt")).toBe(false);
  });
});

describe("reconnaître un fichier MIDI", () => {
  it("accepte les extensions du format", () => {
    for (const n of ["theme.mid", "SUITE.MIDI", "vieux.rmi"]) expect(estFichierMidi(n), n).toBe(true);
  });

  it("accepte aussi sur le type, que les systèmes annoncent de deux façons", () => {
    expect(estFichierMidi("sans-extension", "audio/midi")).toBe(true);
    expect(estFichierMidi("sans-extension", "audio/x-midi")).toBe(true);
  });

  it("UN MIDI N'EST PAS UN SON, même si le système l'annonce en audio", () => {
    // Le piège du geste : un `.mid` pris pour un son partirait au décodeur audio, qui échouerait
    // sur un format qu'il ne connaît pas, et l'utilisateur croirait son fichier abîmé.
    expect(estFichierAudio("theme.mid", "audio/midi")).toBe(false);
    expect(sorteDeposee("theme.mid", "audio/midi")).toBe("midi");
  });
});

describe("choisir le composant selon le fichier", () => {
  it("un son donne une entrée audio, un MIDI donne un lecteur MIDI", () => {
    expect(sorteDeposee("prise.wav")).toBe("audio");
    expect(sorteDeposee("theme.mid")).toBe("midi");
  });

  it("le reste ne donne rien, et le canevas le laisse passer", () => {
    expect(sorteDeposee("photo.png", "image/png")).toBeNull();
    expect(sorteDeposee("film.mp4", "video/mp4")).toBeNull();
  });
});

describe("placer plusieurs fichiers lâchés ensemble", () => {
  it("les décale en escalier depuis le point de dépôt", () => {
    expect(positionsEnCascade({ x: 100, y: 50 }, 3, 28)).toEqual([
      { x: 100, y: 50 },
      { x: 128, y: 78 },
      { x: 156, y: 106 },
    ]);
  });

  it("un seul fichier tombe exactement où on l'a lâché", () => {
    expect(positionsEnCascade({ x: 10, y: 20 }, 1)).toEqual([{ x: 10, y: 20 }]);
  });

  it("aucun fichier, aucune position", () => {
    expect(positionsEnCascade({ x: 0, y: 0 }, 0)).toEqual([]);
  });
});
