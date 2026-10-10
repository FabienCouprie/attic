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
  "montage-grains": "le seuil décide où les grains sont coupés, donc d'une découpe et non d'un traitement au fil du son",
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
  // LA TRAME EST MESURÉE ICI, parce que c'est elle qui a emporté la décision. `reduireBruit`
  // travaille sur 8192 échantillons par sauts de 4096 : à 44,1 kHz, une fenêtre de 185,8 ms qui
  // avance toutes les 92,9 ms, soit une lecture onze fois par seconde. Ses deux réglages de
  // famille modulable, « Réduction » et « Q », passent par la même boucle. Écarté sur décision de
  // Fabien, au relevé de la famille « niveau ».
  "reduction-bruit": "traitement par trames de 8192 échantillons par sauts de 4096 : une courbe n'y serait lue que onze fois par seconde, soit par paliers de 93 ms",
  // DES RÉGLAGES STRUCTURELS, ET NON DES VALEURS QUI COURENT. Les trois qui suivent ont été relevés
  // au moment de prendre la famille « temps », et écartés sur décision de Fabien. Leur point commun
  // est que le réglage est lu AVANT qu'un seul échantillon soit écrit, et qu'il décide de la forme
  // de ce qui va être calculé : une courbe n'y a pas de place où se glisser.
  "echo-inverse": "le cœur somme des copies décalées du son entier, et « Temps » comme « Feedback » fixent les décalages et la longueur de sortie avant qu'un échantillon soit écrit",
  "enveloppe-adsr": "ses durées sont les cinq points d'ancrage d'une enveloppe en un coup, calculés avant qu'elle soit tracée ; et son « Maintien » est un niveau, non une durée",
  "haas": "déplacer la position de lecture transposerait le canal retardé, alors que l'effet tient à ce que l'oreille fusionne un décalage FIXE",
  // UNE VALEUR PAR SEGMENT, NON PAR ÉCHANTILLON. « Dispersion » et « Transposition » sont lues dans
  // la même boucle, une fois au démarrage de chaque grain, à la cadence que fixe « Densité » : de 1
  // à 400 par seconde, 40 par défaut, soit des paliers de 25 ms. Écarté sur décision de Fabien, au
  // relevé de la famille « espace ».
  "brassage": "ses deux réglages sont lus une fois par segment, à la cadence de « Densité » : 40 par seconde au défaut, soit par paliers de 25 ms",
  // Le recensement lit les noms des réglages, non les cœurs : ces quatre-là portaient un réglage
  // d'une famille modulable, et leur cœur travaille par trames comme les sept ci-dessus.
  "stn-sinus-transitoires-bruit": "traitement par trames : une valeur par bloc, non par échantillon",
  "dereverberation": "traitement par trames : la réduction est lue une fois par bloc de FFT, non par échantillon",
  "shift-formants": "traitement par trames : l'enveloppe est estimée par bloc, non par échantillon",
  "filtrage-spectre": "traitement par trames : la profondeur est appliquée par trame d'analyse, non par échantillon",

  // LES COMPOSANTS LOGISTIQUES RESTENT TELS QU'ILS SONT. Ils portent des réglages d'ajustement qui
  // leur sont propres, que la modulation par courbe ne reproduit pas. Ils ne sont ni retirés du
  // catalogue ni modifiés. Décision de Fabien, définitive.
  "melangeur-logistique": "composant logistique : reste tel qu'il est, il ne bouge pas",

  // LE RÉGLAGE N'EST PAS UN `AudioParam`. Le faire varier demanderait de reconstruire le graphe à
  // chaque valeur, ce qui n'est pas une automation : la table d'un distordeur, la longueur d'une
  // réponse impulsionnelle. Ces composants ne sont pas modifiés. Décision de Fabien, définitive.
  "distorsion": "le gain de saturation est la table d'un distordeur, non un réglage automatisable",
  "reverb-fractale": "le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur",
  "reverbe-convolution": "le decay décide de la longueur d'une réponse impulsionnelle, reconstruite à chaque valeur",
  "piece-lucier": "le decay et le damping fabriquent la réponse impulsionnelle, une fois, avant les passages",
  "resonance-audio": "la largeur, la hauteur et la profondeur sont les dimensions de la pièce ; la position de la source passe par une méthode du SDK, non par un AudioParam",
  "doppler": "la distance est la géométrie du passage, dont toute la trajectoire se déduit, et non une valeur lue à chaque instant",
  "mono-grave": "la coupure fixe les coefficients de quatre biquads et sert aussi à la mesure que le nœud rapporte",

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
  p.type !== "choix" && p.type !== "texte" && p.type !== "dossier" && p.type !== "fichier"
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

/**
 * Pour un composant, les cœurs par trames qu'il emploie : le nom, et ce qui l'a décidé.
 *
 * LE RECENSEMENT LIT LES NOMS DES RÉGLAGES, NON LES CŒURS, et il a proposé pour cette raison quatre
 * composants qu'une règle déjà posée écartait. Cette information vient de `coeurs-par-trames.ts`, qui
 * lit la source ; elle est passée en argument plutôt que calculée ici, pour que ce fichier reste
 * lisible depuis n'importe où et n'ait pas besoin du système de fichiers.
 */
export type CoeursParTrames = ReadonlyMap<string, readonly { nom: string; marqueur: string }[]>;

export function recensementEnTexte(
  fiches: readonly FicheAudio[], parTrames: CoeursParTrames = new Map(),
): string {
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
    "Un composant marqué **⟨trames⟩** a un cœur qui travaille par blocs : une courbe n'y serait lue",
    "qu'une fois par trame, non par échantillon. La marque est relevée sur la source par",
    "`coeurs-par-trames.ts` ; elle n'écarte rien d'elle-même, elle dit de regarder avant de proposer.",
    "",
    `- **acceptent déjà une courbe** : ${deja.length}`,
    `- **restent à faire** : ${composants.size} composants, ${restants.length} couples composant / famille`,
    `- **dont le cœur travaille par trames** : ${[...composants].filter((id) => parTrames.has(id)).length}`,
    `- **écartés** : ${idsEcartes().size}, dont ${nFamilles} ${nFamilles > 1 ? "familles" : "famille"} de la palette ${nFamilles > 1 ? "écartées" : "écartée"} en bloc`,
    "",
    "## Ce qui reste, par famille",
    "",
  ];
  const marque = (id: string): string => {
    const v = parTrames.get(id);
    return v ? ` · **⟨trames⟩** ${v.map((x) => `${x.nom} (${x.marqueur})`).join(", ")}` : "";
  };
  for (const [famille, liste] of familles) {
    lignes.push(`### ${famille} · ${liste.length}`, "");
    for (const c of liste) lignes.push(`- ${c.nom} \`${c.id}\` : ${c.reglages.join(", ")}${marque(c.id)}`);
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
