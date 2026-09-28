// ui/vues.tsx — Le registre : quel noeud recoit quelle vue, et de quel cote du lecteur.
//
// Une part des vues de noeud, decoupees par domaine. Le registre qui les associe a un
// identifiant de fiche vit dans `vues.tsx`, avec le type `VueProps` que toutes recoivent.
// Aucune ligne n'a ete retouchee au passage.

import type { ReactNode } from "react";
import { Quiz } from "./Quiz";
import { Parcours } from "./Parcours";
import { EditeurFormule } from "./EditeurFormule";
import { registre } from "../audio/adaptateur";
import type { FicheAudio } from "../audio/types-domaine";
import { ArbreRythmiqueVue } from "./ArbreRythmiqueVue";
import { RouleauSequence } from "./RouleauSequence";
import { CercleMelodiqueVue, CercleRythmiqueVue } from "./CercleVue";
import type { DonneesNoeud } from "./AtelierNode";
import { VueExtraitVideo, VueFilmCercle, VueMontageVideo, VuePistesMultiples, VueVideoMuette } from "./vues-video";
import { VueMontage } from "./vues-montage";
import { VueFormeOnde, VueSelecteurMultiZones, VueUploadAudio, VueUploadImage, VueUploadPdf, VueUploadSvg } from "./vues-fichiers";
import { VueExplorateur } from "./vues-explorateur";
import { VueLecteurMusique } from "./vues-lecteur";
import { VueSoundFont, VueTranscription, VueUploadIR, VueUploadMidi, VueUploadOnnx, VueUploadPd } from "./vues-midi";
import { VueCollections, VueExport } from "./vues-collections";
import { ClavierMelodie, ClavierSfz, VueApprentissage, VueBanqueSfz, VueOrchestreCsound } from "./vues-claviers";
import { VueADSR, VueComparateurAB, VueDetecteurAccords, VueEmotions, VueGenerateurScriptIA, VueNomsInstruments, VueOscillo, VueReponseFiltre, VueSequenceurAccords, VueSequenceurBatterieAvance, VueSequenceurMelodique, VueSpectre, VueSpectrogramme, VueStylesMusicaux, VueTessituresVoix } from "./vues-analyse";
import { VueGestionNodes, VueJuliaProcessor, VuePythonProcessor } from "./vues-code";
import { VueAnimationSvg, VueAttracteurIFS, VueColorSynth, VueComparaisonEsth, VueCouleurSunoIA, VueEsthetique, VueGalerieExposition, VueGout, VueGravure, VueImageDepuisAudio, VuePochette, VueRenduImage, VueTraceCourbe, VueVexFlow, VueVuMetre } from "./vues-images";
import { VueDemonstration, VueFilmApplication, VueModifierTexte, VueSortieTexte, VueSourceTexte } from "./vues-texte";
import { VueCarteSonore, VueCoordonneesSurCarte, VueCourbe } from "./vues-cartes";

// ui/vues.tsx — Vues de nœud spécifiques + registre (extension UI).
// Découple le renderer générique (AtelierNode) des UI propres à certains nœuds.
// Une vue reçoit { id, data, def } et se rend sous l'en-tête du nœud. Le registre
// associe un id (ou un prédicat) à une ou plusieurs vues, avec une position
// « avant » ou « après » le lecteur audio générique.
//
// Point d'extension multi-domaines (cf. ARCHITECTURE.md §11) : un autre domaine
// enregistre ici ses propres vues (aperçu image, grille de données, éditeur…)
// sans toucher au renderer.

/** Le tampon d'un nœud s'il a plus de deux canaux : son aperçu est alors un repliement, pas le fichier. */
export const tamponMulticanal = (b: unknown): AudioBuffer | null =>
  typeof AudioBuffer !== "undefined" && b instanceof AudioBuffer && b.numberOfChannels > 2 ? b : null;

export interface VueProps {
  id: string;
  data: DonneesNoeud;
  def?: FicheAudio;
}

// ── Plusieurs pistes sur un axe commun ──
// Le nœud pose leurs enveloppes sur lui-même à l'exécution : la vue ne recalcule rien et ne retient
// aucun son. Voir `plugins/visualiseur-multipiste.ts` et `audio/pistes-visu.ts`.
type Vue = (props: VueProps) => ReactNode;
/**
 * Une vue du registre.
 *
 * `porteLecteur` DIT QUE CETTE VUE DONNE DEJA UN MOYEN D'ECOUTER. Le noeud pose un lecteur audio
 * generique sous ses vues ; il le retire quand l'une d'elles porte le sien, sans quoi il y en
 * aurait deux. La regle se lisait auparavant sur la seule PRESENCE d'une vue « avant », au motif
 * qu'une vue custom gere l'audio : c'etait faux pour la plupart d'entre elles, et huit generateurs
 * fabriquaient un son que rien ne permettait d'entendre dans le composant. Le fait se declare donc
 * ici plutot que de se deviner.
 */
interface EntreeRegistre {
  correspond: (ficheId: string) => boolean;
  vue: Vue;
  position: "avant" | "apres";
  masqueMessage?: boolean;
  porteLecteur?: boolean;
}
const parId = (...ids: string[]) => (f: string) => ids.includes(f);

const REGISTRE: EntreeRegistre[] = [
  // Enregistreur et entrée micro : la logique d'enregistrement est dans l'inspecteur,
  // pas dans une vue avant (évite le décalage du handle de sortie).
  { correspond: parId("generateur-courbe", "suiveur-caracteristique"), vue: VueCourbe, position: "avant" },
  // L'arbre rythmique se dessine : la notation en listes reste la source de verite, la vue l'ecrit.
  { correspond: parId("arbre-rythmique"), vue: ArbreRythmiqueVue, position: "avant" },
  { correspond: parId("visualiseur-forme-onde"), vue: VueFormeOnde, position: "avant" },
  // Aucun lecteur à déclarer : ce nœud ne rend pas de son, et n'en propose donc pas l'écoute.
  { correspond: parId("visualiseur-multipiste"), vue: VuePistesMultiples, position: "avant" },
  { correspond: parId("rouleau-sequence"), vue: RouleauSequence, position: "avant" },
  // Les cercles se cliquent : la vue est l'editeur, et le motif qu'elle ecrit vit dans un reglage.
  { correspond: parId("cercle-rythmique"), vue: CercleRythmiqueVue, position: "avant" },
  { correspond: parId("cercle-melodique"), vue: CercleMelodiqueVue, position: "avant" },
  // Le film se regarde ici ; le MP4 produit s'enregistre par le bouton de la vue elle-même.
  { correspond: parId("montage-video"), vue: VueMontageVideo, position: "avant" },
  { correspond: parId("extrait-video"), vue: VueExtraitVideo, position: "avant" },
  // Après le lecteur : le son rendu garde le lecteur commun, la vidéo muette s'enregistre en dessous.
  { correspond: parId("separer-image-son"), vue: VueVideoMuette, position: "apres" },
  { correspond: parId("selecteur-multi-zones"), vue: VueSelecteurMultiZones, position: "avant" },
  // LA LIGNE DE TEMPS PORTE LE LECTEUR, donc le nœud n'en pose pas un second : la tête de lecture ne
  // saurait pas lequel suivre, et deux jeux de commandes pour un même son se contrediraient.
  { correspond: parId("montage", "maquette"), vue: VueMontage, position: "avant", porteLecteur: true },
  { correspond: parId("analyseur-spectre"), vue: VueSpectre, position: "avant" },
  { correspond: parId("spectrogramme"), vue: VueSpectrogramme, position: "avant" },
  { correspond: parId("oscillateur"), vue: VueOscillo, position: "avant" },
  { correspond: parId("reponse-filtre"), vue: VueReponseFiltre, position: "avant" },
  { correspond: parId("comparateur-ab"), vue: VueComparateurAB, position: "avant" },
  { correspond: parId("sequenceur-batterie-avance"), vue: VueSequenceurBatterieAvance, position: "avant" },
  { correspond: parId("sequenceur-melodique"), vue: VueSequenceurMelodique, position: "avant" },
  { correspond: parId("sequenceur-accords"), vue: VueSequenceurAccords, position: "avant" },
  { correspond: parId("generateur-audio-mathematique", "formule-echantillons", "formule-spectrale"), vue: EditeurFormule, position: "avant" },
  { correspond: parId("enveloppe-adsr"), vue: VueADSR, position: "avant" },
  { correspond: parId("noms-instruments"), vue: VueNomsInstruments, position: "avant" },
  { correspond: parId("styles-musicaux"), vue: VueStylesMusicaux, position: "avant" },
  { correspond: parId("emotions"), vue: VueEmotions, position: "avant" },
  { correspond: parId("tessitures-voix"), vue: VueTessituresVoix, position: "avant" },
  { correspond: parId("generateur-script-ia"), vue: VueGenerateurScriptIA, position: "avant" },
  { correspond: parId("couleur-suno-ia"), vue: VueCouleurSunoIA, position: "avant" },
  { correspond: parId("detecteur-accords"), vue: VueDetecteurAccords, position: "avant", masqueMessage: true },
  { correspond: parId("vu-metre"), vue: VueVuMetre, position: "avant" },
  { correspond: parId("score-esthetique"), vue: VueEsthetique, position: "avant" },
  { correspond: parId("comparaison-esthetique"), vue: VueComparaisonEsth, position: "avant" },
  { correspond: parId("colorsynth"), vue: VueColorSynth, position: "avant" },
  { correspond: parId("generateur-pochette"), vue: VuePochette, position: "avant" },
  { correspond: parId("visualisation-songsee"), vue: VueImageDepuisAudio, position: "avant" },
  { correspond: parId("goniometre"), vue: VueImageDepuisAudio, position: "avant" },
  { correspond: parId("visualiseur-courbe"), vue: VueTraceCourbe, position: "avant" },
  { correspond: parId("attracteur-ifs"), vue: VueAttracteurIFS, position: "avant" },
  { correspond: parId("cercle-pulsant"), vue: VueAnimationSvg, position: "avant", porteLecteur: true },
  // Le film n'a aucun port : cette vue est le seul endroit où on le voit et d'où on l'écrit.
  { correspond: parId("cercle-film"), vue: VueFilmCercle, position: "avant" },
  { correspond: (f) => f === "gout-du-son" || f === "parfum-motif" || f === "accord-mets-musique", vue: VueGout, position: "avant" },
  { correspond: parId("rendu-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("camelot"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("texte-image"), vue: VueRenduImage, position: "avant" },
  { correspond: (f) => f.startsWith("vexflow-"), vue: VueVexFlow, position: "avant", masqueMessage: true },
  { correspond: parId("partition-verovio"), vue: VueGravure, position: "avant" },
  { correspond: parId("galerie-exposition"), vue: VueGalerieExposition, position: "avant" },
  { correspond: parId("carte-sonore"), vue: VueCarteSonore, position: "avant" },
  { correspond: parId("coordonnees-sur-carte"), vue: VueCoordonneesSurCarte, position: "avant" },
  { correspond: parId("gestion-nodes"), vue: VueGestionNodes, position: "avant" },
  { correspond: parId("python-processor"), vue: VuePythonProcessor, position: "avant" },
  { correspond: parId("julia-processor"), vue: VueJuliaProcessor, position: "avant" },
  { correspond: parId("source-texte"), vue: VueSourceTexte, position: "avant" },
  { correspond: parId("sortie-texte"), vue: VueSortieTexte, position: "avant", masqueMessage: true },
  { correspond: parId("modifier-texte"), vue: VueModifierTexte, position: "avant" },
  { correspond: parId("demonstration"), vue: VueDemonstration, position: "apres" },
  { correspond: parId("film-application"), vue: VueFilmApplication, position: "apres" },
  { correspond: parId("entree-audio", "sampler-personnalise"), vue: VueUploadAudio, position: "avant", porteLecteur: true },
  { correspond: parId("entree-image"), vue: VueUploadImage, position: "avant" },
  { correspond: parId("entree-image"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueUploadSvg, position: "avant" },
  { correspond: parId("lecteur-svg"), vue: VueRenduImage, position: "avant" },
  { correspond: parId("entree-pdf"), vue: VueUploadPdf, position: "avant" },
  { correspond: parId("explorateur-musique"), vue: VueExplorateur, position: "avant", porteLecteur: true },
  { correspond: parId("lecteur-midi"), vue: VueUploadMidi, position: "avant" },
  { correspond: parId("lecteur-midi"), vue: VueSoundFont, position: "avant" },
  { correspond: parId("transcripteur-midi"), vue: VueTranscription, position: "avant" },
  { correspond: parId("classificateur-genre", "separateur-ia"), vue: VueUploadOnnx, position: "avant" },
  { correspond: parId("reverbe-convolution"), vue: VueUploadIR, position: "apres" },
  { correspond: parId("pure-data"), vue: VueUploadPd, position: "avant" },
  { correspond: (f) => f.startsWith("collection-") && f !== "collection-lecteur-musique", vue: VueCollections, position: "apres" },
  { correspond: parId("collection-lecteur-musique"), vue: VueLecteurMusique, position: "apres" },
  { correspond: parId("sortie-audio", "sortie-midi", "convertisseur-audio", "convertisseur-mp3-wav"), vue: VueExport, position: "apres" },
  { correspond: parId("clavier-melodie"), vue: ClavierMelodie, position: "apres" },
  { correspond: parId("clavier-sfz"), vue: ClavierSfz, position: "apres" },
  { correspond: parId("banque-sfz"), vue: VueBanqueSfz, position: "apres" },
  { correspond: parId("orchestre-csound"), vue: VueOrchestreCsound, position: "apres" },
  { correspond: parId("clavier-apprentissage"), vue: VueApprentissage, position: "apres" },
  { correspond: parId("quiz"), vue: Quiz, position: "avant" },
  { correspond: parId("parcours"), vue: Parcours, position: "avant" },
];

/**
 * L'identifiant sous lequel chercher une vue.
 *
 * UN NOEUD PEUT PORTER UN ANCIEN IDENTIFIANT. Le registre resout les alias — « sequenceur-batterie »
 * ouvre « sequenceur-batterie-avance » —, mais les vues etaient cherchees sur l'identifiant BRUT des
 * donnees du noeud. Un graphe enregistre s'ouvrait donc sur la bonne fiche, avec le bon titre et la
 * bonne execution, mais SANS SA GRILLE : plus rien a cliquer, et aucune erreur pour le dire.
 * Constate dans l'application en verifiant la suppression du sequenceur binaire.
 */
const idPourVue = (ficheId: string): string => registre.trouverDef(ficheId)?.id ?? ficheId;

export function vuesPourNoeud(ficheId: string, position: "avant" | "apres"): Vue[] {
  const id = idPourVue(ficheId);
  return REGISTRE.filter((e) => e.position === position && e.correspond(id)).map((e) => e.vue);
}

/** Une vue « avant » de ce composant donne-t-elle deja un moyen d'ecouter ? */
export function vueAvantPorteLecteur(ficheId: string): boolean {
  return REGISTRE.some((e) => e.position === "avant" && e.porteLecteur === true && e.correspond(ficheId));
}

export function vueAvantMasqueMessage(ficheId: string): boolean {
  const id = idPourVue(ficheId);
  return REGISTRE.some((e) => e.position === "avant" && e.correspond(id) && e.masqueMessage);
}

