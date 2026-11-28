#!/usr/bin/env node
// scripts/temoins-soundhelix.mjs : régénérer les témoins de `src/audio/temoins-soundhelix/` à partir
// du programme SoundHelix 0.9 lui-même.
//
// CE QUE SONT CES TÉMOINS. Les rendus que SoundHelix tire des quatre XML d'essai du même dossier :
// le fichier MIDI qu'écrit son lecteur, et un relevé texte de l'harmonie tic par tic, de la matrice
// d'activité et des séquences de chaque piste avant leur passage en MIDI. Les nœuds d'Attic qui
// reprennent ses moteurs se comparent à eux, note pour note quand le moteur ne tire rien au hasard.
// Le format du relevé est lu par `src/audio/temoins-soundhelix.ts`.
//
// RIEN NE S'ENTEND. `scripts/soundhelix/TemoinSoundHelix.java` appelle la génération puis la seule
// écriture du fichier, sans ouvrir de périphérique MIDI. Le programme n'est pas livré avec Attic :
// il faut son installation, et un Java avec `javac`.
//
//   SOUNDHELIX=<dossier de SoundHelix 0.9> JAVA_BIN=<dossier de java et javac> npm run temoins-soundhelix
//
// LES TÉMOINS NE SE RÉÉCRIVENT PAS SANS RAISON. Le nom du morceau est la graine de SoundHelix, et deux
// générations au même nom rendent les mêmes octets : un témoin régénéré qui change dit qu'un XML
// d'essai a changé, ou que l'installation n'est pas la 0.9. Relire le diff avant de le garder.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = join(RACINE, "src", "audio", "temoins-soundhelix");
const SOURCE = join(RACINE, "scripts", "soundhelix", "TemoinSoundHelix.java");

/** Chaque témoin : l'essai qu'il rend, le nom du morceau, et la base du nom de ses deux fichiers. */
export const TEMOINS = [
  { essai: "essai-accords.xml", nom: "attic", base: "accords" },
  { essai: "essai-registre.xml", nom: "attic", base: "registre" },
  { essai: "essai-batterie.xml", nom: "attic", base: "batterie" },
  ...[1, 2, 3, 4, 5].map((n) => ({ essai: "essai-hasard.xml", nom: `attic ${n}`, base: `hasard-${n}` })),
];

function executable(dossier, nom) {
  if (!dossier) return nom;
  const avecExe = join(dossier, `${nom}.exe`);
  return existsSync(avecExe) ? avecExe : join(dossier, nom);
}

function principal() {
  const soundhelix = process.env.SOUNDHELIX;
  if (!soundhelix || !existsSync(join(soundhelix, "SoundHelix.jar"))) {
    console.error("SOUNDHELIX doit nommer le dossier de SoundHelix 0.9, celui qui contient SoundHelix.jar.");
    process.exit(1);
  }
  const java = executable(process.env.JAVA_BIN, "java");
  const javac = executable(process.env.JAVA_BIN, "javac");
  const separateur = process.platform === "win32" ? ";" : ":";
  const classes = mkdtempSync(join(tmpdir(), "attic-temoins-soundhelix-"));
  const chemin = [classes, "SoundHelix.jar", "lib/gnu-getopt.jar", "lib/log4j.jar"]
    .map((p, i) => (i === 0 ? p : join(soundhelix, p)))
    .join(separateur);
  try {
    execFileSync(javac, ["-encoding", "UTF-8", "-cp", chemin, "-d", classes, SOURCE], { stdio: "inherit" });
    mkdirSync(DOSSIER, { recursive: true });
    for (const t of TEMOINS) {
      try {
        execFileSync(java, ["-cp", chemin, "TemoinSoundHelix", join(DOSSIER, t.essai), t.nom,
          join(DOSSIER, `${t.base}.mid`), join(DOSSIER, `${t.base}.txt`)], { stdio: ["ignore", "inherit", "pipe"] });
      } catch (e) {
        // log4j se plaint de n'avoir aucune configuration à chaque lancement : seul le reste compte.
        const erreur = String(e.stderr ?? "").split(/\r?\n/).filter((l) => l && !l.startsWith("log4j:"));
        console.error(`${t.essai} sous « ${t.nom} » a échoué :`, erreur.join("\n"));
        throw e;
      }
      console.log(`${t.essai} sous « ${t.nom} » : ${t.base}.mid, ${t.base}.txt`);
    }
  } finally {
    rmSync(classes, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) principal();
