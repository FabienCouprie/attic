// core/saisies.test.ts — La table des genres de saisie reproduit-elle ce qui était écrit à la main ?
//
// CE QUE CES CAS TIENNENT. D'abord que la dérivation n'a rien perdu : les listes qu'elle remplace
// sont écrites ici telles qu'elles étaient, et la table doit les rendre. Un refactoring de
// listes qui gouvernent la persistance ne se croit pas sur parole, il se démontre — s'y tromper fait
// perdre à la personne un fichier qu'elle avait chargé.
//
// PUIS CE QU'ELLE RÉCUPÈRE. Cinq champs étaient enregistrés dans le projet et relus à l'ouverture
// sans figurer parmi les saisies : un nœud copié les perdait en silence. Ils sont nommés un par un,
// avec leur raison, pour qu'on voie ce que la table a changé et pourquoi.
import { describe, expect, it } from "vitest";
import {
  CHAMPS_DE_SAISIE, CHAMPS_DE_STRUCTURE, CHAMPS_DU_PROJET, CHAMPS_ENREGISTRES, CHAMPS_MEDIA,
  CHAMPS_RECHARGEABLES, GENRES_DE_SAISIE,
} from "./saisies";
import { CHAMPS_COPIABLES, CHAMPS_RESULTAT, CHAMPS_UTILISATEUR } from "./classes-de-champs";

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
  // Ce que `ui/projet-a-ecrire.ts` écrivait d'un nœud jusqu'au 2026-11-11, dans son ordre à lui.
  projet: ["ficheId", "parametres", "audioNom", "audioChemin", "midiNom", "imageNom", "svgNom",
    "zonesSelectionnees", "sfzChemin", "sfzNom", "sequenceNotes", "morceaux", "portsVisibles",
    "portsVisiblesSortie", "nomFichier", "nom", "nomEn", "couleur", "bulle", "bulleOuverte"],
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
  ["pureDataNom", "le nom de ce patch, que sa vue écrivait sur le nœud sans qu'aucune table le déclare"],
  ["couleur", "la couleur donnée au nœud, enregistrée et relue mais perdue à chaque copie"],
  ["morceaux", "le découpage posé sur la ligne de temps d'un montage, qu'aucune sauvegarde ne gardait"],
]);

const tri = (s: Iterable<string>) => [...s].sort();

describe("la table des genres de saisie", () => {
  it("REND CE QU'UN PROJET ENREGISTRAIT, et rien ne s'y perd", () => {
    const perdus = AVANT.conserves.filter((c) => !CHAMPS_ENREGISTRES.has(c));
    expect(perdus, "un champ qui cesserait d'être enregistré disparaîtrait du projet").toEqual([]);
    // Ce qu'elle ajoute : la couleur, qui était déjà écrite par la persistance sans figurer dans la
    // liste blanche de l'export. Le reste des ajouts vaut pour les saisies, cas plus bas.
    //
    // ET LE DÉCOUPAGE DU MONTAGE, qui n'était écrit NULLE PART : ni dans la table, ni dans la
    // sauvegarde, ni dans la reprise de session. Un montage découpé revenait intact de son fichier,
    // en silence. C'est exactement ce que le cas « aux deux bouts de la persistance » surveille, et
    // il n'avait rien à surveiller tant que la table ignorait ces deux champs.
    //
    // LES PISTES « VIDÉES » DU MONTAGE EN SONT SORTIES le 2026-11-06 : une source branchée apparaît
    // toujours, et rien ne lit plus cette liste. Voir `core/saisies.ts`.
    //
    // ET LE CHEMIN D'UNE PISTE AUDIO, décidé par Fabien le 2026-11-11 : le projet l'écrivait déjà,
    // la table ne le disait pas. Le fichier ne change pas, la table cesse de se taire.
    expect(tri([...CHAMPS_ENREGISTRES].filter((c) => !AVANT.conserves.includes(c))))
      .toEqual(["audioChemin", "couleur", "morceaux"]);
  });

  it("LE PROJET ÉCRIT LES VINGT CHAMPS QU'IL ÉCRIVAIT À LA MAIN, ni plus ni moins", () => {
    expect(tri(CHAMPS_DU_PROJET), "la liste dérivée des tables doit être celle que le projet écrivait").toEqual(tri(AVANT.projet));
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
    // encore leurs clés à la main : `ui/projet-a-ecrire.ts` d'un côté, la restauration de
    // `useEnCours.ts` de l'autre. Tant qu'ils le font, un genre ajouté à la table sans être ajouté là serait écrit par
    // la table et perdu par la persistance, sans que rien ne le dise. C'est la divergence même que
    // cette table existe pour empêcher ; ici elle est surveillée plutôt que supprimée, parce que
    // réécrire ces deux sites demande d'éprouver un enregistrement et une réouverture.
    // LE CÔTÉ QUI ÉCRIT A CHANGÉ DE FICHIER le 2026-11-08 : les listes de champs sont sorties de
    // `ui/hooks/usePersistance.ts` avec le corps qui les écrit. Ce cas lit là où elles sont, sans
    // quoi il chercherait les champs dans un fichier qui ne les porte plus.
    //
    // LE CÔTÉ QUI ÉCRIT LE FICHIER NE SE LIT PLUS DANS LE TEXTE depuis le 2026-11-11 : il tire sa
    // liste de `CHAMPS_DU_PROJET`, et `ui/projet-a-ecrire.test.ts` l'éprouve en l'exécutant. Lu dans
    // le texte après ce changement, ce cas est tombé sur cinq noms que seule la liste du fichier
    // portait : l'en-cours, écrit dans le même fichier, ne les écrit pas, et la recherche dans le
    // texte entier le masquait.
    //
    // LE CÔTÉ QUI RELIT NE SE LIT PLUS DANS LE TEXTE NON PLUS, depuis la réparation de l'en-cours
    // du même jour : `ui/en-cours-a-relire.ts` relit `CHAMPS_DU_PROJET`, et
    // `ui/en-cours-a-relire.test.ts` fait l'aller-retour entier en l'exécutant, champ par champ. Il
    // reste à ce cas ce qu'aucun des deux ne dit : la table des saisies est contenue dans ce que la
    // persistance transporte, aux deux bouts.
    expect([...CHAMPS_ENREGISTRES].filter((c) => !CHAMPS_DU_PROJET.has(c)), "enregistré par la table, ignoré par la persistance").toEqual([]);
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

describe("la table de la structure du graphe", () => {
  const structure = Object.keys(CHAMPS_DE_STRUCTURE);

  it("AUCUN CHAMP DE STRUCTURE NE SUIT UNE COPIE NI UN COUPER-COLLER", () => {
    // Ce sont les deux listes que `ui/hooks/useCopierColler.ts` passe à sa copie.
    expect(structure.filter((c) => CHAMPS_COPIABLES.has(c) || CHAMPS_UTILISATEUR.has(c)),
      "un nœud collé arriverait dans une bulle qui n'existe peut-être pas").toEqual([]);
  });

  it("AUCUN N'EST EFFACÉ PAR UNE REMISE À ZÉRO, qui n'efface que des résultats", () => {
    expect(structure.filter((c) => CHAMPS_RESULTAT.has(c))).toEqual([]);
  });

  it("LA STRUCTURE N'EST PAS UNE SAISIE, et le projet écrit exactement les deux tables", () => {
    expect(structure.filter((c) => CHAMPS_DE_SAISIE.has(c))).toEqual([]);
    expect([...CHAMPS_DU_PROJET]).toEqual([
      ...CHAMPS_ENREGISTRES, ...structure.filter((c) => CHAMPS_DE_STRUCTURE[c].enregistre),
    ]);
  });
});
