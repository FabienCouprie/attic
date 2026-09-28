// audio/reconnaitre-accord.ts — Nommer l'accord que des notes forment.
//
// POURQUOI CE MODULE EXISTE. Le dépôt savait reconnaître un accord dans un SON, par corrélation de
// chromagramme ; il ne savait pas le reconnaître dans des NOTES. Or c'est ce qu'il faut pour poser
// une mélodie sur une suite d'accords écrite : la qualité désigne la gamme, et la gamme dit quelles
// notes sont disponibles.
//
// LA RECONNAISSANCE SE DÉRIVE DE LA TABLE, elle ne porte aucune liste à elle. On essaie les douze
// fondamentales contre les trente-trois qualités, et l'on garde celle qui explique le mieux les
// classes de hauteur entendues. Une qualité ajoutée à la table est donc reconnue le jour même, sans
// qu'on touche ici.
//
// CE QUI EST MESURÉ, ET POURQUOI CE N'EST PAS UNE ÉGALITÉ. Un accord réel est rarement écrit
// exactement comme la table : une quinte omise, une fondamentale doublée, une neuvième ajoutée.
// L'écart se compte donc en deux termes, et ils ne pèsent pas pareil. Une note ENTENDUE que la
// qualité n'explique pas est une faute grave : elle contredit le nom qu'on donne. Une note de la
// qualité qui MANQUE est une omission, chose courante et sans gravité. Le score les pénalise dans
// ce rapport, et c'est ce qui fait qu'un do-mi-sol-si est nommé septième majeure plutôt que majeur.
//
// LA BASSE TRANCHE LES SYMÉTRIES, et il en faut bien quelque chose. Un accord diminué de septième
// rend le même ensemble de classes pour quatre fondamentales, un accord augmenté pour trois : aucun
// calcul sur les classes ne peut les départager, puisqu'il n'y a rien à départager. La note la plus
// grave décide, ce qui est aussi ce qu'une oreille fait.

import { QUALITES, qualiteDe } from "./qualites-accords";

/** Ce qu'on a reconnu, et à quel point cela colle. */
export interface AccordReconnu {
  /** La fondamentale, en classe de hauteur de zéro à onze. */
  fondamentale: number;
  /** L'identifiant de la qualité, tel que `qualites-accords.ts` le porte. */
  qualite: string;
  /** Vrai quand les classes entendues sont EXACTEMENT celles de la qualité. */
  exact: boolean;
  /** Les classes entendues que la qualité n'explique pas. */
  etrangeres: number[];
  /** Les classes de la qualité qui ne sonnent pas. */
  omises: number[];
}

const classe = (n: number) => ((Math.round(n) % 12) + 12) % 12;

/** Le poids d'une note entendue qu'on n'explique pas : elle contredit le nom qu'on donne. */
const PRIX_ETRANGERE = 3;
/** Le poids d'une note de la qualité qui manque : une omission est courante et sans gravité. */
const PRIX_OMISE = 1;

/**
 * L'accord que ces hauteurs forment, ou `undefined` s'il n'y en a pas assez pour en nommer un.
 *
 * DEUX NOTES NE FONT PAS UN ACCORD, et le dire vaut mieux que de nommer au hasard : un intervalle
 * de quinte appartient à une majeure comme à une mineure, et choisir reviendrait à inventer la
 * tierce. En dessous de trois classes distinctes, on ne rend rien.
 */
export function reconnaitreAccord(hauteurs: readonly number[]): AccordReconnu | undefined {
  if (hauteurs.length === 0) return undefined;
  const entendues = new Set(hauteurs.map(classe));
  if (entendues.size < 3) return undefined;

  const basse = classe(hauteurs.reduce((m, h) => Math.min(m, h), Infinity));
  let meilleur: AccordReconnu | undefined;
  let meilleurScore = Infinity;

  for (let fondamentale = 0; fondamentale < 12; fondamentale++) {
    for (const q of QUALITES) {
      const attendues = new Set(q.intervalles.map((i) => classe(fondamentale + i)));
      const etrangeres = [...entendues].filter((c) => !attendues.has(c)).sort((a, b) => a - b);
      const omises = [...attendues].filter((c) => !entendues.has(c)).sort((a, b) => a - b);
      // LA BASSE N'EST QU'UN DÉPARTAGE, d'où son poids d'une demi-omission : elle doit trancher
      // entre deux lectures également bonnes, jamais l'emporter sur une note étrangère de plus.
      const score = etrangeres.length * PRIX_ETRANGERE + omises.length * PRIX_OMISE
        + (fondamentale === basse ? 0 : 0.5);
      if (score < meilleurScore) {
        meilleurScore = score;
        meilleur = {
          fondamentale, qualite: q.id,
          exact: etrangeres.length === 0 && omises.length === 0,
          etrangeres, omises,
        };
      }
    }
  }
  return meilleur;
}

/**
 * Les accords d'une suite de notes, un par groupe de notes qui commencent ensemble.
 *
 * CE QUI FAIT UN ACCORD EST LE DÉBUT COMMUN, à la tolérance près. Deux notes écrites pour sonner
 * ensemble ne commencent jamais au même millionième dans un fichier joué : grouper sur l'égalité
 * stricte rendrait un accord par note. La tolérance est la même idée que le regroupement des
 * frappes d'une pulsation, et pour la même raison.
 */
export function accordsDeSequence(
  notes: readonly { note: number; debut: number; fin: number }[],
  tolerance = 0.05,
): { debut: number; fin: number; hauteurs: number[]; accord: AccordReconnu | undefined }[] {
  const triees = [...notes].sort((a, b) => a.debut - b.debut);
  const groupes: { debut: number; fin: number; hauteurs: number[] }[] = [];
  for (const n of triees) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && n.debut - dernier.debut <= tolerance) {
      dernier.hauteurs.push(n.note);
      dernier.fin = Math.max(dernier.fin, n.fin);
    } else {
      groupes.push({ debut: n.debut, fin: n.fin, hauteurs: [n.note] });
    }
  }
  return groupes.map((g) => ({ ...g, accord: reconnaitreAccord(g.hauteurs) }));
}

/** Le nom lisible d'un accord reconnu, dans la langue demandée. */
export function nomDeLaccord(a: AccordReconnu, anglais: boolean): string {
  const NOMS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const q = qualiteDe(a.qualite);
  const symbole = q?.symbole ?? a.qualite;
  return `${NOMS[a.fondamentale]}${symbole}${a.exact ? "" : anglais ? " (approx.)" : " (approché)"}`;
}
