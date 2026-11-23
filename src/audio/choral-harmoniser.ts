// audio/choral-harmoniser.ts — Harmoniser un soprano à quatre voix par des règles écrites.
//
// LE CHEMIN : une colonne par pas de la grille où le soprano sonne ; pour chacune, les dispositions
// qui tiennent les règles d'une colonne seule (`choral-candidats.ts`) ; une énergie sur chaque colonne
// et sur chaque passage (`choral-energie.ts`) ; la meilleure suite, ou une suite tirée, par la chaîne
// exacte (`choral-chaine.ts`).
//
// LE SOPRANO RESSORT TEL QU'IL EST REÇU : ses notes ne sont pas reposées sur la grille. Une note du
// soprano plus courte qu'un pas, une croche sous un pas de noire, n'a pas sa colonne : elle passe
// sur l'accord du pas où elle tombe, comme une note de passage.
//
// LES VOIX ÉCRITES TIENNENT LEURS NOTES RÉPÉTÉES : deux colonnes voisines où l'alto garde sa hauteur
// font une seule note tenue. Un soupir du soprano fait taire les trois autres voix.

import type { Note } from "./note";
import type { Sequence } from "./sequence";
import { Respiration } from "../core/respirer";
import { creerAleatoire } from "../core/hasard";
import type { Mode } from "./choral-regles";
import { accordsPossibles, dispositions, type AccordCandidat, type Septiemes } from "./choral-candidats";
import { energieColonne, energiePassage, type ColonneChoisie } from "./choral-energie";
import { meilleureSuite, suiteTiree } from "./choral-chaine";
import { appliquerModele, rangsDuFaisceau } from "./choral-modele";
import type { ModeleHarmonique } from "./modele-harmonique";

export interface OptionsHarmonisation {
  tonique: number;
  mode: Mode;
  /** La durée d'un pas, en noires : 1 ou 0,5. */
  pas: number;
  septiemes: Septiemes;
  renversements: boolean;
  temperature: number;
  graine: number;
  /** Un modèle appris, sa part et son faisceau. Sa grille l'emporte sur `pas`. */
  modele?: { modele: ModeleHarmonique; partDesRegles: number; faisceau: number };
}

export interface HarmonisationRendue {
  notes: Note[];
  /** L'accord de chaque colonne, dans l'ordre du temps. */
  accords: { debut: number; accord: AccordCandidat }[];
  energie: number;
  colonnes: number;
  /** Les colonnes qui n'ont trouvé aucun accord de la tonalité et ont pris un repli. */
  replis: number;
}

export interface RefusHarmonisation {
  /** Les notes du soprano qu'aucune disposition ne peut porter, avec leur instant. */
  sansDisposition: { note: number; debut: number }[];
}

export const estRefusHarmonisation = (r: HarmonisationRendue | RefusHarmonisation): r is RefusHarmonisation => "sansDisposition" in r;

/** Harmonise la voix 0 de `seq`, la seule lue : les autres voix reçues sont ignorées. */
export async function harmoniserChoral(seq: Sequence, o: OptionsHarmonisation): Promise<HarmonisationRendue | RefusHarmonisation> {
  const tempo = seq.tempo && seq.tempo > 0 ? seq.tempo : 120;
  // LA GRILLE D'UN MODÈLE BRANCHÉ L'EMPORTE : il n'a appris des passages que d'un pas à l'autre.
  const pas = (60 / tempo) * (o.modele ? o.modele.modele.pas : o.pas);
  const modele = o.modele ? appliquerModele(o.modele.modele, o.tonique) : null;
  const regles = o.modele ? Math.max(0, Math.min(1, o.modele.partDesRegles)) : 1;
  const melange = (r: number, m: () => number) => (modele ? regles * r + (1 - regles) * m() : r);
  const soprano = seq.notes.filter((n) => (n.voix ?? 0) === 0).sort((a, b) => a.debut - b.debut);
  const fin = Math.max(0, ...soprano.map((n) => n.fin));
  const instants: { debut: number; note: number }[] = [];
  for (let k = 0; k * pas < fin - 1e-9; k++) {
    const t = k * pas;
    const n = soprano.find((x) => x.debut <= t + 1e-9 && x.fin > t + 1e-9);
    if (n) instants.push({ debut: t, note: Math.round(n.note) });
  }
  // LES CANDIDATS ET LEUR COÛT SE CONSTRUISENT EN RENDANT LA MAIN, une colonne à la fois : sur 190
  // colonnes, septièmes partout, leur construction d'un seul tenant tenait le fil 114 ms avant même
  // que la chaîne ne commence, et le coût de toutes les colonnes se calculait ensuite d'un bloc.
  const ctx = { tonique: o.tonique, mode: o.mode };
  const n = instants.length;
  const rang = (k: number) => (k === n - 1 ? "derniere" : k === n - 2 ? "avant-derniere" : "autre");
  const souffle = new Respiration();
  const colonnes: ColonneChoisie[][] = [];
  const couts: number[][] = [];
  for (const [k, { note }] of instants.entries()) {
    const tous = accordsPossibles(note, o.tonique, o.mode, o.septiemes).flatMap((accord) =>
      dispositions(accord, note, o.renversements).map((voix) => ({ accord, voix })));
    const coutsTous = tous.map((c) => melange(energieColonne(c, ctx, rang(k)), () => modele!.colonne(c.voix)));
    // LE FAISCEAU NE GARDE QUE LES COLONNES DE MOINDRE COÛT, avant la chaîne ; à zéro, toutes.
    const gardes = rangsDuFaisceau(coutsTous, o.modele?.faisceau ?? 0);
    colonnes.push(gardes.map((i) => tous[i]));
    couts.push(gardes.map((i) => coutsTous[i]));
    await souffle.tour();
  }
  const vides = instants.filter((_, k) => colonnes[k].length === 0);
  if (vides.length > 0) return { sansDisposition: vides.map((v) => ({ note: v.note, debut: v.debut })) };

  // Deux colonnes séparées par un soupir ne se jugent pas l'une après l'autre.
  const contigues = instants.map((x, k) => k > 0 && Math.abs(x.debut - instants[k - 1].debut - pas) < 1e-9);
  const chaine = {
    colonnes: couts,
    passage: (t: number, i: number, j: number) => (contigues[t + 1]
      ? melange(energiePassage(colonnes[t][i], colonnes[t + 1][j], ctx), () => modele!.passage(colonnes[t][i].voix, colonnes[t + 1][j].voix))
      : 0),
  };
  const suite = o.temperature > 0
    ? await suiteTiree(chaine, o.temperature, creerAleatoire(o.graine), souffle)
    : await meilleureSuite(chaine, souffle);
  const choisies = suite.choix.map((c, k) => colonnes[k][c]);

  const notes: Note[] = soprano.map((s) => ({ ...s, voix: 0 }));
  for (let v = 1; v < 4; v++) {
    let ouverte: Note | null = null;
    choisies.forEach((c, k) => {
      const debut = instants[k].debut;
      const h = c.voix[v];
      if (ouverte && contigues[k] && ouverte.note === h) { ouverte.fin = debut + pas; return; }
      ouverte = { note: h, velocite: soprano.find((s) => s.debut <= debut + 1e-9 && s.fin > debut + 1e-9)?.velocite ?? 80, debut, fin: debut + pas, voix: v };
      notes.push(ouverte);
    });
  }
  notes.sort((a, b) => a.debut - b.debut || (a.voix ?? 0) - (b.voix ?? 0));
  return {
    notes,
    accords: choisies.map((c, k) => ({ debut: instants[k].debut, accord: c.accord })),
    energie: suite.energie,
    colonnes: n,
    replis: choisies.filter((c) => c.accord.repli).length,
  };
}
