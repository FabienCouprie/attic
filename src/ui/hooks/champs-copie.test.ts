// champs-copie.test.ts — Verrouille la séparation entre les deux rôles des
// listes de champs : protection contre la réinitialisation d'un côté, allowlist
// du copier-coller de l'autre.
import { describe, it, expect } from "vitest";
import { CHAMPS_UTILISATEUR, CHAMPS_MEDIA_LOCAL, CHAMPS_COPIABLES } from "./useExecutionGraphe";

describe("champs copiables", () => {
  // Le piège principal : un champ mal orthographié dans CHAMPS_MEDIA_LOCAL
  // n'exclurait rien du tout, sans la moindre erreur — l'« Entrée audio » collée
  // recommencerait à arriver avec le fichier de l'original.
  it("chaque champ média exclu existe bien dans CHAMPS_UTILISATEUR", () => {
    const inconnus = [...CHAMPS_MEDIA_LOCAL].filter((c) => !CHAMPS_UTILISATEUR.has(c));
    expect(inconnus).toEqual([]);
  });

  it("le média chargé n'est pas dupliqué par un copier-coller", () => {
    for (const champ of ["audioFichier", "audioNom", "audioUrl", "audioChemin",
                         "imageFichier", "midiFichier", "pdfFichier", "svgFichier",
                         "irFichier", "enregistrementBlob", "enregistrementUrl"]) {
      expect(CHAMPS_COPIABLES.has(champ), `${champ} ne doit pas être copié`).toBe(false);
    }
  });

  // Le média DOIT rester protégé des réinitialisations en cascade : l'exclure de
  // CHAMPS_UTILISATEUR ferait perdre à l'utilisateur son fichier au lancement du
  // graphe. Les deux rôles doivent donc rester distincts.
  it("le média reste protégé d'une réinitialisation", () => {
    for (const champ of CHAMPS_MEDIA_LOCAL) {
      expect(CHAMPS_UTILISATEUR.has(champ), `${champ} doit survivre à un reset`).toBe(true);
    }
  });

  it("les réglages saisis par l'utilisateur, eux, restent copiés", () => {
    for (const champ of ["ficheId", "nom", "parametres", "zonesSelectionnees"]) {
      expect(CHAMPS_COPIABLES.has(champ), `${champ} doit être copié`).toBe(true);
    }
  });

  it("copiables = utilisateur moins média, sans rien inventer", () => {
    expect(CHAMPS_COPIABLES.size).toBe(CHAMPS_UTILISATEUR.size - CHAMPS_MEDIA_LOCAL.size);
    for (const champ of CHAMPS_COPIABLES) expect(CHAMPS_UTILISATEUR.has(champ)).toBe(true);
  });
});
