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

import { IDS_CALCUL, IDS_CALCUL_DML } from "./parametre-calcul";
import { registre } from "../audio/adaptateur";
import "../composition";

const ICI = dirname(fileURLToPath(import.meta.url));
const MODULE = "parametre-calcul.ts";

/**
 * Les nœuds qui tournent sous `onnxruntime-node`, et portent donc le vocabulaire de DirectML.
 *
 * UN NŒUD INSCRIT ICI SANS RAISON N'EST PAS UNE EXCEPTION, c'est un oubli qu'on a cessé de voir.
 */
const SOUS_DIRECTML: Readonly<Record<string, string>> = {
  "bruitage-ia": "Stable Audio 3 tourne sous `onnxruntime-node`, qui n'expose que le processeur "
    + "et la carte : `electron/stable-audio-3.cjs` ne connaît que `auto`, `carte` et "
    + "`processeur`, et retombe sur `auto` pour tout autre identifiant.",
  "texte-image": "SDXS-512 tourne sous `onnxruntime-node`. Mesuré le 2026-10-26 sur une RTX "
    + "2060 : l'unet rend en 6,88 s sur la carte contre 11,3 s au processeur, soit environ 7,6 s "
    + "par image contre 11,9 s.",
};

const fiches = () => registre.tousLesPlugins()
  .filter((d) => !d.id.startsWith("__") && !d.id.startsWith("frontiere"));

const reglagesCalcul = () => fiches().flatMap((d) => {
  const ps = (d as unknown as { parametres?: { nom?: string; optionIds?: string[] }[] }).parametres ?? [];
  return ps.filter((p) => p?.nom === "Calcul").map((p) => ({ id: d.id, ids: p.optionIds ?? [] }));
});

describe("le réglage de périphérique", () => {
  it("NE SE DÉCLARE QU'À UN SEUL ENDROIT, pour qu'un périphérique neuf s'écrive une fois", () => {
    // ON CHERCHE LA FORME ET NON LE NOM. La déclaration d'un réglage commence toujours par son
    // nom dans les deux langues ; le mot « Calcul » seul, lui, se trouve dans toutes les phrases
    // qui parlent de temps de calcul. Le dépôt a déjà payé deux fois un garde qui criait sur le
    // commentaire d'un fichier.
    const copies = sources(ICI)
      .filter((p) => !p.endsWith(MODULE))
      .filter((p) => /nom:\s*"Calcul",\s*nomEn:\s*"Compute"/.test(readFileSync(p, "utf8")))
      .map((p) => relative(ICI, p).replace(/\\/g, "/"));
    expect(copies, [
      "",
      "LE RÉGLAGE DE PÉRIPHÉRIQUE EST DÉCLARÉ AILLEURS QUE DANS SON MODULE.",
      "",
      `Il doit vivre dans \`plugins/${MODULE}\` et nulle part ailleurs : deux déclarations`,
      "finissent toujours par diverger, et c'est le nœud oublié qui n'offrira pas le périphérique",
      "neuf. Huit copies y étaient le 2026-10-26, identiques identifiant pour identifiant.",
      "",
      "Employer `parametreCalcul(...)` pour un nœud du pont, `parametreCalculDirectML(...)` pour",
      "un nœud qui tourne sous `onnxruntime-node` ; chacun prend la phrase propre au nœud.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET TOUT RÉGLAGE « CALCUL » PORTE LE VOCABULAIRE DE SON MOTEUR, qui est déclaré", () => {
    // UN IDENTIFIANT QUE LE MOTEUR NE CONNAÎT PAS NE REFUSE PAS : il retombe sur son défaut. Le
    // réglage paraît donc marcher et ne fait rien, ce que le contrat de composant interdit.
    const fautifs = reglagesCalcul()
      .filter((r) => {
        const attendu = SOUS_DIRECTML[r.id] ? IDS_CALCUL_DML : IDS_CALCUL;
        return r.ids.join("|") !== attendu.join("|");
      })
      .map((r) => `${r.id} : ${r.ids.join(" ") || "(aucun)"}`);
    expect(fautifs, [
      "",
      "UN RÉGLAGE « CALCUL » PORTE D'AUTRES IDENTIFIANTS QUE CEUX DE SON MOTEUR.",
      "",
      "Le pont attend : " + IDS_CALCUL.map((i) => i || "(vide)").join(" "),
      "DirectML attend : " + IDS_CALCUL_DML.join(" "),
      "",
      "Un nœud qui tourne sous `onnxruntime-node` s'inscrit dans `SOUS_DIRECTML` avec sa raison.",
      "Un identifiant inconnu ne fait pas échouer le moteur, il le fait retomber sur son défaut,",
      "et le réglage devient un curseur qui ne peut rien changer.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("ET CHAQUE EXCEPTION DÉSIGNE UN NŒUD QUI EXISTE ET QUI PORTE CE RÉGLAGE", () => {
    // Une exception qui ne désigne plus rien décrit un état disparu, et couvrirait un vrai défaut
    // le jour où l'identifiant serait repris.
    const portent = new Set(reglagesCalcul().map((r) => r.id));
    const perimees = Object.keys(SOUS_DIRECTML).filter((id) => !portent.has(id));
    expect(perimees, [
      "",
      "UNE EXCEPTION NE DÉSIGNE PLUS DE NŒUD PORTANT UN RÉGLAGE « CALCUL ».",
      "",
      "La retirer de `SOUS_DIRECTML` : une liste qu'on ne réduit pas finit par décrire un état qui",
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
