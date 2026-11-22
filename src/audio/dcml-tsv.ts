// audio/dcml-tsv.ts — Une table de notes du DCML lue en séquence à voix.
//
// D'OÙ VIENT CE FORMAT. Le Digital and Cognitive Musicology Lab (EPFL) publie ses corpus en
// partitions MuseScore et, à côté, en tables : une ligne par note, extraite par la bibliothèque
// `ms3` (Hentschel, Rammos, Neuwirth, Rohrmeier). Le corpus des chorals de Bach (`DCMLab/
// bach_chorales`, v2.0, CC0) en porte une par choral, `notes/<nom>.notes.tsv`.
//
// CE QUI EST LU, PAR NOM DE COLONNE ET JAMAIS PAR RANG. Relevé sur les 361 tables du corpus :
// l'ordre des colonnes n'est pas le même partout, et une lecture par rang trouvait « 3/2 » dans la
// colonne des liaisons de cinquante et une notes. Sont lus :
//   · `quarterbeats_all_endings`, l'attaque en noires depuis le début, toutes fins de reprise
//     comprises ; à défaut, `quarterbeats` ;
//   · `duration_qb`, la durée en noires ;
//   · `staff` et `voice`, la portée et la voix dans la portée, qui font ensemble une voix ;
//   · `midi`, la hauteur ;
//   · `tied` : 1 ouvre une liaison, 0 la continue, -1 la ferme.
// Les nombres peuvent s'écrire en fraction (« 3/2 ») : c'est la forme de `ms3`.
//
// LES REPRISES NE SONT PAS DÉPLIÉES : la table suit la partition telle qu'elle est écrite, une
// mesure une fois. C'est aussi ce que fait la lecture des partitions (`audio/partition-lecture.ts`).
//
// LES VOIX SE NUMÉROTENT PAR PORTÉE PUIS PAR VOIX : sur un choral à deux portées, cela donne
// soprano, alto, ténor et basse, dans l'ordre où le corpus les écrit.

import type { Note } from "./note";
import type { InfoVoix, Sequence } from "./sequence";

/** Un nombre de `ms3` : entier, décimal ou fraction. NaN si la case est vide ou illisible. */
export function nombreMs3(texte: string | undefined): number {
  const t = (texte ?? "").trim();
  if (t === "") return Number.NaN;
  const f = /^(-?\d+)\/(\d+)$/.exec(t);
  if (f) return Number(f[1]) / Number(f[2]);
  return Number(t);
}

export interface TableDcmlLue {
  sequence: Sequence;
  /** Les lignes écartées, chacune avec son numéro (à partir de 2, l'en-tête étant la ligne 1) et sa raison. */
  refusees: { ligne: number; raison: string }[];
  /** Les notes jointes à la précédente par une liaison. */
  liees: number;
}

const COLONNES = ["staff", "voice", "midi", "duration_qb"] as const;

/**
 * Lit une table de notes du DCML.
 *
 * `tempo` RÈGLE LES SECONDES, la table ne comptant qu'en noires : une noire vaut 60 / tempo.
 */
export function lireTableDcml(texte: string, tempo = 100): TableDcmlLue {
  const lignes = texte.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const entete = (lignes[0] ?? "").split("\t");
  const rang = (nom: string) => entete.indexOf(nom);
  const manquantes = [...COLONNES].filter((c) => rang(c) < 0);
  if (rang("quarterbeats_all_endings") < 0 && rang("quarterbeats") < 0) manquantes.push("quarterbeats" as never);
  if (manquantes.length > 0) {
    return { sequence: { notes: [], tempo }, refusees: [{ ligne: 1, raison: `colonnes absentes : ${manquantes.join(", ")}` }], liees: 0 };
  }
  const noire = 60 / Math.max(1, tempo);
  const refusees: { ligne: number; raison: string }[] = [];
  const brutes: { cle: string; portee: number; voix: number; note: number; debut: number; fin: number; tied: number }[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const c = lignes[i].split("\t");
    const lire = (nom: string) => (rang(nom) >= 0 ? c[rang(nom)] : undefined);
    const attaque = Number.isFinite(nombreMs3(lire("quarterbeats_all_endings")))
      ? nombreMs3(lire("quarterbeats_all_endings")) : nombreMs3(lire("quarterbeats"));
    const duree = nombreMs3(lire("duration_qb"));
    const portee = nombreMs3(lire("staff"));
    const voix = nombreMs3(lire("voice"));
    const note = nombreMs3(lire("midi"));
    const tied = nombreMs3(lire("tied"));
    if (![attaque, duree, portee, voix, note].every(Number.isFinite) || duree <= 0) {
      refusees.push({ ligne: i + 1, raison: "attaque, durée, portée, voix ou hauteur illisible" });
      continue;
    }
    brutes.push({ cle: `${portee}/${voix}`, portee, voix, note, debut: attaque, fin: attaque + duree, tied: Number.isFinite(tied) ? tied : Number.NaN });
  }
  // Les voix, dans l'ordre des portées puis des voix.
  const cles = [...new Map(brutes.map((b) => [b.cle, b])).values()]
    .sort((a, b) => a.portee - b.portee || a.voix - b.voix).map((b) => b.cle);
  const numero = new Map(cles.map((c, i) => [c, i]));
  // Les liaisons : une note qui continue ou ferme une liaison prolonge la précédente de sa voix,
  // de même hauteur, qui s'arrêtait à son attaque.
  const notes: (Note & { cle: string })[] = [];
  let liees = 0;
  for (const b of [...brutes].sort((x, y) => x.debut - y.debut || x.portee - y.portee || x.voix - y.voix)) {
    if (b.tied === 0 || b.tied === -1) {
      const avant = [...notes].reverse().find((n) => n.cle === b.cle && n.note === b.note && Math.abs(n.fin - b.debut * noire) < 1e-9);
      if (avant) { avant.fin = b.fin * noire; liees++; continue; }
    }
    notes.push({ cle: b.cle, note: b.note, velocite: 80, debut: b.debut * noire, fin: b.fin * noire, voix: numero.get(b.cle)! });
  }
  const voix: InfoVoix[] = cles.map((c, i) => ({ numero: i, nom: `${c.replace("/", ".")}` }));
  const propres: Note[] = notes.map(({ cle: _cle, ...n }) => n);
  const fin = propres.reduce((m, n) => Math.max(m, n.fin), 0);
  return { sequence: { notes: propres, tempo, duree: fin, voix }, refusees, liees };
}
