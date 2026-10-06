// electron/ressource-locale.test.ts — Le schéma qui sert une ressource livrée à un worker.
//
// POURQUOI CE TEST, ET IL EST DE SÛRETÉ AVANT D'ÊTRE DE JUSTESSE. Ce module transforme une chaîne
// venue de la page en chemin de fichier lu sur le disque. Un segment `..` qui passerait donnerait à
// une page le moyen de lire n'importe quoi hors des ressources — un fichier de configuration, une
// clé, le fichier de projet d'à côté. La remontée est donc refusée AVANT toute résolution, et c'est
// ce que ces cas tiennent.
//
// LE RESTE EST DE JUSTESSE : le schéma existe parce que les sept nœuds Magenta chargent leurs
// modèles dans un Web Worker, où il n'y a ni preload ni `fetch` de `file:`, et parce que la
// bibliothèque n'accepte qu'une URL. Une adresse mal découpée donnerait un modèle introuvable, donc
// sept nœuds muets dans l'application empaquetée seulement.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const requerir = createRequire(import.meta.url);
const { SCHEMA, cheminRelatifDepuisUrl, typeDeContenu, servir } = requerir("./ressource-locale.cjs");

describe("le chemin demandé par une URL du schéma", () => {
  it("l'hôte porte le premier segment, et le reste suit", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/melody_rnn/config.json`))
      .toBe("magenta/melody_rnn/config.json");
  });

  it("un fragment de poids, qui n'a pas d'extension, passe comme le reste", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/melody_rnn/group1-shard1of4`))
      .toBe("magenta/melody_rnn/group1-shard1of4");
  });

  it("les caractères échappés sont rendus à leur valeur", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/mon%20modele/config.json`))
      .toBe("magenta/mon modele/config.json");
  });

  // ── LA REMONTÉE EST REFUSÉE, et c'est la raison d'être de ce test ──
  it("UN SEGMENT « .. » EST REFUSÉ, sous toutes ses formes", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/../../etc/passwd`)).toBeNull();
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/a/../../b`)).toBeNull();
    // Échappé, le point reste un point : c'est pourquoi le contrôle vient APRÈS le décodage.
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/%2e%2e/secret`)).toBeNull();
  });

  it("un segment « . » est refusé aussi : il n'a aucune raison d'apparaître", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/./config.json`)).toBeNull();
  });

  it("une adresse vide ne désigne rien", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://`)).toBeNull();
    expect(cheminRelatifDepuisUrl("pas une url")).toBeNull();
  });

  // ── ET LE SCHÉMA NE SERT QUE LES DOSSIERS QU'IL DÉCLARE ──
  //
  // Trouvé en vérifiant le chemin empaqueté : sans cette borne, `attic-res://package.json`
  // résolvait et rendait le fichier. Le schéma donnait alors accès à tout ce que le résolveur sait
  // atteindre — la racine du projet en développement, `resources/` dans l'application installée.
  // Attic installant des nœuds à chaud, du code tiers tourne dans la page : la borne n'est pas
  // théorique.
  it("UN FICHIER HORS DES DOSSIERS SERVIS EST REFUSÉ, fût-il livré", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://package.json`)).toBeNull();
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://src/plugins/notices.ts`)).toBeNull();
    // Les autres dossiers de `public/` sont livrés eux aussi, et ne sont pas servis pour autant :
    // la borne porte sur ce que le schéma DÉCLARE, non sur ce qui se trouve à côté.
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://sf2/banque.sf2`)).toBeNull();
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://piper-tts/voix.onnx`)).toBeNull();
  });

  it("sert les modèles de `oonx`, qu'il a fallu ouvrir pour la reconnaissance vocale", () => {
    // Les deux modèles ASR venaient d'un tiers à l'exécution ; livrés comme ceux de Magenta, leurs
    // workers les lisent par ce schéma, et le dossier a donc rejoint la liste.
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://oonx/whisper-base-en/config.json`))
      .toBe("oonx/whisper-base-en/config.json");
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://oonx/sherpa-asr-whisper-tiny/tiny-tokens.txt`))
      .toBe("oonx/sherpa-asr-whisper-tiny/tiny-tokens.txt");
    // Et les deux contrôles s'y appliquent comme ailleurs.
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://oonx/../package.json`)).toBeNull();
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://oonx`)).toBeNull();
  });

  it("un dossier servi sans fichier ne désigne rien non plus", () => {
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta`)).toBeNull();
    expect(cheminRelatifDepuisUrl(`${SCHEMA}://magenta/`)).toBeNull();
  });
});

describe("le type de contenu", () => {
  it("le JSON est annoncé comme tel : la bibliothèque le lit par `response.json()`", () => {
    expect(typeDeContenu("magenta/melody_rnn/config.json")).toBe("application/json");
  });

  it("un fragment de poids est un flot d'octets", () => {
    expect(typeDeContenu("magenta/melody_rnn/group1-shard1of4")).toBe("application/octet-stream");
  });
});

describe("ce que le schéma répond", () => {
  const requete = (chemin: string) => ({ url: `${SCHEMA}://${chemin}` });

  it("une ressource résolue est servie avec sa longueur", async () => {
    const octets = Buffer.from("{\"a\":1}");
    const resoudre = (r: string) => (r === "magenta/x/config.json" ? "/faux/chemin" : null);
    // On remplace la lecture par la nôtre en passant par un résolveur qui pointe un fichier réel.
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const d = mkdtempSync(join(tmpdir(), "res-"));
    const f = join(d, "config.json");
    writeFileSync(f, octets);
    const rep = await servir(requete("magenta/x/config.json"), (r: string) => (resoudre(r) ? f : null));
    expect(rep.status).toBe(200);
    expect(rep.headers.get("Content-Type")).toBe("application/json");
    expect(rep.headers.get("Content-Length")).toBe(String(octets.length));
    expect(await rep.text()).toBe("{\"a\":1}");
  });

  it("UNE REMONTÉE N'ATTEINT JAMAIS LE RÉSOLVEUR, et c'est l'ordre qui compte", async () => {
    let appele = false;
    const rep = await servir(requete("magenta/../../secret"), () => { appele = true; return "/secret"; });
    expect(rep.status).toBe(400);
    expect(appele, "le résolveur ne doit pas même être interrogé").toBe(false);
  });

  it("une ressource que le résolveur ne trouve pas rend 404, et non une erreur", async () => {
    const rep = await servir(requete("magenta/absent/config.json"), () => null);
    expect(rep.status).toBe(404);
  });

  it("un chemin résolu vers un fichier inexistant rend 404 lui aussi", async () => {
    const rep = await servir(requete("magenta/x/config.json"), () => "/n/existe/pas/du/tout");
    expect(rep.status).toBe(404);
  });
});
