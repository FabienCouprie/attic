// ui/niveau-ecoute.test.ts — Aucun lecteur de composant ne s'ouvre à pleine puissance.
//
// POURQUOI CE FICHIER EXISTE, relevé par Fabien : « quand un lecteur apparaît sur un nœud il n'est
// jamais à pleine puissance, la norme est là. Ce doit être pareil ici. C'est systématiquement fait
// pour les autres nodes, pourquoi celui-ci échappe à la règle ? »
//
// LA RÉPONSE EST QU'IL N'Y AVAIT RIEN À QUOI ÉCHAPPER. La règle existait dans les faits, appliquée
// sept fois, mais elle s'écrivait en clair à chaque endroit : un `0.3` sans nom, recopié dans six
// fichiers de vue. Une règle recopiée n'est pas tenue, elle est répétée ; le premier composant qui
// apporte sa propre écoute la manque sans que rien ne le signale, et c'est ce qu'a fait la ligne de
// temps du Montage en montant son graphe vivant.
//
// CE QUE CES CAS TIENNENT. Que la valeur ne se réécrive nulle part ailleurs, et que tout élément
// audio d'une vue passe par le point d'entrée commun. Les deux ensemble : le premier seul laisserait
// poser un lecteur sans niveau du tout, le second seul laisserait réécrire la valeur à côté.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NIVEAU_ECOUTE, ouvrirAuNiveauDEcoute } from "./niveau-ecoute";

/**
 * Les lecteurs dont le niveau est gouverné par un réglage déclaré du composant.
 *
 * SEULE EXCEPTION LÉGITIME, et elle se vérifie : le niveau y est un paramètre visible, documenté,
 * que l'exécuteur lit. Ce n'est plus une ouverture silencieuse à pleine puissance, c'est un réglage
 * dont la personne dispose. Un lecteur qui n'a ni l'un ni l'autre est un oubli.
 */
const REGLE_PAR_UN_PARAMETRE = new Map([
  ["src\\ui\\vues-lecteur.tsx", "le paramètre « Volume », défaut 80 %, posé par un effet et par son curseur"],
]);

/** Les sources de l'interface, hors tests et hors le module qui porte la norme. */
function sourcesUI(dossier = join("src", "ui"), out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    const c = join(dossier, e.name);
    if (e.isDirectory()) sourcesUI(c, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/niveau-ecoute\.ts$/.test(e.name)) {
      out.push(c);
    }
  }
  return out;
}

/** Le texte sans ses commentaires : un `<audio>` cité dans une explication n'est pas un lecteur. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const sources = sourcesUI().map((f) => ({ f, texte: sansCommentaires(readFileSync(f, "utf8")) }));

describe("le niveau d'écoute d'un composant", () => {
  it("n'est pas la pleine puissance", () => {
    expect(NIVEAU_ECOUTE).toBeGreaterThan(0);
    expect(NIVEAU_ECOUTE).toBeLessThan(1);
  });

  it("se pose sur l'élément, au chargement de sa source", () => {
    const faux = { currentTarget: { volume: 1 } as HTMLAudioElement };
    ouvrirAuNiveauDEcoute(faux);
    expect(faux.currentTarget.volume).toBe(NIVEAU_ECOUTE);
  });

  it("NE SE RÉÉCRIT NULLE PART AILLEURS : une valeur recopiée n'est pas une règle", () => {
    // C'est la répétition qui a laissé le Montage y échapper : sept `0.3` en clair, et rien qui
    // dise qu'il en manquait un huitième.
    const fautifs = sources
      .filter(({ texte }) => /\.volume\s*=\s*[\d.]/.test(texte))
      .map(({ f }) => f);
    expect(fautifs, "poser le niveau par « ouvrirAuNiveauDEcoute » plutôt qu'en clair").toEqual([]);
  });

  it("EST POSÉ SUR TOUT ÉLÉMENT AUDIO D'UNE VUE, sans quoi il s'ouvrirait à fond", () => {
    // Un élément audio sans `onLoadedMetadata` ouvre à 1, c'est-à-dire à pleine échelle.
    const fautifs: string[] = [];
    for (const { f, texte } of sources) {
      if (!f.endsWith(".tsx") || REGLE_PAR_UN_PARAMETRE.has(f)) continue;
      // Le JSX d'un lecteur s'étend jusqu'à sa fermeture : on coupe sur `/>` ou `</audio>`, jamais
      // sur le premier `>` venu, qu'une flèche de fonction dans un attribut fournirait aussitôt.
      for (const m of texte.matchAll(/<audio\b[\s\S]*?(?:\/>|<\/audio>)/g)) {
        if (!m[0].includes("onLoadedMetadata")) fautifs.push(`${f} : ${m[0].slice(0, 70)}…`);
      }
    }
    expect(fautifs, "poser onLoadedMetadata={ouvrirAuNiveauDEcoute} sur ce lecteur").toEqual([]);
  });

  it("ET L'EXCEPTION PORTE SA RAISON, sans quoi elle serait une dérogation", () => {
    for (const [f, raison] of REGLE_PAR_UN_PARAMETRE) {
      const trouve = sources.find((s) => s.f === f);
      expect(trouve, `${f} n'existe plus : retirer l'exception`).toBeTruthy();
      expect(raison.length, `${f} : écrire pourquoi ce lecteur est une exception`).toBeGreaterThan(20);
      // La raison invoquée est un réglage : il doit se poser sur l'élément.
      expect(trouve!.texte, `${f} : le niveau doit y être posé par son réglage`).toMatch(/\.volume\s*=/);
    }
  });

  it("VAUT AUSSI POUR UNE ÉCOUTE MONTÉE EN DIRECT, qui est un lecteur comme un autre", () => {
    // Le graphe vivant du Montage ne passe pas par un élément audio : sans cette assertion, le seul
    // lecteur du dépôt qui ne soit pas une balise échapperait aux deux cas ci-dessus.
    const vive = readFileSync(join("src", "ui", "hooks", "useLectureVive.ts"), "utf8");
    expect(vive).toContain("NIVEAU_ECOUTE");
    expect(vive, "la sortie des pistes doit passer par le gain d'écoute").toMatch(/gainDEcoute\(/);
  });
});
