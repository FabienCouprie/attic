// src/docs/dependances-audio.ts — De quoi chaque module audio dépend vraiment.
//
// POURQUOI CE FICHIER EXISTE, et c'est une faute de ma part qu'il répare.
//
// Pour décider si un traitement peut quitter le fil de l'interface, une seule question compte :
// dépend-il du Web Audio ? J'y ai répondu quatre fois de suite par `grep AudioBuffer`, et quatre
// fois de suite je me suis trompé — annonçant 64 modules liés au Web Audio là où il y en a 21,
// déclarant deux composants intraitables alors qu'ils l'étaient, et prédisant 554 fichiers réécrits
// pour une renormalisation qui n'en a touché aucun.
//
// LA CAUSE N'EST PAS UNE MAUVAISE LECTURE DU CODE, C'EST DE NE PAS L'AVOIR LU. `grep AudioBuffer`
// n'est pas « dépend du Web Audio » : c'est un substitut bon marché, qui donne une réponse immédiate
// et plausible. Plausible, elle n'appelle pas de vérification, et c'est ce qui la rend dangereuse.
//
// LA DISTINCTION QUI COMPTE, et que le substitut efface :
//
//   RENDU       le module fait rendre un graphe par `OfflineAudioContext` ou `AudioContext`. Il ne
//               peut pas aller dans un worker. Mais il NE FIGE PAS non plus : ce rendu a lieu hors
//               du fil principal. Ces modules ne sont donc ni déplaçables ni gênants.
//
//   RÉCIPIENT   le module ne se sert d'`AudioBuffer` que pour transporter des `Float32Array`. Tout
//               son calcul est du JavaScript ordinaire, donc il FIGE, et il devient transposable dès
//               qu'on en extrait un cœur par voie. C'est la classe qui compte : c'est là que se
//               trouve le travail, et c'est elle que le substitut masquait.
//
//   PUR         le module ne mentionne jamais `AudioBuffer`. Transposable tel quel.
//
// CE FICHIER NE REMPLACE PAS LA LECTURE DU CODE, il remplace le grep. La table est versionnée et
// vérifiée par un test : on la lit au lieu de la redécouvrir, et elle ne peut pas dériver en silence.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Les trois classes, de la plus contraignante à la plus libre. */
export type ClasseDependance = "rendu" | "recipient" | "pur";

export interface DependanceModule {
  module: string;
  classe: ClasseDependance;
  /** Ce qui a décidé la classe : le premier marqueur rencontré, pour que le verdict soit relisible. */
  marqueur: string;
}

/**
 * Ce qui fait un RENDU, et rien d'autre.
 *
 * Construire un graphe de nœuds et le faire rendre est la seule chose qu'un worker ne sait pas
 * faire. `createBiquadFilter` et ses pareils y figurent parce qu'un module peut recevoir un contexte
 * en argument sans jamais écrire son nom.
 */
const MARQUEURS_RENDU = [
  "OfflineAudioContext",
  "new AudioContext",
  "webkitAudioContext",
  "startRendering",
  "createBiquadFilter",
  "createBufferSource",
  "createConvolver",
  "createDynamicsCompressor",
  "createWaveShaper",
];

/** Une ligne de commentaire ne décide de rien : elle parle du code, elle ne l'exécute pas. */
export function lignesDeCode(source: string): string[] {
  const out: string[] = [];
  let dansBloc = false;
  for (const brute of source.split(/\r?\n/)) {
    let l = brute;
    if (dansBloc) {
      const fin = l.indexOf("*/");
      if (fin < 0) continue;
      l = l.slice(fin + 2);
      dansBloc = false;
    }
    for (;;) {
      const debut = l.indexOf("/*");
      if (debut < 0) break;
      const fin = l.indexOf("*/", debut + 2);
      if (fin < 0) { l = l.slice(0, debut); dansBloc = true; break; }
      l = l.slice(0, debut) + l.slice(fin + 2);
    }
    const ligne = l.split("//")[0];
    if (ligne.trim()) out.push(ligne);
  }
  return out;
}

/** La classe d'un module, lue sur son code seul. */
export function classer(source: string): { classe: ClasseDependance; marqueur: string } {
  const code = lignesDeCode(source).join("\n");
  for (const m of MARQUEURS_RENDU) {
    if (code.includes(m)) return { classe: "rendu", marqueur: m };
  }
  if (code.includes("AudioBuffer")) return { classe: "recipient", marqueur: "AudioBuffer" };
  return { classe: "pur", marqueur: "" };
}

/** La table entière, dans l'ordre alphabétique pour qu'un diff se lise. */
export function dependancesAudio(racine: string): DependanceModule[] {
  const dossier = join(racine, "src", "audio");
  return readdirSync(dossier)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
    .sort()
    .map((f) => ({ module: f, ...classer(readFileSync(join(dossier, f), "utf8")) }));
}

/** Le fichier versionné : une ligne par module, la classe puis le marqueur qui l'a décidée. */
export function tableEnTexte(table: readonly DependanceModule[]): string {
  const compte = (c: ClasseDependance) => table.filter((d) => d.classe === c).length;
  const lignes = [
    "# Dépendances audio",
    "",
    "Généré par `npm run docs:dependances`. Ne pas modifier à la main.",
    "",
    "De quoi chaque module de `src/audio/` dépend réellement, et donc ce qui peut quitter le fil de",
    "l'interface. Le critère est le RENDU, pas la mention d'`AudioBuffer` : un module qui ne s'en sert",
    "que comme récipient fige le fil et devient transposable dès qu'on en extrait un cœur par voie.",
    "Un module de classe « rendu », lui, n'est ni transposable ni gênant, son rendu ayant lieu ailleurs.",
    "",
    `- **rendu** : ${compte("rendu")} · ne peut pas aller dans un worker, mais ne fige pas`,
    `- **récipient** : ${compte("recipient")} · fige, transposable après extraction d'un cœur par voie`,
    `- **pur** : ${compte("pur")} · transposable tel quel`,
    "",
    "| module | classe | marqueur |",
    "| --- | --- | --- |",
    ...table.map((d) => `| ${d.module} | ${d.classe} | ${d.marqueur || "—"} |`),
    "",
  ];
  return lignes.join("\n");
}
