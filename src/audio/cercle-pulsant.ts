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

import { camelotToAccord } from "./camelot";
import type { NoteEvenement } from "./midi";

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

export interface OptionsCercle {
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
  /** Rayon en deçà duquel la pulsation ne sonne pas : le silence a une image. */
  seuilSilence: number;
  graine: number;
}

function tirage(graine: number): () => number {
  let g = (graine | 0) || 1;
  return () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
}

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

const MAJEUR = [0, 2, 4, 5, 7, 9, 11];
const MINEUR = [0, 2, 3, 5, 7, 8, 10];

/**
 * La suite des pulsations.
 *
 * LE RYTHME N'EST PAS UNE GRILLE : la cadence glisse du début vers la fin, si bien que l'écart
 * entre deux frappes change continûment. On avance donc instant par instant plutôt que de diviser
 * la durée — une grille imposerait un tempo là où l'on veut une respiration.
 */
export function pulsations(o: OptionsCercle): Pulsation[] {
  const alea = tirage(o.graine);
  const out: Pulsation[] = [];
  let t = 0;
  let garde = 0;
  while (t < o.dureeSec && garde++ < 100000) {
    const avancement = o.dureeSec > 0 ? t / o.dureeSec : 0;
    const cadence = o.pulsationDebut + (o.pulsationFin - o.pulsationDebut) * avancement;
    const periode = 1 / Math.max(0.05, cadence);
    // Le rayon respire : une oscillation lente sous la cadence, plus un grain d'irrégularité.
    const souffle = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.11 * t);
    const rayon = Math.min(1, Math.max(0,
      (1 - o.respiration) + o.respiration * souffle * (0.75 + 0.5 * alea())));
    out.push({
      temps: t,
      rayon,
      teinte: o.teinteDebut + o.teinteParcours * avancement,
      saturation: Math.min(1, Math.max(0, o.saturation)),
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

    const gamme = estMineur(code) ? MINEUR : MAJEUR;
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
      const tierce = estMineur(code) ? 3 : 4;
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
        for (const demi of [0, tierce, 7]) {
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
