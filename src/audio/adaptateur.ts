// audio/adaptateur.ts — Adaptateur du domaine audio.
//
// Crée un registre typé, enregistre les types de flux audio + toutes les fiches
// de plugins, et configure les modules du cœur qui ont besoin du registre
// (metastore, nodes-installes, registre-actif).
//
// C'est le SEUL endroit où `enregistrer()` est appelé. Importer un module de
// plugin n'a plus d'effet de bord — les fiches sont exportées, pas enregistrées.
import { creerRegistre, ecartsDeType, type Registre } from "../core";
import { configurerRegistre as configurerRegistreMeta } from "../core/metastore";
import { configurerServicesDomaine } from "../core/services-domaine";
import { configurerRegistreNodes } from "../core/nodes-installes";
import { configurerRegistreGestion } from "../plugins/gestion-nodes";
import { configurerRegistreQuiz } from "../plugins/quiz";
import { toutesLesFiches } from "../plugins";
import type { ValeurAudio, RuntimeAudio } from "./types-domaine";
import { frequenceDeTravail, frequenceDuProjet, publierFrequenceDeTravail } from "./frequence-de-travail";
import { contenusControleCompatibles } from "./sous-types-controle";
import { contenusTexteCompatibles } from "./sous-types-texte";
// ═══ CE QU'UNE VALEUR DOIT ÊTRE POUR CIRCULER SUR SON PORT ═══
//
// Point 6 d'une revue du dépôt : rien ne vérifiait, à l'exécution, qu'une valeur correspond au type
// de son port. Un composant qui déclare une sortie audio pouvait rendre n'importe quoi.
//
// CES PRÉDICATS NE SONT PAS ÉCRITS POUR L'OCCASION : le domaine les avait déjà, et s'en servait.
// `estCourbe` décide si une courbe se dessine, `estObjet` si un objet se rend, `estSequence` si des
// notes se lisent, `estCercle` si un cercle s'affiche. Les réemployer donne UNE source de vérité par
// type ; en écrire d'autres ici aurait fait deux définitions qui auraient fini par se séparer.
import { estCourbe } from "./courbe";
import { estObjet } from "./multicanal";
import { estCercle } from "./cercle";
import { estSequence } from "./sequence";

export const registre = creerRegistre<ValeurAudio, RuntimeAudio>();

// LE REGISTRE EST JOIGNABLE DEPUIS LA PAGE, pour les épreuves de bout en bout et pour elles seules.
// C'est ce qui permet à `tests-e2e/types-au-port.spec.ts` de DÉSARMER un prédicat et de vérifier que
// la console se met à parler : sans cela, le silence du garde ne prouverait rien — un moteur qui
// n'appellerait pas la vérification rendrait exactement le même vide.
//
// ET LA RÈGLE AVEC LUI, plutôt que recopiée dans le banc. Le banc tourne DANS LA PAGE, par
// `page.evaluate`, et ne peut donc pas importer un module : sans ce point d'accès, il aurait fallu
// réécrire chez lui les cinq lignes de `ecartsDeType`. Deux écritures d'une règle finissent toujours
// par se séparer — c'est ce que ce dépôt répète, et il l'a payé assez souvent.
if (typeof window !== "undefined") {
  const g = window as unknown as { __attic_registre__?: unknown; __attic_ecarts_de_type__?: unknown };
  g.__attic_registre__ = registre;
  g.__attic_ecarts_de_type__ = ecartsDeType;
}

// Types de flux du domaine audio (dans le registre, pas dans un global)
  registre.enregistrerTypeFlux({ id: "audio", couleur: "#2a9d8f", libelle: "Audio",
    estDuType: (v) => typeof AudioBuffer !== "undefined" && v instanceof AudioBuffer });
  // GRIS NEUTRE, PARCE QU'UN NŒUD-FRONTIÈRE N'A PAS DE TYPE À LUI. Il marque, à l'intérieur d'un
  // méta-composant, l'endroit où un port sera exposé ; ce port prend le type du port interne auquel
  // la frontière se relie. Ses deux blocs étaient déclarés « audio », si bien qu'ils s'affichaient
  // en vert quoi qu'on y branche : on croyait y lire un type, et c'était toujours le même.
  registre.enregistrerTypeFlux({ id: "frontiere", couleur: "#8a8f98", libelle: "Port exposé" });
  registre.enregistrerTypeFlux({ id: "midi", couleur: "#e9a13b", libelle: "MIDI" });
  // LE CONTRÔLE PORTE DES CONTENUS LUI AUSSI, et pour la même raison que le texte : ses vingt-six
  // ports transportent une durée, des zones, un tempo ou un profil de bruit, et brancher un tempo
  // sur une entrée de zones était licite. La règle vit dans `sous-types-controle.ts`, avec le
  // relevé qui a décidé des quatre.
  registre.enregistrerTypeFlux({
    id: "controle", couleur: "#e8590c", libelle: "Contrôle",
    sousTypesCompatibles: contenusControleCompatibles,
  });
  // LE TEXTE PORTE DES CONTENUS, et c'est le seul flux qui en déclare : une notation, un ABC et un
  // prompt sont tous du texte, et les brancher l'un sur l'autre ne veut rien dire. La règle vit
  // dans `sous-types-texte.ts`, avec le relevé qui a décidé des trois.
  registre.enregistrerTypeFlux({
    id: "texte", couleur: "#36a2eb", libelle: "Texte",
    sousTypesCompatibles: contenusTexteCompatibles,
    estDuType: (v) => typeof v === "string",
  });
  // ═══ LES TYPES QUI NE DÉCLARENT PAS DE PRÉDICAT, ET POURQUOI CHACUN ═══
  //
  // LE SILENCE EST LE DÉFAUT, et il est volontaire : un prédicat FAUX crierait sur des composants
  // corrects, on apprendrait à ne plus le lire, et le jour où il dirait vrai personne ne
  // l'entendrait. On n'en déclare donc un qu'après avoir MESURÉ ce qui circule.
  //
  //   · `frontiere` n'a pas de type à lui — il prend celui du port auquel il se relie —, et
  //     `types-au-port.ts` l'écarte explicitement pour cette raison.
  //   · `controle` transporte vingt-six contenus différents : une durée, des zones, un tempo, un
  //     profil de bruit. C'est `sous-types-controle.ts` qui les départage, par SOUS-TYPE ; un
  //     prédicat unique sur le type ne pourrait que tout accepter.
  //   · `fichier`, `image`, `midi`, `video` portent des `File`, des `Blob`, parfois un tableau
  //     d'octets selon le producteur. Les quatre demandent un relevé avant d'être déclarés : c'est
  //     exactement là qu'un prédicat trop serré ferait du bruit.
  //   · `banque`, `accordage` et `spectrogramme` n'ont pas de prédicat dans le domaine aujourd'hui,
  //     et je n'en écris pas au jugé.
  registre.enregistrerTypeFlux({ id: "fichier", couleur: "#999", libelle: "Fichier" });
  registre.enregistrerTypeFlux({ id: "image", couleur: "#d63384", libelle: "Image" });
  registre.enregistrerTypeFlux({ id: "courbe", couleur: "#b06fe0", libelle: "Courbe", estDuType: estCourbe });
  // ORANGE FRANC, et non plus l'ambre #c99a2e : mesurée dans Lab, sa distance au MIDI (#e9a13b)
  // n'était que de 11,9 ΔE — deux tuyaux qu'on ne distingue pas d'un coup d'œil, et c'est ce qui a
  // été remonté. Celle-ci en est à 22,3 tout en restant à 24,2 du « Contrôle » (#e8590c), l'autre
  // orange de la palette : c'est le meilleur compromis mesuré entre les deux voisines.
  registre.enregistrerTypeFlux({ id: "banque", couleur: "#fb8c00", libelle: "Banque" });
  // VERT TILLEUL, la seule teinte que la palette n'occupait pas encore : un objet sonore n'est pas de
  // l'audio — il porte un son ET sa trajectoire, sans salle —, et il ne doit pouvoir se brancher que
  // sur un rendu d'objets. Un type distinct l'impose ; le teinter comme l'audio inviterait à l'erreur.
  registre.enregistrerTypeFlux({ id: "objet", couleur: "#82c91e", libelle: "Objet", estDuType: estObjet });
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
  registre.enregistrerTypeFlux({ id: "sequence", couleur: "#8b5a2b", libelle: "Séquence", estDuType: estSequence });
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
  registre.enregistrerTypeFlux({ id: "cercle", couleur: "#ffffff", libelle: "Cercle", estDuType: estCercle });
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
  // JAUNE FRANC ET POINT EN LOSANGE, les deux choisis par la mesure.
  //
  // LA COULEUR : la palette ne portait AUCUN jaune pur — l'ambre du MIDI, les deux oranges, et plus
  // rien entre eux et le vert. Mesuré comme les trois précédentes, #f2d600 est à 37,7 ΔE de sa plus
  // proche voisine, l'ambre du MIDI, là où le seuil du garde est à 18. C'est la deuxième plus grande
  // marge de la palette.
  //
  // ET LA DISTANCE AU FOND DU CANEVAS A COMPTÉ AUTANT, parce que Fabien l'a déjà relevée pour le
  // cercle : « un câble d'un pixel et demi de large ne montre pas sa couleur ». Sur le #0f0b17 du
  // canevas, ce jaune est à 123,3 ΔE — plus clair que tout ce que la palette porte, le vert tilleul
  // de l'objet compris. Le marine qui gagnait sur le premier critère, à 39,3, n'était qu'à 53,3 du
  // fond, soit plus sombre que la plus sombre des quatorze : il a été écarté pour cela.
  //
  // LE LOSANGE est la troisième forme, et la dernière libre. Un accordage n'est ni du son ni une
  // courbe : c'est une RÈGLE qu'on applique à des hauteurs, et rien d'autre ne s'y branche. La forme
  // le dit d'un coup d'œil, comme le carré dit qu'un spectrogramme ne s'entend pas.
  //
  // « ACCORDAGE » ET NON « ACCORD », ET LE MOT A ÉTÉ PESÉ. `accord` est pris deux fois dans ce
  // dépôt — l'empilement de notes de `audio/accords.ts` et de « Grille d'accords », et le désaccord
  // en cents d'une zone d'échantillonneur, `zone.accord`. Un port « Accord » voisin d'une « Grille
  // d'accords » aurait été à relire deux fois. « Accordage » est le mot du facteur d'instruments, et
  // il est libre ici à une occurrence près, l'étiquette d'une tablature, qui désigne la même chose.
  registre.enregistrerTypeFlux({ id: "accordage", couleur: "#f2d600", forme: "losange", libelle: "Accordage" });

// Enregistrer toutes les fiches de plugins
for (const fiche of toutesLesFiches) {
  registre.enregistrer(fiche);
}

// ET FIGER CE SOCLE, ICI ET NULLE PART AILLEURS. C'est le seul endroit où `enregistrer()` est
// appelé pour le domaine ; l'instant qui suit cette boucle est donc exactement celui où « natif »
// a un sens. Tout ce qui s'inscrira ensuite — un nœud installé depuis un `.zip` partagé, un
// méta-composant porté par un projet reçu — ne pourra plus prendre la place d'un de ces
// identifiants. Relevé le 2026-10-25 : `enregistrer` les remplaçait en silence, de sorte qu'un
// composant reçu pouvait garder le nom, l'icône et la place d'un composant du socle.
registre.figerLesNatifs();

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
  // LA FRÉQUENCE DE TRAVAIL APPARTIENT AU FICHIER DE PROJET, et c'est le seul réglage de domaine qui
  // y voyage aujourd'hui. Sans cela le même projet rendrait un autre son demain, ou sur une autre
  // machine — mesuré, deux des cinq graphes livrés rendaient à deux fréquences selon la carte son.
  // La sauvegarde, elle, n'a pas à savoir ce qu'est une fréquence : voir `core/services-domaine.ts`.
  reglagesDeProjet: () => ({ frequenceDeTravail: frequenceDeTravail() }),
  appliquerReglagesDeProjet: (json) => publierFrequenceDeTravail(frequenceDuProjet(json)),

  // ═══ CE QUI TRAVERSE LA FRONTIÈRE D'UN CADRE ISOLÉ, ET CE QUI NE PEUT PAS ═══
  //
  // `postMessage` clone par l'algorithme du langage : les nombres, les chaînes, les objets simples
  // et les tableaux typés passent ; un `AudioBuffer` NON. Ses canaux, eux, sont des `Float32Array`.
  // On le démonte donc à l'aller et on le remonte au retour, ce qui est exactement ce que font
  // déjà les treize workers du dépôt.
  //
  // ET CE QUI NE PEUT PAS TRAVERSER SE DIT, au lieu de laisser le cadre échouer sans raison : une
  // valeur qu'aucune des deux règles ne couvre est refusée avec son type, et c'est l'appelant qui
  // en fait un message de nœud.
  versTransport: (valeur) => {
    if (typeof AudioBuffer !== "undefined" && valeur instanceof AudioBuffer) {
      const canaux: Float32Array[] = [];
      for (let c = 0; c < valeur.numberOfChannels; c++) canaux.push(new Float32Array(valeur.getChannelData(c)));
      // CES CANAUX SONT DES COPIES NEUVES, et c'est ce qui permet de les TRANSFÉRER : le tampon
      // d'origine garde sa mémoire, et le cadre reçoit celle-ci sans la recopier. Une heure de
      // stéréo pèse 1,27 Go, et le clonage en faisait une seconde copie à chaque run.
      return {
        ok: true, valeur: { __audio: true, canaux, frequence: valeur.sampleRate },
        transferables: canaux.map((c) => c.buffer as ArrayBuffer),
      };
    }
    if (valeur === null || valeur === undefined) return { ok: true, valeur };
    const t = typeof valeur;
    if (t === "number" || t === "string" || t === "boolean") return { ok: true, valeur };
    if (ArrayBuffer.isView(valeur) || valeur instanceof ArrayBuffer) return { ok: true, valeur };
    if (t === "object") {
      // UN OBJET SIMPLE PASSE, un objet à prototype non. Un `File` ou une `Map` se cloneraient,
      // mais leur sens de ce côté-ci n'est pas garanti : on préfère refuser et le dire.
      const proto = Object.getPrototypeOf(valeur as object);
      if (proto === Object.prototype || proto === null || Array.isArray(valeur)) return { ok: true, valeur };
    }
    return { ok: false, pourquoi: (valeur as object)?.constructor?.name ?? t };
  },

  depuisTransport: (valeur) => {
    const v = valeur as { __audio?: boolean; canaux?: Float32Array[]; frequence?: number };
    if (!v || typeof v !== "object" || !v.__audio || !Array.isArray(v.canaux)) return valeur;
    if (typeof AudioBuffer === "undefined") return valeur;
    const b = new AudioBuffer({
      numberOfChannels: Math.max(1, v.canaux.length),
      length: Math.max(1, v.canaux[0]?.length ?? 1),
      // LA FRÉQUENCE DE REPLI EST CELLE DU PROJET, et non 44 100 en dur : un tampon remonté sans
      // la sienne doit rejoindre l'invariant du moteur, pas une constante. Un garde refuse ce
      // 44 100-là, et il a eu raison de le refuser ici.
      sampleRate: v.frequence || frequenceDeTravail(),
    });
    for (let c = 0; c < v.canaux.length; c++) b.getChannelData(c).set(v.canaux[c]);
    return b;
  },
});

