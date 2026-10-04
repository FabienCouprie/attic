// vues-domaine/vues.tsx — CE QUE LE DOMAINE AUDIO DÉCLARE AU REGISTRE DES VUES.
//
// CE FICHIER N'EST PLUS UN MODULE QUE LE SHELL IMPORTE, et c'est le renversement qui nomme la
// frontière. Il mêlait deux choses : la mécanique d'un registre de vues — ce qu'est une vue, ce que
// « avant » et « après » veulent dire, comment on en trouve une — et la liste ci-dessous, qui nomme
// des identifiants de composants AUDIO, avec les modules de vues qui vont avec.
//
// LE COMPTE SE LIT SUR LE FICHIER, et nulle part ailleurs : **81 entrées**, nommant 85 identifiants
// de composants — un composant peut porter plusieurs identifiants, par alias —, et **21 modules de
// vues** importés ci-dessous. Ces chiffres sont ceux de ce fichier-ci : ils ne sont pas recopiés dans
// une seconde liste, parce qu'une liste recopiée vieillit.
//
// Le shell importait ce fichier pour sa mécanique et recevait le domaine avec : `AtelierNode`
// chargeait les vingt-et-un modules, et un domaine d'images aurait hérité d'un registre parlant de
// clavier SFZ.
//
// La mécanique vit désormais dans `ui/registre-vues.ts`, vide par défaut. Ce fichier-ci ne fait plus
// qu'une chose : APPELER `declarerVues` avec ce que l'audio a à montrer. Son import a donc un effet
// de bord, et c'est la racine de composition (`src/composition.ts`) qui le déclenche.
//
// Point d'extension multi-domaines (cf. ARCHITECTURE.md §11) : un autre domaine écrit son propre
// fichier de déclaration et le fait importer par sa racine de composition. Ni `registre-vues.ts` ni
// `AtelierNode.tsx` ne bougent.

import { Quiz } from "./Quiz";
import { Parcours } from "./Parcours";
import { EditeurFormule } from "./EditeurFormule";

import { ArbreRythmiqueVue } from "./ArbreRythmiqueVue";
import { RouleauSequence } from "./RouleauSequence";
import { CercleRetoucheVue } from "./CercleRetoucheVue";
import { CercleGammeVue } from "./CercleGammeVue";
import { CercleMelodiqueVue, CercleRythmiqueVue } from "./CercleVue";
import { VueExtraitVideo, VueFilmCercle, VueMontageVideo, VuePistesMultiples, VueVideoMuette } from "./vues-video";
import { VueMontage } from "./vues-montage";
import { VueFormeOnde, VueSelecteurMultiZones, VueUploadAudio, VueUploadImage, VueUploadPdf, VueUploadSvg } from "./vues-fichiers";
import { VueExplorateur } from "./vues-explorateur";
import { VueLecteurMusique } from "./vues-lecteur";
import { VueTranscription, VueUploadIR, VueUploadMidi, VueUploadOnnx, VueUploadPd } from "./vues-midi";
import { VueCollections, VueExport } from "./vues-collections";
import { ClavierMelodie, ClavierSfz, VueApprentissage, VueBanqueSfz, VueOrchestreCsound } from "./vues-claviers";
import { VueADSR, VueComparateurAB, VueDetecteurAccords, VueEmotions, VueGenerateurScriptIA, VueNomsInstruments, VueOscillo, VueReponseFiltre, VueSequenceurAccords, VueSequenceurBatterieAvance, VueSequenceurMelodique, VueSpectre, VueSpectrogramme, VueStylesMusicaux, VueTessituresVoix } from "./vues-analyse";
import { VueGestionNodes, VueJuliaProcessor, VuePythonProcessor } from "./vues-code";
import { VueAnimationSvg, VueAttracteurIFS, VueColorSynth, VueComparaisonEsth, VueCouleurSunoIA, VueEsthetique, VueGalerieExposition, VueGout, VueGravure, VueImageDepuisAudio, VuePochette, VueRenduImage, VueTraceCourbe, VueVexFlow, VueVuMetre } from "./vues-images";
import { VueDemonstration, VueFilmApplication, VueModifierTexte, VueSortieTexte, VueSourceTexte } from "./vues-texte";
import { VueCarteSonore, VueCoordonneesSurCarte, VueCourbe } from "./vues-cartes";
import { declarerVues, parId } from "../ui/registre-vues";

// ── Plusieurs pistes sur un axe commun ──
// Le nœud pose leurs enveloppes sur lui-même à l'exécution : la vue ne recalcule rien et ne retient
// aucun son. Voir `plugins/visualiseur-multipiste.ts` et `audio/pistes-visu.ts`.

declarerVues([
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
  // Celui-ci montre le cercle qu'il a RECU, et non un cercle deduit de ses reglages : il le tient
  // du canal `designe`, dont un changement de reglage ne perime pas le contenu. Sans cela, le clic
  // qui allume une place effacerait le dessin qu'on est en train de cliquer.
  { correspond: parId("cercle-retouche"), vue: CercleRetoucheVue, position: "avant" },
  // Et celui-ci montre le cercle qu'il a PRODUIT de ses réglages : il ne se clique donc pas, une
  // retouche écrirait par-dessus ce que la gamme nommée dit.
  { correspond: parId("cercle-gamme"), vue: CercleGammeVue, position: "avant" },
  // Le film se regarde ici ; le MP4 produit s'enregistre par le bouton de la vue elle-même.
  { correspond: parId("montage-video"), vue: VueMontageVideo, position: "avant" },
  { correspond: parId("extrait-video"), vue: VueExtraitVideo, position: "avant" },
  // Après le lecteur : le son rendu garde le lecteur commun, la vidéo muette s'enregistre en dessous.
  { correspond: parId("separer-image-son"), vue: VueVideoMuette, position: "apres" },
  // L'ONDE PORTE LE LECTEUR, donc le nœud n'en pose pas un second — relevé par Fabien : « le
  // sélecteur multizone a un deuxième lecteur, le sien, et un lecteur classique supplémentaire ».
  // Le sien est le bon : son bouton, son compteur et sa tête de lecture vivent sur l'onde, où se
  // tracent les zones, et l'on y cherche un instant en cliquant le dessin plutôt qu'une réglette.
  { correspond: parId("selecteur-multi-zones"), vue: VueSelecteurMultiZones, position: "avant", porteLecteur: true },
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
]);

