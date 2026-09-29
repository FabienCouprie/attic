// champs-copie.test.ts — Verrouille la séparation entre les trois rôles des
// listes de champs : ce qu'une exécution dépose et qu'un reset retire, ce qui
// est à l'utilisateur et survit à tout, ce qu'un copier-coller emporte.
import { describe, it, expect } from "vitest";
import {
  CHAMPS_UTILISATEUR, CHAMPS_MEDIA_LOCAL, CHAMPS_COPIABLES, CHAMPS_RESULTAT,
} from "./useExecutionGraphe";

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

// CE QUI A FAIT ÉCRIRE CETTE PARTIE, relevé par Fabien : le dessin du générateur de courbe restait
// affiché après un reset. Le nœud revenait à « en attente », son message disparaissait, et la
// courbe restait. Trois champs que l'exécution dépose manquaient à la liste de ce qu'un reset
// efface, parce que cette liste était écrite à la main loin de l'endroit qui écrit.
//
// CE QUE CE TEST PEUT VOIR, ET CE QU'IL NE PEUT PAS. Il tient les ensembles disjoints et nomme les
// champs affichés qui doivent partir : un champ retiré de la liste rallume le défaut. Il ne peut
// pas deviner un champ que l'exécution se mettrait à écrire demain sans le déclarer ici ; c'est
// l'unicité de la liste, et non ce test, qui rend cet oubli difficile.
describe("champs de résultat", () => {
  it("UN RÉSULTAT N'EST PAS UNE SAISIE : les deux ensembles ne se touchent pas", () => {
    const communs = [...CHAMPS_RESULTAT].filter((c) => CHAMPS_UTILISATEUR.has(c));
    expect(communs).toEqual([]);
  });

  it("LES TROIS CHAMPS QUI SURVIVAIENT À UN RESET en font partie", () => {
    // Le dessin de la courbe, le fichier MIDI à télécharger, la pastille en décibels : trois
    // affichages qui restaient sur un nœud redevenu « en attente ».
    for (const champ of ["apercuCourbe", "midiFichierSortie", "ecartNiveau"]) {
      expect(CHAMPS_RESULTAT.has(champ), `${champ} doit être effacé par un reset`).toBe(true);
    }
  });

  it("ET CE QU'UN COMPOSANT MONTRE AUSSI, par son canal déclaré", () => {
    // Le même défaut que le dessin de la courbe, relevé par Fabien sur le Montage : la barre de
    // chaque piste, son onde et les notes des boîtes restaient à l'écran après une remise à zéro,
    // décrivant une exécution qui n'avait plus lieu. Trois champs y répondaient, un par besoin ; le
    // canal les remplace par deux clés qui valent pour tout composant.
    for (const champ of ["_affichage", "_designe"]) {
      expect(CHAMPS_RESULTAT.has(champ), `${champ} doit être effacé par un reset`).toBe(true);
    }
  });

  it("et tout ce qu'un reset effaçait déjà y reste", () => {
    for (const champ of ["audioResultatUrl", "audioResultatNom", "audioResultatBuffer",
                         "audioResultatMessage", "scriptGenere", "mp3Url", "imageResultatUrl",
                         "imageResultatFile", "visualisationUrl", "tempsExecution"]) {
      expect(CHAMPS_RESULTAT.has(champ), `${champ} doit être effacé par un reset`).toBe(true);
    }
  });
});
