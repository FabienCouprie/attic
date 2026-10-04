// audio/adaptateur.ts — Adaptateur du domaine audio.
//
// Crée un registre typé, enregistre les types de flux audio + toutes les fiches
// de plugins, et configure les modules du cœur qui ont besoin du registre
// (metastore, nodes-installes, registre-actif).
//
// C'est le SEUL endroit où `enregistrer()` est appelé. Importer un module de
// plugin n'a plus d'effet de bord — les fiches sont exportées, pas enregistrées.
import { creerRegistre, type Registre } from "../core";
import { configurerRegistre as configurerRegistreMeta } from "../core/metastore";
import { configurerServicesDomaine } from "../core/services-domaine";
import { configurerRegistreNodes } from "../core/nodes-installes";
import { configurerRegistreGestion } from "../plugins/gestion-nodes";
import { configurerRegistreQuiz } from "../plugins/quiz";
import { toutesLesFiches } from "../plugins";
import type { ValeurAudio, RuntimeAudio } from "./types-domaine";

export const registre = creerRegistre<ValeurAudio, RuntimeAudio>();

// Types de flux du domaine audio (dans le registre, pas dans un global)
  registre.enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f", libelle: "Audio" });
  // GRIS NEUTRE, PARCE QU'UN NŒUD-FRONTIÈRE N'A PAS DE TYPE À LUI. Il marque, à l'intérieur d'un
  // méta-composant, l'endroit où un port sera exposé ; ce port prend le type du port interne auquel
  // la frontière se relie. Ses deux blocs étaient déclarés « audio », si bien qu'ils s'affichaient
  // en vert quoi qu'on y branche : on croyait y lire un type, et c'était toujours le même.
  registre.enregistrerTypeFlux({ id: "frontiere", couleur: "#8a8f98", libelle: "Port exposé" });
  registre.enregistrerTypeFlux({ id: "midi", couleur: "#e9a13b", libelle: "MIDI" });
  registre.enregistrerTypeFlux({ id: "controle", couleur: "#e8590c", libelle: "Contrôle" });
  registre.enregistrerTypeFlux({ id: "texte", couleur: "#36a2eb", libelle: "Texte" });
  registre.enregistrerTypeFlux({ id: "fichier", couleur: "#999", libelle: "Fichier" });
  registre.enregistrerTypeFlux({ id: "image", couleur: "#d63384", libelle: "Image" });
  registre.enregistrerTypeFlux({ id: "courbe", couleur: "#b06fe0", libelle: "Courbe" });
  // ORANGE FRANC, et non plus l'ambre #c99a2e : mesurée dans Lab, sa distance au MIDI (#e9a13b)
  // n'était que de 11,9 ΔE — deux tuyaux qu'on ne distingue pas d'un coup d'œil, et c'est ce qui a
  // été remonté. Celle-ci en est à 22,3 tout en restant à 24,2 du « Contrôle » (#e8590c), l'autre
  // orange de la palette : c'est le meilleur compromis mesuré entre les deux voisines.
  registre.enregistrerTypeFlux({ id: "banque", couleur: "#fb8c00", libelle: "Banque" });
  // VERT TILLEUL, la seule teinte que la palette n'occupait pas encore : un objet sonore n'est pas de
  // l'audio — il porte un son ET sa trajectoire, sans salle —, et il ne doit pouvoir se brancher que
  // sur un rendu d'objets. Un type distinct l'impose ; le teinter comme l'audio inviterait à l'erreur.
  registre.enregistrerTypeFlux({ id: "objet", couleur: "#82c91e", libelle: "Objet" });
  // CORAIL CLAIR, choisi par la mesure et non au jugé : sa distance en Lab à la couleur la plus
  // proche de la palette, le rose de l'image (#d63384), est de 40,5 ΔE, et toutes les autres sont
  // au-delà. C'était le meilleur des treize candidats essayés, le suivant étant à 38,7. Un film
  // n'est ni un fichier quelconque ni une image : il porte une durée, et un port qui le dit permet
  // enfin de brancher une sortie vidéo quelque part.
  registre.enregistrerTypeFlux({ id: "video", couleur: "#ff8787", libelle: "Vidéo" });
  // SÉPIA, et c'est la seule famille de teintes que la palette n'occupait pas : dix couleurs y
  // sont posées, du turquoise au corail, aucune n'est brune. Mesurée comme les deux précédentes,
  // en Lab : sa distance à la plus proche des dix, l'ambre du MIDI, est de 39,1 ΔE, la deuxième
  // étant à 42,6 — là où le dépôt a accepté 22,3 pour la banque. Et 69,2 ΔE du fond du canevas,
  // #0a1a40, quand la moins détachée des dix en est à 58,9 : les indigos d'encre tombaient tous
  // sous ce seuil et disparaissaient sur le bleu nuit.
  //
  // UN PORT QUI PORTE DES NOTES ET NON UN FICHIER. Le type « midi » transporte un `.mid`, dont le
  // numéro de note est un octet : une hauteur qui ne tombe pas sur un demi-ton n'y survit pas.
  // Voir `audio/sequence.ts` pour ce que cela empêchait.
  //
  // IL S'EST APPELÉ « PARTITION » LE TEMPS D'UNE HEURE, et Fabien a relevé la collision : quatre
  // ports Csound portent déjà ce nom pour un texte au format `sco`, et deux ports homonymes de
  // deux couleurs se seraient côtoyés dans la palette. Le mot promettait en outre une notation,
  // quand ce flux n'est qu'un convoi d'événements.
  registre.enregistrerTypeFlux({ id: "sequence", couleur: "#8b5a2b", libelle: "Séquence" });
  // BLANC, DEMANDÉ PAR FABIEN, et il a raison : le bleu électrique qu'il remplaçait était à 93,5 ΔE
  // du fond du canevas sur le papier, mais un câble d'un pixel et demi de large ne montre pas sa
  // couleur comme un aplat, et du bleu sur du bleu nuit ne ressortait pas à l'œil.
  //
  // MESURÉ COMME LES QUATRE PRÉCÉDENTES. Sa distance en Lab à la plus proche des douze, le gris du
  // fichier, est de **36,8 ΔE**, et **41,1** de celui du port exposé ; le dépôt a déjà accepté
  // 22,3 pour la banque, et sa paire la plus serrée est justement ces deux gris à **6,7**. Du fond
  // du canevas il est à **93,9 ΔE**, la plus grande distance de toute la palette.
  //
  // C'EST LA SEULE COULEUR NON SATURÉE HORS DES DEUX GRIS, et c'est ce qui la rend lisible : un
  // câble blanc se voit sur un fond sombre là où une teinte, même vive, se fond dans les autres.
  //
  // UN PORT QUI PORTE UN CERCLE, ET NON DES NOTES DATÉES. Une séquence a ses temps en secondes ;
  // un cercle n'a que des places et un nombre de places. C'est ce qui permet de le tourner, de le
  // réfléchir et d'en prendre le complémentaire, toutes opérations qui perdent leur sens dès
  // qu'une attaque est datée. Voir `audio/cercle.ts`.
  registre.enregistrerTypeFlux({ id: "cercle", couleur: "#ffffff", libelle: "Cercle" });
  // LE PREMIER TYPE QUI SE DISTINGUE PAR SA FORME ET NON PAR SA COULEUR, relevé par Fabien : « les
  // ports spectrogrammes et les ports sons sont de la même couleur, très proche pour un œil humain
  // serait plus exact ; nous manquons déjà de couleur, je recommanderais tout simplement de changer
  // la forme du port ».
  //
  // IL AVAIT RAISON, ET C'EST MON INSTRUMENT QUI ME FLATTAIT. J'avais relevé 42,5 ΔE entre ce vert
  // et le turquoise de l'audio, avec la formule de 1976 — celle qu'emploient les cinq commentaires
  // ci-dessus. Reprise avec la **CIEDE2000**, qui existe précisément pour corriger la surestimation
  // des couleurs saturées, la même paire tombe à **19,0**, cinquième paire la plus serrée de toute
  // la palette. Et les écarts écrits plus haut se resserrent tous : midi/banque passe de 22,3 à
  // **8,3**, le dépôt ayant donc déjà accepté bien moins qu'il ne le croyait.
  //
  // LA COULEUR N'AVAIT DONC PLUS RIEN À DONNER, et la forme, elle, multiplie : treize couleurs par
  // trois formes au lieu d'une quatorzième teinte à trouver dans ce qui reste. Le point du port est
  // un carré ; voir `core/typesFlux.ts` et `ui/forme-port.ts`.
  //
  // LE VERT RESTE, et sa parenté avec l'audio et l'objet n'est plus un défaut : elle dit ce qu'un
  // spectrogramme est, du son regardé, et c'est la forme qui dit qu'on ne peut pas l'entendre.
  //
  // UN PORT QUI PORTE UNE MATRICE ET SON PARAMÉTRAGE. Sans ce type, chaque composant d'une chaîne
  // porterait les sept mêmes réglages d'échelle, à accorder à la main d'un bout à l'autre. Voir
  // `audio/spectrogramme-mel.ts`.
  registre.enregistrerTypeFlux({ id: "spectrogramme", couleur: "#2f9e44", forme: "carre", libelle: "Spectrogramme" });

// Enregistrer toutes les fiches de plugins
for (const fiche of toutesLesFiches) {
  registre.enregistrer(fiche);
}

// Configurer les modules du cœur avec ce registre.
//
// LES DEUX PREMIERS NE CONNAISSENT PLUS LE DOMAINE, et le transtypage le dit. `metastore` et
// `nodes-installes` déclaraient `Registre<TypeValeur, AudioContext>` : le cœur nommait donc la
// valeur ET LE RUNTIME du domaine audio. Ils fabriquent des fiches dérivées — un méta-composant, un
// node installé — dont les valeurs ne font que passer, si bien que `unknown` leur suffit. Un
// registre concret n'entre pas dans un registre générique sans qu'on le dise, `Registre` étant
// invariant en ses deux paramètres ; c'est ce que ce transtypage dit, et il reste du côté du domaine.
const commeGenerique = registre as unknown as Registre<unknown, unknown>;
configurerRegistreMeta(commeGenerique);
configurerRegistreNodes(commeGenerique);
configurerRegistreGestion(registre);
configurerRegistreQuiz(registre);

// CE QUE LE DOMAINE AUDIO RÉPOND AU CŒUR SUR SES PROPRES VALEURS.
//
// Trois endroits du cœur nommaient `AudioBuffer` en dur : l'empreinte d'une valeur, qui décide si un
// nœud doit se recalculer ; le nom d'un type, qui dit ce qu'une sauvegarde JSON va détruire ; et les
// globales prêtées à un node installé à chaud. Aucun n'avait besoin de CONNAÎTRE le domaine : chacun
// avait besoin d'une RÉPONSE. Elles sont ici.
configurerServicesDomaine({
  // Les trois nombres qui font qu'un tampon est celui-là et pas un autre. Deux sons différents de
  // mêmes dimensions ont la même empreinte, et c'est assumé : le cœur ne lit pas les échantillons.
  // La remarque est écrite en tête de `core/cache-execution.ts`.
  empreinte: (v) => (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer
    ? `AudioBuffer(${v.length},${v.sampleRate},${v.numberOfChannels})`
    : null),
  nomDeType: (v) => (typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer ? "AudioBuffer" : null),
  // Un tampon ne survit pas à `JSON.stringify` : une sauvegarde doit le dire au lieu de le perdre.
  typesNonSerialisables: ["AudioBuffer"],
  // Un node installé à chaud est du code audio : il lui faut de quoi fabriquer un tampon.
  globalesInstallees: { AudioBuffer: (typeof AudioBuffer !== "undefined" ? AudioBuffer : undefined) },
});

