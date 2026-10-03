// tests-e2e/empreintes.spec.ts — Le son d'un composant ne change pas sans qu'on l'ait voulu.
//
// POURQUOI CE FICHIER EXISTE, et c'est la pièce qui manquait le plus.
//
// Douze composants ont été déplacés hors du fil de l'interface, et j'ai vérifié à chaque fois que
// leur son restait identique en comparant une empreinte avant et après. Ces douze vérifications
// reposaient sur ma discipline : elles n'étaient consignées nulle part, et rien ne les rejouait.
// Or c'est exactement la classe de faute qui s'est produite — une migration à moitié faite, dont les
// tests passaient parce qu'ils regardaient la forme du code et non son effet.
//
// CE QUE CE FICHIER CHANGE. L'empreinte de chaque composant surveillé est ENREGISTRÉE dans
// `empreintes.json`, versionné. Toute modification qui altère une sortie fait échouer ce test, sans
// que j'aie à y penser ni à l'affirmer. Ce n'est plus moi qui certifie l'identité du son : c'est le
// dépôt.
//
// CE QUE L'EMPREINTE EST, ET CE QU'ELLE N'EST PAS. Deux nombres par sortie audio, valeur efficace et
// crête, à neuf décimales. Elle attrape tout changement de niveau, de longueur ou de contenu global ;
// elle n'attraperait pas deux échantillons échangés à énergie égale. C'est un filet, non une preuve
// d'égalité bit à bit, et c'est ce filet-là qui a suffi à prendre chacune de mes erreurs.
//
// POUR L'ÉTABLIR OU L'ÉTENDRE : `ECRIRE_EMPREINTES=1 npx playwright test tests-e2e/empreintes.spec.ts`
// Relire le diff AVANT de le committer : une empreinte qui change est soit un progrès voulu, soit
// exactement le défaut que ce fichier existe pour attraper.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { DUREE_SEC, FREQUENCE, mesurerComposant } from "./banc-mesure";

const devUrl = process.env.DEV_URL || "http://localhost:5175";
// Ce fichier est chargé comme module ES : __dirname n'y existe pas.
const ICI = dirname(fileURLToPath(import.meta.url));
const CHEMIN = resolve(ICI, "empreintes.json");
const ecrire = process.env.ECRIRE_EMPREINTES === "1";

/**
 * Les composants surveillés, et le worker que chacun couvre.
 *
 * LA RÈGLE D'APPARTENANCE : tout composant dont le calcul a été déplacé hors du fil, ou dont un
 * module partagé a été retouché, entre ici. `couverture-empreintes.test.ts` refuse qu'un worker de
 * calcul existe sans qu'un composant d'ici le réclame : c'est ce qui empêche la liste de vieillir.
 */
const SURVEILLES: {
  id: string;
  worker?: string;
  parametres?: Record<string, string | number>;
  /** Les rangs d'entrée qui reçoivent le son d'essai, quand une seule ne suffit pas. */
  entreesAudio?: number[];
}[] = [
  // Déplacés dans un worker.
  { id: "phase-pghi", worker: "pghi-worker.ts" },
  { id: "stn-sinus-transitoires-bruit", worker: "stn-worker.ts" },
  { id: "sms-sinusoides-bruit", worker: "sms-worker.ts" },
  { id: "decomposition-atomique", worker: "atomes-worker.ts" },
  { id: "texture-statistique", worker: "texture-worker.ts" },
  { id: "correction-hauteur", worker: "correction-hauteur-worker.ts" },
  { id: "shimmer", worker: "shimmer-worker.ts" },
  { id: "suiveur-hauteur", worker: "hauteur-worker.ts" },
  // LA FICHE TECHNIQUE PARTAGE L'OUVRIER DU SUIVEUR, et c'est voulu : sa notice promet qu'elle ne
  // peut pas contredire le suiveur de hauteur. Son empreinte audio est celle de l'entrée, qu'elle
  // laisse passer ; c'est son MESSAGE qui porte les chiffres mesurés, hauteur comprise.
  { id: "fiche-technique", worker: "hauteur-worker.ts" },
  { id: "harmonizer", worker: "harmoniser-worker.ts" },
  { id: "voice-changer", worker: "formants-worker.ts" },
  // LA FAMILLE DES MELS. L'analyse et la synthèse sont sorties du fil le même jour : avant, huit
  // tours de Griffin-Lim sur cinq secondes de son laissaient la sonde sans un battement pendant
  // 14 049 millisecondes. « Spectrogramme → son » prend peu de tours ici pour que le banc tienne
  // dans son temps ; c'est l'identité du son qui est surveillée, pas sa durée de calcul.
  // LA PASSE SUR LES PLUS LENTS, premier lot. Le relevé des composants audio vers audio donne leur
  // temps et leur gel sur trois secondes de son ; ces deux-là figeaient TOTALEMENT, 615 et 245
  // millisecondes sans qu'un seul message passe.
  { id: "glissando-tonalite", worker: "glissando-worker.ts" },
  { id: "changement-tonalite", worker: "tonalite-worker.ts" },
  // LES QUATRE MISES EN FORME DE WISHART PARTAGENT UN WORKER, le mode voyageant avec les réglages.
  // Toutes les quatre figeaient totalement : 329, 260, 238 ms et le gel sans un seul message.
  // `glissando-interieur` était déjà surveillé plus bas pour sa modulation ; il est monté ici le
  // jour où il a reçu son worker, deux entrées pour un même composant s'écrasant dans la base.
  // Deux calculs déjà purs et déjà par voie : il ne leur manquait qu'une signature à un seul objet
  // de réglages, le dialogue des workers n'en passant pas cinq. 585 et 429 ms de gel total.
  // LE PREMIER COMPOSANT RÉPARTI SUR PLUSIEURS OUVRIERS. Il ne découpe pas son travail par canal
  // mais par racine : dix-neuf transpositions indépendantes, qui tournent de front. 14 390 ms de
  // gel total avant, et c'était le plus long du catalogue. Sa première sortie est une banque, que
  // le banc ne sait pas empreindre ; la seconde est l'aperçu audio, et c'est elle qui est surveillée.
  { id: "banque-clavier", worker: "banque-worker.ts" },
  { id: "separation-harmonique-percussive", worker: "hpss-worker.ts" },
  // Sa sortie n'a pas la longueur de son entrée : le socle rend la voie telle quelle, et c'est le
  // composant qui fabrique son tampon.
  { id: "vitesse-variable", worker: "vitesse-worker.ts" },
  { id: "ondelettes", worker: "ondelettes-worker.ts" },
  // Quatre des cinq mises en forme du Composers' Desktop Project, qui partagent un worker comme
  // celles de Wishart. « Peignes accordés » ne passe pas par ce passage-là.
  { id: "formule-spectrale", worker: "formule-spectrale-worker.ts" },
  { id: "peignes-accordes", worker: "peigne-worker.ts" },
  { id: "etirement-spectre", worker: "cdp-worker.ts" },
  { id: "arpege-spectral", worker: "cdp-worker.ts" },
  { id: "crible-harmonique", worker: "cdp-worker.ts" },
  { id: "melange-fenetres", worker: "cdp-worker.ts" },
  { id: "tracage-spectral", worker: "wishart-worker.ts" },
  { id: "flou-spectral", worker: "wishart-worker.ts" },
  { id: "gel-spectral", worker: "wishart-worker.ts" },
  { id: "glissando-interieur", worker: "wishart-worker.ts" },
  // SECOND LOT DE LA PASSE SUR LES PLUS LENTS, trouvé en élargissant le relevé. Le premier ne
  // portait que sur les composants audio VERS audio ; ces quatre-là rendent du texte, une courbe ou
  // un journal en plus de leur son, et ils figeaient tout autant — 248, 228, 203 et 154
  // millisecondes sans qu'un seul message passe.
  { id: "gout-du-son", worker: "gout-worker.ts" },
  { id: "ecosysteme", worker: "ecosysteme-worker.ts" },
  { id: "reverberation-velours", worker: "velours-worker.ts" },
  { id: "reverbe-hachee", worker: "hachee-worker.ts" },
  // TROISIÈME LOT : LES GÉNÉRATEURS. Ceux-là n'ont aucune entrée audio, donc aucun canal à
  // découper, et leur calcul ne se coupe pas en tâches indépendantes — une phase s'accumule d'un
  // échantillon au suivant. Ils passent par `parUneFois`, qui est `parLot` avec un lot de un.
  // Relevé avant, sans qu'un seul message passe : 492, 475, 342 et 176 millisecondes.
  { id: "glissando-de-gamme", worker: "glissando-agregats-worker.ts" },
  { id: "glissando-harmonique", worker: "glissando-agregats-worker.ts" },
  { id: "battements-binauraux", worker: "binaural-worker.ts" },
  { id: "spirale-logarithmique", worker: "spirale-worker.ts" },
  { id: "son-spectrogramme", worker: "spectrogramme-analyse-worker.ts" },
  { id: "spectrogramme-son", worker: "spectrogramme-synthese-worker.ts", parametres: { Tours: 2, Graine: 7 } },
  // Rendus vivants par la respiration.
  { id: "griffin-lim" },
  { id: "assaisonnement-sonore" },
  // Non déplacés, mais ils partagent les cœurs extraits de `commun.ts` : ce sont eux qui prouvent
  // qu'une extraction dans un fichier central n'a rien changé au son de ceux qui en dépendent.
  // `changement-tonalite` était ici pour cette raison ; il est monté plus haut le jour où il a reçu
  // son worker, et deux entrées pour un même composant se seraient écrasées dans la base.
  { id: "octaver" },
  { id: "paulstretch" },
  // LES QUATORZE EFFETS RENDUS PAR LE WEB AUDIO. Leur empreinte est enregistree AVANT qu'ils
  // recoivent une entree Modulation : sans branchement, elle ne doit pas bouger d'un chiffre.
  { id: "de-esser" },
  { id: "particules" },
  // resonance-audio est ecarte de la base : il rend un son DIFFERENT a chaque execution, mesure sur
  // trois passages, 0,126 puis 0,194 puis 0,171 de valeur efficace. Une empreinte ne peut pas le
  // surveiller, et un test capricieux finit desactive. Sa modulation sera verifiee autrement.
  { id: "exciter" },
  { id: "quadrafuzz" },
  { id: "reverb-fractale" },
  { id: "reverbe-convolution" },
  { id: "distorsion" },
  { id: "piece-lucier" },
  { id: "compresseur-multibande" },
  // PREMIER LOT DE LA CAMPAGNE DE MODULATION. Leur empreinte est enregistree AVANT qu'ils
  // recoivent une entree Modulation : sans branchement, elle ne doit pas bouger d'un chiffre.
  { id: "reverberation" },
  { id: "delay-stereo" },
  { id: "chorus" },
  { id: "flanger" },
  { id: "ring-modulator" },
  { id: "bitcrusher" },
  // SECOND LOT DE LA CAMPAGNE DE MODULATION : les dix-sept a cible unique. Leur empreinte est
  // enregistree AVANT qu'ils recoivent une entree Modulation. `octaver` et
  // `stn-sinus-transitoires-bruit` sont deja surveilles plus haut et ne sont pas repetes ici.
  // Il lui faut deux sons : sans le second il ne rend rien, et son empreinte serait vide.
  { id: "convolution-deux-sons", entreesAudio: [0, 1] },
  { id: "decaleur-frequence" },
  // Cible et modele : deux entrees, comme la convolution.
  { id: "transfert-enveloppe", entreesAudio: [0, 1] },
  { id: "transient-shaper" },
  { id: "montage-grains" },
  { id: "suppression-clics" },
  { id: "doppler" },
  // Son et filtre : deux entrees.
  { id: "filtrage-spectre", entreesAudio: [0, 1] },
  { id: "largeur-stereo" },
  { id: "mono-grave" },
  { id: "shift-formants" },
  { id: "dereverberation" },
  { id: "formule-echantillons" },
  // Cible et corpus : deux entrees. Le corpus est ici le son d'essai lui-meme, ce qui suffit a
  // mesurer une identite ; ce n'est pas un usage musical du composant.
  { id: "mosaiquage", entreesAudio: [0, 1] },
  // Le generateur de courbe : une sortie de type courbe, et non audio. Il entre ici sur la forme
  // Logistique, dont l etiquette annoncait une courbe en S et rendait une suite chaotique. Son
  // empreinte porte le nombre de paliers, qui distingue une courbe lisse d un escalier.
  { id: "generateur-courbe", parametres: { Forme: "Logistique" } },
];

interface Ligne {
  empreintes: (string | null)[];
  message: string | null;
}

/**
 * Le message, débarrassé de ce qui ne peut pas être comparé.
 *
 * UN TEMPS DE CALCUL NE SE COMPARE PAS. La décomposition atomique annonce sa durée dans son message,
 * « 200 atomes · 98.9 % expliqués · 19.6 dB / 2212 ms », et ce nombre change à chaque exécution.
 * L'enregistrer tel quel rendrait ce test capricieux, et un test capricieux finit désactivé, ce qui
 * est la pire des issues pour un garde-fou.
 */
function messageComparable(message: string | null): string | null {
  return message === null ? null : message.replace(/\d+(?:[.,]\d+)?\s*ms\b/g, "« durée »");
}

test("les empreintes des composants surveillés n'ont pas changé", async ({ page }) => {
  test.setTimeout(600_000);

  const attendues: Record<string, Ligne> = existsSync(CHEMIN)
    ? JSON.parse(readFileSync(CHEMIN, "utf8")).composants
    : {};
  if (!ecrire) {
    expect(existsSync(CHEMIN),
      "empreintes.json est absent : établissez-le avec ECRIRE_EMPREINTES=1").toBe(true);
  }

  const obtenues: Record<string, Ligne> = {};
  const ecarts: string[] = [];

  for (const s of SURVEILLES) {
    const m = await mesurerComposant(page, devUrl, s.id,
      { parametres: s.parametres, entreesAudio: s.entreesAudio });
    expect(m.erreur, `${s.id} a échoué : ${m.erreur}`).toBeNull();
    // Une sortie audio est exigée : un composant qui n'en rend plus est un changement en soi, et
    // sans cette garde il passerait pour « conforme » avec une liste d'empreintes vide.
    expect(m.empreintes.some((e) => e !== null),
      `${s.id} ne rend aucune sortie dont on sache prendre l'empreinte`).toBe(true);

    const ligne: Ligne = { empreintes: m.empreintes, message: messageComparable(m.message) };
    obtenues[s.id] = ligne;
    if (ecrire) continue;

    const attendue = attendues[s.id];
    if (!attendue) { ecarts.push(`${s.id} : absent de la base`); continue; }
    if (JSON.stringify(attendue.empreintes) !== JSON.stringify(ligne.empreintes)) {
      ecarts.push(`${s.id} : ${JSON.stringify(attendue.empreintes)} → ${JSON.stringify(ligne.empreintes)}`);
    } else if (attendue.message !== ligne.message) {
      ecarts.push(`${s.id} : message « ${attendue.message} » → « ${ligne.message} »`);
    }
  }

  if (ecrire) {
    writeFileSync(CHEMIN, `${JSON.stringify({
      frequence: FREQUENCE, dureeSec: DUREE_SEC, composants: obtenues,
    }, null, 2)}\n`, "utf8");
    return;
  }

  expect(ecarts, [
    "Le son d'un composant surveillé a changé.",
    "Si ce n'était pas voulu, c'est le défaut que ce test existe pour attraper.",
    "Si c'était voulu, relisez le diff puis lancez ECRIRE_EMPREINTES=1.",
  ].join("\n")).toEqual([]);
});
