// audio/piano-mains.ts — Quelle main joue chaque note d'une partition pour piano.
//
// NÉ AVEC « PARTITION PIANO », 2026-11-23. Une partition pour piano a deux portées : la clé de sol pour
// la main droite, la clé de fa pour la main gauche. Une notation à une seule voix, comme celles que les
// nœuds d'Attic écrivent, ou une partition à plusieurs portées, ne dit pas quelle main joue quoi : il
// faut une règle, et Fabien en a voulu deux, au choix du réglage « Partage ».
//
// LE POINT FIXE. Une note à partir du « Point de partage » (le do 4 par défaut) est à la main droite,
// une note plus grave à la main gauche. C'est prévisible ; une mélodie qui passe sous le point change
// de portée, et un accord à cheval est coupé.
//
// PAR LA MAIN, le défaut. La pièce se découpe en TRANCHES, une par instant d'attaque, comme pour la
// guitare (`tranches` de `guitare-doigte.ts`) : la tranche porte les notes attaquées et celles qui
// sonnent encore. Les notes neuves d'une tranche, triées par hauteur, se partagent en un seuil : les
// plus graves à gauche, les autres à droite ; les mains ne se croisent donc jamais dans ce qu'elles
// attaquent ensemble. Une note tenue, ou liée, garde la main qui l'a attaquée, et compte dans sa main.
// Chaque main a une FENÊTRE de « Écart » demi-tons. Tant qu'elle n'a pas bougé, sa place est libre dans
// ce qui couvre toutes ses notes depuis le dernier déplacement ; elle ne bouge que si une note en sort,
// et alors au plus court. Le coût d'un partage, dans cet ordre :
//   1. le DÉPASSEMENT : les notes au-delà de cinq dans une main, et les demi-tons au-delà de l'écart ;
//   2. puis la somme de trois termes, en demi-tons :
//      - le DÉPLACEMENT des deux fenêtres ;
//      - le REGISTRE : une note de la main droite sous le point de partage compte sa distance au point,
//        une note de la main gauche au point ou au-dessus aussi ;
//      - le CHANGEMENT DE MAIN dans une LIGNE, une suite de notes seules dans une voix, compté pour
//        CHANGEMENT demi-tons : quand une note seule suit, dans sa voix, une note seule de l'autre main
//        à moins d'un écart. Une ligne qui avance par petits intervalles reste ainsi dans sa main, même
//        sous le point ; un saut plus grand que l'écart, de la basse au chant, change de main sans
//        frais. Un accord n'est pas une ligne : chacune de ses notes va où les mains la tiennent, et la
//        note seule qui suit un accord n'est liée à rien.
// Le calcul se fait par programmation dynamique sur la pièce entière : l'état est le partage des notes
// qui sonnent, la place des deux fenêtres et la dernière attaque de chaque voix ; à état égal, le moins
// coûteux reste, et les ETATS meilleurs passent à la tranche suivante. À coût égal, le partage le plus
// proche du point fixe l'emporte.
//
// CE QUI NE SE JOUE PAS EST GRAVÉ, ET DIT, décision de Fabien du 2026-11-23 : un accord qu'aucun partage
// ne tient, plus de cinq notes dans une main ou une main plus large que l'écart, garde le meilleur
// partage ; une note hors du clavier, sous la 0 ou au-dessus du do 8, garde la main de la règle.

import { tranches, type NoteAPlacer } from "./guitare-doigte";

export type Main = "droite" | "gauche";

/** Une note à partager, avec sa voix : la portée et la couche d'où elle vient. */
export type NoteDeVoix = NoteAPlacer & { voix: string };

export type ReglagesMains = {
  partage: "main" | "fixe";
  /** Le point de partage, en hauteur MIDI : le seuil en point fixe, le pivot des registres par la main. */
  point: number;
  /** Le nombre de demi-tons que couvre une main. */
  ecart: number;
};

/** Un accord qu'aucun partage ne tient : ses notes et sa mesure. */
export type Large = { notes: string[]; mesure: number };

export type Partage = {
  /** La main de chaque identifiant : la note et ses suites liées. */
  mains: Map<string, Main>;
  larges: Large[];
  horsClavier: { nom: string; mesure: number }[];
};

/** Les touches du piano : la 0 et le do 8. */
export const CLAVIER: readonly [number, number] = [21, 108];
/** Le nombre de doigts d'une main. */
const DOIGTS = 5;
/** Ce que coûte un changement de main dans une voix, en demi-tons. */
export const CHANGEMENT = 24;
/** Le nombre d'états gardés d'une tranche à la suivante. */
const ETATS = 256;

/** Les places possibles de la fenêtre d'une main, la note la plus grave qu'elle couvre ; null avant sa première note. */
type Fenetre = [number, number] | null;
type Attaque = { midi: number; main: Main }[];

type Etat = {
  /** La main de chaque note qui sonne dans la tranche, par son rang. */
  mains: Map<number, Main>;
  droite: Fenetre;
  gauche: Fenetre;
  /** La dernière attaque de chaque voix. */
  voix: Map<string, Attaque>;
  depasse: number;
  reste: number;
  /** Le dépassement de cette tranche seule, pour le dire. */
  ici: number;
  precedent: Etat | null;
};

const meilleur = (a: Etat, b: Etat) => a.depasse !== b.depasse ? a.depasse < b.depasse : a.reste < b.reste;
const ordre = (a: Etat, b: Etat) => (meilleur(a, b) ? -1 : meilleur(b, a) ? 1 : 0);

/** Le dépassement d'une main : les notes au-delà de cinq, les demi-tons au-delà de l'écart. */
function depassement(hauteurs: number[], ecart: number): number {
  if (hauteurs.length === 0) return 0;
  return Math.max(0, hauteurs.length - DOIGTS) + Math.max(0, Math.max(...hauteurs) - Math.min(...hauteurs) - ecart);
}

/**
 * La fenêtre d'une main après une tranche, et son déplacement. Les places qui couvrent les notes vont
 * de `plus haute − écart` à `plus basse` ; une main trop large n'a que la plus basse. Si elles
 * rencontrent les places d'avant, la main n'a pas bougé ; sinon elle va à la plus proche.
 */
function fenetre(hauteurs: number[], ecart: number, avant: Fenetre): { apres: Fenetre; deplacement: number } {
  if (hauteurs.length === 0) return { apres: avant, deplacement: 0 };
  const min = Math.min(...hauteurs), max = Math.max(...hauteurs);
  const voulues: [number, number] = [Math.min(max - ecart, min), min];
  if (avant === null) return { apres: voulues, deplacement: 0 };
  const bas = Math.max(avant[0], voulues[0]), haut = Math.min(avant[1], voulues[1]);
  if (bas <= haut) return { apres: [bas, haut], deplacement: 0 };
  return voulues[1] < avant[0]
    ? { apres: [voulues[1], voulues[1]], deplacement: avant[0] - voulues[1] }
    : { apres: [voulues[0], voulues[0]], deplacement: voulues[0] - avant[1] };
}

/** Le registre : la distance d'une note au point, quand elle est du mauvais côté pour sa main. */
const registre = (midi: number, main: Main, point: number) =>
  main === "droite" ? Math.max(0, point - midi) : Math.max(0, midi - point + 1);

/** Un changement de main dans une ligne : la dernière attaque de la voix, une note seule, à moins d'un écart, dans l'autre main. */
const change = (midi: number, main: Main, avant: Attaque | undefined, ecart: number) =>
  avant?.length === 1 && Math.abs(avant[0].midi - midi) <= ecart && avant[0].main !== main;

/** La main de chaque note, les accords trop larges et les notes hors du clavier. */
export function partager(notes: readonly NoteDeVoix[], r: ReglagesMains): Partage {
  const horsClavier = notes.filter((n) => n.midi < CLAVIER[0] || n.midi > CLAVIER[1]).map((n) => ({ nom: n.nom, mesure: n.mesure }));
  const coupes = tranches(notes);
  let etats: Etat[] = [{ mains: new Map(), droite: null, gauche: null, voix: new Map(), depasse: 0, reste: 0, ici: 0, precedent: null }];

  for (const t of coupes) {
    const neuves = [...t.neuves].sort((a, b) => notes[a].midi - notes[b].midi || a - b);
    const tenues = t.sonnent.filter((i) => !t.neuves.includes(i));
    // Le seuil du point fixe, puis les autres du plus proche au plus lointain : à coût égal, l'ordre décide.
    const fixe = neuves.filter((i) => notes[i].midi < r.point).length;
    const seuils = r.partage === "fixe" ? [fixe]
      : Array.from({ length: neuves.length + 1 }, (_, k) => k).sort((a, b) => Math.abs(a - fixe) - Math.abs(b - fixe) || a - b);
    const suivants = new Map<string, Etat>();
    for (const e of etats) {
      for (const k of seuils) {
        const mains = new Map<number, Main>();
        tenues.forEach((i) => mains.set(i, e.mains.get(i)!));
        neuves.forEach((i, rang) => mains.set(i, rang < k ? "gauche" : "droite"));
        const de = (main: Main) => [...mains].filter(([, m]) => m === main).map(([i]) => notes[i].midi);
        const ici = depassement(de("droite"), r.ecart) + depassement(de("gauche"), r.ecart);
        const d = fenetre(de("droite"), r.ecart, e.droite);
        const g = fenetre(de("gauche"), r.ecart, e.gauche);
        let reste = e.reste + d.deplacement + g.deplacement;
        const attaques = new Map<string, Attaque>();
        for (const i of neuves) {
          const main = mains.get(i)!, { midi, voix } = notes[i];
          reste += registre(midi, main, r.point);
          if (!attaques.has(voix)) attaques.set(voix, []);
          attaques.get(voix)!.push({ midi, main });
        }
        for (const [v, a] of attaques) if (a.length === 1 && change(a[0].midi, a[0].main, e.voix.get(v), r.ecart)) reste += CHANGEMENT;
        const voix = new Map([...e.voix, ...attaques]);
        const suivant: Etat = { mains, droite: d.apres, gauche: g.apres, voix, depasse: e.depasse + ici, reste, ici, precedent: e };
        const cle = [
          [...mains].map(([i, m]) => `${i}${m[0]}`).join(","), d.apres?.join(":"), g.apres?.join(":"),
          [...voix].map(([v, a]) => `${v}=${a.map((x) => `${x.midi}${x.main[0]}`).join(".")}`).join(","),
        ].join("|");
        const ancien = suivants.get(cle);
        if (!ancien || meilleur(suivant, ancien)) suivants.set(cle, suivant);
      }
    }
    etats = [...suivants.values()];
    if (etats.length > ETATS) etats = etats.sort(ordre).slice(0, ETATS);
  }

  let fin = etats[0];
  for (const e of etats) if (meilleur(e, fin)) fin = e;
  const mains = new Map<string, Main>();
  const larges: Large[] = [];
  const chemin: Etat[] = [];
  for (let e: Etat | null = fin; e && e.precedent; e = e.precedent) chemin.unshift(e);
  chemin.forEach((e, rang) => {
    const t = coupes[rang];
    for (const [i, m] of e.mains) for (const id of notes[i].ids) if (!mains.has(id)) mains.set(id, m);
    if (e.ici > 0) larges.push({ notes: t.sonnent.map((i) => notes[i].nom), mesure: notes[t.neuves[0]].mesure });
  });
  return { mains, larges, horsClavier };
}
