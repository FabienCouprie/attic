// src/docs/modulables.ts — Ce qui reste à rendre modulable par une courbe.
//
// POURQUOI CE FICHIER EXISTE. Le recensement a été fait une fois à la main, et j'ai cité son total
// de mémoire alors qu'il avait déjà changé : les exclusions convenues n'en étaient pas retirées. Un
// nombre qu'on répète sans le recalculer est un nombre faux dès la première avancée. Il est donc
// engendré, versionné, et il DÉCROÎT TOUT SEUL à mesure que les composants reçoivent leur entrée.
//
// LE CRITÈRE N'EST PAS INVENTÉ, il est relevé sur les composants déjà modulables : ils pilotent tous
// une grandeur continue et audible, un mélange, un niveau, une fréquence, une hauteur, un temps, une
// position, un seuil, une rétroaction. Jamais une taille de fenêtre, un nombre d'itérations ni une
// graine, qui décident de la façon de calculer et non de ce qu'on entend.
//
// LES EXCLUSIONS SONT NOMMÉES ET MOTIVÉES, une par une, plutôt que devinées par un motif. Un réglage
// qui décide d'une opération portant sur le fichier entier, une normalisation, un rognage, le seuil
// d'une analyse, ne se module pas : le faire varier dans le temps ne veut rien dire.

import type { FicheAudio } from "../audio/types-domaine";
import { FAMILLES_EFFETS } from "../plugins/familles-palette";

/** Les huit familles de grandeurs continues, telles que les composants déjà modulables les pilotent. */
export const FAMILLES: Record<string, RegExp> = {
  melange: /^(mix|m[ée]lange|wet|dry|proportion)$/i,
  niveau: /^(gain|volume|niveau|r[ée]duction|amplitude|intensit[ée])$/i,
  frequence: /^(fr[ée]quence|fr[ée]quence de coupure|coupure|fondamentale|q|r[ée]sonance|brillance)$/i,
  hauteur: /^(transposition|d[ée]saccord|d[ée]tune|hauteur|pitch)$/i,
  temps: /^(temps|retard|pr[ée]-d[ée]lai|decay|d[ée]croissance|attaque|rel[âa]chement|maintien|queue|chute)$/i,
  espace: /^(profondeur|largeur|position|azimut|distance|rotation|[ée]tirement|dispersion|panoramique|ouverture)$/i,
  dynamique: /^(seuil|ratio|plafond|compression)$/i,
  retroaction: /^(feedback|rebouclage|r[ée]injection|damping)$/i,
};

/**
 * Les composants écartés, et pourquoi.
 *
 * Chacun porte un réglage d'une des huit familles, mais ce réglage décide d'une opération globale ou
 * structurelle : le faire varier au fil du son n'a pas de sens.
 */
export const ECARTES: Record<string, string> = {
  "normaliseur": "le niveau et le plafond visent le fichier entier ; les faire varier détruirait la normalisation",
  "recaler-niveau": "le plafond vise le recalage entier, qui est une mesure globale",
  "rogner-silences": "le seuil décide d'une découpe, pas d'un traitement au fil du son",
  "auto-similarite": "le seuil règle l'affichage d'une analyse, non un traitement",
  "boucle-graphe-fin-c": "le niveau appartient à la mécanique de boucle du graphe",
  "fiche-technique": "les seuils règlent un rapport de mesure",
  "csound": "le volume est passé à un interpréteur externe, qui ne lit pas une valeur par échantillon",
  "csound-effet": "idem, interpréteur externe",
  "csound-spectral": "idem, interpréteur externe",
  "particules": "les réglages partent dans une partition Csound, qui ne lit pas une valeur par échantillon",

  // TRAITEMENT PAR TRAMES. Ces composants analysent et resynthétisent par blocs : une courbe n'y
  // serait lue qu'une fois par trame, non par échantillon, et la modulation n'aurait pas la
  // résolution qu'elle promet. Écartés sur décision de Fabien.
  "griffin-lim": "traitement par trames : une valeur par bloc, non par échantillon",
  "phase-pghi": "traitement par trames : une valeur par bloc, non par échantillon",
  "gel-spectral": "traitement par trames : une valeur par bloc, non par échantillon",
  "flou-spectral": "traitement par trames : une valeur par bloc, non par échantillon",
  "tracage-spectral": "traitement par trames : une valeur par bloc, non par échantillon",
  "arpege-spectral": "traitement par trames : une valeur par bloc, non par échantillon",
  "formule-spectrale": "traitement par trames : une valeur par bloc, non par échantillon",

  // LES COMPOSANTS LOGISTIQUES RESTENT TELS QU'ILS SONT. Ils portent des réglages d'ajustement qui
  // leur sont propres, que la modulation par courbe ne reproduit pas. Ils ne sont ni retirés du
  // catalogue ni modifiés. Décision de Fabien, définitive.
  "auto-pan-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "chopper-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "echo-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "melangeur-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "paulstretch-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "tremolo-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",
  "vibrato-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",

  // LE RÉGLAGE N'EST PAS UN `AudioParam`. Le faire varier demanderait de reconstruire le graphe à
  // chaque valeur, ce qui n'est pas une automation : la table d'un distordeur, la longueur d'une
  // réponse impulsionnelle. Ces composants ne sont pas modifiés. Décision de Fabien, définitive.
  "distorsion": "le gain de saturation est la table d'un distordeur, non un réglage automatisable",
  "reverb-fractale": "le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur",
  "reverbe-convolution": "le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur",
  "piece-lucier": "le decay et le damping fabriquent la réponse impulsionnelle, une fois, avant les passages",
  "resonance-audio": "la largeur, la hauteur et la profondeur sont les dimensions de la pièce ; la position de la source passe par une méthode du SDK, non par un AudioParam",

  // PLUSIEURS CIBLES À LA FOIS. Une seule entrée Modulation ne peut en piloter qu'une, et choisir
  // laquelle serait décider à la place de celui qui s'en sert. Écartés sur décision de Fabien.
  "shimmer": "quatre réglages modulables à la fois : transposition, mélange, rebouclage, décroissance",
  "compresseur": "trois réglages modulables à la fois : seuil et ratio, gain, attaque et relâchement",
  "ducking": "trois réglages modulables à la fois : seuil, réduction, attaque et relâchement",
  "compresseur-multibande": "trois seuils et une paire attaque / relâchement : aucune cible unique à piloter",
};

/**
 * Les familles de la palette écartées en bloc, et pourquoi.
 *
 * UNE DÉCISION D'ENSEMBLE SE LIT OÙ ELLE EST DÉCLARÉE. Écarter une famille en recopiant ici les
 * identifiants de ses membres laisserait entrer le prochain nœud qu'on y range, et le recensement
 * dirait alors qu'il reste à faire une décision déjà prise. La famille est donc lue dans
 * `familles-palette.ts`, qui est l'endroit où le rangement de la palette est décidé.
 */
export const CATEGORIES_ECARTEES: Record<string, string> = {
  "Topologie": "la famille entière est écartée : le son y est promené sur une surface refermée sur elle-même, dont la géométrie est le sujet du nœud et non un réglage à faire varier",
};

/** Les identifiants écartés, nommément ou par leur famille de palette. */
export function idsEcartes(): Map<string, string> {
  const out = new Map(Object.entries(ECARTES));
  for (const [famille, raison] of Object.entries(CATEGORIES_ECARTEES)) {
    for (const id of FAMILLES_EFFETS[famille] ?? []) if (!out.has(id)) out.set(id, raison);
  }
  return out;
}

export interface CibleModulable {
  id: string;
  nom: string;
  famille: string;
  /** Les réglages de cette famille, tels qu'ils apparaissent à l'écran. */
  reglages: string[];
}

const estAudio = (f: FicheAudio, cote: "entrees" | "sorties") =>
  ((f as any)[cote] ?? []).some((p: any) => p.type === "audio");

const aCourbe = (f: FicheAudio) =>
  ((f as any).entrees ?? []).some((p: any) => p.type === "courbe");

const estContinu = (p: any) =>
  p.type !== "choix" && p.type !== "texte" && p.type !== "dossier"
  && p.type !== "couleurs" && p.type !== "sf2instrument";

/** Ce qui reste à faire : un effet audio vers audio, sans entrée courbe, non écarté. */
export function cibles(fiches: readonly FicheAudio[]): CibleModulable[] {
  const out: CibleModulable[] = [];
  const ecartes = idsEcartes();
  for (const f of fiches) {
    if (!estAudio(f, "entrees") || !estAudio(f, "sorties")) continue;
    if (aCourbe(f)) continue;
    if (ecartes.has(f.id)) continue;
    const parFamille = new Map<string, string[]>();
    for (const p of ((f as any).parametres ?? [])) {
      if (!estContinu(p)) continue;
      for (const [fam, re] of Object.entries(FAMILLES)) {
        if (re.test(p.nom)) {
          (parFamille.get(fam) ?? parFamille.set(fam, []).get(fam)!).push(p.nom);
          break;
        }
      }
    }
    for (const [famille, reglages] of parFamille) {
      out.push({ id: f.id, nom: f.nom, famille, reglages: [...new Set(reglages)] });
    }
  }
  return out.sort((a, b) => a.famille.localeCompare(b.famille) || a.id.localeCompare(b.id));
}

/** Les composants qui acceptent déjà une courbe, et le réglage que chacun pilote. */
export function dejaModulables(fiches: readonly FicheAudio[]): { id: string; cible: string }[] {
  return fiches
    .filter(aCourbe)
    .map((f) => {
      const e = ((f as any).entrees ?? []).find((p: any) => p.type === "courbe");
      return { id: f.id, cible: e?.module ?? "(non déclarée)" };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function recensementEnTexte(fiches: readonly FicheAudio[]): string {
  const restants = cibles(fiches);
  const deja = dejaModulables(fiches);
  const composants = new Set(restants.map((c) => c.id));
  const parFamille = new Map<string, CibleModulable[]>();
  for (const c of restants) (parFamille.get(c.famille) ?? parFamille.set(c.famille, []).get(c.famille)!).push(c);
  const familles = [...parFamille.entries()].sort((a, b) => b[1].length - a[1].length);
  const nFamilles = Object.keys(CATEGORIES_ECARTEES).length;

  const lignes = [
    "# Effets à rendre modulables",
    "",
    "Généré par `npm run docs:modulables`. Ne pas modifier à la main.",
    "",
    "Le critère est relevé sur les composants qui acceptent déjà une courbe : ils pilotent tous une",
    "grandeur continue et audible. Un réglage qui décide de la façon de calculer, taille de fenêtre,",
    "nombre d'itérations, graine, n'entre pas ici. Les composants écartés le sont nommément, avec leur",
    "raison, et la liste décroît d'elle-même à mesure que les entrées Modulation sont posées.",
    "",
    `- **acceptent déjà une courbe** : ${deja.length}`,
    `- **restent à faire** : ${composants.size} composants, ${restants.length} couples composant / famille`,
    `- **écartés** : ${idsEcartes().size}, dont ${nFamilles} ${nFamilles > 1 ? "familles" : "famille"} de la palette ${nFamilles > 1 ? "écartées" : "écartée"} en bloc`,
    "",
    "## Ce qui reste, par famille",
    "",
  ];
  for (const [famille, liste] of familles) {
    lignes.push(`### ${famille} · ${liste.length}`, "");
    for (const c of liste) lignes.push(`- ${c.nom} \`${c.id}\` : ${c.reglages.join(", ")}`);
    lignes.push("");
  }
  lignes.push("## Familles écartées en bloc", "");
  for (const [famille, raison] of Object.entries(CATEGORIES_ECARTEES)) {
    lignes.push(`- **${famille}** : ${raison}`);
    lignes.push(`  - ${(FAMILLES_EFFETS[famille] ?? []).map((id) => `\`${id}\``).join(", ")}`);
  }
  lignes.push("", "## Écartés nommément, et pourquoi", "");
  for (const [id, raison] of Object.entries(ECARTES)) lignes.push(`- \`${id}\` : ${raison}`);
  lignes.push("", "## Acceptent déjà une courbe", "");
  for (const d of deja) lignes.push(`- \`${d.id}\` : ${d.cible}`);
  lignes.push("");
  return lignes.join("\n");
}
