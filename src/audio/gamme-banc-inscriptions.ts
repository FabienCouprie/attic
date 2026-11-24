// audio/gamme-banc-inscriptions.ts — Ce que le banc des gammes déclare, et le chemin des réglages liés.
//
// LES DÉCLARATIONS DU BANC, partagées par le garde rapide (`docs/gammes-tenues-tous.test.ts`) et la
// passe profonde (`docs/gammes-passe-profonde.test.ts`) : un réglage de gamme est éprouvé, ou tenu par
// un autre garde, ou hors de portée du banc ; un nœud peut ne pas transposer par construction, ou ne
// pas se juger sur l'appartenance sous le banc. Chaque entrée porte sa raison, et le garde rapide
// refuse celle qui ne sert plus.

import type { FicheLancable, Reglages } from "./lancer-fiche";
import type { ReglageDeGamme } from "./gamme-banc-lancer";
import { reglagesApresChangement } from "../core/reglages-lies";
import { INERTIES_CONDITIONNEES } from "./croisement-inscriptions";

/** Les réglages qu'aucun lancer du banc ne sait rendre lisibles, et pourquoi. */
export const HORS_DE_PORTEE: Record<string, string> = {
  "sampler-personnalise·Gamme": "le nœud joue un fichier posé dans ses propres données, que le banc ne sait pas lui donner",
  "palette-harmonique·Gamme": "le nœud lit une image par le DOM, absent du banc ; son calcul pur est tenu dans gammes-tenues-accords.test.ts",
  "dessin-sonore·Gamme": "le nœud lit une image par le DOM, absent du banc ; son calcul pur est tenu dans gammes-tenues-accords.test.ts",
  "parole-vers-sequence·Gamme": "le nœud exige le modèle de reconnaissance vocale Vosk, absent du banc de node",
  "vexflow-grille·Gamme": "le nœud rend une partition en SVG, que le banc ne sait pas lire ; ses accords viennent de accordsDepuisRomains, que la Progression éprouve",
  "gammes-monde·Gamme": "le nœud rend un texte libre, la liste de ses degrés, sans hauteur que le banc sache lire",
  "partition-aleatoire-csound·Gamme": "le nœud rend une partition Csound, que le banc ne sait pas encore lire",
  "cercle-pulsant·Gamme": "la clé du nœud suit la roue de Camelot et change en cours de rendu ; le banc ne sait pas encore la suivre",
};

/** Les réglages tenus par un autre garde, qui sait lire ce que leur nœud rend. */
export const TENUS_AILLEURS: Record<string, string> = {
  "generateur-accords·Gamme": "gammes-tenues-son.test.ts, par le MIDI que le nœud remet à sa synthèse, capté au passage",
  "tonal-gamme·Type": "gammes-tenues-tous.test.ts, qui lit ses noms de notes sans octave sous chaque gamme offerte et les douze toniques ; le banc ne lit que des hauteurs",
  "correction-hauteur·Gamme": "gammes-tenues-son.test.ts, par la hauteur suivie au pYIN dans le son corrigé",
  "glissando-de-gamme·Gamme de départ": "gammes-tenues-son.test.ts, par les pics du spectre de la tenue initiale",
  "glissando-de-gamme·Gamme d'arrivée": "gammes-tenues-son.test.ts, par les pics du spectre de la tenue finale",
  "verifier-choral·Gamme": "audio/choral-verifier.test.ts, qui plante sous les douze toniques et les cinq modes une sensible doublée là où le mode en a une, et en phrygien la seconde augmentée de la tonique ; le nœud rend un rapport, que le banc ne lit pas",
  "apprendre-corpus·Gamme": "plugins/apprendre-corpus.test.ts, qui écarte en les nommant les pièces de l'autre mode ; le nœud rend un modèle et un rapport, sans aucune note que le banc puisse lire",
};

/** Les nœuds dont la clé ne peut pas transposer le rendu, par construction, et pourquoi. */
export const SANS_TRANSPOSITION: Record<string, string> = {
  "arbre-rythmique·Gamme": "il tire ses hauteurs dans un registre borné : sous une autre tonique, l'ensemble permis change, et le tirage rend d'autres degrés",
  "evolution-melodie·Gamme": "il fait évoluer dans un registre borné une mélodie reçue : sous une autre tonique, les hauteurs permises changent, et l'évolution aussi",
  "solveur-contraintes·Gamme": "il cherche une suite sous contraintes dans un registre borné : sous une autre tonique, les hauteurs permises changent, et la solution aussi",
  "zones-vers-midi·Gamme": "il suit une courbe reçue, qui ne bouge pas : sous une autre clé, il rend d'autres degrés, sans rien déplacer",
  "l-systeme·Gamme": "une note qui sort de son registre devient un silence : monter la clé d'un demi-ton y pousse une note limite, et le nombre de notes change",
  "harmoniser-choral·Gamme": "le soprano reçu ressort tel quel et ne bouge pas avec la clé : sous une autre tonique, ce sont les accords écrits autour de lui qui changent",
};

/** Les nœuds dont l'appartenance ne se juge pas sous le banc, et pourquoi. */
export const APPARTENANCE_DECLAREE: Record<string, string> = {
  "accords-vers-notation·Gamme": "sous sa source par défaut, « Accords détectés », il écrit les accords d'une entrée fixe, que la gamme ne gouverne pas",
  "harmoniser-choral·Gamme": "le soprano reçu ressort tel quel, ses notes hors de la gamme comprises, et une note qu'aucun accord de la tonalité ne contient reçoit une dominante secondaire ou un accord emprunté, hors de la gamme par nature ; en dorien, en phrygien et en mixolydien, les accords de la sensible ajoutée et la tonique majeure du phrygien en sortent aussi",
};

/**
 * Les valeurs d'un autre réglage sous lesquelles la gamme est sans effet, que la notice dit, et que
 * le banc des croisements ne voit pas parce qu'il ne fait varier qu'un réglage à la fois depuis les
 * défauts. La passe profonde ne les croise pas : une note hors de la gamme y est la promesse tenue.
 */
export const GAMME_SANS_EFFET: Record<string, { reglage: string; valeurs: string[]; raison: string }> = {
  "zones-vers-midi·Gamme": {
    reglage: "Source de hauteur", valeurs: ["fixe"],
    raison: "sa documentation : « Sans effet quand « Source de hauteur » vaut « Note fixe » » ; la note du réglage y est posée telle quelle",
  },
};

/**
 * Pourquoi la gamme d'un réglage est sans effet quand `reglage` vaut `valeur`, s'il est déclaré : par
 * `GAMME_SANS_EFFET`, ou par une inertie conditionnée du banc des croisements.
 */
export function gammeSansEffet(p: ReglageDeGamme, reglage: string, valeur: string): string | undefined {
  const ici = GAMME_SANS_EFFET[cleDeReglage(p)];
  if (ici && ici.reglage === reglage && ici.valeurs.includes(valeur)) return ici.raison;
  for (const i of INERTIES_CONDITIONNEES) {
    if (i.ou !== cleDeReglage(p) || "une" in i.quand || "tous" in i.quand || !("reglage" in i.quand)) continue;
    const q = i.quand;
    if (q.reglage !== reglage) continue;
    if ("valeurs" in q ? q.valeurs.includes(valeur) : !q.sauf.includes(valeur)) return i.raison;
  }
  return undefined;
}

/**
 * Les nœuds qui bâtissent des accords sur les degrés de leur gamme, et que P4 juge à la passe profonde.
 * Ailleurs, les notes que P4 grouperait ne sont pas des accords bâtis sur un degré : les trois voix du
 * flocon de Koch, qui jouent ses trois niveaux à trois vitesses ; les cellules vivantes d'un automate ;
 * une mélodie fractale assez rapide, sous le cantus firmus, pour que trois de ses notes tombent dans
 * la même fenêtre d'attaque. Une triade de la gamme n'y est promise nulle part.
 */
export const ACCORDS_SUR_LES_DEGRES = new Set([
  "generateur-musical", "boite-groove", "sequenceur-accords", "color-looper", "tonal-progression", "tonal-grille",
]);

/** Les six gammes de P3 au garde rapide : deux symétries, deux gammes à sept degrés, deux pentatoniques ou presque. */
export const GAMMES_DE_TRANSPOSITION = ["majeur", "mineur-harmonique", "pentatonique-mineure", "ton-entier", "diminuee-demi-ton", "blues"];

/** La clé d'un réglage de gamme dans ces tables. */
export const cleDeReglage = (p: ReglageDeGamme) => `${p.fiche}·${p.gamme}`;

/**
 * Les réglages qu'un défaut lié à la gamme reçoit quand la gamme change, depuis la création du nœud :
 * le chemin de l'inspecteur, par la règle des réglages liés (`core/reglages-lies.ts`).
 */
export function reglagesLies(f: FicheLancable, p: ReglageDeGamme, gamme: string): Reglages {
  const creation: Record<string, number | string> = {};
  for (const x of f.parametres) if (typeof x.defaut === "number" || typeof x.defaut === "string") creation[x.nom] = x.defaut;
  const apres = reglagesApresChangement(f, creation, p.gamme, gamme);
  const lies: Reglages = {};
  for (const x of f.parametres) if (x.defautSelon?.reglage === p.gamme) lies[x.nom] = apres[x.nom];
  return lies;
}
