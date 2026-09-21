// parcours/fiche-son.ts — La fiche technique d'un son : les mesures de l'examinateur, rendues
// lisibles.
//
// POURQUOI CE FICHIER EXISTE, ET C'EST UNE DETTE QU'ON PAIE. En écrivant les épreuves du parcours,
// l'examinateur a fini par mesurer neuf choses qu'aucun nœud du catalogue ne dit : la part
// d'énergie sous 200 hertz, la corrélation des canaux, l'équilibre gauche-droite, l'écart au
// demi-ton. L'élève se retrouvait donc devant un verdict — « corrélation 0,24 » — qu'il ne pouvait
// vérifier nulle part ailleurs. L'examinateur voyait plus que l'utilisateur, ce qui n'est pas
// tenable : un jugement qu'on ne peut pas reproduire n'enseigne rien, il intimide.
//
// Le nœud « Fiche technique » expose donc EXACTEMENT les mêmes chiffres, par les mêmes fonctions.
// C'est pour cela que ce fichier vit ici, à côté de l'examinateur, plutôt que parmi les analyses :
// la fiche et l'épreuve ne peuvent pas se contredire, puisqu'il n'y a qu'une seule mesure.
//
// LES CIBLES DE DIFFUSION PASSENT PAR `jugerCibles`, celui du parcours. Une « conformité » écrite
// à part aurait fini par diverger d'un dixième de décibel, et c'est exactement le genre d'écart qui
// fait douter d'un outil de mesure. Trois cibles sont proposées, avec leurs vraies valeurs : les
// plateformes à −14 LUFS, le balado à −16, la télévision et la radio à −23 selon EBU R 128.
//
// CE QUI N'EST PAS AFFICHÉ COMPTE AUTANT. Sur un son mono, la rubrique stéréo est absente au lieu
// d'annoncer une corrélation de 1,000 et un équilibre de 0,00 dB — deux chiffres exacts qui
// laisseraient croire à une mesure alors qu'ils ne font que répéter « il n'y a qu'un canal ». De
// même, sans hauteur tenue, la fiche le dit en un mot plutôt que d'aligner des cents sur du bruit.

import { verdictStereo } from "../audio/stereo-correlation";
import { chiffre } from "./conditions";
import type { MesureCopie } from "./mesures";
import { jugerCibles } from "./mesures";
import type { Cible, Point } from "./types";

/** Une cible de diffusion : son nom, et les exigences qu'elle impose. */
export interface CibleDiffusion {
  id: string;
  fr: string;
  en: string;
  cibles: Cible[];
}

/** Le plafond de vrai pic, identique aux trois cibles : c'est la convention de diffusion. */
const PLAFOND: Cible = {
  grandeur: "vraiPic", max: -1,
  exigence: "le vrai pic reste sous −1 dBTP", exigenceEn: "true peak stays under -1 dBTP",
};

/** Une fenêtre de sonie d'un décibel de part et d'autre de la cible. */
const sonie = (cible: number, marge = 1): Cible => ({
  grandeur: "lufs", min: cible - marge, max: cible + marge,
  exigence: `la sonie tient entre ${chiffre(cible - marge, false)} et ${chiffre(cible + marge, false)} LUFS`,
  exigenceEn: `loudness holds between ${chiffre(cible - marge, true)} and ${chiffre(cible + marge, true)} LUFS`,
});

export const CIBLES_DIFFUSION: CibleDiffusion[] = [
  { id: "aucune", fr: "Aucune", en: "None", cibles: [] },
  { id: "streaming", fr: "Plateformes (−14 LUFS)", en: "Platforms (-14 LUFS)", cibles: [sonie(-14), PLAFOND] },
  { id: "balado", fr: "Balado (−16 LUFS)", en: "Podcast (-16 LUFS)", cibles: [sonie(-16), PLAFOND] },
  { id: "ebu", fr: "Radio et télévision, EBU R 128 (−23 LUFS)", en: "Radio and television, EBU R 128 (-23 LUFS)", cibles: [sonie(-23, 0.5), PLAFOND] },
];

/** La cible demandée, ou aucune si l'identifiant est inconnu. */
export const cibleDiffusion = (id: string): CibleDiffusion =>
  CIBLES_DIFFUSION.find((c) => c.id === id) ?? CIBLES_DIFFUSION[0];

/** Le verdict de conformité, par les mêmes fonctions que les épreuves du parcours. */
export const conformite = (m: MesureCopie, id: string): Point[] =>
  jugerCibles(cibleDiffusion(id).cibles, m);

/**
 * Ce qu'une corrélation veut dire, dans les mots du goniomètre.
 *
 * Le classement vient de `verdictStereo`, la fonction que le goniomètre appelle : un même chiffre
 * reçoit donc le même verdict des deux côtés, et personne n'a à se demander pourquoi l'un dit
 * « large » quand l'autre dit « étroite ». L'opposition de phase garde son avertissement entier :
 * c'est le seul cas où le chiffre annonce un défaut, et non une largeur.
 */
const LIBELLE_STEREO: Record<string, { fr: string; en: string }> = {
  mono: { fr: "mono ou presque", en: "mono or nearly" },
  etroit: { fr: "stéréo étroite", en: "narrow stereo" },
  large: { fr: "stéréo large", en: "wide stereo" },
  opposition: { fr: "opposition de phase — le mix s'effondre en mono", en: "out of phase — the mix collapses in mono" },
};

const LARGEUR = 20;

/** Une ligne alignée : l'intitulé, puis la valeur. */
const ligne = (quoi: string, valeur: string): string => `  ${quoi.padEnd(LARGEUR)}${valeur}`;

/** Un décibel signé : le signe dit de quel côté, et c'est ce qui sert à corriger. */
const signe = (v: number, en: boolean): string => (v > 0 ? "+" : "") + chiffre(v, en);

/**
 * La fiche technique, en clair.
 *
 * Les rubriques suivent l'ordre dans lequel on se pose les questions en travaillant : combien de
 * temps et combien de canaux, puis quel niveau, puis quelle couleur, puis quelle largeur, puis
 * quelle note. Ce n'est pas l'ordre des mesures dans le code, et c'est volontaire.
 */
export function ficheSon(m: MesureCopie, en: boolean, diffusion = "aucune", avecHauteur = true): string {
  const l: string[] = [];
  const c = (v: number) => chiffre(v, en);
  l.push(en ? "SOUND SPEC SHEET" : "FICHE TECHNIQUE DU SON");
  l.push("");
  l.push(ligne(en ? "Duration" : "Durée", `${c(m.dureeSec)} s`));
  l.push(ligne(en ? "Channels" : "Canaux",
    `${m.canaux} ${m.canaux >= 2 ? (en ? "(stereo)" : "(stéréo)") : (en ? "(mono)" : "(mono)")}`));

  l.push("");
  l.push(en ? "Level" : "Niveau");
  l.push(ligne(en ? "Loudness" : "Sonie", `${c(m.lufs)} LUFS`));
  l.push(ligne(en ? "True peak" : "Vrai pic", `${c(m.vraiPicDb)} dBTP`));
  l.push(ligne(en ? "Peak" : "Crête", `${c(m.creteDb)} dBFS`));
  l.push(ligne(en ? "Crest factor" : "Facteur de crête", `${c(m.facteurCreteDb)} dB`));
  // L'intitulé porte la réserve : cette plage compte les silences, et un blanc y suffit à annoncer
  // cent décibels. La dire sans le dire aurait été un chiffre juste et trompeur.
  l.push(ligne(en ? "Loudness spread" : "Plage de sonie",
    `${c(m.plageDynamiqueDb)} dB ${en ? "(silence included)" : "(silences compris)"}`));

  l.push("");
  l.push(en ? "Spectrum" : "Spectre");
  l.push(ligne(en ? "Below 200 Hz" : "Sous 200 Hz", `${c(m.partGravePc)} %`));
  l.push(ligne(en ? "Above 4 kHz" : "Au-dessus de 4 kHz", `${c(m.partAiguPc)} %`));

  if (m.canaux >= 2) {
    l.push("");
    l.push(en ? "Stereo" : "Stéréo");
    const verdict = LIBELLE_STEREO[verdictStereo(m.correlation)];
    l.push(ligne(en ? "Correlation" : "Corrélation", `${c(m.correlation)} · ${en ? verdict.en : verdict.fr}`));
    // Un écart nul n'a pas de côté : « 0 dB (gauche) » se lisait comme un déséquilibre à gauche.
    const cote = Math.abs(m.equilibreDb) < 0.05
      ? (en ? "centred" : "centré")
      : m.equilibreDb > 0 ? (en ? "left" : "gauche") : (en ? "right" : "droite");
    l.push(ligne(en ? "Balance" : "Équilibre", `${signe(m.equilibreDb, en)} dB (${cote})`));
  }

  if (avecHauteur) {
    l.push("");
    l.push(en ? "Pitch" : "Hauteur");
    if (m.hauteurHz > 0) {
      l.push(ligne(en ? "Pitch" : "Hauteur", `${c(m.hauteurHz)} Hz (${m.noteProche})`));
      l.push(ligne(en ? "Deviation" : "Écart", `${signe(m.ecartCents, en)} cents`));
    } else {
      l.push(ligne(en ? "Pitch" : "Hauteur", en ? "no sustained pitch" : "aucune hauteur tenue"));
    }
    l.push(ligne(en ? "Sustained frames" : "Trames tenues", `${c(m.partVoiseePc)} %`));
  }

  const cible = cibleDiffusion(diffusion);
  if (cible.cibles.length > 0) {
    const points = conformite(m, diffusion);
    l.push("");
    l.push(`${en ? "Target" : "Cible"} : ${en ? cible.en : cible.fr}`);
    for (const p of points) l.push(`  ${p.satisfait ? "[x]" : "[ ]"} ${en ? p.texteEn : p.texte}`);
    l.push(points.every((p) => p.satisfait)
      ? (en ? "  Compliant." : "  Conforme.")
      : (en ? "  Not compliant yet." : "  Pas encore conforme."));
  }
  return l.join("\n");
}

/** Le résumé d'une ligne, pour le message du nœud. */
export function resumeSon(m: MesureCopie, en: boolean, diffusion = "aucune"): string {
  const c = (v: number) => chiffre(v, en);
  const morceaux = [
    `${c(m.dureeSec)} s`,
    m.canaux >= 2 ? (en ? "stereo" : "stéréo") : "mono",
    `${c(m.lufs)} LUFS`,
    `${c(m.vraiPicDb)} dBTP`,
  ];
  if (m.canaux >= 2) morceaux.push(`r ${c(m.correlation)}`);
  if (m.hauteurHz > 0) morceaux.push(`${c(m.hauteurHz)} Hz (${m.noteProche})`);
  const points = conformite(m, diffusion);
  if (points.length > 0) {
    morceaux.push(points.every((p) => p.satisfait)
      ? (en ? "compliant" : "conforme")
      : `${points.filter((p) => p.satisfait).length}/${points.length} ${en ? "met" : "tenues"}`);
  }
  return morceaux.join(" · ");
}
