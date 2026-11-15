// audio/croisement-reglages.ts — Croiser les réglages d'une fiche avec ses nomenclatures.
//
// POURQUOI CE MODULE EXISTE. L'« Octaves » de l'arpégiateur n'agissait plus dès qu'un « Motif » était
// choisi, et aucun garde ne pouvait le voir : tous font varier UN réglage à partir des défauts, et
// sous les défauts le motif valait « Droit ». Une inertie qui dépend de la valeur d'un autre réglage
// ne se voit qu'en faisant varier les deux. C'est le lot 1 de la passe de complétude des nœuds à
// nomenclature (plan du 2026-11-14).
//
// CE QU'IL MESURE, pour chaque réglage à nomenclature N d'une fiche :
//  1. une passe par valeur offerte de N : les valeurs qui rendent les mêmes sorties qu'une autre
//     sont des COÏNCIDENCES, et celle qui coïncide avec le défaut est un repli possible ;
//  2. sous chaque valeur v de N, chaque autre réglage S passe à ses valeurs d'essai : si aucune ne
//     change les sorties, S est INERTE sous v.
//
// SEULES LES SORTIES COMPTENT, et non le message : un réglage qui ne change que ce que le nœud dit de
// lui-même ne change rien de ce qu'il rend. Les sorties se comparent par `empreinteValeurs`, qui lit
// chaque échantillon et chaque octet.
//
// LES DURÉES SONT BORNÉES À HUIT SECONDES dans la passe, quatre mesures de 4/4 à 120 à la noire : un
// générateur de soixante secondes lancé des centaines de fois rendrait la passe inabordable. Elles
// l'étaient d'abord à une seconde, comme dans le garde de la traversée multicanale, et c'était trop
// court pour ce qui se déroule dans le temps : sur cinq fiches, le métronome y rendait 2/4 comme 7/4,
// le générateur musical « Rock » comme « Classique », et ces fausses coïncidences tombent toutes à
// huit secondes, le reste du relevé ne bougeant pas, pour une passe 3,6 fois plus longue (156 s
// contre 564). Une durée qu'on éprouve est bornée de même, à deux fois sa base (`essaisDe`).

import type { ParametreDef } from "../core/types";
import { valeurCanoniqueChoix } from "../i18n";
import { empreinteValeurs, entreesDEssai, lancerFiche, valeursDEssai, type FicheLancable, type Reglages } from "./lancer-fiche";
import { notesVersFichierMidi } from "./midi-ecriture";
import { BASES_PROPRES } from "./croisement-bases";
import { DEUX_NOTES, ENTREES_PROPRES, notesDesAccords, sonSecond } from "./croisement-entrees";

/**
 * Des entrées assez riches pour qu'un réglage puisse agir : des accords dans le MIDI, des accords
 * chiffrés dans l'ABC.
 *
 * LES VALEURS D'ESSAI COMMUNES SONT UNE LIGNE MÉLODIQUE, et la première passe l'a montré sur cinq
 * fiches : l'arpégiateur y paraissait sans direction, n'ayant reçu aucun accord, et « Reprise ABC »
 * refusait ses cinquante-neuf lancers faute d'accords chiffrés. Une inertie mesurée sur une entrée
 * qui ne peut pas la faire voir n'en est pas une. Les autres ports gardent `entreesDEssai`.
 */
export function entreesRiches(fiche: FicheLancable, o: { facultatifs?: boolean } = {}): unknown[] {
  const communes = entreesDEssai(fiche);
  const reglages = new Set(fiche.parametres.map((p) => p.nom));
  const propres = ENTREES_PROPRES[fiche.id] ?? {};
  let audios = 0;
  return (fiche.entrees ?? []).map((p, i) => {
    const nom = p.nom ?? "";
    if (nom in propres) return propres[nom].valeur();
    // UN PORT QUI PORTE LE NOM D'UN RÉGLAGE LE REMPLACE quand il est branché : la « Tonalité » de la
    // progression tonale, l'« Accords » de la grille. La passe éprouve les réglages ; ce port reste
    // donc débranché, sans quoi le réglage paraîtrait inerte sous chaque valeur, ou ses valeurs
    // coïncideraient toutes. La première passe l'a montré sur quatre fiches, refusées à chaque lancer.
    if (reglages.has(nom)) return undefined;
    // UN PORT FACULTATIF BRANCHÉ PREND LA MAIN SUR DES RÉGLAGES, pour la même raison : la pulsation
    // reçue du cercle pulsant dicte sa durée et ses instants. La passe éprouve le nœud seul.
    // MAIS UN NŒUD DONT TOUS LES PORTS SONT FACULTATIFS NE REND RIEN SEUL : la deuxième passe a rendu
    // vides le montage, le comparateur A/B, les voicings, MusicXML et cinq autres, à chaque lancer.
    // `facultatifs` branche alors ses ports de matière ; une modulation, jamais (`courbe`, `controle`).
    const modulation = p.type === "courbe" || p.type === "controle";
    if (p.requis === false && (!o.facultatifs || modulation)) return undefined;
    // DEUX PORTS AUDIO QUI REÇOIVENT LE MÊME SON NE COMPARENT RIEN : l'appariement à une référence,
    // le recalage de niveau, le morphing, le transfert d'enveloppe et le comparateur A/B mesuraient
    // le son d'essai contre lui-même à la deuxième passe. Chaque port audio après le premier reçoit
    // donc `sonSecond`.
    if (p.type === "audio") return audios++ === 0 ? communes[i] : sonSecond();
    if (p.type === "cercle") return CERCLE_D_ESSAI;
    if (p.type === "midi") return notesVersFichierMidi([...notesDesAccords(), ...DEUX_NOTES], 120, 0);
    if (p.type === "texte" && p.sousType === "abc") {
      return `X:1\nT:Essai\nM:4/4\nL:1/8\nQ:1/4=120\nK:G\n"G"GABG DGBG|"C"cBcd "G"efge|"D"dcBA GFGA|"G"BGAF "D"G4|]`;
    }
    return communes[i];
  });
}

/**
 * Un cercle de percussion, la grille de huit d'un tresillo.
 *
 * `valeurs-essai.ts` ne fabrique aucun cercle, l'y croyant jamais attendu en entrée : les
 * transformations de cercle en attendent un, et le complémentaire refusait ses treize lancers.
 */
const CERCLE_D_ESSAI = {
  positions: 8, sorte: "percussion",
  sommets: [{ position: 0, valeur: 36 }, { position: 3, valeur: 38 }, { position: 6, valeur: 36 }],
};

/**
 * Les valeurs d'essai d'un réglage, une durée bornée à deux fois sa base.
 *
 * LE MÉTRONOME A PRIS UNE HEURE CINQUANTE À LA PREMIÈRE PASSE, sur 3 h 28 en tout : sa « Durée »
 * s'éprouvait à soixante secondes sous chacune des trente métriques. Une durée qui agit se voit
 * aussi bien entre sa base et le double.
 *
 * DEUX AUTRES PIÈGES, relevés au lot 3d-2. UN TOUR COMPLET N'A QU'UNE DIRECTION À SES DEUX BORNES :
 * −180° et 180° sont le même azimut, et le spatialiseur en stéréo rendait les deux au centre comme
 * son défaut, 0° ; la borne basse cède sa place. UNE BASE PROPRE N'EST PAS UNE VALEUR D'ESSAI :
 * `valeursDEssai` n'écarte que le défaut déclaré, et un réglage que `BASES_PROPRES` déplace se serait
 * essayé à sa propre base, et aurait paru inerte ; son défaut déclaré devient sa dernière valeur
 * d'essai, ce qui en laisse une à un choix de deux valeurs.
 */
export function essaisDe(s: ParametreDef, base: Reglages): (string | number)[] {
  const pd = s as ParametreDef & { unite?: string; plage?: [number, number]; defaut?: string | number };
  let essais = valeursDEssai(s);
  if (pd.unite === "°" && pd.plage && pd.plage[1] - pd.plage[0] === 360) essais = essais.filter((v) => v !== pd.plage![0]);
  if (!estDuree(s)) {
    if (!(s.nom in base) || essais.length === 0 || pd.defaut === undefined) return essais;
    const lu = (v: string | number) => String(s.type === "choix" ? valeurCanoniqueChoix(s, v) : v);
    const tous = [...essais, s.type === "choix" ? lu(pd.defaut) : pd.defaut];
    return tous.filter((v, i) => lu(v) !== lu(base[s.nom]) && tous.findIndex((w) => lu(w) === lu(v)) === i);
  }
  const plafond = Math.max(2 * Number(base[s.nom] ?? 1), 1);
  const bornes = essais.map((v) => Math.min(Number(v), plafond));
  return [...new Set(bornes)].filter((v) => v !== base[s.nom]);
}

/** Un réglage inerte sous une valeur d'un réglage à nomenclature. */
export interface Inertie { fiche: string; reglage: string; gouverneur: string; valeur: string; essais: (string | number)[] }

/** Des valeurs d'un même réglage qui rendent les mêmes sorties. */
export interface Coincidence { fiche: string; reglage: string; valeurs: string[]; avecLeDefaut: boolean }

/** Un lancer qui n'a rien rendu de comparable : levé, rendu en erreur, ou hors délai. */
export interface Echec { fiche: string; reglages: Reglages; raison: string }

export interface RapportCroisement {
  fiche: string;
  lancers: number;
  /** Les valeurs essayées de chaque réglage à nomenclature, celles qu'il offre. */
  valeurs: Record<string, string[]>;
  inerties: Inertie[];
  coincidences: Coincidence[];
  echecs: Echec[];
  /** Les réglages qui n'ont pas de valeur d'essai (texte, fichier), et ne sont donc pas éprouvés. */
  nonEprouves: string[];
  /**
   * La valeur de chaque réglage aux réglages de base, un choix sous son identifiant. C'est ce que vaut
   * un réglage dans chaque lancer où il n'est ni le gouverneur ni le réglage éprouvé, et ce qui permet
   * de juger une inertie déclarée par sa vraie condition (lot 3d).
   */
  defauts?: Record<string, string>;
  /** Les réglages vus agir, sous quelle valeur de quel gouverneur : ce qui dément une condition. */
  agissants?: { reglage: string; gouverneur: string; valeur: string }[];
  /** Les ports d'entrée que la passe laisse libres : la condition `{ port }` s'y lit. */
  portsLibres?: string[];
}

/** Chaque lancer a rendu des sorties toutes vides : le nœud seul ne rend rien (`entreesRiches`). */
export const rienRenduSeul = (r: RapportCroisement): boolean =>
  r.lancers > 0 && r.echecs.length === r.lancers && r.echecs.every((e) => e.raison.startsWith("rendu vide"));

/** Le délai d'un lancer, au-delà duquel il compte comme un échec. */
export const DELAI_LANCER_MS = 20_000;

/** La borne des durées dans la passe : quatre mesures de 4/4 à 120 à la noire. */
export const SECONDES_DE_BASE = 8;

const estDuree = (p: ParametreDef) => {
  const pd = p as ParametreDef & { unite?: string; plage?: [number, number] };
  return pd.unite === "s" && Array.isArray(pd.plage);
};

/**
 * Les réglages de base de la passe : les défauts, sauf les durées, bornées à `secondes`, et les
 * réglages propres à la fiche (`BASES_PROPRES`), là où ses défauts ne donnent prise à aucun réglage.
 */
export function reglagesDeBase(fiche: FicheLancable, secondes = SECONDES_DE_BASE): Reglages {
  const base: Reglages = {};
  for (const p of fiche.parametres) {
    if (!estDuree(p)) continue;
    const pd = p as ParametreDef & { plage: [number, number]; defaut?: number };
    base[p.nom] = Math.min(Number(pd.defaut ?? secondes), Math.max(pd.plage[0], secondes));
  }
  return { ...base, ...BASES_PROPRES[fiche.id]?.reglages };
}

/** Un lancer borné dans le temps, rendu en empreinte de ses sorties ou en raison d'échec. */
async function empreinte(fiche: FicheLancable, reglages: Reglages, entrees?: unknown[]): Promise<{ emp: string } | { echec: string }> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<"délai">((ok) => { minuteur = setTimeout(() => ok("délai"), DELAI_LANCER_MS); });
  try {
    const r = await Promise.race([lancerFiche(fiche, reglages, entrees ? { entrees } : {}), delai]);
    if (r === "délai") return { echec: `hors délai (${DELAI_LANCER_MS / 1000} s)` };
    if (r.levee) return { echec: `a levé : ${r.levee}` };
    if (r.erreurRendue) return { echec: `rendu en erreur : ${r.message.slice(0, 120)}` };
    // UN LANCER QUI NE REND RIEN NE MESURE RIEN. Un nœud sans fichier, sans zones ou sans pulsation
    // rend des sorties nulles et le dit dans son message, sans erreur ; leur empreinte ne bougeant
    // jamais, la première passe y avait vu chaque réglage inerte, neuf cents fois sur le cercle pulsant.
    if (r.valeurs.every((v) => v == null)) return { echec: `rendu vide : ${r.message.slice(0, 120)}` };
    return { emp: await empreinteValeurs(r.valeurs) };
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Croise une fiche avec ses réglages à nomenclature.
 *
 * `gouverneurs` nomme chaque réglage à nomenclature et les identifiants qu'il offre ; `essaisMax`
 * borne le nombre de valeurs d'essai d'un autre réglage sous chaque valeur (deux par défaut : une
 * seule pourrait tomber pile sur une valeur équivalente au défaut, et faire croire à une inertie).
 */
export async function croiserFiche(
  fiche: FicheLancable, gouverneurs: readonly { reglage: string; ids: readonly string[] }[],
  o: { essaisMax?: number; entrees?: unknown[]; secondes?: number } = {},
): Promise<RapportCroisement> {
  const rapport: RapportCroisement = {
    fiche: fiche.id, lancers: 0, valeurs: {}, inerties: [], coincidences: [], echecs: [], nonEprouves: [], defauts: {}, agissants: [],
  };
  const base = reglagesDeBase(fiche, o.secondes);
  for (const p of fiche.parametres) {
    const brut = base[p.nom] ?? (p as { defaut?: string | number }).defaut;
    if (brut === undefined) continue;
    rapport.defauts![p.nom] = String(p.type === "choix" ? valeurCanoniqueChoix(p, brut) : brut);
  }
  rapport.portsLibres = (fiche.entrees ?? []).flatMap((e, i) => (o.entrees?.[i] == null ? [e.nom ?? `in:${i}`] : []));
  const essaisMax = o.essaisMax ?? 2;
  const lancer = async (reglages: Reglages) => {
    rapport.lancers++;
    const r = await empreinte(fiche, reglages, o.entrees);
    if ("echec" in r) rapport.echecs.push({ fiche: fiche.id, reglages, raison: r.echec });
    return "emp" in r ? r.emp : null;
  };
  const autres = (n: string) => fiche.parametres.filter((p) => p.nom !== n && !(p as { hidden?: boolean }).hidden);
  rapport.nonEprouves = fiche.parametres
    .filter((p) => !(p as { hidden?: boolean }).hidden && valeursDEssai(p).length === 0 && p.type !== "choix")
    .map((p) => p.nom);

  for (const g of gouverneurs) {
    const pN = fiche.parametres.find((p) => p.nom === g.reglage);
    if (!pN) continue;
    rapport.valeurs[g.reglage] = [...g.ids];
    const parValeur = new Map<string, string>();
    for (const v of g.ids) {
      const emp = await lancer({ ...base, [g.reglage]: v });
      if (emp !== null) parValeur.set(v, emp);
    }
    // 1. LES COÏNCIDENCES : des valeurs qui rendent les mêmes sorties.
    const groupes = new Map<string, string[]>();
    for (const [v, emp] of parValeur) groupes.set(emp, [...(groupes.get(emp) ?? []), v]);
    // Le défaut d'un choix s'écrit souvent par son libellé : il se lit comme le moteur le lit.
    const defautId = String(valeurCanoniqueChoix(pN, (pN as { defaut?: string | number }).defaut ?? g.ids[0] ?? ""));
    for (const valeurs of groupes.values()) {
      if (valeurs.length > 1) {
        rapport.coincidences.push({ fiche: fiche.id, reglage: g.reglage, valeurs, avecLeDefaut: valeurs.includes(defautId) });
      }
    }
    // 2. LES INERTIES : sous chaque valeur, chaque autre réglage à ses valeurs d'essai.
    for (const [v, empV] of parValeur) {
      for (const s of autres(g.reglage)) {
        const essais = essaisDe(s, base).slice(0, essaisMax);
        if (essais.length === 0) continue;
        let agit = false, decide = true;
        for (const e of essais) {
          const emp = await lancer({ ...base, [g.reglage]: v, [s.nom]: e });
          if (emp === null) { decide = false; continue; }
          if (emp !== empV) { agit = true; break; }
        }
        if (!agit && decide) rapport.inerties.push({ fiche: fiche.id, reglage: s.nom, gouverneur: g.reglage, valeur: v, essais });
        if (agit) rapport.agissants!.push({ reglage: s.nom, gouverneur: g.reglage, valeur: v });
      }
    }
  }
  return rapport;
}
