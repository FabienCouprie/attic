// audio/cercle-pulsant.ts — Une animation et une mélodie qui sont la même chose.
//
// LE PRINCIPE, ET CE QUI LE DISTINGUE D'UNE SONIFICATION DÉCORATIVE. On ne dérive pas la musique
// de l'animation, ni l'animation de la musique : on calcule UNE SEULE suite de pulsations, et les
// deux sorties la lisent. Le dessin anime exactement ces instants, la mélodie écrit exactement ces
// notes. Elles ne peuvent pas diverger, parce qu'il n'y a rien à synchroniser — c'est la même
// liste, regardée deux fois.
//
// LA TEINTE DONNE LA TONALITÉ PAR LA ROUE DE CAMELOT, et ce n'est pas un mappage arbitraire.
// `audio/camelot.ts` dispose les douze tonalités en cercle — anneau A pour les mineurs, B pour les
// majeurs — selon la règle d'enchaînement des disc-jockeys : une case voisine, le même numéro dans
// l'autre anneau, ou sept cases plus loin. La teinte est un cercle, la roue en est un autre : les
// faire correspondre fait que **deux teintes voisines donnent deux tonalités compatibles**. Un
// dégradé continu produit donc une suite de modulations qui fonctionnent.
//
// Le mappage chromatique évident — teinte divisée en douze demi-tons — ferait exactement
// l'inverse : deux couleurs voisines y donnent deux tonalités étrangères l'une à l'autre, et un
// dégradé sonnerait comme une suite d'accidents.
//
// LE RESTE SUIT. La saturation choisit l'anneau : terne pour le mineur, vive pour le majeur — ce
// que l'œil lit déjà comme sombre ou éclatant. La clarté donne le registre. Le rayon au moment de
// la frappe donne le degré dans la gamme, et son amplitude la nuance : une grande pulsation est
// une note forte.

import { creerAleatoire } from "../core";
import { camelotToAccord } from "./camelot";
import { degresDeGamme } from "./gammes";
import type { NoteEvenement } from "./midi-sequence";
import type { Frappe } from "./pulsation";
import { intervallesDaccord } from "./qualites-accords";

/** Une pulsation : un instant, une taille, une couleur. Tout le reste en découle. */
export interface Pulsation {
  /** Instant de la frappe, en secondes. */
  temps: number;
  /** Rayon atteint, entre 0 et 1. */
  rayon: number;
  /** Teinte en degrés, 0 à 360. */
  teinte: number;
  /** Saturation, 0 à 1. */
  saturation: number;
  /** Clarté, 0 à 1. */
  clarte: number;
}

/**
 * Ce qu'il faut pour engendrer la suite de pulsations, et rien de plus.
 *
 * POURQUOI CE TYPE EXISTE À PART. `seuilSilence` ne décide que de ce qui SONNE : il est lu par les
 * notes, par les accords et par l'animation SVG, jamais par `pulsations`. Un composant qui ne tire
 * de cette suite qu'une image n'a donc rien à en dire, et le générateur vidéo le donnait pourtant,
 * avec un curseur visible et documenté qui ne pouvait rien changer. Le séparer met cette erreur hors
 * de portée : un appelant qui n'a pas de son à produire ne peut plus fournir ce champ par mégarde.
 */
export interface OptionsPulsations {
  dureeSec: number;
  /** Pulsations par seconde au début. */
  pulsationDebut: number;
  /** Pulsations par seconde à la fin. Différente du début, le rythme s'accélère ou ralentit. */
  pulsationFin: number;
  /** Teinte de départ, en degrés. */
  teinteDebut: number;
  /** De combien la teinte tourne sur toute la durée, en degrés. Signé. */
  teinteParcours: number;
  /** Saturation moyenne, 0 à 1. */
  saturation: number;
  /** Clarté moyenne, 0 à 1. */
  clarte: number;
  /** Amplitude de la respiration du rayon, 0 à 1. */
  respiration: number;
  /**
   * De combien la suite des tonalités s'écarte du parcours réglé, de zéro à un.
   *
   * POURQUOI CE RÉGLAGE EXISTE, relevé par Fabien : « les accords sont peu variables en fonction de
   * la graine, on entend à peu près la même progression à chaque fois ». Mesuré sur huit graines :
   * la progression était **identique aux huit**, `8B 9B 10B 11B 12B` à chaque fois. La cause est
   * structurelle et non un réglage mal choisi : la teinte se calcule de `teinteDebut` et de
   * `teinteParcours`, sans un seul tirage, et l'harmonie vient entièrement de la teinte. La graine ne
   * touchait que le rayon, donc la nuance, le degré de la mélodie et le silence.
   *
   * CE QU'ELLE TIRE AU SORT N'EST PAS UNE TONALITÉ QUELCONQUE, et c'est ce qui distingue ce réglage
   * d'un bruit ajouté. À chaque changement de case, elle choisit entre suivre le parcours et prendre
   * l'un des trois mouvements que la roue de Camelot autorise : la case voisine, le même numéro dans
   * l'autre anneau, ou sept cases plus loin. Ce sont les enchaînements que les disc-jockeys emploient
   * précisément parce qu'ils tiennent ; la suite reste donc une suite de modulations qui fonctionnent,
   * et ce n'est plus la même à chaque graine.
   *
   * À ZÉRO, PAS UN SEUL TIRAGE N'EST CONSOMMÉ, et la pièce est exactement celle d'avant ce réglage,
   * rayon compris : le `&&` court-circuite avant d'appeler le tirage. C'est ce qui permet de retrouver
   * le comportement d'origine sans rien d'autre à régler.
   */
  errance?: number;
  /**
   * De combien chaque intervalle entre deux pulsations s'écarte de la cadence réglée, de zéro à un.
   *
   * POURQUOI CE RÉGLAGE EXISTE, relevé par Fabien après une première correction qui ne portait que
   * sur l'harmonie : « ça sonne pareil quelle que soit la graine ». Les instants venaient du seul
   * glissement de cadence, sans un tirage : mesuré sur huit graines, **une seule suite d'instants
   * pour les huit**. Or le rythme est ce qu'on entend en premier d'une pulsation, et le mode par
   * défaut ne fait sonner ni accords ni mélodie : aucune correction de l'harmonie ne pouvait donc
   * s'y entendre.
   *
   * L'ÉCART EST RELATIF À LA PÉRIODE COURANTE. Une pièce qui accélère garde ainsi la même
   * irrégularité perçue d'un bout à l'autre ; comptée en secondes, elle paraîtrait s'assagir à
   * mesure que la cadence monte.
   *
   * À ZÉRO, AUCUN TIRAGE N'EST CONSOMMÉ et les instants sont ceux d'une grille exacte, ce qui est le
   * comportement d'avant ce réglage.
   */
  irregularite?: number;
  graine: number;
}

/** Les mêmes, plus ce qui ne concerne que le son. */
export interface OptionsCercle extends OptionsPulsations {
  /** Rayon en deçà duquel la pulsation ne sonne pas : le silence a une image. */
  seuilSilence: number;
  /**
   * La gamme où la mélodie prend ses degrés, par son identifiant dans la table commune.
   *
   * VIDE VEUT DIRE « SELON LA ROUE », et c'est le comportement d'origine : la saturation choisit
   * l'anneau, donc majeur ou mineur. Un identifiant donné passe outre, et la roue ne décide plus
   * que de la TONIQUE. Les deux se défendent — la roue tient sa cohérence de ce que ses cases
   * voisines s'enchaînent, ce qu'une gamme imposée ne défait pas puisqu'elle ne touche pas au
   * parcours des toniques.
   */
  gamme?: string;
  /** La qualité des accords, par son identifiant. Vide veut dire « selon la roue » : majeur ou mineur. */
  qualite?: string;
}

/**
 * Ce que le cercle fait entendre.
 *
 * `pulsation` est le défaut, demandé par Fabien : un seul son sourd par frappe, celui-là même que
 * rend le composant Pulsation, si bien que le son qui sort d'ici peut rentrer là-bas et
 * réciproquement. `rythme` frappe une percussion à la place. `melodie` est le comportement des
 * versions antérieures : la mélodie et ses accords.
 *
 * `accords` NE REND QUE L'HARMONIE, demandé par Fabien. Ce n'est pas la mélodie coupée : c'est la
 * suite des tonalités traversées, rendue seule, donc ce que la roue prescrit sans la ligne qui la
 * parcourt. Elle sert de matière à qui veut écrire sa mélodie ailleurs, et c'est aussi ce qu'un
 * composant qui pose une mélodie sur des accords attend en entrée.
 */
export type ModeDuCercle = "pulsation" | "rythme" | "melodie" | "accords";

/**
 * Les pulsations audibles, vues comme des frappes.
 *
 * C'EST LE MÊME TYPE QUE CELUI DE `audio/pulsation.ts`, et ce n'est pas une coïncidence : ce que
 * cette fonction rend, l'autre l'extrait d'un son. Les deux bouts se branchent donc l'un sur
 * l'autre sans rien convertir, et c'est ce qui ferme la boucle.
 *
 * LE RAYON DONNE LA FORCE, comme il donne déjà la vélocité de la mélodie : une grande pulsation est
 * une frappe forte. Une pulsation sous le seuil ne rend rien, la même décision que partout ici.
 */
export function frappesDuCercle(p: readonly Pulsation[], o: OptionsCercle): Frappe[] {
  const out: Frappe[] = [];
  for (const pulse of p) {
    if (pulse.rayon < o.seuilSilence) continue;
    out.push({ instant: pulse.temps, force: Math.round(50 + pulse.rayon * 70), atomes: 1 });
  }
  return out;
}

/**
 * Les pulsations que dicte une suite de notes reçue.
 *
 * LA BOUCLE SE FERME ICI. Le composant Pulsation tire d'un son ses frappes ; posées à l'entrée de
 * celui-ci, elles deviennent les instants du cercle, et l'on voit battre ce qu'on a entendu battre.
 *
 * CE QUI EST REÇU EST LE RYTHME, ET RIEN D'AUTRE. La couleur reste un réglage : elle continue de
 * tourner sur la durée reçue, donc de donner la tonalité et le registre. Prendre aussi la hauteur
 * des notes reçues ferait un second mappage, concurrent de la roue de Camelot, et le composant
 * n'aurait plus une règle mais deux.
 *
 * LE RAYON VIENT DE LA VÉLOCITÉ, parce que c'est la même grandeur dans l'autre sens : la force
 * d'une frappe y devenait un rayon, elle le redevient. Une suite sans vélocité utile — toutes les
 * notes au même niveau — donne un cercle qui garde sa taille, ce qui est exact.
 */
export function pulsationsDepuisNotes(
  notes: readonly { debut: number; velocite?: number }[], o: OptionsPulsations,
): Pulsation[] {
  const instants = [...new Set(notes.map((n) => Math.max(0, n.debut)))].sort((a, b) => a - b);
  if (instants.length === 0) return [];
  const forceA = new Map<number, number>();
  for (const n of notes) {
    const t = Math.max(0, n.debut);
    forceA.set(t, Math.max(forceA.get(t) ?? 0, n.velocite ?? 100));
  }
  const fin = Math.max(o.dureeSec, instants[instants.length - 1]);
  return instants.map((t) => {
    const avancement = fin > 0 ? Math.min(1, t / fin) : 0;
    const force = (forceA.get(t) ?? 100) / 127;
    return {
      temps: t,
      rayon: Math.min(1, Math.max(0, (1 - o.respiration) + o.respiration * force)),
      teinte: o.teinteDebut + o.teinteParcours * avancement,
      saturation: Math.min(1, Math.max(0, o.saturation)),
      clarte: Math.min(1, Math.max(0, o.clarte)),
    };
  });
}

/**
 * Le tirage vient du générateur commun, et il en venait pas.
 *
 * CE QUI ÉTAIT ÉCRIT ICI, et pourquoi c'était faux. Un générateur congruentiel recopié à la main,
 * avec le multiplicateur de la bibliothèque C. En JavaScript ce produit DÉPASSE 2^53 dès le second
 * tirage, d'un facteur qui monte à 131 : les bits de poids faible sont perdus, et ce sont exactement
 * ceux qui portent l'aléa d'un tel générateur. Relevé par Fabien à l'oreille, puis mesuré : période de
 * 10 466, et 14 469 valeurs distinctes sur 20 000 tirages, soit 28 % de doublons. Le générateur de
 * `core/hasard.ts` emploie `Math.imul`, qui est la seule façon correcte de multiplier sur 32 bits
 * en JavaScript, et rend 20 000 valeurs distinctes sur 20 000.
 *
 * LA PIÈCE CHANGE, ET IL FAUT LE DIRE : à graine égale, les rayons ne sont plus les mêmes qu'avant
 * cette correction. C'est le prix d'un aléa qui en est un.
 */
const tirage = creerAleatoire;

/**
 * La case de la roue de Camelot qu'une couleur désigne.
 *
 * La teinte tourne dans le sens des aiguilles depuis le rouge ; la roue tourne de même depuis sa
 * case 1. Trente degrés valent une case. La saturation choisit l'anneau, et le seuil est au
 * milieu : rien ne justifierait de le placer ailleurs, et le mettre ailleurs ferait dépendre le
 * mode d'un réglage caché.
 */
export function couleurVersCamelot(teinte: number, saturation: number): string {
  const degres = ((teinte % 360) + 360) % 360;
  const n = (Math.floor(degres / 30) % 12) + 1;
  return `${n}${saturation >= 0.5 ? "B" : "A"}`;
}

/** La tonique d'une case, en classe de hauteur — ce que la gamme prendra pour point de départ. */
export function toniqueDeCamelot(code: string): number {
  const accord = camelotToAccord(code);
  if (!accord) return 0;
  const lettre = accord.replace(/m$/, "");
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let n = base[lettre[0]] ?? 0;
  if (lettre[1] === "#") n += 1;
  if (lettre[1] === "b") n -= 1;
  return ((n % 12) + 12) % 12;
}

/** Vrai si la case désigne un mode mineur — l'anneau A de la roue. */
export const estMineur = (code: string) => code.toUpperCase().endsWith("A");

// LES DEGRÉS VIENNENT DE LA TABLE COMMUNE, `gammes.ts`. Ils étaient écrits ici à la main, et le
// garde des gammes ne les voyait pas : il ne cherchait que des constantes nommées `GAMME*`, quand
// celles-ci s'appelaient `MAJEUR` et `MINEUR`. C'est ce trou qui a fait refaire le garde sur la
// FORME d'une gamme plutôt que sur le nom qu'on lui donne.
const MAJEUR = degresDeGamme("majeur");
const MINEUR = degresDeGamme("mineur");

/** La gamme d'une case : celle qu'on impose, ou celle que l'anneau désigne. */
const gammeDuCode = (code: string, impose?: string) =>
  impose ? degresDeGamme(impose) : (estMineur(code) ? MINEUR : MAJEUR);

/** L'accord d'une case : celui qu'on impose, ou la triade que l'anneau désigne. */
const accordDuCode = (code: string, impose?: string) =>
  intervallesDaccord(impose || (estMineur(code) ? "m" : "maj"));

/**
 * La suite des pulsations.
 *
 * LE RYTHME N'EST PAS UNE GRILLE : la cadence glisse du début vers la fin, si bien que l'écart
 * entre deux frappes change continûment. On avance donc instant par instant plutôt que de diviser
 * la durée — une grille imposerait un tempo là où l'on veut une respiration.
 */
export function pulsations(o: OptionsPulsations): Pulsation[] {
  const alea = tirage(o.graine);
  const out: Pulsation[] = [];
  const errance = Math.min(1, Math.max(0, o.errance ?? 0));
  const saturationReglee = Math.min(1, Math.max(0, o.saturation));
  const irregularite = Math.min(1, Math.max(0, o.irregularite ?? 0));

  // LA RESPIRATION PART D'UNE PHASE ET D'UNE VITESSE TIRÉES, et c'est ce qui manquait le plus.
  //
  // CE QUI ÉTAIT FAUX, relevé par Fabien : « ça sonne pareil quelle que soit la graine ». Le souffle
  // était `sin(2π · 0,11 · t)`, le MÊME sinus pour toute graine, parti de la même phase. Or c'est lui
  // qui décide quelles pulsations passent sous le seuil de silence : l'architecture de son et de
  // silence, qui est ce qu'on entend en premier, était donc identique d'une graine à l'autre.
  // Mesuré sur huit graines : les motifs de silence se superposaient à une ou deux places près, et
  // les INSTANTS, eux, étaient rigoureusement identiques — une seule suite pour les huit.
  const phase = alea() * 2 * Math.PI;
  // La vitesse varie d'un tiers autour de sa valeur d'origine : assez pour que les blocs tombent
  // ailleurs, pas assez pour que le cercle cesse de respirer lentement sous la cadence.
  const vitesseSouffle = 0.11 * (0.75 + 0.5 * alea());
  // L'ERRANCE REMPLACE LE PAS DU PARCOURS, elle ne s'y ajoute pas, et c'est ce qui la garde dans la
  // roue. Ajoutée, un écart d'une case sur un pas nominal d'une case donnait un saut de DEUX cases,
  // que la roue de Camelot n'autorise pas : la suite aurait cessé d'être une suite de modulations
  // qui tiennent, ce qui est tout l'intérêt de passer par elle. Le décalage est donc calculé pour
  // que la case ENTENDUE tombe sur la cible, quel que soit le pas que le parcours venait de faire.
  //
  // ET IL S'ACCUMULE : un écart pris reste pris, et le parcours continue de tourner par-dessus. Le
  // retirer ferait revenir la pièce à son chemin réglé, donc effacerait la modulation entendue.
  //
  // LA CASE SE COMPTE SANS LA RAMENER DANS LE TOUR. Une case entendue vaut toujours la nominale plus
  // le décalage en cases, le décalage étant un multiple de trente degrés ; c'est le code de Camelot
  // qui ramène dans les douze, à la lecture. Compter modulo douze ici obligerait à des soustractions
  // circulaires pour rien.
  const caseDe = (degres: number) => Math.floor(degres / 30);
  let decalage = 0;
  let anneauChange = false;
  // La première case ne se tire pas : la pièce commence dans la tonalité que les réglages disent.
  let caseNominale = caseDe(o.teinteDebut);
  let t = 0;
  let garde = 0;
  while (t < o.dureeSec && garde++ < 100000) {
    const avancement = o.dureeSec > 0 ? t / o.dureeSec : 0;
    const cadence = o.pulsationDebut + (o.pulsationFin - o.pulsationDebut) * avancement;
    // L'INSTANT SUIVANT SE TIRE, ET IL NE SE TIRAIT PAS. Les instants venaient du seul glissement de
    // cadence : ils étaient donc rigoureusement les mêmes pour toute graine, et le rythme est ce
    // qu'on entend en premier d'une pulsation. L'écart se compte en part de la période courante, de
    // sorte qu'une pièce qui accélère garde la même irrégularité RELATIVE d'un bout à l'autre ; en
    // valeur absolue, elle paraîtrait s'assagir à mesure que la cadence monte.
    const periode = (1 / Math.max(0.05, cadence))
      * (irregularite > 0 ? 1 + irregularite * (alea() * 2 - 1) : 1);
    const teinteNominale = o.teinteDebut + o.teinteParcours * avancement;
    const caseCourante = caseDe(teinteNominale);
    if (caseCourante !== caseNominale) {
      const pas = caseCourante - caseNominale;
      caseNominale = caseCourante;
      // LE `&&` COURT-CIRCUITE À ERRANCE NULLE : aucun tirage n'est consommé, et la suite des
      // rayons reste celle d'avant ce réglage, à l'échantillon près.
      if (errance > 0 && alea() < errance) {
        // Les trois mouvements de la roue, comptés depuis la case qu'on vient d'entendre.
        const mouvement = Math.floor(alea() * 3);
        const vise = mouvement === 0 ? -1 : mouvement === 1 ? 0 : 7;
        if (mouvement === 1) anneauChange = !anneauChange;
        decalage += (vise - pas) * 30;
      }
    }
    // Le rayon respire : une oscillation lente sous la cadence, plus un grain d'irrégularité.
    //
    // LE GRAIN VA DE 0,6 À 1 ET NON DE 0,75 À 1,25, et ce n'est pas un réglage de goût. Avec l'ancien
    // intervalle, la formule pouvait rendre jusqu'à 1,25 et se faisait raboter par le plafond :
    // mesuré sur une pièce de deux minutes, **31 pulsations sur 288 collées exactement à 1**, soit
    // onze pour cent de la pièce au rayon maximal, et ce à TOUTE respiration puisque le dépassement
    // est proportionnel. Or le rayon donne la nuance et le degré : onze pour cent des notes sortaient
    // à la même force et au même degré. Les trente doublons de rayon relevés venaient tous de là.
    // Ramené sous un, le plancher ne bouge pas — il vaut toujours cent moins la respiration — et le
    // plafond n'est plus atteint que par la limite.
    const souffle = 0.5 + 0.5 * Math.sin(phase + 2 * Math.PI * vitesseSouffle * t);
    const rayon = Math.min(1, Math.max(0,
      (1 - o.respiration) + o.respiration * souffle * (0.6 + 0.4 * alea())));
    out.push({
      temps: t,
      rayon,
      teinte: teinteNominale + decalage,
      // L'ANNEAU EST LA SATURATION, le composant le tient depuis l'origine : changer d'anneau, c'est
      // donc passer du vif au terne. La couleur suit la tonalité parce qu'elle EST la tonalité.
      saturation: anneauChange ? 1 - saturationReglee : saturationReglee,
      clarte: Math.min(1, Math.max(0, o.clarte)),
    });
    t += periode;
  }
  return out;
}

/**
 * Les notes que ces pulsations écrivent.
 *
 * UNE PULSATION SOUS LE SEUIL NE SONNE PAS, et c'est ce qui permet à la pièce de respirer : le
 * cercle se rétracte, la musique se tait, et les deux se taisent ensemble parce que c'est la même
 * décision. Sans ce seuil, une note tomberait sur chaque battement du début à la fin, ce qu'aucune
 * musique ne fait.
 */
export function notesDepuisPulsations(
  p: readonly Pulsation[], o: OptionsCercle, octaveBase = 4,
): { notes: NoteEvenement[]; codes: string[] } {
  const notes: NoteEvenement[] = [];
  const codes: string[] = [];
  for (let i = 0; i < p.length; i++) {
    const pulse = p[i];
    const code = couleurVersCamelot(pulse.teinte, pulse.saturation);
    codes.push(code);
    if (pulse.rayon < o.seuilSilence) continue;

    const gamme = gammeDuCode(code, o.gamme);
    // Le rayon choisit le degré : un grand cercle est une note GRAVE. C'est le sens que l'œil
    // donne spontanément à une forme large, et l'inverser ferait grimper la mélodie quand le
    // dessin s'alourdit.
    const degre = Math.min(gamme.length - 1, Math.floor((1 - pulse.rayon) * gamme.length));
    // La clarté donne le registre : une couleur claire monte d'une octave.
    const octave = octaveBase + Math.round(pulse.clarte * 2) - 1;
    const note = 12 * (octave + 1) + toniqueDeCamelot(code) + gamme[degre];
    const fin = i + 1 < p.length ? p[i + 1].temps : pulse.temps + 0.4;
    notes.push({
      note: Math.min(108, Math.max(21, note)),
      velocite: Math.round(50 + pulse.rayon * 70),
      debut: pulse.temps,
      fin: Math.min(o.dureeSec, fin),
    });
  }
  return { notes, codes };
}

/**
 * Les accords que la roue prescrit.
 *
 * UNE CASE DE LA ROUE DE CAMELOT EST UNE TONALITÉ, DONC UN ACCORD. La teinte parcourt la roue, et
 * cette suite de cases est une suite d'accords — c'est même l'objet de la roue, dont la règle
 * d'enchaînement sert aux disc-jockeys à passer d'un morceau au suivant sans heurt harmonique.
 * Seule la mélodie l'entendait : elle prend ses degrés dans la gamme de la case, mais un degré
 * isolé ne fait pas entendre la tonalité dont il vient. La triade de tonique, elle, la nomme.
 *
 * Elle est posée UNE OCTAVE SOUS LA MÉLODIE, et à une nuance qu'on règle : deux voix dans le même
 * registre se disputent l'avant-plan, et c'est la mélodie qui doit l'occuper.
 *
 * UN SEGMENT SANS PULSATION AUDIBLE NE SONNE PAS. La teinte tourne sans se soucier du seuil de
 * silence, si bien qu'une case peut être traversée pendant que le cercle est rétracté. Y poser un
 * accord romprait la propriété qui fait tenir le composant : l'image et la musique se taisent
 * ensemble, parce que c'est la même décision.
 */
export type ModeAccords = "aucun" | "tenus" | "frappes";

export function accordsDepuisPulsations(
  p: readonly Pulsation[], o: OptionsCercle, mode: ModeAccords, nuance: number, octaveBase = 4,
): NoteEvenement[] {
  if (mode === "aucun" || p.length === 0) return [];
  const velocite = Math.round(Math.min(127, Math.max(1, nuance * 127)));
  const notes: NoteEvenement[] = [];
  const codeDe = (i: number) => couleurVersCamelot(p[i].teinte, p[i].saturation);

  let i = 0;
  while (i < p.length) {
    const code = codeDe(i);
    let j = i;
    while (j + 1 < p.length && codeDe(j + 1) === code) j++;

    const audibles: number[] = [];
    for (let k = i; k <= j; k++) if (p[k].rayon >= o.seuilSilence) audibles.push(k);
    if (audibles.length > 0) {
      // LES INTERVALLES VIENNENT DE LA TABLE COMMUNE, `qualites-accords.ts`. Ils étaient CALCULÉS
      // ici — `[0, tierce, 7]` avec une tierce mineure ou majeure —, et c'est pire qu'une table
      // cachée : un garde qui cherche la forme d'un accord ne peut pas voir une triade qu'aucune
      // liste ne porte. Une qualité imposée ouvre du même coup les trente-trois autres.
      const intervalles = accordDuCode(code, o.qualite);
      const octave = octaveBase + Math.round(p[i].clarte * 2) - 2;
      const racine = 12 * (octave + 1) + toniqueDeCamelot(code);
      const finSegment = Math.min(o.dureeSec, j + 1 < p.length ? p[j + 1].temps : p[j].temps + 0.4);
      const frappes = mode === "frappes" ? audibles : [audibles[0]];
      for (let f = 0; f < frappes.length; f++) {
        const debut = p[frappes[f]].temps;
        const fin = mode === "frappes" && f + 1 < frappes.length
          ? Math.min(finSegment, p[frappes[f + 1]].temps)
          : finSegment;
        if (fin <= debut) continue;
        for (const demi of intervalles) {
          notes.push({ note: Math.min(108, Math.max(21, racine + demi)), velocite, debut, fin });
        }
      }
    }
    i = j + 1;
  }
  return notes;
}

/** Une couleur en notation CSS, depuis les trois composantes d'une pulsation. */
export const couleurCss = (p: Pulsation, alpha = 1) =>
  `hsl(${(((p.teinte % 360) + 360) % 360).toFixed(1)} ${(p.saturation * 100).toFixed(0)}% ${(30 + p.clarte * 45).toFixed(0)}%${alpha < 1 ? ` / ${alpha}` : ""})`;

export interface OptionsSvg {
  taille: number;
  /** Laisser une traînée derrière chaque pulsation. */
  echos: boolean;
}

/**
 * L'animation, en SVG.
 *
 * SMIL PLUTÔT QUE CSS OU JAVASCRIPT, et ce choix a une raison précise : un SVG animé par SMIL
 * s'anime même chargé dans une balise `img`, c'est-à-dire là où Attic affiche ses images. Une
 * animation CSS ou pilotée par script ne tournerait que dans un contexte de document complet, et
 * le nœud rendrait une image fixe sans dire pourquoi.
 *
 * Le fichier est autonome : aucune police, aucune ressource extérieure, aucun script. Il s'ouvre
 * dans n'importe quel navigateur et se glisse dans une page.
 */
export function svgAnime(p: readonly Pulsation[], o: OptionsCercle, s: OptionsSvg): string {
  const taille = s.taille;
  const centre = taille / 2;
  const rayonMax = taille * 0.38;
  const duree = Math.max(0.1, o.dureeSec);
  const cle = (v: number) => (v / duree).toFixed(5);

  // Une seule animation par attribut, dont les valeurs sont les pulsations : le navigateur
  // interpole entre elles, ce qui donne la respiration sans qu'on l'écrive image par image.
  const temps: string[] = [];
  const rayons: string[] = [];
  const couleurs: string[] = [];
  for (const pulse of p) {
    // Deux points par pulsation : le creux juste avant, le sommet à l'instant de la frappe.
    const avant = Math.max(0, pulse.temps - 0.06);
    temps.push(cle(avant), cle(pulse.temps));
    rayons.push((rayonMax * 0.25).toFixed(1), (rayonMax * Math.max(0.12, pulse.rayon)).toFixed(1));
    couleurs.push(couleurCss(pulse), couleurCss(pulse));
  }
  temps.push("1"); rayons.push((rayonMax * 0.25).toFixed(1)); couleurs.push(couleurCss(p[p.length - 1] ?? {
    temps: 0, rayon: 0.5, teinte: o.teinteDebut, saturation: o.saturation, clarte: o.clarte,
  }));

  // Les échos : un anneau par pulsation audible, qui s'ouvre et s'efface. C'est la décroissance
  // de la note, rendue visible — et c'est ce qui donne son épaisseur à l'image.
  const echos = s.echos
    ? p.filter((x) => x.rayon >= o.seuilSilence).slice(0, 400).map((x) => `
    <circle cx="${centre}" cy="${centre}" r="1" fill="none" stroke="${couleurCss(x, 0.55)}" stroke-width="2">
      <animate attributeName="r" values="${(rayonMax * 0.3).toFixed(1)};${(rayonMax * 1.15).toFixed(1)}"
        begin="${x.temps.toFixed(3)}s" dur="1.1s" repeatCount="indefinite" fill="remove" />
      <animate attributeName="opacity" values="0.6;0" begin="${x.temps.toFixed(3)}s" dur="1.1s"
        repeatCount="indefinite" fill="remove" />
    </circle>`).join("")
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${taille} ${taille}" width="${taille}" height="${taille}">
  <defs>
    <radialGradient id="halo">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#fff" stop-opacity="0.06" />
      <stop offset="100%" stop-color="#fff" stop-opacity="0" />
    </radialGradient>
    <filter id="flou"><feGaussianBlur stdDeviation="${(taille / 90).toFixed(2)}" /></filter>
  </defs>
  <rect width="${taille}" height="${taille}" fill="#0b0d14" />${echos}
  <circle cx="${centre}" cy="${centre}" r="1" filter="url(#flou)" opacity="0.55">
    <animate attributeName="r" dur="${duree}s" repeatCount="indefinite"
      keyTimes="${temps.join(";")}" values="${rayons.map((r) => (Number(r) * 1.25).toFixed(1)).join(";")}" />
    <animate attributeName="fill" dur="${duree}s" repeatCount="indefinite"
      keyTimes="${temps.join(";")}" values="${couleurs.join(";")}" />
  </circle>
  <circle cx="${centre}" cy="${centre}" r="1">
    <animate attributeName="r" dur="${duree}s" repeatCount="indefinite"
      keyTimes="${temps.join(";")}" values="${rayons.join(";")}" />
    <animate attributeName="fill" dur="${duree}s" repeatCount="indefinite"
      keyTimes="${temps.join(";")}" values="${couleurs.join(";")}" />
  </circle>
  <circle cx="${centre}" cy="${centre}" r="${(rayonMax * 0.55).toFixed(1)}" fill="url(#halo)" />
</svg>`;
}
