// plugins/provenance-modeles.test.ts — D'où viennent les modèles, et la règle qui le dit.
//
// LA RÈGLE DU DÉPÔT : un modèle vient de la release `assets`, jamais d'un tiers. Elle a trois
// raisons, et chacune a été vérifiée sur un composant réel avant d'être écrite ici.
//
//   HORS LIGNE. Une installation sans réseau doit pouvoir employer le nœud. Les sept nœuds Magenta
//   ne le pouvaient pas, là où tous les autres nœuds à modèle le pouvaient ; les deux nœuds de
//   reconnaissance vocale non plus.
//
//   INTÉGRITÉ. Ce qui arrive doit être vérifiable. C'est l'affaire de `modeles-manifest.json`, qui
//   porte la taille et l'empreinte de chaque fichier ; un téléchargement direct chez un tiers n'a
//   ni l'une ni l'autre, et un fichier tronqué devient un nœud qui échoue sans dire pourquoi.
//
//   MAÎTRISE DE L'ADRESSE. Un tiers déplace, renomme ou retire ce qu'il héberge, et le nœud casse
//   sans que rien n'ait changé chez nous. Le dépôt d'origine du classificateur de genre a disparu
//   le 22 septembre 2026, et c'est pourquoi ce modèle n'est pas rediffusable.
//
// POURQUOI UN TEST ET NON UNE CONSIGNE. Le défaut s'est reproduit quatre fois : les points de
// contrôle Magenta, puis `whisper-en` et `sherpa-asr`, et il en reste deux. Une règle qu'on répète
// dans les en-têtes se perd ; celle-ci se mesure sur la source.
//
// CE QUE CE GARDE CHERCHE EST UNE FORME, et non un nom de nœud : une adresse d'hébergeur de modèles
// dans la source d'un composant ou d'un worker. Les exceptions sont nommées une à une, avec leur
// raison, et c'est la liste qui doit rétrécir.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const RACINE = path.resolve(__dirname, "..");

/** Les hébergeurs tiers d'où un modèle pourrait venir. */
const HEBERGEURS = /https?:\/\/[^"'`\s]*(?:huggingface\.co|storage\.googleapis\.com|tfhub\.dev|raw\.githubusercontent\.com|kaggle\.com)[^"'`\s]*/g;

/**
 * Ce qui a le droit de nommer un tiers, et pourquoi.
 *
 * CHAQUE LIGNE EST UNE DETTE, pas une permission : elle dit ce qui reste à faire passer par la
 * release. Les deux premières sont des nœuds qui chargent encore leur modèle chez un tiers à
 * l'exécution ; les suivantes ne chargent rien et nomment un tiers pour une autre raison.
 */
const EXCEPTIONS: Record<string, string> = {
  "ddsp.ts":
    "DETTE. Les quatre points de contrôle DDSP — violon, flûte, saxophone, trompette — sont chargés "
    + "depuis storage.googleapis.com à l'exécution. Même traitement à faire que pour Magenta et les "
    + "deux nœuds de reconnaissance vocale : miroir local, entrée au manifeste, publication.",
  "tts.ts":
    "DETTE. Les vecteurs de locuteur sont chargés depuis huggingface.co à l'exécution. Même "
    + "traitement à faire.",
  "kokoro-local.js":
    "PAS UNE DETTE, et c'est écrit sur place : l'adresse amont sert à RECONNAÎTRE les requêtes de "
    + "la bibliothèque pour les détourner vers le miroir local. Le repli vers l'amont est délibéré, "
    + "l'application installée n'ayant pas le miroir.",
};

/**
 * Les adresses d'un fichier, ou une liste vide.
 *
 * `String.prototype.match` AVEC UN MOTIF GLOBAL, et non `RegExp.prototype.test` : ce dernier garde
 * un `lastIndex` entre deux appels sur le même motif, de sorte qu'un fichier sur deux répondait
 * faux. Le premier cas de ce fichier passait, le second non — écrit, vu, corrigé.
 */
const adressesTierces = (texte: string): string[] => texte.match(HEBERGEURS) ?? [];

/** Les fichiers de composants et de workers, où un chargement de modèle peut se cacher. */
function sources(): { nom: string; chemin: string }[] {
  const out: { nom: string; chemin: string }[] = [];
  for (const dossier of ["plugins", "workers"]) {
    const d = path.join(RACINE, dossier);
    if (!fs.existsSync(d)) continue;
    for (const nom of fs.readdirSync(d)) {
      if (!/\.(ts|js)$/.test(nom) || nom.endsWith(".test.ts")) continue;
      out.push({ nom, chemin: path.join(d, nom) });
    }
  }
  return out;
}

describe("la provenance des modèles", () => {
  it("AUCUN COMPOSANT NE NOMME UN HÉBERGEUR TIERS, hors les exceptions qui portent leur raison", () => {
    const fautifs: string[] = [];
    for (const { nom, chemin } of sources()) {
      const trouvees = adressesTierces(fs.readFileSync(chemin, "utf8"));
      if (trouvees.length === 0 || EXCEPTIONS[nom]) continue;
      fautifs.push(`${nom} → ${[...new Set(trouvees)].slice(0, 2).join(", ")}`);
    }
    expect(fautifs, "un modèle doit venir de la release « assets »").toEqual([]);
  });

  it("et chaque exception est encore utile : une dette payée se retire de la liste", () => {
    // Une exception qui ne correspond plus à rien est pire qu'absente : elle fait croire qu'il reste
    // du travail là où il n'y en a plus, et elle couvrirait un retour en arrière sans qu'on le voie.
    const nomsVus = new Set(sources().map((s) => s.nom));
    const avecTiers = new Set(
      sources()
        .filter(({ chemin }) => adressesTierces(fs.readFileSync(chemin, "utf8")).length > 0)
        .map((s) => s.nom),
    );
    for (const nom of Object.keys(EXCEPTIONS)) {
      expect(nomsVus.has(nom), `${nom} n'existe plus : retirer son exception`).toBe(true);
      expect(avecTiers.has(nom), `${nom} ne nomme plus de tiers : retirer son exception`).toBe(true);
    }
  });

  it("les deux nœuds de reconnaissance vocale prennent leur modèle sous `oonx`", async () => {
    // LE CAS QUI TIENT LA CORRECTION. Le chemin se construit dans la page et voyage jusqu'au worker ;
    // c'est donc lui qu'on interroge, et non la présence d'une chaîne dans la source.
    const sherpa = await import("./sherpa-asr");
    const whisper = await import("./speech-to-text");
    expect(sherpa.DOSSIER_MODELE).toBe("oonx/sherpa-asr-whisper-tiny");
    expect(`${whisper.RACINE_MODELES}/${whisper.NOM_MODELE}`).toBe("oonx/whisper-base-en");
  });

  it("et les deux paquets sont au manifeste, avec une adresse sur la release", async () => {
    const manifeste = JSON.parse(
      fs.readFileSync(path.resolve(RACINE, "..", "scripts", "modeles-manifest.json"), "utf8"),
    );
    for (const id of ["sherpa-asr-whisper-tiny", "whisper-base-en"]) {
      const entree = manifeste.modeles.find((m: { id: string }) => m.id === id);
      expect(entree, id).toBeTruthy();
      expect(entree.source.url, id).toMatch(/^https:\/\/github\.com\/FabienCouprie\/attic\/releases\/download\/assets\//);
      expect(entree.source.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      expect(entree.fichiers.length, id).toBeGreaterThan(0);
    }
  });
});
