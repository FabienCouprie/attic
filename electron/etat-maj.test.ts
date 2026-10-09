// electron/etat-maj.test.ts — Ce qu'on a le droit de conclure d'une vérification de mise à jour.
//
// LE DÉFAUT QUE CES CAS EMPÊCHENT A ÉTÉ VU PAR FABIEN : « l'icône de mise à jour reste orange après
// la mise à jour, on réappuie et cela génère une erreur ». Deux symptômes, une seule ligne.
//
// `maj:verifier` concluait « une mise à jour est disponible » de la seule PRÉSENCE de
// `result.updateInfo`, sur la foi d'un commentaire qui l'affirmait. Or `checkForUpdates` rend un
// `UpdateCheckResult` dès que la vérification aboutit, et `updateInfo` décrit la dernière version
// publiée — y compris quand c'est celle qui tourne déjà. En 5.0.1 face à une release 5.0.1, la
// vérification concluait donc « 5.0.1 disponible », le bouton orange revenait, et le clic suivant
// lançait un téléchargement qui n'avait rien à prendre : c'est son échec qui s'affichait.
//
// LA FORME DU PIÈGE, et c'est elle qu'on garde : un objet rendu à chaque succès, pris pour le signe
// d'un succès PARTICULIER. Le champ qui répond est `isUpdateAvailable`, et lui seul.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const { etatNeutre, etatVerification, etatApresVerification, etatApresAttente } =
  createRequire(import.meta.url)("./etat-maj.cjs") as {
    etatNeutre: () => any; etatVerification: () => any;
    etatApresVerification: (r: unknown) => any;
    etatApresAttente: (courant: unknown, r: unknown) => any;
  };

/** Ce que rend `checkForUpdates` quand la vérification aboutit : `updateInfo` est TOUJOURS là. */
const resultat = (isUpdateAvailable: boolean, version = "5.0.1", releaseNotes = "") =>
  ({ isUpdateAvailable, updateInfo: { version, releaseNotes } });

describe("ce qu'une vérification permet de conclure", () => {
  it("UNE VERSION PUBLIÉE N'EST PAS UNE MISE À JOUR DISPONIBLE, et c'est tout le défaut", () => {
    // L'application tourne en 5.0.1, la release annonce 5.0.1 : `updateInfo` est rendu, et il ne
    // veut rien dire. Conclure de sa présence faisait reparaître le bouton orange.
    const etat = etatApresVerification(resultat(false, "5.0.1"));
    expect(etat.statut).toBe("a-jour");
    expect(etat.disponible).toBe(false);
    expect(etat.version).toBe("");
  });

  it("et une vraie mise à jour est annoncée avec sa version ET ses notes", () => {
    // Les notes étaient écrasées par une chaîne vide, ce qui vidait l'infobulle du bouton.
    const etat = etatApresVerification(resultat(true, "5.1.0", "Deux correctifs."));
    expect(etat).toMatchObject({ disponible: true, version: "5.1.0", notes: "Deux correctifs.", statut: "disponible" });
  });

  it("une vérification qui ne rend rien ne promet rien", () => {
    expect(etatApresVerification(null).statut).toBe("a-jour");
    expect(etatApresVerification(undefined).statut).toBe("a-jour");
    expect(etatApresVerification({}).statut).toBe("a-jour");
  });
});

describe("ce que les écouteurs ont déjà posé", () => {
  it("L'EMPORTE SUR LE RETOUR DE LA PROMESSE : ils savent davantage, notes comprises", () => {
    // `update-available` porte les notes de version ; le retour les ignorait. C'est l'écrasement
    // de cet état-là par une conclusion fausse qui produisait le bouton orange fantôme.
    const parEvenement = { disponible: true, version: "5.1.0", notes: "Les notes.", progression: 0, statut: "disponible" };
    expect(etatApresAttente(parEvenement, resultat(false))).toBe(parEvenement);

    const aJour = { ...etatNeutre(), statut: "a-jour" };
    expect(etatApresAttente(aJour, resultat(true, "5.0.1"))).toBe(aJour);
  });

  it("mais si AUCUN n'a tranché, le résultat conclut — le filet sert à cela", () => {
    expect(etatApresAttente(etatVerification(), resultat(true, "5.1.0")))
      .toMatchObject({ statut: "disponible", version: "5.1.0" });
    expect(etatApresAttente(etatVerification(), resultat(false)).statut).toBe("a-jour");
    expect(etatApresAttente(etatNeutre(), resultat(false)).statut).toBe("a-jour");
  });

  it("et une vérification qui commence efface ce que la précédente avait conclu", () => {
    // Sans cela, le bouton orange d'une vérification précédente resterait pendant la suivante.
    expect(etatVerification()).toEqual({ disponible: false, version: "", notes: "", progression: 0, statut: "verification" });
  });
});
