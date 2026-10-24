// vues-domaine/gain-de-note.test.ts — La touche jouée sonne au niveau que le nœud rendra.
//
// LE DÉFAUT QU'ILS TIENNENT. La synthèse interne d'un clavier jouable faisait sonner sa touche à un
// niveau ÉCRIT EN DUR : `0,12`, quoi que vaille « Volume » et quelle que soit la force de la frappe.
// La même touche jouée au SoundFont, elle, passait par le rendu et suivait les deux. Un clavier
// disait donc deux choses selon son mode de synthèse, et c'est l'inverse de la règle que
// `clavier-son.ts` énonce pour lui-même : ce qu'on entend en jouant est ce que le nœud rendra.
//
// LES DEUX MOITIÉS COMPTENT. La formule est éprouvée à part, et aucune vue ne doit écrire un niveau
// à la main : la première seule laisserait recopier un facteur à côté, la seconde seule laisserait la
// formule dériver sans que rien ne la lise.
//
// CE QUE CES CAS NE VOIENT PAS, ET IL FAUT LE DIRE. Un nombre posé dans une variable au lieu du
// point d'appel leur échappe : `const niveau = 0,12` suivi de `gain.setValueAtTime(niveau, …)` n'est
// plus un littéral au point d'appel, et seul le second cas le rattrape, parce que la formule cesse
// alors d'être appelée. Suivre un nombre à travers les variables demanderait de lire le flot de
// données, ce qu'un garde de forme ne fait pas. L'égalité du niveau joué et du niveau rendu se
// mesure, elle, dans l'application, en espionnant les gains créés.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { gainDeNote } from "../audio/midi-sequence";

/** Les sources des vues du domaine, hors tests. */
function sources(dossier = join("src", "vues-domaine"), out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const c = join(dossier, e.name);
    if (e.isDirectory()) sources(c, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(c);
  }
  return out;
}

const fichiers = sources().map((f) => ({ f, texte: readFileSync(f, "utf8") }));

/** Le texte sans ses commentaires : un nombre cité dans une explication n'est pas un gain. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

describe("le gain d'une note jouée", () => {
  it("suit la vélocité de la frappe", () => {
    expect(gainDeNote(127, 100)).toBeCloseTo(0.4, 10);
    expect(gainDeNote(64, 100)).toBeCloseTo((64 / 127) * 0.4, 10);
    expect(gainDeNote(0, 100)).toBe(0);
    // Une frappe deux fois plus forte sonne deux fois plus fort, en amplitude.
    expect(gainDeNote(100, 100) / gainDeNote(50, 100)).toBeCloseTo(2, 10);
  });

  it("suit le volume du nœud", () => {
    expect(gainDeNote(127, 50)).toBeCloseTo(0.2, 10);
    expect(gainDeNote(127, 0)).toBe(0);
    expect(gainDeNote(100, 80) / gainDeNote(100, 40)).toBeCloseTo(2, 10);
  });

  it("borne le volume, et PAS la vélocité", () => {
    // Le volume est borné comme il l'était dans la boucle du rendu : un réglage hors bornes vient
    // d'un graphe écrit à la main.
    expect(gainDeNote(127, 400)).toBeCloseTo(0.4, 10);
    expect(gainDeNote(127, -20)).toBe(0);
    // LA VÉLOCITÉ NE L'EST PAS, et ce cas est là pour dire que c'est voulu : la borner changerait
    // le son RENDU, que la base d'empreintes surveille pour soixante-douze composants. La formule
    // extraite rend exactement ce que la boucle rendait.
    expect(gainDeNote(254, 100)).toBeCloseTo(0.8, 10);
    expect(gainDeNote(-127, 100)).toBeCloseTo(-0.4, 10);
  });

  // ─── Le cas qui aurait attrapé le défaut ───
  //
  // UN NIVEAU POSÉ N'EST PAS UNE CIBLE DE RAMPE, et il a fallu les distinguer : le relâchement d'une
  // note descend vers un plancher écrit en clair, `0,0001`, qui n'est pas un niveau d'écoute mais
  // la fin d'un fondu. Une cible franchement inaudible est donc admise ; au-delà d'un centième de
  // l'échelle, une rampe pose bien un niveau et retombe sous la règle.
  const PLANCHER_DE_FONDU = 0.01;

  it("AUCUNE VUE N'ÉCRIT UN NIVEAU À LA MAIN", () => {
    const fautifs: string[] = [];
    for (const { f, texte } of fichiers) {
      for (const ligne of sansCommentaires(texte).split("\n")) {
        const pose = ligne.match(/\.gain(?:\.value\s*=|\.setValueAtTime\()\s*(\d[\d.e-]*)/);
        if (pose && Number(pose[1]) !== 0) { fautifs.push(`${f} : ${ligne.trim().slice(0, 64)}`); continue; }
        const rampe = ligne.match(/\.gain\.(?:linear|exponential)RampToValueAtTime\(\s*(\d[\d.e-]*)/);
        if (rampe && Number(rampe[1]) >= PLANCHER_DE_FONDU) fautifs.push(`${f} : ${ligne.trim().slice(0, 64)}`);
      }
    }
    expect(fautifs, "tirer le niveau de « gainDeNote », du réglage du nœud, ou de NIVEAU_ECOUTE")
      .toEqual([]);
  });

  it("et toute vue qui synthétise une note en direct APPELLE la formule du rendu", () => {
    // L'APPEL, ET NON LE NOM : un import resté en place suffisait à satisfaire ce cas, et c'est un
    // défaut planté qui l'a montré. En rendant son niveau écrit en dur à la touche, le fichier
    // gardait `gainDeNote` dans ses imports et passait au vert.
    const sansFormule = fichiers
      .filter(({ texte }) => sansCommentaires(texte).includes("createOscillator"))
      .filter(({ texte }) => !/gainDeNote\s*\(/.test(sansCommentaires(texte)))
      .map(({ f }) => f);
    expect(sansFormule, "une touche sous le doigt doit sonner comme le rendu").toEqual([]);
    // Le garde ne vaut que s'il regarde quelque chose : deux vues synthétisent aujourd'hui.
    const avecOscillateur = fichiers.filter(({ texte }) => sansCommentaires(texte).includes("createOscillator"));
    expect(avecOscillateur.length).toBe(2);
  });
});
