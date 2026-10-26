// plugins/parametre-calcul.test.ts — Un seul vocabulaire de périphérique par moteur.
//
// ═══ LE DÉFAUT RELEVÉ PAR FABIEN ═══
//
// « Certains nœuds fonctionnant avec des modèles IA ont un paramètre Calcul, les plus anciens
// non. Une homogénéisation serait donc souhaitable. » Vrai sur la forme : HUIT DÉCLARATIONS
// portaient la même liste, identiques identifiant pour identifiant, sans que rien ne les tienne
// ensemble. Un périphérique ajouté au moteur aurait dû être écrit huit fois.
//
// ═══ MAIS PAS SUR LE FOND, ET C'EST MESURÉ ═══
//
// Les dix-huit fiches qui portent ce réglage parlent toutes au MÊME moteur. Les autres nœuds à
// modèle n'en manquent pas par négligence : ils tournent ailleurs, sous trois moteurs qui ne
// comprennent pas ces noms-là — `onnxruntime-node` en processeur dur pour Demucs et l'esthétique,
// `onnxruntime-web` dans la page pour le débruitage et la séparation, DirectML pour Stable Audio.
//
// D'OÙ LA SECONDE RÈGLE, qui est la vraie leçon de ce chantier : unifier le vocabulaire de
// « Bruitage IA » sur celui-ci rendrait TROIS OPTIONS SUR CINQ INERTES, et en silence —
// `electron/stable-audio-3.cjs` retombe sur « auto » pour tout identifiant qu'il ne connaît pas.
// Le garde inscrit donc l'exception AVEC SA RAISON, pour que la prochaine homogénéisation ne la
// prenne pas pour un oubli.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IDS_CALCUL } from "./parametre-calcul";
import { registre } from "../audio/adaptateur";
import "../composition";

const ICI = dirname(fileURLToPath(import.meta.url));
const MODULE = "parametre-calcul.ts";

/**
 * Les nœuds dont le réglage « Calcul » ne peut pas porter ces identifiants-là, et pourquoi.
 *
 * UNE EXCEPTION SANS RAISON ÉCRITE N'EST PAS UNE EXCEPTION, c'est un oubli qu'on a cessé de voir.
 */
const AUTRES_MOTEURS: Readonly<Record<string, string>> = {
  "bruitage-ia": "Stable Audio 3 tourne sous DirectML et non sous Vulkan ou CUDA : "
    + "`electron/stable-audio-3.cjs` ne connaît que `auto`, `carte` et `processeur`, et retombe "
    + "sur `auto` pour tout autre identifiant — trois options sur cinq seraient inertes.",
};

const fiches = () => registre.tousLesPlugins()
  .filter((d) => !d.id.startsWith("__") && !d.id.startsWith("frontiere"));

const reglagesCalcul = () => fiches().flatMap((d) => {
  const ps = (d as unknown as { parametres?: { nom?: string; optionIds?: string[] }[] }).parametres ?? [];
  return ps.filter((p) => p?.nom === "Calcul").map((p) => ({ id: d.id, ids: p.optionIds ?? [] }));
});

describe("le réglage de périphérique", () => {
  it("N'EST DÉCLARÉ QU'À UN SEUL ENDROIT, pour qu'un périphérique neuf s'écrive une fois", () => {
    // ON CHERCHE LA FORME ET NON LE NOM : `id: "Vulkan0"` n'apparaît que dans une liste de
    // périphériques, là où le mot seul se trouve aussi dans une phrase qui le raconte. Le dépôt a
    // déjà payé deux fois un garde qui criait sur le commentaire d'un fichier.
    const copies = sources(ICI)
      .filter((p) => !p.endsWith(MODULE))
      .filter((p) => /id:\s*"(Vulkan0|Vulkan1|CUDA0)"/.test(readFileSync(p, "utf8")))
      .map((p) => relative(ICI, p).replace(/\\/g, "/"));
    expect(copies, [
      "",
      "UNE SECONDE LISTE DE PÉRIPHÉRIQUES EST APPARUE.",
      "",
      `Elle doit vivre dans \`plugins/${MODULE}\` et nulle part ailleurs : deux listes finissent`,
      "toujours par diverger, et c'est le nœud oublié qui n'offrira pas le périphérique neuf.",
      "",
      "Employer `parametreCalcul(invariance, invarianceEn)`, qui prend la phrase propre au nœud.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET TOUT RÉGLAGE « CALCUL » PORTE CES IDENTIFIANTS, sauf exception écrite", () => {
    // UN IDENTIFIANT QUE LE MOTEUR NE CONNAÎT PAS NE REFUSE PAS : il retombe sur son défaut. Le
    // réglage paraît donc marcher et ne fait rien, ce que le contrat de composant interdit.
    const fautifs = reglagesCalcul()
      .filter((r) => !AUTRES_MOTEURS[r.id])
      .filter((r) => r.ids.join("|") !== IDS_CALCUL.join("|"))
      .map((r) => `${r.id} : ${r.ids.join(" ") || "(aucun)"}`);
    expect(fautifs, [
      "",
      "UN RÉGLAGE « CALCUL » PORTE D'AUTRES IDENTIFIANTS QUE CEUX DU PONT.",
      "",
      "Attendus : " + IDS_CALCUL.map((i) => i || "(vide)").join(" "),
      "",
      "Si le nœud parle à un AUTRE moteur, l'inscrire dans `AUTRES_MOTEURS` avec la raison : un",
      "identifiant inconnu ne fait pas échouer le moteur, il le fait retomber sur son défaut, et",
      "le réglage devient un curseur qui ne peut rien changer.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET CHAQUE EXCEPTION DÉSIGNE UN NŒUD QUI EXISTE ET QUI PORTE CE RÉGLAGE", () => {
    // Une exception qui ne désigne plus rien décrit un état disparu, et couvrirait un vrai défaut
    // le jour où l'identifiant serait repris.
    const portent = new Set(reglagesCalcul().map((r) => r.id));
    const perimees = Object.keys(AUTRES_MOTEURS).filter((id) => !portent.has(id));
    expect(perimees, [
      "",
      "UNE EXCEPTION NE DÉSIGNE PLUS DE NŒUD PORTANT UN RÉGLAGE « CALCUL ».",
      "",
      "La retirer d'`AUTRES_MOTEURS` : une liste qu'on ne réduit pas finit par décrire un état qui",
      "n'existe plus, et par couvrir le défaut qu'elle était censée excepter.",
      "",
    ].join("\n")).toEqual([]);
  });
});

function sources(dossier: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dossier)) {
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) sources(p, acc);
    else if (/\.ts$/.test(e) && !/\.test\.ts$/.test(e)) acc.push(p);
  }
  return acc;
}
