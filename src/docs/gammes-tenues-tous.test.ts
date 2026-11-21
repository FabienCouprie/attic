// docs/gammes-tenues-tous.test.ts — Chaque réglage de gamme du catalogue est tenu par ce que son nœud rend.
//
// LE GARDE RAPIDE DU BANC DES GAMMES, chantier du contrôle des gammes ouvert le 2026-11-21. Les gardes
// voisins tiennent chacun un défaut réparé ; celui-ci tient l'INVENTAIRE ENTIER : chaque réglage de
// gamme que le registre des nomenclatures relève est éprouvé ici, ou déclaré tenu ailleurs, ou hors de
// portée du banc, avec sa raison. Un nœud à gamme ajouté demain doit entrer dans l'une des trois.
//
// CE QUI SE JUGE, sur ce que le nœud rend par `executer` :
//  - sous chaque gamme offerte, en mi bémol, chaque note de chaque sortie lue est un degré de la gamme
//    posée sur la tonique (P1), et le nœud a rendu des notes ;
//  - sous six gammes choisies pour leurs symétries, la clé montée d'un demi-ton monte tout d'un
//    demi-ton, mêmes attaques et mêmes durées (P3) : un demi-ton, parce qu'aucune gamme ne revient sur
//    elle-même à un demi-ton, quand les deux diminuées le font à trois.
//
// UNE DÉCLARATION SE PAIE : elle porte sa raison, et le garde vérifie qu'elle tient encore. Un nœud
// déclaré sans transposition doit encore en manquer une sous l'une des six gammes ; un nœud dont
// l'appartenance est déclarée doit encore sortir de la gamme sous l'une des siennes. Sans quoi la
// déclaration est périmée, et elle tombe.
//
// LE CHEMIN DE L'INSPECTEUR : un réglage dont le défaut suit la gamme (`defautSelon`) prend celui que
// la règle des réglages liés lui donne quand la gamme change, comme dans l'application.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { registre } from "../audio/adaptateur";
import { lancerFiche, type FicheLancable, type Reglages } from "../audio/lancer-fiche";
import { apparier, type ReglageDeGamme } from "../audio/gamme-banc-lancer";
import type { PortDeSortie } from "../audio/gamme-banc-hauteurs";
import { releverUneGamme, type ReleveDeGamme } from "../audio/gamme-banc-releve";
import { degresAttendus as degresDe } from "../audio/gamme-banc-proprietes";
import { reglagesApresChangement } from "../core/reglages-lies";
import { reglagesANomenclature } from "../plugins/nomenclatures";

type FicheDuBanc = FicheLancable & { sorties?: readonly PortDeSortie[] };
const fiche = (id: string) => registre.trouverDef(id) as unknown as FicheDuBanc | undefined;

async function lireNotation(texte: string): Promise<unknown> {
  const f = fiche("texte-vers-midi");
  return f ? (await lancerFiche(f, {}, { entrees: [texte] })).valeurs[1] : null;
}

/** Les réglages qu'aucun lancer du banc ne sait rendre lisibles, et pourquoi. */
const HORS_DE_PORTEE: Record<string, string> = {
  "sampler-personnalise·Gamme": "le nœud joue un fichier posé dans ses propres données, que le banc ne sait pas lui donner",
  "palette-harmonique·Gamme": "le nœud lit une image par le DOM, absent du banc ; son calcul pur est tenu dans gammes-tenues-accords.test.ts",
  "dessin-sonore·Gamme": "le nœud lit une image par le DOM, absent du banc ; son calcul pur est tenu dans gammes-tenues-accords.test.ts",
  "parole-vers-sequence·Gamme": "le nœud exige le modèle de reconnaissance vocale Vosk, absent du banc de node",
  "vexflow-grille·Gamme": "le nœud rend une partition en SVG, que le banc ne sait pas lire ; ses accords viennent de accordsDepuisRomains, que la Progression éprouve",
  "vexflow-partition·Gamme": "le nœud rend une partition en SVG, que le banc ne sait pas lire ; ses accords viennent de accordsDepuisRomains, que la Progression éprouve",
  "gammes-monde·Gamme": "le nœud rend un texte libre, la liste de ses degrés, sans hauteur que le banc sache lire",
  "partition-aleatoire-csound·Gamme": "le nœud rend une partition Csound, que le banc ne sait pas encore lire",
  "cercle-pulsant·Gamme": "la clé du nœud suit la roue de Camelot et change en cours de rendu ; le banc ne sait pas encore la suivre",
};

/** Les réglages tenus par un autre garde, qui sait lire ce que leur nœud rend. */
const TENUS_AILLEURS: Record<string, string> = {
  "generateur-accords·Gamme": "gammes-tenues-son.test.ts, par le MIDI que le nœud remet à sa synthèse, capté au passage",
  "correction-hauteur·Gamme": "gammes-tenues-son.test.ts, par la hauteur suivie au pYIN dans le son corrigé",
  "glissando-de-gamme·Gamme de départ": "gammes-tenues-son.test.ts, par les pics du spectre de la tenue initiale",
  "glissando-de-gamme·Gamme d'arrivée": "gammes-tenues-son.test.ts, par les pics du spectre de la tenue finale",
};

/** Les nœuds dont la clé ne peut pas transposer le rendu, par construction, et pourquoi. */
const SANS_TRANSPOSITION: Record<string, string> = {
  "arbre-rythmique·Gamme": "il tire ses hauteurs dans un registre borné : sous une autre tonique, l'ensemble permis change, et le tirage rend d'autres degrés",
  "evolution-melodie·Gamme": "il fait évoluer dans un registre borné une mélodie reçue : sous une autre tonique, les hauteurs permises changent, et l'évolution aussi",
  "solveur-contraintes·Gamme": "il cherche une suite sous contraintes dans un registre borné : sous une autre tonique, les hauteurs permises changent, et la solution aussi",
  "zones-vers-midi·Gamme": "il suit une courbe reçue, qui ne bouge pas : sous une autre clé, il rend d'autres degrés, sans rien déplacer",
  "l-systeme·Gamme": "une note qui sort de son registre devient un silence : monter la clé d'un demi-ton y pousse une note limite, et le nombre de notes change",
};

/** Les nœuds dont l'appartenance ne se juge pas sous le banc, et pourquoi. */
const APPARTENANCE_DECLAREE: Record<string, string> = {
  "accords-vers-notation·Gamme": "sous sa source par défaut, « Accords détectés », il écrit les accords d'une entrée fixe, que la gamme ne gouverne pas",
};

/** Les six gammes de P3 : deux symétries, deux gammes à sept degrés, deux pentatoniques ou presque. */
const GAMMES_DE_TRANSPOSITION = ["majeur", "mineur-harmonique", "pentatonique-mineure", "ton-entier", "diminuee-demi-ton", "blues"];

const { paires } = apparier(reglagesANomenclature());
const cle = (p: ReglageDeGamme) => `${p.fiche}·${p.gamme}`;

/** Les réglages qu'un défaut lié à la gamme reçoit quand la gamme change, depuis la création du nœud. */
function reglagesLies(f: FicheLancable, p: ReglageDeGamme, gamme: string): Reglages {
  const creation: Record<string, number | string> = {};
  for (const x of f.parametres) if (typeof x.defaut === "number" || typeof x.defaut === "string") creation[x.nom] = x.defaut;
  const apres = reglagesApresChangement(f, creation, p.gamme, gamme);
  const lies: Reglages = {};
  for (const x of f.parametres) if (x.defautSelon?.reglage === p.gamme) lies[x.nom] = apres[x.nom];
  return lies;
}

const hors = (r: ReleveDeGamme) => r.sorties.reduce((a, s) => a + s.hors, 0);
const notes = (r: ReleveDeGamme) => r.sorties.reduce((a, s) => a + s.notes, 0);

describe("l'inventaire du garde des gammes", () => {
  it("chaque réglage de gamme est éprouvé ici, tenu ailleurs, ou hors de portée, et chaque déclaration nomme un réglage qui existe", () => {
    const connus = new Set(paires.map(cle));
    for (const table of [HORS_DE_PORTEE, TENUS_AILLEURS, SANS_TRANSPOSITION, APPARTENANCE_DECLAREE]) {
      for (const [ou, raison] of Object.entries(table)) {
        expect(connus.has(ou), `« ${ou} » n'est pas un réglage de gamme du registre`).toBe(true);
        expect(raison.length, `la raison de « ${ou} » doit dire pourquoi`).toBeGreaterThanOrEqual(30);
      }
    }
    for (const ou of Object.keys(HORS_DE_PORTEE)) expect(TENUS_AILLEURS[ou], ou).toBeUndefined();
  });
});

describe("chaque réglage de gamme, tenu par ce que son nœud rend", () => {
  const eprouves = paires.filter((p) => !HORS_DE_PORTEE[cle(p)] && !TENUS_AILLEURS[cle(p)]);
  for (const p of eprouves) {
    it(`${cle(p)} : chaque note est de la gamme sur sa tonique, et la clé transpose`, async () => {
      const f = fiche(p.fiche)!;
      const o = { ports: f.sorties ?? [], graines: [1], degresDe, lireNotation };
      const fautes: string[] = [];
      let horsTrouves = 0;
      for (const gamme of p.ids) {
        const r = await releverUneGamme(f, p, gamme, { ...o, toniques: [3], autres: reglagesLies(f, p, gamme) });
        if (r.echecs.length) fautes.push(`${gamme} : ${r.echecs.join(" ; ")}`);
        else if (notes(r) === 0) fautes.push(`${gamme} : aucune note rendue`);
        horsTrouves += hors(r);
        if (!APPARTENANCE_DECLAREE[cle(p)] && hors(r) > 0) {
          fautes.push(`${gamme} : ${r.sorties.flatMap((s) => s.exemplesHors.map((x) => `${s.sortie} ${x}`)).join(", ")}`);
        }
      }
      if (APPARTENANCE_DECLAREE[cle(p)] && horsTrouves === 0) fautes.push("déclaration d'appartenance périmée : aucune note n'est sortie de la gamme");
      if (p.tonique) {
        const choisies = GAMMES_DE_TRANSPOSITION.filter((g) => p.ids.includes(g));
        let manque = 0;
        for (const gamme of choisies.length ? choisies : p.ids) {
          const r = await releverUneGamme(f, p, gamme, { ...o, autres: reglagesLies(f, p, gamme) });
          const raison = r.sorties.map((s) => s.transposition).find(Boolean);
          if (raison) { manque++; if (!SANS_TRANSPOSITION[cle(p)]) fautes.push(`${gamme} : la clé ne transpose pas, ${raison}`); }
        }
        if (SANS_TRANSPOSITION[cle(p)] && manque === 0) fautes.push("déclaration sans transposition périmée : la clé transpose sous chaque gamme éprouvée");
      }
      expect(fautes).toEqual([]);
    }, 120_000);
  }
});
