// audio/conformite-clavier.ts — Un MIDI est-il jouable à deux mains sur un clavier ?
//
// La question se pose dès qu'on veut MONTRER un fichier MIDI sur un clavier de quatre-vingt-huit
// touches : un fichier d'orchestre, de batterie ou de synthèse ne s'y montre pas, ou s'y montre
// en mentant. Elle se scinde en deux, et tout ce module tient dans cette distinction.
//
// CE QUI SE DÉCIDE. Quatre choses sont des oui ou des non, sans arbitraire :
//   — une note hors des 88 touches ne peut pas être affichée, encore moins jouée ;
//   — le canal 10 du MIDI (indice 9) porte des INSTRUMENTS de percussion et non des hauteurs :
//     les poser sur un clavier serait un mensonge ;
//   — plus de dix notes ensemble, c'est plus de dix doigts ;
//   — et surtout : un accord doit pouvoir se PARTAGER ENTRE DEUX MAINS. C'est le vrai test, et
//     il se calcule — voir `partitionDeuxMains`.
//
// CE QUI NE SE DÉCIDE PAS. La vitesse, l'ampleur des sauts, les notes tenues sous d'autres : un
// verdict y serait malhonnête, parce que la frontière entre le difficile et l'impossible dépend
// de qui joue. Ce module rend donc des CHIFFRES pour ces trois-là, et laisse juger.
//
// Ce partage est aussi ce qui guide l'usage : un nœud d'apprentissage ne doit pas refuser un
// fichier, il doit montrer ce qu'il peut et nommer ce qu'il ne peut pas.

/** Les bornes du clavier : la 0 à do 8, les 88 touches d'un piano. */
export const NOTE_GRAVE = 21;
export const NOTE_AIGUE = 108;

/** Le canal de percussion du MIDI — le dixième, donc l'indice 9. */
export const CANAL_PERCUSSION = 9;

/** Ce qu'il faut d'une note pour juger : sa hauteur, son temps, son canal. */
export interface NoteJouee {
  note: number;
  debut: number;
  fin: number;
  canal?: number;
  velociete?: number;
}

export type Main = "gauche" | "droite";

export interface ReglagesMain {
  /** Écart maximal d'une main, en demi-tons. Une octave par défaut ; une grande main fait 16. */
  ecartMax?: number;
  /** Doigts par main. */
  doigts?: number;
}

/**
 * Partage un accord entre deux mains, ou dit que c'est impossible.
 *
 * L'algorithme est exhaustif et c'est ce qui le rend sûr : deux mains jouant un accord ne
 * s'entrecroisent pas — la gauche prend les graves, la droite les aigus —, il n'y a donc que
 * n + 1 partages possibles, et on les essaie tous. Chaque côté doit tenir dans les doigts d'une
 * main et dans son écart. Le partage retenu est le plus ÉQUILIBRÉ des valides, parce que c'est
 * celui qu'un pianiste choisit quand rien ne l'oblige.
 *
 * Rend `null` quand aucun partage ne passe : là, ce n'est pas difficile, c'est impossible.
 */
export function partitionDeuxMains(
  hauteurs: number[], r: ReglagesMain = {},
): { gauche: number[]; droite: number[] } | null {
  const ecartMax = r.ecartMax ?? 12;
  const doigts = r.doigts ?? 5;
  const notes = [...new Set(hauteurs)].sort((a, b) => a - b);
  if (notes.length === 0) return { gauche: [], droite: [] };
  if (notes.length > doigts * 2) return null;

  const tient = (m: number[]) => m.length <= doigts && (m.length < 2 || m[m.length - 1] - m[0] <= ecartMax);
  let meilleur: { gauche: number[]; droite: number[] } | null = null;
  let meilleurEcart = Infinity;
  for (let k = 0; k <= notes.length; k++) {
    const gauche = notes.slice(0, k), droite = notes.slice(k);
    if (!tient(gauche) || !tient(droite)) continue;
    const desequilibre = Math.abs(gauche.length - droite.length);
    if (desequilibre < meilleurEcart) { meilleur = { gauche, droite }; meilleurEcart = desequilibre; }
  }
  return meilleur;
}

/** Les notes qui sonnent à un instant donné. */
function notesALInstant(notes: NoteJouee[], t: number): NoteJouee[] {
  return notes.filter((n) => n.debut <= t && t < n.fin);
}

export interface AccordInjouable {
  instant: number;
  hauteurs: number[];
}

export interface CanalVu {
  canal: number;
  notes: number;
  percussion: boolean;
  grave: number;
  aigu: number;
}

export interface Conformite {
  /** Nombre de notes examinées, après filtrage éventuel par canal. */
  total: number;
  duree: number;
  canaux: CanalVu[];
  /** Ce qui est décidé — les empêchements. */
  horsClavier: { graves: number; aigues: number; exemples: number[] };
  percussion: number;
  polyphonieMax: number;
  instantPolyphonie: number;
  injouables: AccordInjouable[];
  /** Ce qui est mesuré — à juger. */
  notesParSeconde: number;
  /** Plus court intervalle entre deux attaques d'une MÊME main, en secondes. */
  intervalleMinMain: number | null;
  /** Le plus grand saut d'une main, et le temps qu'elle a pour le faire. */
  sautMax: { demiTons: number; secondes: number; instant: number } | null;
  /** Notes tenues pendant qu'une autre note de la même main va et vient : pédale ou substitution. */
  tenues: number;
  /** Aucun empêchement : le fichier se joue tel quel. */
  jouable: boolean;
}

export interface OptionsConformite extends ReglagesMain {
  /** Ne garder qu'un canal. `undefined` = tous. */
  canal?: number;
  /** Nombre maximal d'accords injouables rapportés. */
  maxInjouables?: number;
}

/**
 * Le relevé complet.
 *
 * Les instants examinés sont les ATTAQUES : la polyphonie ne peut croître qu'à une attaque, et
 * un accord injouable comporte forcément une attaque. Examiner un pas de temps régulier
 * coûterait plus cher et ne trouverait rien de plus.
 */
export function analyserConformiteClavier(
  toutes: NoteJouee[], o: OptionsConformite = {},
): Conformite {
  const ecartMax = o.ecartMax ?? 12;
  const doigts = o.doigts ?? 5;
  const maxInjouables = o.maxInjouables ?? 8;

  const canaux: CanalVu[] = [];
  for (const n of toutes) {
    const c = n.canal ?? 0;
    let vu = canaux.find((x) => x.canal === c);
    if (!vu) { vu = { canal: c, notes: 0, percussion: c === CANAL_PERCUSSION, grave: n.note, aigu: n.note }; canaux.push(vu); }
    vu.notes++;
    vu.grave = Math.min(vu.grave, n.note);
    vu.aigu = Math.max(vu.aigu, n.note);
  }
  canaux.sort((a, b) => b.notes - a.notes || a.canal - b.canal);

  const notes = (o.canal === undefined ? toutes : toutes.filter((n) => (n.canal ?? 0) === o.canal))
    .slice()
    .sort((a, b) => a.debut - b.debut || a.note - b.note);
  const percussion = notes.filter((n) => (n.canal ?? 0) === CANAL_PERCUSSION).length;
  const graves = notes.filter((n) => n.note < NOTE_GRAVE);
  const aigues = notes.filter((n) => n.note > NOTE_AIGUE);
  const duree = notes.reduce((m, n) => Math.max(m, n.fin), 0);

  // Polyphonie et jouabilité, aux instants d'attaque.
  let polyphonieMax = 0, instantPolyphonie = 0;
  const injouables: AccordInjouable[] = [];
  const instants = [...new Set(notes.map((n) => n.debut))].sort((a, b) => a - b);
  for (const t of instants) {
    const ensemble = notesALInstant(notes, t);
    if (ensemble.length > polyphonieMax) { polyphonieMax = ensemble.length; instantPolyphonie = t; }
    const hauteurs = [...new Set(ensemble.map((n) => n.note))];
    if (hauteurs.length > 1 && !partitionDeuxMains(hauteurs, { ecartMax, doigts })
      && injouables.length < maxInjouables) {
      injouables.push({ instant: t, hauteurs: hauteurs.sort((a, b) => a - b) });
    }
  }

  // Ce qui se mesure : il faut d'abord savoir quelle main joue quoi.
  const mains = assignerMains(notes, { ecartMax, doigts });
  let intervalleMinMain: number | null = null;
  let sautMax: Conformite["sautMax"] = null;
  for (const main of ["gauche", "droite"] as Main[]) {
    const suite = notes.filter((_, i) => mains[i] === main);
    for (let i = 1; i < suite.length; i++) {
      const dt = suite[i].debut - suite[i - 1].debut;
      if (dt > 1e-6) {
        if (intervalleMinMain === null || dt < intervalleMinMain) intervalleMinMain = dt;
        const saut = Math.abs(suite[i].note - suite[i - 1].note);
        // Le pire saut n'est pas le plus grand : c'est le plus grand rapporté au temps donné.
        if (!sautMax || saut / dt > sautMax.demiTons / sautMax.secondes) {
          sautMax = { demiTons: saut, secondes: dt, instant: suite[i].debut };
        }
      }
    }
  }

  // Une note tenue pendant qu'une autre de la même main s'attaque ET se relâche : la main ne
  // peut pas être aux deux endroits, il faut la pédale ou un changement de doigt.
  let tenues = 0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const sous = notes.filter((m, j) => mains[j] === mains[i] && m !== n
      && m.debut > n.debut && m.fin <= n.fin);
    if (sous.length >= 2) tenues++;
  }

  return {
    total: notes.length,
    duree,
    canaux,
    horsClavier: {
      graves: graves.length,
      aigues: aigues.length,
      exemples: [...graves, ...aigues].slice(0, 6).map((n) => n.note),
    },
    percussion,
    polyphonieMax,
    instantPolyphonie,
    injouables,
    notesParSeconde: duree > 0 ? notes.length / duree : 0,
    intervalleMinMain,
    sautMax,
    tenues,
    jouable: graves.length === 0 && aigues.length === 0 && percussion === 0
      && polyphonieMax <= doigts * 2 && injouables.length === 0,
  };
}

/**
 * Quelle main joue quoi, note par note.
 *
 * Sert à colorer le clavier — c'est ce qui aide vraiment à apprendre —, et à mesurer vitesse et
 * sauts par main plutôt que sur le flux entier, où deux mains alternées donneraient des chiffres
 * deux fois trop rapides.
 *
 * La règle est celle d'un pianiste qui déchiffre : l'accord se partage par `partitionDeuxMains`,
 * et une note seule va à la main dont la DERNIÈRE POSITION est la plus proche — à égalité, la
 * gauche prend les graves. Ce n'est pas un doigté, et cela ne prétend pas l'être : c'est une
 * attribution stable, qui suffit à voir la musique se séparer en deux.
 */
export function assignerMains(notes: NoteJouee[], r: ReglagesMain = {}): Main[] {
  const mains: Main[] = new Array(notes.length).fill("droite");
  let derniereGauche: number | null = null, derniereDroite: number | null = null;
  const parInstant = new Map<number, number[]>();
  notes.forEach((n, i) => {
    const l = parInstant.get(n.debut) ?? [];
    l.push(i);
    parInstant.set(n.debut, l);
  });
  for (const t of [...parInstant.keys()].sort((a, b) => a - b)) {
    const indices = parInstant.get(t)!;
    if (indices.length > 1) {
      const hauteurs = indices.map((i) => notes[i].note);
      const part = partitionDeuxMains(hauteurs, r);
      if (part) {
        for (const i of indices) mains[i] = part.gauche.includes(notes[i].note) ? "gauche" : "droite";
        if (part.gauche.length) derniereGauche = part.gauche[part.gauche.length - 1];
        if (part.droite.length) derniereDroite = part.droite[0];
        continue;
      }
      // Accord injouable : on coupe au milieu, faute de mieux, pour rester lisible.
      const triees = [...hauteurs].sort((a, b) => a - b);
      const milieu = triees[Math.floor(triees.length / 2)];
      for (const i of indices) mains[i] = notes[i].note < milieu ? "gauche" : "droite";
      continue;
    }
    const i = indices[0], h = notes[i].note;
    // Une main qui n'a pas encore joué est AU REPOS, au do 4, et non à l'infini : la compter
    // infiniment loin la rendait inéligible pour toujours, et deux mains alternées finissaient
    // toutes deux à gauche — trouvé par le test qui mesure la vitesse par main.
    const dg = Math.abs(h - (derniereGauche ?? 60));
    const dd = Math.abs(h - (derniereDroite ?? 60));
    // À égalité, les graves vont à la gauche, comme sur une partition.
    const main: Main = dg === dd ? (h < 60 ? "gauche" : "droite") : dg < dd ? "gauche" : "droite";
    mains[i] = main;
    if (main === "gauche") derniereGauche = h; else derniereDroite = h;
  }
  return mains;
}

// ── Adapter, quand on le demande explicitement ───────────────────────────────────

export interface OptionsAdaptation extends ReglagesMain {
  /** Replier par octaves les notes hors des 88 touches. */
  replier?: boolean;
  /** Retirer les notes de percussion. */
  sansPercussion?: boolean;
  /** Ne garder que ce canal. */
  canal?: number;
  /** Ramener la polyphonie à ce nombre de notes, en gardant les extrêmes. */
  polyphonieMax?: number;
}

/**
 * Rend un flux jouable, et le dit.
 *
 * Cette fonction existe SÉPARÉMENT de l'analyse, et le nœud ne l'appelle que si l'utilisateur
 * la demande : une adaptation silencieuse mentirait sur la musique, alors qu'une adaptation
 * demandée est un choix. Le repliement par octaves est le seul qui préserve la classe de
 * hauteur — donc l'harmonie — au prix du registre.
 */
export function adapterAuClavier(
  notes: NoteJouee[], o: OptionsAdaptation = {},
): { notes: NoteJouee[]; repliees: number; retirees: number } {
  let repliees = 0, retirees = 0;
  let sortie = notes.slice();

  if (o.canal !== undefined) {
    const avant = sortie.length;
    sortie = sortie.filter((n) => (n.canal ?? 0) === o.canal);
    retirees += avant - sortie.length;
  }
  if (o.sansPercussion) {
    const avant = sortie.length;
    sortie = sortie.filter((n) => (n.canal ?? 0) !== CANAL_PERCUSSION);
    retirees += avant - sortie.length;
  }
  if (o.replier) {
    sortie = sortie.map((n) => {
      let h = n.note;
      while (h < NOTE_GRAVE) h += 12;
      while (h > NOTE_AIGUE) h -= 12;
      if (h !== n.note) repliees++;
      return h === n.note ? n : { ...n, note: h };
    });
  } else {
    const avant = sortie.length;
    sortie = sortie.filter((n) => n.note >= NOTE_GRAVE && n.note <= NOTE_AIGUE);
    retirees += avant - sortie.length;
  }
  if (o.polyphonieMax !== undefined) {
    const max = Math.max(1, o.polyphonieMax);
    const parInstant = new Map<number, NoteJouee[]>();
    for (const n of sortie) {
      const l = parInstant.get(n.debut) ?? [];
      l.push(n);
      parInstant.set(n.debut, l);
    }
    const garde = new Set<NoteJouee>();
    for (const l of parInstant.values()) {
      if (l.length <= max) { for (const n of l) garde.add(n); continue; }
      // On garde les extrêmes — la basse et le chant —, puis on complète vers le centre :
      // c'est ce qu'un arrangeur garde quand il doit réduire.
      const triees = [...l].sort((a, b) => a.note - b.note);
      const choisies: NoteJouee[] = [];
      let g = 0, d = triees.length - 1;
      while (choisies.length < max && g <= d) {
        choisies.push(triees[g++]);
        if (choisies.length < max && g <= d) choisies.push(triees[d--]);
      }
      for (const n of choisies) garde.add(n);
      retirees += l.length - choisies.length;
    }
    sortie = sortie.filter((n) => garde.has(n));
  }
  return { notes: sortie, repliees, retirees };
}

// ── Le rapport, en mots ──────────────────────────────────────────────────────────

const MOTS = {
  fr: {
    jouable: "Conforme : ce fichier se joue tel quel à deux mains.",
    rien: "Aucune note à examiner.",
    notes: "notes", secondes: "s", canal: "canal", percussion: "percussion",
    empechements: "Empêchements", mesures: "Mesures",
    horsClavier: "hors des 88 touches",
    dontGraves: "sous le la 0", dontAigues: "au-dessus du do 8",
    percussionNotes: "notes de percussion (canal 10) : ce sont des instruments, pas des hauteurs",
    polyphonie: "notes ensemble au plus, à",
    injouables: "accord(s) qu'aucune paire de mains ne peut tenir, le premier à",
    debit: "notes par seconde en moyenne",
    intervalle: "plus court intervalle entre deux attaques d'une même main",
    saut: "plus grand saut d'une main :",
    demiTons: "demi-tons en",
    tenues: "note(s) tenue(s) sous d'autres : pédale ou changement de doigt",
    canauxTitre: "Canaux",
  },
  en: {
    jouable: "Conformant: this file can be played as is with two hands.",
    rien: "No note to examine.",
    notes: "notes", secondes: "s", canal: "channel", percussion: "percussion",
    empechements: "Impossibilities", mesures: "Measurements",
    horsClavier: "outside the 88 keys",
    dontGraves: "below A0", dontAigues: "above C8",
    percussionNotes: "percussion notes (channel 10): these are instruments, not pitches",
    polyphonie: "notes at once at most, at",
    injouables: "chord(s) no pair of hands can hold, the first at",
    debit: "notes per second on average",
    intervalle: "shortest gap between two attacks of the same hand",
    saut: "largest jump of one hand:",
    demiTons: "semitones in",
    tenues: "note(s) held under others: pedal or finger substitution",
    canauxTitre: "Channels",
  },
} as const;

/** Le rapport lisible, dans la langue demandée. Les empêchements d'abord, les mesures ensuite. */
export function resumeConformite(c: Conformite, langue: "fr" | "en" = "fr"): string {
  const m = MOTS[langue];
  if (c.total === 0) return m.rien;
  const l: string[] = [];

  l.push(`${c.total} ${m.notes} · ${c.duree.toFixed(2)} ${m.secondes}`);
  if (c.canaux.length > 1) {
    l.push(`${m.canauxTitre} : ${c.canaux.map((x) =>
      `${x.canal + 1} (${x.notes}${x.percussion ? `, ${m.percussion}` : ""})`).join(" · ")}`);
  }

  const empechements: string[] = [];
  const hc = c.horsClavier.graves + c.horsClavier.aigues;
  if (hc > 0) {
    empechements.push(`${hc} ${m.notes} ${m.horsClavier}`
      + ` (${c.horsClavier.graves} ${m.dontGraves}, ${c.horsClavier.aigues} ${m.dontAigues})`);
  }
  if (c.percussion > 0) empechements.push(`${c.percussion} ${m.percussionNotes}`);
  if (c.polyphonieMax > 10) {
    empechements.push(`${c.polyphonieMax} ${m.polyphonie} ${c.instantPolyphonie.toFixed(2)} ${m.secondes}`);
  }
  if (c.injouables.length > 0) {
    empechements.push(`${c.injouables.length} ${m.injouables} ${c.injouables[0].instant.toFixed(2)} ${m.secondes}`
      + ` (${c.injouables[0].hauteurs.join(", ")})`);
  }
  if (empechements.length > 0) l.push("", `${m.empechements} :`, ...empechements.map((e) => `- ${e}`));
  else l.push("", m.jouable);

  const mesures: string[] = [`${c.notesParSeconde.toFixed(1)} ${m.debit}`];
  if (c.intervalleMinMain !== null) {
    mesures.push(`${(c.intervalleMinMain * 1000).toFixed(0)} ms ${m.intervalle}`);
  }
  if (c.sautMax) {
    mesures.push(`${m.saut} ${c.sautMax.demiTons} ${m.demiTons} ${(c.sautMax.secondes * 1000).toFixed(0)} ms`);
  }
  if (c.tenues > 0) mesures.push(`${c.tenues} ${m.tenues}`);
  l.push("", `${m.mesures} :`, ...mesures.map((x) => `- ${x}`));

  return l.join("\n");
}
