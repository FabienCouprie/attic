// parcours/conditions.ts — Ce qui coche, et ce qui dit pourquoi ça ne coche pas.
//
// LE TRAVAIL DE CE FICHIER EST LA SECONDE PHRASE, PAS LA PREMIÈRE. Savoir si un exercice est
// réussi tient en trois filtres ; dire à quelqu'un qui bute POURQUOI il bute est le seul service
// qu'un parcours puisse vraiment rendre. Un exercice qui reste rouge sans un mot est une énigme,
// et une énigme n'enseigne rien — elle décourage.
//
// C'est pourquoi l'examen ne rend pas un booléen mais une liste de POINTS, et pourquoi chaque
// point est examiné par ÉTAPES, dans l'ordre où un élève les franchit :
//
//     le nœud n'est pas là          →  « Il manque un générateur de fréquence. »
//     il est là mais pas lancé      →  « Le générateur de fréquence n'a pas encore été lancé. »
//     il est là, mais mal réglé     →  « Sa durée doit atteindre 2 ; elle est à 1. »
//     les deux sont là, non reliés  →  « Le générateur n'est pas encore relié à la sortie. »
//
// Chacune de ces phrases apprend quelque chose de différent. Les replier sur un « non réussi »
// unique aurait coûté trois lignes de moins ici et toute la valeur du parcours.
//
// LES ÉTAPES SONT ORDONNÉES PAR CE QUI EST LE PLUS INSTRUCTIF, et cet ordre se discute : on
// signale l'absence avant le réglage, parce qu'on ne règle pas un nœud qu'on n'a pas posé ; et le
// défaut de branchement en dernier, parce qu'il suppose les deux nœuds présents.

import type { Atelier, NoeudVu } from "./atelier";
import { mene, relieDirect } from "./atelier";
import type { Condition, Critere, Point } from "./types";

/**
 * Un nombre tel qu'on l'écrit dans la langue lue.
 *
 * Virgule décimale et signe moins typographique en français, point et trait d'union en anglais —
 * exactement ce que font les notices du catalogue. Sans cela, une exigence écrite « −16 LUFS » dans
 * l'énoncé se voyait répondre « mesuré : -63,62 LUFS » deux lignes plus bas, avec deux signes moins
 * différents dans la même phrase.
 *
 * LES DÉCIMALES TOMBENT AU MILLIER, ET NON À LA CENTAINE. Une fréquence de 440,2 hertz écrite
 * « 440 » perdrait ce qui se discute : à cette hauteur, un seul hertz vaut déjà quatre cents, soit
 * l'écart qu'un accordeur cherche. Au-delà du millier, en revanche, un dixième de hertz ne dit plus
 * rien d'utile — il encombre.
 */
export function chiffre(v: number, en: boolean): string {
  const arrondi = Math.abs(v) >= 1000 ? Math.round(v) : Math.round(v * 100) / 100;
  const texte = String(arrondi);
  return en ? texte : texte.replace(".", ",").replace("-", "−");
}

/** Une phrase commence par une majuscule, même quand le critère est écrit en minuscules. */
const majuscule = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));

/** Le nœud est-il celui qu'on cherche, indépendamment de son état et de ses réglages ? */
function estCelui(n: NoeudVu, c: Critere): boolean {
  if (c.fiches && !c.fiches.includes(n.ficheId)) return false;
  if (c.famille && n.famille !== c.famille) return false;
  if (c.univers && n.univers !== c.univers) return false;
  return true;
}

/** Le réglage exigé est-il tenu ? Un paramètre absent vaut « pas encore réglé ». */
function reglageTenu(n: NoeudVu, c: Critere): boolean {
  const e = c.parametre;
  if (!e) return true;
  const brut = n.parametres[e.nom];
  if (brut === undefined || brut === null || brut === "") return false;
  if (e.vaut !== undefined) return String(brut) === String(e.vaut);
  const v = typeof brut === "number" ? brut : Number(String(brut).replace(",", "."));
  if (!Number.isFinite(v)) return false;
  if (e.min !== undefined && v < e.min) return false;
  if (e.max !== undefined && v > e.max) return false;
  return true;
}

/** Tout est tenu : l'identité, le lancement, le réglage. */
const convient = (n: NoeudVu, c: Critere): boolean =>
  estCelui(n, c) && (!c.rendu || n.rendu) && reglageTenu(n, c);

/** Les nœuds qui conviennent entièrement. */
export const retenus = (a: Atelier, c: Critere): NoeudVu[] => a.noeuds.filter((n) => convient(n, c));

/** L'exigence de réglage, dite en clair : « doit atteindre 2 », « doit valoir Sinus ». */
function exigenceDite(c: Critere, en: boolean): string {
  const e = c.parametre!;
  if (e.vaut !== undefined) return en ? `must be « ${e.vaut} »` : `doit valoir « ${e.vaut} »`;
  if (e.min !== undefined && e.max !== undefined) {
    return en
      ? `must sit between ${chiffre(e.min, en)} and ${chiffre(e.max, en)}`
      : `doit tenir entre ${chiffre(e.min, en)} et ${chiffre(e.max, en)}`;
  }
  if (e.min !== undefined) return en ? `must reach ${chiffre(e.min, en)}` : `doit atteindre ${chiffre(e.min, en)}`;
  return en ? `must stay under ${chiffre(e.max!, en)}` : `doit rester sous ${chiffre(e.max!, en)}`;
}

/** Le nom du réglage dans la langue lue : la clé est française, l'affichage ne doit pas l'être. */
const nomReglage = (c: Critere, en: boolean): string =>
  (en ? c.parametre!.nomEn ?? c.parametre!.nom : c.parametre!.nom);

/** La valeur actuelle du réglage, dite en clair, ou « rien » si le champ est vide. */
function valeurDite(n: NoeudVu | undefined, c: Critere, en: boolean): string {
  const brut = n?.parametres[c.parametre!.nom];
  if (brut === undefined || brut === null || brut === "") return en ? "nothing yet" : "rien pour l'instant";
  return typeof brut === "number" ? chiffre(brut, en) : `« ${brut} »`;
}

/** Un point satisfait, dit de la même façon des deux côtés. */
const ok = (texte: string, texteEn: string): Point => ({ satisfait: true, texte, texteEn });
const non = (texte: string, texteEn: string): Point => ({ satisfait: false, texte, texteEn });

/**
 * Un critère, examiné par étapes.
 *
 * `nombre` sert aux exercices qui demandent plusieurs nœuds semblables — deux sources à mélanger,
 * trois effets en série. Le décompte est alors dit, parce que « il en faut deux, il y en a un »
 * est la seule phrase qui se comprenne du premier coup.
 */
export function examinerCritere(a: Atelier, c: Critere, nombre = 1): Point {
  const complets = retenus(a, c);
  if (complets.length >= nombre) {
    if (nombre > 1) {
      return ok(`${majuscule(c.quoi)} : ${complets.length} sur ${nombre} demandés.`,
                `${majuscule(c.quoiEn)}: ${complets.length} of ${nombre} asked for.`);
    }
    // UN RÉGLAGE TENU SE DIT AVEC SA VALEUR. Deux exigences portant sur le même nœud rendaient
    // sinon deux fois « le générateur : posé », ce qui ne disait plus laquelle était laquelle —
    // relevé dans l'application, sur l'exercice qui demande 220 hertz pendant trois secondes.
    if (c.parametre) {
      return ok(`${majuscule(c.quoi)} : « ${c.parametre.nom} » à ${valeurDite(complets[0], c, false)}.`,
                `${majuscule(c.quoiEn)}: « ${nomReglage(c, true)} » at ${valeurDite(complets[0], c, true)}.`);
    }
    return ok(`${majuscule(c.quoi)} : posé.`, `${majuscule(c.quoiEn)}: placed.`);
  }
  const memeIdentite = a.noeuds.filter((n) => estCelui(n, c));
  if (memeIdentite.length < nombre) {
    return nombre > 1
      ? non(`Il faut ${nombre} fois ${c.quoi} ; il y en a ${memeIdentite.length}.`,
            `${nombre} of ${c.quoiEn} are needed; there are ${memeIdentite.length}.`)
      : non(`Il manque ${c.quoi}.`, `${majuscule(c.quoiEn)} is missing.`);
  }
  // Le nœud est là : reste à savoir ce qui, de son réglage ou de son lancement, n'y est pas.
  const malRegle = c.parametre ? memeIdentite.find((n) => !reglageTenu(n, c)) : undefined;
  if (malRegle) {
    return non(
      `${majuscule(c.quoi)} : « ${c.parametre!.nom} » ${exigenceDite(c, false)} ; il est à ${valeurDite(malRegle, c, false)}.`,
      `${majuscule(c.quoiEn)}: « ${nomReglage(c, true)} » ${exigenceDite(c, true)}; it sits at ${valeurDite(malRegle, c, true)}.`);
  }
  return non(`${majuscule(c.quoi)} n'a pas encore été lancé.`, `${majuscule(c.quoiEn)} has not been run yet.`);
}

/** Un lien, examiné de même : d'abord ce qui manque, ensuite ce qui n'est pas branché. */
function examinerLien(a: Atelier, amont: Critere, aval: Critere, direct: boolean): Point[] {
  const sources = retenus(a, amont);
  const cibles = retenus(a, aval);
  const points: Point[] = [];
  if (sources.length === 0) points.push(examinerCritere(a, amont));
  if (cibles.length === 0) points.push(examinerCritere(a, aval));
  if (points.length > 0) return points;

  const passe = sources.some((s) => cibles.some((t) => (direct ? relieDirect(a, s.id, t.id) : mene(a, s.id, t.id))));
  const lie = direct
    ? { fr: "branché directement sur", en: "wired straight into" }
    : { fr: "relié à", en: "connected to" };
  return [passe
    ? ok(`${majuscule(amont.quoi)} est ${lie.fr} ${aval.quoi}.`, `${majuscule(amont.quoiEn)} is ${lie.en} ${aval.quoiEn}.`)
    : non(`${majuscule(amont.quoi)} n'est pas encore ${lie.fr} ${aval.quoi}.`,
          `${majuscule(amont.quoiEn)} is not ${lie.en} ${aval.quoiEn} yet.`)];
}

/**
 * La liste de contrôle d'une condition.
 *
 * Elle est plate : « toutes » ne crée pas de niveau, il concatène. Une liste à puces imbriquée
 * dans un nœud de trois cents pixels de large ne se lit pas, et aucune condition d'exercice n'a
 * jamais eu besoin de plus d'un niveau.
 */
export function examiner(condition: Condition | undefined, a: Atelier): Point[] {
  if (!condition) return [];
  switch (condition.sorte) {
    case "present":
      return [examinerCritere(a, condition.critere, condition.nombre ?? 1)];
    case "relie":
      return examinerLien(a, condition.amont, condition.aval, condition.direct === true);
    case "absent": {
      const trouves = a.noeuds.filter((n) => estCelui(n, condition.critere));
      return [trouves.length === 0
        ? ok(`Aucun ${condition.critere.quoi} : c'est bien ce qui est demandé.`,
             `No ${condition.critere.quoiEn}: that is what was asked.`)
        : non(`${majuscule(condition.critere.quoi)} est encore dans l'atelier.`,
              `${majuscule(condition.critere.quoiEn)} is still in the workshop.`)];
    }
    case "toutes":
      return condition.conditions.flatMap((c) => examiner(c, a));
  }
}

/** Tous les points sont-ils cochés ? Une liste vide ne vaut pas réussite. */
export const tousCoches = (points: Point[]): boolean => points.length > 0 && points.every((p) => p.satisfait);
