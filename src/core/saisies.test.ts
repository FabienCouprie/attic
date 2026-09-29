// core/saisies.test.ts — La table des genres de saisie reproduit-elle ce qui était écrit à la main ?
//
// CE QUE CES CAS TIENNENT. D'abord que la dérivation n'a rien perdu : les quatre listes qu'elle
// remplace sont écrites ici telles qu'elles étaient, et la table doit les rendre. Un refactoring de
// listes qui gouvernent la persistance ne se croit pas sur parole, il se démontre — s'y tromper fait
// perdre à la personne un fichier qu'elle avait chargé.
//
// PUIS CE QU'ELLE RÉCUPÈRE. Cinq champs étaient enregistrés dans le projet et relus à l'ouverture
// sans figurer parmi les saisies : un nœud copié les perdait en silence. Ils sont nommés un par un,
// avec leur raison, pour qu'on voie ce que la table a changé et pourquoi.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAMPS_DE_SAISIE, CHAMPS_ENREGISTRES, CHAMPS_MEDIA, CHAMPS_RECHARGEABLES, GENRES_DE_SAISIE,
} from "./saisies";

/** Les listes telles qu'elles étaient écrites à la main, avant la table. */
const AVANT = {
  utilisateur: ["ficheId", "nom", "nomEn", "parametres", "zonesSelectionnees",
    "audioFichier", "audioNom", "audioUrl", "audioChemin",
    "midiFichier", "midiNom", "midiUrl", "imageFichier", "imageNom", "imageUrl",
    "svgFichier", "svgNom", "svgUrl", "pdfFichier", "pdfNom", "irFichier", "irNom",
    "enregistrementBlob", "enregistrementUrl", "modeleFichier"],
  media: ["audioFichier", "audioNom", "audioUrl", "audioChemin",
    "midiFichier", "midiNom", "midiUrl", "imageFichier", "imageNom", "imageUrl",
    "svgFichier", "svgNom", "svgUrl", "pdfFichier", "pdfNom", "irFichier", "irNom",
    "enregistrementBlob", "enregistrementUrl", "modeleFichier"],
  conserves: ["ficheId", "parametres", "audioNom", "midiNom", "imageNom", "svgNom",
    "zonesSelectionnees", "nomFichier", "sfzChemin", "sfzNom", "sequenceNotes", "nom", "nomEn"],
  rechargeables: ["audioFichier", "midiFichier", "imageFichier", "svgFichier",
    "enregistrementBlob", "irFichier", "pureDataFichier"],
};

/**
 * Les cinq champs que la divergence avait laissés dehors, et la raison de chacun.
 *
 * Tous étaient enregistrés dans le projet et relus à l'ouverture ; aucun n'était une saisie. Comme
 * l'allowlist du copier-coller est celle des saisies, **un nœud copié les perdait**.
 */
const RECUPERES = new Map([
  ["sfzChemin", "le chemin du fichier SFZ chargé, qu'un composant lit à l'exécution"],
  ["sfzNom", "son nom, affiché sur le nœud"],
  ["sequenceNotes", "la mélodie jouée au clavier du nœud"],
  ["nomFichier", "le nom du fichier d'origine, que les métadonnées d'export réécrivent"],
  ["pureDataFichier", "le patch Pure Data chargé, que son composant lit à l'exécution"],
  ["couleur", "la couleur donnée au nœud, enregistrée et relue mais perdue à chaque copie"],
]);

const tri = (s: Iterable<string>) => [...s].sort();

describe("la table des genres de saisie", () => {
  it("REND CE QU'UN PROJET ENREGISTRAIT, et rien ne s'y perd", () => {
    const perdus = AVANT.conserves.filter((c) => !CHAMPS_ENREGISTRES.has(c));
    expect(perdus, "un champ qui cesserait d'être enregistré disparaîtrait du projet").toEqual([]);
    // Ce qu'elle ajoute : la couleur, qui était déjà écrite par la persistance sans figurer dans la
    // liste blanche de l'export. Le reste des ajouts vaut pour les saisies, cas plus bas.
    expect(tri([...CHAMPS_ENREGISTRES].filter((c) => !AVANT.conserves.includes(c)))).toEqual(["couleur"]);
  });

  it("ET EXACTEMENT LES FICHIERS QUE L'OUVERTURE REFABRIQUE", () => {
    expect(tri(CHAMPS_RECHARGEABLES)).toEqual(tri(AVANT.rechargeables));
  });

  it("NE PERD AUCUNE SAISIE de ce qui était énuméré à la main", () => {
    const perdus = AVANT.utilisateur.filter((c) => !CHAMPS_DE_SAISIE.has(c));
    expect(perdus, "un champ de saisie perdu, c'est un fichier chargé qui s'évapore").toEqual([]);
  });

  it("NE PERD AUCUN MÉDIA LOCAL", () => {
    const perdus = AVANT.media.filter((c) => !CHAMPS_MEDIA.has(c));
    expect(perdus, "un média oublié serait dupliqué par un copier-coller").toEqual([]);
  });

  it("ET CE QU'ELLE AJOUTE EST NOMMÉ, avec sa raison", () => {
    const ajouts = tri([...CHAMPS_DE_SAISIE].filter((c) => !AVANT.utilisateur.includes(c)));
    expect(ajouts).toEqual(tri(RECUPERES.keys()));
    for (const [champ, raison] of RECUPERES) {
      expect(raison.length, `${champ} : écrire pourquoi il est une saisie`).toBeGreaterThan(20);
    }
  });

  it("UN CHAMP ENREGISTRÉ EST TOUJOURS UNE SAISIE : on n'enregistre pas ce qu'on ne reconnaît pas", () => {
    const orphelins = [...CHAMPS_ENREGISTRES].filter((c) => !CHAMPS_DE_SAISIE.has(c));
    expect(orphelins, "enregistré par le projet mais absent des saisies, donc perdu à la copie").toEqual([]);
  });

  it("UN FICHIER RECHARGEABLE EST TOUJOURS UN MÉDIA LOCAL", () => {
    // Un fichier que l'ouverture refabrique est un fichier posé sur ce nœud : le dupliquer à la
    // copie ferait arriver un nœud collé avec le média de l'original.
    const orphelins = [...CHAMPS_RECHARGEABLES].filter((c) => !CHAMPS_MEDIA.has(c));
    expect(orphelins).toEqual([]);
  });

  it("UN MÉDIA LOCAL EST TOUJOURS UNE SAISIE", () => {
    expect([...CHAMPS_MEDIA].filter((c) => !CHAMPS_DE_SAISIE.has(c))).toEqual([]);
  });

  it("CHAQUE GENRE DÉCLARE SES CHAMPS, et ce qu'il conserve en fait partie", () => {
    for (const [nom, g] of Object.entries(GENRES_DE_SAISIE)) {
      expect(g.champs.length, `${nom} : un genre sans champ ne sert à rien`).toBeGreaterThan(0);
      for (const c of g.conserves) {
        expect(g.champs, `${nom} : « ${c} » est conservé sans être déclaré`).toContain(c);
      }
      if (g.rechargeable) {
        expect(g.champs, `${nom} : le rechargeable doit être un de ses champs`).toContain(g.rechargeable);
      }
    }
  });

  it("TOUT CE QUI S'ENREGISTRE ARRIVE AUX DEUX BOUTS DE LA PERSISTANCE", () => {
    // CE QUE CE CAS GARDE FERMÉ. Les sites qui écrivent le projet et qui le relisent énumèrent
    // encore leurs clés à la main : `usePersistance.ts` d'un côté, la restauration d'`App.tsx` de
    // l'autre. Tant qu'ils le font, un genre ajouté à la table sans être ajouté là serait écrit par
    // la table et perdu par la persistance, sans que rien ne le dise. C'est la divergence même que
    // cette table existe pour empêcher ; ici elle est surveillée plutôt que supprimée, parce que
    // réécrire ces deux sites demande d'éprouver un enregistrement et une réouverture.
    const persistance = readFileSync(join("src", "ui", "hooks", "usePersistance.ts"), "utf8");
    const restauration = readFileSync(join("src", "ui", "App.tsx"), "utf8");
    const absents = (source: string) => [...CHAMPS_ENREGISTRES].filter((c) => !source.includes(c));
    expect(absents(persistance), "enregistré par la table, ignoré par la sauvegarde").toEqual([]);
    expect(absents(restauration), "enregistré par la table, ignoré par la réouverture").toEqual([]);
  });

  it("DEUX GENRES NE SE PARTAGENT PAS UN CHAMP", () => {
    const vus = new Map<string, string>();
    const doubles: string[] = [];
    for (const [nom, g] of Object.entries(GENRES_DE_SAISIE)) {
      for (const c of g.champs) {
        if (vus.has(c)) doubles.push(`${c} : ${vus.get(c)} et ${nom}`);
        vus.set(c, nom);
      }
    }
    expect(doubles, "un champ partagé rendrait sa classe ambiguë").toEqual([]);
  });
});
