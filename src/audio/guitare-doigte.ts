// audio/guitare-doigte.ts — Où une guitare joue chaque note : la corde et la case.
//
// NÉ AVEC « PARTITION GUITARE », 2026-11-23. Une hauteur se joue souvent à plusieurs endroits du
// manche : le mi 4 sur la première corde à vide, sur la deuxième en case 5, sur la troisième en case 9.
// Il faut donc une règle, et celle de Fabien est le moindre déplacement de la main sur toute la pièce.
//
// LE MODÈLE. La pièce se découpe en TRANCHES, une par instant d'attaque : la tranche porte les notes
// attaquées à cet instant et celles qui sonnent encore, tenues par une autre voix ou par une liaison.
// Une affectation donne à chaque note de la tranche une corde et une case :
//   - deux notes qui sonnent ensemble prennent deux cordes ;
//   - une note tenue garde la corde et la case où elle a été attaquée ;
//   - les cases appuyées tiennent dans l'« Écart » de la main, de la plus basse à la plus haute ;
//   - la main couvre « Écart » cases à partir de l'index, sa POSITION : à 4, la position 7 tient de la
//     case 7 à la case 10. Elle ne se déplace que si une case appuyée sort de cette fenêtre, et le
//     déplacement se compte en cases. Une corde à vide ne la déplace pas.
//
// LA FENÊTRE, ET NON LA PLUS BASSE CASE APPUYÉE, décision de Fabien du 2026-11-23. La première règle,
// approuvée d'abord, mettait la main à la plus basse case appuyée : passer de la case 7 à la case 8
// coûtait un déplacement, et sur si 4, ré 4, sol 4, le calcul montait en case 12 sur trois cordes pour
// garder le même numéro, là où la main joue en septième position sans bouger.
//
// LE CALCUL EST EXACT, par programmation dynamique sur l'état (affectation de la tranche, position de
// la main) : la somme des déplacements d'une attaque à la suivante est la plus petite possible sur la
// pièce entière, et non à chaque pas. La première position se prend sans déplacement. À déplacement
// égal, la somme des cases l'emporte, donc les cases basses et les cordes à vide. À égalité encore,
// l'ordre d'énumération décide, de la corde la plus aiguë à la plus grave, puis de la position la plus
// basse : le résultat ne dépend de rien d'autre que des notes et des réglages.
//
// CE QUI NE SE JOUE PAS EST REFUSÉ, NOMMÉ, décisions de Fabien du 2026-11-23 : une note hors de la
// tessiture de l'accordage, et un accord que la main ne peut pas tenir, pour l'une des trois raisons,
// plus de notes que de cordes, deux notes qui exigent la même corde, un écart trop grand.

import { lireNomDeNote, midiDuNom } from "./noms-de-notes";

/** Un accordage : ses cordes, du grave à l'aigu, en noms de notes. */
export type Accordage = { id: string; nom: string; nomEn: string; cordes: readonly string[] };

/**
 * Les accordages offerts, décision de Fabien du 2026-11-23 : une liste nommée, dont le nombre de
 * cordes suit l'accordage. Les cordes s'écrivent en noms, lus par le lecteur des noms de notes.
 */
export const ACCORDAGES: readonly Accordage[] = [
  { id: "standard", nom: "Standard", nomEn: "Standard", cordes: ["E2", "A2", "D3", "G3", "B3", "E4"] },
  { id: "drop-d", nom: "Drop D", nomEn: "Drop D", cordes: ["D2", "A2", "D3", "G3", "B3", "E4"] },
  { id: "dadgad", nom: "DADGAD", nomEn: "DADGAD", cordes: ["D2", "A2", "D3", "G3", "A3", "D4"] },
  { id: "open-g", nom: "Open G", nomEn: "Open G", cordes: ["D2", "G2", "D3", "G3", "B3", "D4"] },
  { id: "open-d", nom: "Open D", nomEn: "Open D", cordes: ["D2", "A2", "D3", "F#3", "A3", "D4"] },
  { id: "demi-ton", nom: "Un demi-ton plus bas", nomEn: "Half step down", cordes: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"] },
  { id: "standard-7", nom: "Standard 7 cordes", nomEn: "Standard 7-string", cordes: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"] },
];

/** L'accordage d'un identifiant ; le standard pour un identifiant inconnu. */
export const accordageDe = (id: string): Accordage => ACCORDAGES.find((a) => a.id === id) ?? ACCORDAGES[0];

/** Les hauteurs MIDI des cordes à vide, du grave à l'aigu. */
export const cordesMidi = (a: Accordage): number[] => a.cordes.map((c) => midiDuNom(lireNomDeNote(c)!)!);

/** Une place sur le manche : la corde, 1 étant la plus aiguë comme dans l'usage, et la case. */
export type Place = { corde: number; frette: number };

/** Une note à placer. Ses identifiants sont ceux de la note et de ses suites liées. */
export type NoteAPlacer = { ids: string[]; midi: number; debut: number; fin: number; mesure: number; nom: string };

export type ReglagesDoigte = {
  /** Les cordes à vide, du grave à l'aigu, sans le capodastre. */
  cordes: readonly number[];
  /** La case du capodastre, 0 sans lui. Les cases rendues se comptent depuis lui. */
  capo: number;
  /** La dernière case du manche, comptée depuis le sillet. */
  derniereCase: number;
  /** Le nombre de cases que la main couvre, de la plus basse à la plus haute appuyée. */
  ecart: number;
};

export type RaisonDoigte = "tessiture" | "nombre" | "corde" | "ecart";
/** Ce qui ne se joue pas : la raison, les notes nommées, la mesure. */
export type FauteDoigte = { raison: RaisonDoigte; notes: string[]; mesure: number };

const EPS = 1e-6;

/** Les places d'une hauteur, de la corde la plus aiguë à la plus grave. */
export function candidats(midi: number, r: ReglagesDoigte): Place[] {
  const n = r.cordes.length;
  const places: Place[] = [];
  for (let corde = 1; corde <= n; corde++) {
    const frette = midi - (r.cordes[n - corde] + r.capo);
    if (Number.isInteger(frette) && frette >= 0 && frette <= r.derniereCase - r.capo) places.push({ corde, frette });
  }
  return places;
}

/** Les cases appuyées tiennent-elles dans l'écart de la main ? */
const dansEcart = (frettes: number[], ecart: number) => {
  const appuyees = frettes.filter((f) => f > 0);
  return appuyees.length === 0 || Math.max(...appuyees) - Math.min(...appuyees) + 1 <= ecart;
};

/** Toutes les affectations sur des cordes distinctes, chaque note prise dans ses candidats. */
function affectations(places: Place[][], prises: Set<number>, rendu: (a: Place[]) => void, courante: Place[] = []): void {
  const i = courante.length;
  if (i === places.length) { rendu(courante.slice()); return; }
  for (const p of places[i]) {
    if (prises.has(p.corde)) continue;
    prises.add(p.corde);
    courante.push(p);
    affectations(places, prises, rendu, courante);
    courante.pop();
    prises.delete(p.corde);
  }
}

/** Les tranches : à chaque instant d'attaque, les notes qui sonnent, attaquées ou tenues. */
export function tranches(notes: readonly NoteAPlacer[]): { instant: number; sonnent: number[]; neuves: number[] }[] {
  const instants = [...new Set(notes.map((n) => Math.round(n.debut / EPS) * EPS))].sort((a, b) => a - b);
  return instants.map((t) => {
    const sonnent = notes.map((_, i) => i).filter((i) => notes[i].debut <= t + EPS && notes[i].fin > t + EPS);
    return { instant: t, sonnent, neuves: sonnent.filter((i) => Math.abs(notes[i].debut - t) <= EPS) };
  });
}

/** Ce qui ne se joue pas, tranche par tranche, avant tout calcul du chemin. */
export function fautesDeDoigte(notes: readonly NoteAPlacer[], r: ReglagesDoigte): FauteDoigte[] {
  const fautes: FauteDoigte[] = [];
  const places = notes.map((n) => candidats(n.midi, r));
  notes.forEach((n, i) => { if (places[i].length === 0) fautes.push({ raison: "tessiture", notes: [n.nom], mesure: n.mesure }); });
  if (fautes.length > 0) return fautes;
  const vues = new Set<string>();
  for (const t of tranches(notes)) {
    const cle = t.sonnent.join(",");
    if (t.sonnent.length < 2 || vues.has(cle)) continue;
    vues.add(cle);
    const faute = (raison: RaisonDoigte) => fautes.push({ raison, notes: t.sonnent.map((i) => notes[i].nom), mesure: notes[t.neuves[0]].mesure });
    if (t.sonnent.length > r.cordes.length) { faute("nombre"); continue; }
    let distinctes = false, tenues = false;
    affectations(t.sonnent.map((i) => places[i]), new Set(), (a) => {
      distinctes = true;
      if (!tenues && dansEcart(a.map((p) => p.frette), r.ecart)) tenues = true;
    });
    if (!distinctes) faute("corde");
    else if (!tenues) faute("ecart");
  }
  return fautes;
}

type Etat = {
  /** La place de chaque note qui sonne dans la tranche. */
  places: Map<number, Place>;
  /** La position de la main, la case de l'index ; -1 tant qu'aucune case n'a été appuyée. */
  main: number;
  deplacement: number;
  somme: number;
  precedent: Etat | null;
};

/**
 * Les positions de la main qui couvrent les cases appuyées d'une tranche, de la plus basse à la plus
 * haute : l'index au plus bas sur la plus basse, et la fenêtre jusqu'à la plus haute. Sans case
 * appuyée, la main reste où elle est.
 */
function positions(frettes: number[], ecart: number, main: number): number[] {
  const appuyees = frettes.filter((f) => f > 0);
  if (appuyees.length === 0) return [main];
  const depuis = Math.max(1, Math.max(...appuyees) - ecart + 1), jusqua = Math.min(...appuyees);
  return Array.from({ length: jusqua - depuis + 1 }, (_, k) => depuis + k);
}

const meilleur = (a: Etat, b: Etat) => a.deplacement !== b.deplacement ? a.deplacement < b.deplacement : a.somme < b.somme;

/**
 * La place de chaque note, ou les fautes nommées. Les identifiants d'une même note, sa première
 * attaque et ses suites liées, prennent la même place.
 */
export function placer(notes: readonly NoteAPlacer[], r: ReglagesDoigte): { places: Map<string, Place> } | { fautes: FauteDoigte[] } {
  const fautes = fautesDeDoigte(notes, r);
  if (fautes.length > 0) return { fautes };
  const candidatsDe = notes.map((n) => candidats(n.midi, r));
  let etats: Etat[] = [{ places: new Map(), main: -1, deplacement: 0, somme: 0, precedent: null }];
  for (const t of tranches(notes)) {
    const suivants = new Map<string, Etat>();
    const tenues = t.sonnent.filter((i) => !t.neuves.includes(i));
    for (const e of etats) {
      const prises = new Set(tenues.map((i) => e.places.get(i)!.corde));
      affectations(t.neuves.map((i) => candidatsDe[i]), prises, (a) => {
        const places = new Map<number, Place>();
        tenues.forEach((i) => places.set(i, e.places.get(i)!));
        t.neuves.forEach((i, k) => places.set(i, a[k]));
        const frettes = [...places.values()].map((p) => p.frette);
        if (!dansEcart(frettes, r.ecart)) return;
        const somme = e.somme + a.reduce((s, p) => s + p.frette, 0);
        const cleAffectation = [...places].map(([i, p]) => `${i}:${p.corde}`).join(",");
        for (const main of positions(frettes, r.ecart, e.main)) {
          const suivant: Etat = {
            places, main, precedent: e, somme,
            deplacement: e.deplacement + (e.main >= 0 && main >= 0 ? Math.abs(main - e.main) : 0),
          };
          const cle = `${cleAffectation}|${main}`;
          const ancien = suivants.get(cle);
          if (!ancien || meilleur(suivant, ancien)) suivants.set(cle, suivant);
        }
      });
    }
    if (suivants.size === 0) {
      // Chaque note de la tranche se joue, et la tranche seule aussi : c'est la note tenue, à la place
      // où elle a été attaquée, qui prend la corde qu'une autre exige.
      return { fautes: [{ raison: "corde", notes: t.sonnent.map((i) => notes[i].nom), mesure: notes[t.neuves[0]].mesure }] };
    }
    etats = [...suivants.values()];
  }
  let fin = etats[0];
  for (const e of etats) if (meilleur(e, fin)) fin = e;
  const places = new Map<string, Place>();
  for (let e: Etat | null = fin; e; e = e.precedent) {
    for (const [i, p] of e.places) for (const id of notes[i].ids) if (!places.has(id)) places.set(id, p);
  }
  return { places };
}

/** La tessiture d'un accordage sous ses réglages : la corde la plus grave à vide, la plus aiguë à la dernière case. */
export const tessiture = (r: ReglagesDoigte): [number, number] =>
  [Math.min(...r.cordes) + r.capo, Math.max(...r.cordes) + r.derniereCase];
