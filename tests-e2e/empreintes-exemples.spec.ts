// tests-e2e/empreintes-exemples.spec.ts — Le SON que rend chaque exemple, surveillé.
//
// POURQUOI CE GARDE EXISTE, ET IL A UNE DATE. Le 2026-10-25, « Étaler sur le clavier » rendait un
// son faux jusqu'à CENT TRENTE CENTS — plus d'un demi-ton — avec tous les nœuds annonçant
// « Terminé » et quatre gardes au vert. Aucun ne regardait le son : ils vérifiaient un plan, un
// transpositeur factice, une déclaration, une absence d'erreur.
//
// CE QU'IL SURVEILLE : ce qu'on ENTEND en ouvrant un exemple et en pressant Lancer. Chaque nœud qui
// produit de l'audio expose son aperçu en WAV ; le garde les empreint tous. Il couvre donc les
// CHAÎNES ENTIÈRES, là où `empreintes.spec.ts` couvre des composants ISOLÉS nourris d'un son
// d'essai. Un défaut né de la rencontre de deux composants n'est visible que d'ici.
//
// IL MESURE SON PROPRE BRUIT AVANT DE SURVEILLER QUOI QUE CE SOIT, et c'est la pièce qui l'a sauvé.
// Un premier jet comparait à la neuvième décimale : relancé sans qu'une ligne ait changé, il a
// annoncé quinze écarts. Deux sortes, qu'il fallait séparer plutôt que noyer sous une précision
// choisie au hasard :
//
//   LE BRUIT FLOTTANT — 0,051016711 contre 0,051016712 — qui ne vient d'aucun changement.
//   LA VRAIE VARIABILITÉ — `paulstretch` varie de 5 %, un réseau DDSP de 2 %, une boîte à groove
//   de 0,2 % : ces composants tirent au hasard, et leur son n'est pas le même deux fois.
//
// L'ÉTABLISSEMENT JOUE DONC CHAQUE EXEMPLE TROIS FOIS. Ce qui ne se reproduit pas est déclaré
// VARIABLE, avec l'écart relevé, et sort de la surveillance — mieux vaut un garde qui dit ce qu'il
// ne tient pas qu'un garde qui crie au loup. Le reste est comparé à un pour cent près.
//
// POURQUOI TROIS ET NON DEUX, ET C'EST MESURÉ. Avec deux passes, `groove-etire-et-tourne` a été
// déclaré stable — ses deux relevés tenaient dans un demi pour cent — puis la passe de comparaison
// suivante l'a vu bouger de 1,66 % sur la crête. DEUX ÉCHANTILLONS NE CARACTÉRISENT PAS UNE
// VARIABLE ALÉATOIRE : ils disent seulement que deux tirages se ressemblaient.
//
// ET CE GARDE RESTE STATISTIQUE. Trois passes ne prouvent pas une stabilité éternelle ; un faux
// rouge reste possible sur un composant qui tire au hasard. C'est pourquoi son message ne dit pas
// « faute » mais « à écouter » : il désigne un son à juger de l'oreille, il ne tranche pas.
//
//   npm run test:empreintes-exemples
//   EXEMPLE=un-son-projete-en-microtonal npm run test:empreintes-exemples
//   ECRIRE_EMPREINTES_EXEMPLES=1 npm run test:empreintes-exemples   (après avoir ÉCOUTÉ)
//
// IL N'EST PAS DANS LA PASSE ORDINAIRE : il lance des graphes complets dans un navigateur, ce qui se
// compte en minutes. C'est un garde qu'on lance, comme la base des composants.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { etatDesNoeuds, semerEtLancer } from "./pilote-graphe";
import { serveurDeVerification } from "./serveur-de-developpement";

const devUrl = serveurDeVerification(5240);
const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const CHEMIN = resolve(ICI, "empreintes-exemples.json");
const ecrire = process.env.ECRIRE_EMPREINTES_EXEMPLES === "1";
const SEUL = process.env.EXEMPLE ?? "";

/**
 * L'écart relatif toléré sur le NIVEAU, et il est mesuré, non choisi.
 *
 * Le bruit flottant d'un rendu complet se tient sous le dix-millième ; un pour cent le couvre
 * largement tout en laissant tomber le garde sur ce qui s'entend. La longueur, les canaux et le
 * taux, eux, se comparent À L'IDENTIQUE : ils ne bruitent pas, et un rendu qui perdrait sa queue ou
 * passerait en mono garderait à peu près le même niveau.
 */
const TOLERANCE = 0.01;

/**
 * La crête se compare AUSSI SERRÉ que la valeur efficace, et c'est elle qui tient ce garde.
 *
 * J'AVAIS COMMENCÉ PAR LA DESSERRER À CINQ POUR CENT, pour une raison qui semblait bonne : une
 * crête est un seul échantillon sur des millions, donc la statistique la plus fragile du relevé,
 * et `groove-etire-et-tourne` la faisait bouger de 1,66 % d'une passe à l'autre en atterrissant
 * sur le plafond d'un limiteur. Mais cet exemple est écarté depuis, pour un défaut qui lui est
 * propre : la raison de desserrer avait disparu, et le desserrage était resté.
 *
 * CE QU'IL AURAIT COÛTÉ, MESURÉ EN REPLANTANT LE DÉFAUT DES CENT TRENTE CENTS. L'aperçu de la
 * banque bouge alors de quatre MILLIÈMES de pour cent en valeur efficace, et de **6,5 % en crête**.
 * À cinq pour cent de tolérance, le garde attrapait son défaut fondateur avec un point et demi de
 * marge — par chance de seuil. À un pour cent, il l'attrape avec un facteur six.
 */
const TOLERANCE_CRETE = 0.01;

/**
 * Le centroïde, en demi-tons — et CE N'EST PAS le détecteur de hauteur que j'espérais.
 *
 * JE L'AI AJOUTÉ POUR UNE RAISON QUI S'EST RÉVÉLÉE FAUSSE, et l'écrire vaut mieux que de laisser
 * croire qu'il fait ce qu'il ne fait pas. Le défaut des cent trente cents replanté, la valeur
 * efficace ne bougeait que de quatre millièmes de pour cent : j'en ai conclu qu'il fallait un axe
 * qui suive la hauteur. Mesuré : le centroïde bouge alors de **dix-sept millièmes de demi-ton**,
 * six fois moins que le seuil.
 *
 * POURQUOI. Un centroïde est une brillance GLOBALE, non une hauteur. L'aperçu de cet exemple est
 * une cloche dont le centroïde est à 12,4 kHz, portée par un spectre large : transposer sa région
 * fondamentale de quelques dizaines de cents ne le déplace presque pas. Sur un son tonique, il
 * bougerait ; sur un son de cloche, non.
 *
 * CE QU'IL APPORTE QUAND MÊME : il voit ce qu'un niveau ne voit pas — un filtre déplacé, une bande
 * perdue, un rééchantillonnage. Il reste donc, à sa vraie place, qui est à côté des autres axes et
 * non au-dessus. CE QUI ATTRAPE LE DÉFAUT DES CENT TRENTE CENTS EST LA CRÊTE, à 6,5 % contre un
 * seuil de un.
 */
const TOLERANCE_CENTROIDE_DEMI_TONS = 0.1;

interface MesureLecteur {
  rms: number; crete: number; trames: number; canaux: number; taux: number;
  /** Le centroïde spectral, en hertz : l'axe qui suit la hauteur. */
  centroide: number;
}
type Empreinte = { lecteurs: Record<string, MesureLecteur>; erreurs: string[] };

/**
 * Un exemple qui attend un fichier de l'utilisateur ne se surveille pas.
 *
 * « Entrée audio » reçoit un son que QUELQU'UN dépose : sans lui tout ce qui suit tombe, avec lui le
 * résultat dépend du fichier. Une empreinte en serait flottante d'une machine à l'autre. La règle
 * est MÉCANIQUE — elle lit le graphe, elle ne tient aucune liste de noms — et le motif est écrit
 * dans la base.
 */
const ATTEND_UN_FICHIER = "entree-audio";

/**
 * Les exemples dont le son NE SE REPRODUIT PAS, avec la mesure qui le dit.
 *
 * CECI N'EST PAS UNE EXEMPTION DE CONFORT : c'est la trace écrite d'un défaut connu, et la ligne
 * disparaît le jour où il est réparé. Elle est tenue à la main parce qu'aucune règle mécanique ne
 * l'attrape : une irrégularité intermittente échappe à l'échantillonnage, elle se diagnostique.
 *
 * LA LISTE EST VIDE, ET ELLE L'EST POUR UNE BONNE RAISON. Elle a porté `groove-etire-et-tourne` le
 * temps d'une journée : ce garde a découvert, à son premier usage, que « Boîte à groove » annonçait
 * « graine 4242 » dans son propre message et rendait `0.172357839` puis `0.170609203` sur deux
 * passes du banc. Sa génération MIDI était bien semée ; son rendu de batterie ne l'était pas, Tone
 * tirant au hasard le décalage de départ de chaque frappe dans son tampon de bruit. La graine va
 * désormais jusque-là, et les trois passes rendent `0.171573496` au neuvième chiffre.
 */
const SON_NON_REPRODUCTIBLE: Record<string, string> = {};

const tous = readdirSync(join(RACINE, "exemples"))
  .filter((n) => n.endsWith(".json"))
  .filter((n) => !SEUL || n === `${SEUL}.json` || n === SEUL)
  .sort();

const horsDePortee = tous.filter((f) => {
  const g = JSON.parse(readFileSync(join(RACINE, "exemples", f), "utf8")) as
    { nodes?: { data?: { ficheId?: string } }[] };
  return (g.nodes ?? []).some((n) => n.data?.ficheId === ATTEND_UN_FICHIER);
});
const exemples = tous.filter((f) => !horsDePortee.includes(f) && !SON_NON_REPRODUCTIBLE[f]);

const relatif = (a: number, b: number): number => {
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m > 0 ? Math.abs(a - b) / m : 0;
};

/**
 * Ce qui sépare deux relevés du même exemple. Vide quand ils disent la même chose.
 *
 * `facteur` resserre les tolérances à l'ÉTABLISSEMENT, et cette marge est ce qui rend la détection
 * fiable. Pour être surveillé à un pour cent, un exemple doit se reproduire à un DEMI pour cent :
 * sans cette marge, un composant qui varie d'environ un pour cent est déclaré stable ou variable
 * SELON LA CHANCE DU TIRAGE — ce qui est arrivé deux fois de suite à `groove-etire-et-tourne`, dont
 * les trois passes d'établissement se sont accordées avant qu'une quatrième ne bouge de 1,45 %.
 */
function ecartsEntre(avant: Empreinte, apres: Empreinte, quoi: string, facteur = 1): string[] {
  const out: string[] = [];
  const dire = (m?: MesureLecteur) => m
    ? `${m.rms.toFixed(6)}/${m.crete.toFixed(6)} · ${m.centroide.toFixed(1)} Hz`
      + ` · ${m.trames} trames · ${m.canaux}ch · ${m.taux} Hz`
    : "(aucun aperçu)";
  for (const id of new Set([...Object.keys(avant.lecteurs), ...Object.keys(apres.lecteurs)])) {
    const a = avant.lecteurs[id], b = apres.lecteurs[id];
    if (!a || !b) { out.push(`${quoi} · ${id}\n    avant : ${dire(a)}\n    après : ${dire(b)}`); continue; }
    const dRms = relatif(a.rms, b.rms), dCrete = relatif(a.crete, b.crete);
    // Le centroïde se compare en DEMI-TONS : un écart de cinquante hertz ne veut pas dire la même
    // chose à deux cents hertz qu'à cinq mille, et c'est en hauteur qu'on l'entend.
    const dCentroide = a.centroide > 0 && b.centroide > 0
      ? Math.abs(12 * Math.log2(b.centroide / a.centroide)) : 0;
    const forme = a.trames !== b.trames || a.canaux !== b.canaux || a.taux !== b.taux;
    if (forme || dRms > TOLERANCE * facteur || dCrete > TOLERANCE_CRETE * facteur
      || dCentroide > TOLERANCE_CENTROIDE_DEMI_TONS * facteur) {
      out.push(`${quoi} · ${id}  (${(dRms * 100).toFixed(3)} % d'efficace,`
        + ` ${(dCrete * 100).toFixed(3)} % de crête, ${dCentroide.toFixed(3)} demi-ton de couleur)`
        + `\n    avant : ${dire(a)}\n    après : ${dire(b)}`);
    }
  }
  if (avant.erreurs.join("|") !== apres.erreurs.join("|")) {
    out.push(`${quoi} · nœuds en erreur\n    avant : ${avant.erreurs.join(", ") || "aucun"}`
      + `\n    après : ${apres.erreurs.join(", ") || "aucun"}`);
  }
  return out;
}

/**
 * Joue un exemple et rend l'empreinte de chaque aperçu audio.
 *
 * LE PILOTAGE N'EST PAS ÉCRIT ICI, et c'est voulu : semer, lancer, attendre la fin et attendre que
 * les aperçus se posent vit dans `pilote-graphe.ts`, que le verbe `exécuter` emploie aussi. Les
 * trois corrections qu'il porte ont chacune coûté une mesure fausse ; un second exemplaire les
 * aurait perdues une à une. Ne reste ici que ce qui est propre à ce garde : la MESURE.
 *
 * LE LECTEUR DE WAV S'IMPORTE DANS LA PAGE, comme le banc importe les siens. Un premier jet lisait
 * le SOURCE du module pour le passer à `new Function` : c'est du TypeScript, que le navigateur ne
 * parse pas, et la passe s'est arrêtée sur « Unexpected identifier 'MesureWav' ».
 */
async function jouer(page: import("@playwright/test").Page, fichier: string): Promise<Empreinte> {
  const graphe = readFileSync(join(RACINE, "exemples", fichier), "utf8");
  await semerEtLancer(page, devUrl, graphe, { profondeurExport: 32 });

  const lecteurs = await page.evaluate(async () => {
    const { lireWav, tamponDepuisWav } = await import("/src/audio/empreinte-wav.ts") as unknown as {
      lireWav: (o: ArrayBuffer) => { rms: number; crete: number; trames: number; canaux: number; taux: number };
      tamponDepuisWav: (o: ArrayBuffer) => AudioBuffer;
    };
    // LE CENTROÏDE VIENT DU MODULE DU DÉPÔT, celui qu'emploient les nœuds Meyda : un second calcul
    // de spectre écrit ici dériverait de celui que l'application montre.
    const { calculerCentroidSpectralMeyda } = await import("/src/audio/analyse-descripteurs.ts") as unknown as
      { calculerCentroidSpectralMeyda: (b: AudioBuffer) => { valeur: number } };
    const lecteurs: Record<string, MesureLecteur> = {};
    for (const a of Array.from(document.querySelectorAll("[data-id] audio")) as HTMLAudioElement[]) {
      const id = (a.closest("[data-id]") as HTMLElement | null)?.dataset.id;
      if (!id || !a.src) continue;
      try {
        const octets = await (await fetch(a.src)).arrayBuffer();
        const m = lireWav(octets);
        const centroide = calculerCentroidSpectralMeyda(tamponDepuisWav(octets)).valeur;
        lecteurs[id] = { rms: m.rms, crete: m.crete, trames: m.trames, canaux: m.canaux, taux: m.taux, centroide };
      } catch {
        lecteurs[id] = { rms: -1, crete: -1, trames: -1, canaux: -1, taux: -1, centroide: -1 };
      }
    }
    return lecteurs;
  }) as Record<string, MesureLecteur>;

  // L'ERREUR PORTE SON MESSAGE, et non son seul identifiant : un relevé qui dirait « six nœuds en
  // erreur » obligerait à rejouer l'exemple pour savoir lequel et pourquoi.
  const erreurs = (await etatDesNoeuds(page))
    .filter((n) => n.statut === "erreur")
    .map((n) => (n.message ? `${n.id} : ${n.message.slice(0, 90)}` : n.id))
    .sort();
  return { lecteurs, erreurs };
}

test.describe("le son que rendent les exemples", () => {
  test.setTimeout(3_600_000);

  test("chaque aperçu audio rend le son qu'il rendait", async ({ page }) => {
    const fichier = existsSync(CHEMIN)
      ? JSON.parse(readFileSync(CHEMIN, "utf8")) as { exemples: Record<string, Empreinte>; variables?: Record<string, string> }
      : { exemples: {}, variables: {} };
    if (!ecrire) {
      expect(existsSync(CHEMIN),
        "empreintes-exemples.json est absent : établissez-le avec ECRIRE_EMPREINTES_EXEMPLES=1").toBe(true);
    }

    // ─── L'ÉTABLISSEMENT : chaque exemple joué DEUX FOIS, et ce qui ne se reproduit pas sort ───
    if (ecrire) {
      const stables: Record<string, Empreinte> = {};
      const variables: Record<string, string> = {};
      for (const f of exemples) {
        const passes: Empreinte[] = [];
        for (let i = 0; i < 3; i++) passes.push(await jouer(page, f));
        // TOUTES LES PAIRES, et non la seule première contre la dernière : un tirage qui s'écarte
        // au milieu doit compter autant qu'un autre.
        const bruit = [
          ...ecartsEntre(passes[0], passes[1], f, 0.5),
          ...ecartsEntre(passes[1], passes[2], f, 0.5),
          ...ecartsEntre(passes[0], passes[2], f, 0.5),
        ];
        if (bruit.length === 0) {
          stables[f] = passes[2];
          console.log(`${f.padEnd(42)} stable · ${Object.keys(passes[2].lecteurs).length} aperçu(s)`);
        } else {
          variables[f] = bruit.join(" | ").slice(0, 500);
          console.log(`${f.padEnd(42)} VARIABLE · ${bruit.length} écart(s) entre trois passes`);
        }
      }
      writeFileSync(CHEMIN, `${JSON.stringify({
        profondeurExport: 32, toleranceEfficace: TOLERANCE, toleranceCrete: TOLERANCE_CRETE, toleranceCentroideDemiTons: TOLERANCE_CENTROIDE_DEMI_TONS,
        horsDePortee: Object.fromEntries(horsDePortee.map((f) =>
          [f, `attend un fichier de l'utilisateur par « ${ATTEND_UN_FICHIER} »`])),
        defautsConnus: SON_NON_REPRODUCTIBLE,
        variables, exemples: stables,
      }, null, 2)}\n`, "utf8");
      console.log(`\nbase écrite : ${Object.keys(stables).length} surveillé(s), `
        + `${Object.keys(variables).length} variable(s), ${horsDePortee.length} hors de portée.`);
      return;
    }

    // ─── LA COMPARAISON ───
    const base = fichier.exemples;
    const aComparer = exemples.filter((f) => base[f]);
    const neufs = exemples.filter((f) => !base[f] && !(fichier.variables ?? {})[f]);
    const ecarts: string[] = [];
    for (const f of aComparer) {
      const apres = await jouer(page, f);
      const e = ecartsEntre(base[f], apres, f);
      ecarts.push(...e);
      console.log(`${f.padEnd(42)} ${e.length === 0 ? "identique" : `${e.length} ÉCART(S)`}`);
    }

    expect(neufs, [
      "", "Ces exemples ne sont pas dans la base du son :", ...neufs.map((f) => `  ${f}`),
      "", "Écoutez-les, puis inscrivez-les avec ECRIRE_EMPREINTES_EXEMPLES=1.", "",
    ].join("\n")).toEqual([]);

    expect(ecarts, [
      "",
      "LE SON D'UN EXEMPLE A CHANGÉ. Ce n'est pas forcément une faute — c'est forcément à écouter.",
      "",
      "Un nœud peut annoncer « Terminé » et rendre un son faux : c'est arrivé, à cent trente cents.",
      "Lancez `npm run ecouter` sur les composants en cause, écoutez, et si le changement est voulu,",
      "relisez le diff puis lancez ECRIRE_EMPREINTES_EXEMPLES=1.",
      "",
      ...ecarts,
      "",
    ].join("\n")).toEqual([]);
  });
});
