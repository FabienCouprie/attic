// plugins/separateur-canaux.ts — Nœud « Séparateur canaux ».
//
// ═══ CE QU'IL FAISAIT, ET LE DÉFAUT MESURÉ ═══
//
// Il ne connaissait que la stéréo : deux sorties, gauche et droite. Sur un tampon à SIX canaux il
// prenait les deux premiers et JETAIT LES QUATRE AUTRES sans un mot — son message disait
// « Gauche + Droite · 44100 Hz ». Mesuré le 2026-10-26.
//
// ET CE N'ÉTAIT PAS THÉORIQUE. Le sous-type `stereo` de son port d'entrée était DÉCORATIF : le type
// de flux `audio` ne déclare aucun `sousTypesCompatibles`, contrairement au texte et au contrôle qui
// ont chacun leur règle. N'importe quel audio se branche donc sur n'importe quel port audio, et ce
// dépôt produit du 5.1, du 7.1, du 7.1.4, des anneaux de huit et seize, et de l'ambisonie jusqu'à
// l'ordre trois — soit SEIZE canaux au maximum, d'après `audio/multicanal.ts`.
//
// ═══ SEIZE SORTIES, ET POURQUOI PAS HUIT ═══
//
// Seize est le nombre que la table des dispositions déclare au plus : anneau de seize, ambisonie
// d'ordre trois. S'arrêter à huit aurait reproduit exactement le défaut qu'on répare, un cran plus
// loin. Six était jusqu'ici le maximum du catalogue — le séparateur de pistes — et seize est donc
// sans précédent ; c'est le prix d'un séparateur qui ne jette rien.
//
// ═══ ET LES SORTIES SONT NUMÉROTÉES, PARCE QU'UN PORT NE PEUT PAS MENTIR ═══
//
// Elles s'appelaient « Gauche » et « Droite ». Un port est STATIQUE : son nom ne peut pas suivre la
// disposition de ce qui arrive. Or le canal un d'un champ ambisonique est W, l'omnidirectionnel, et
// l'appeler « Gauche » serait FAUX — la même règle que pour les prédicats de type : une étiquette
// fausse est pire qu'une étiquette neutre, parce qu'on apprend à ne plus la lire.
//
// LA CORRESPONDANCE EST DONC DANS LE MESSAGE, que le nœud écrit À L'EXÉCUTION, quand il connaît la
// disposition : « 5.1 · 6 canaux · 1=L 2=R 3=C 4=LFE 5=Ls 6=Rs ». Et le résumé dit le cas courant,
// pour qui cherche dans la palette : sur un stéréo, un est la gauche et deux la droite.
//
// LES CÂBLES DÉJÀ POSÉS SURVIVENT : une arête retient `out:0` et `out:1`, des INDEX et non des noms.

import type { FicheAudio } from "../audio/types-domaine";
import { dispositionDe, nombreDeCanaux } from "../audio/multicanal";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";

/** Le plus grand nombre de canaux qu'une disposition de ce dépôt déclare. Voir l'en-tête. */
const SORTIES = 16;

/**
 * Un canal, recopié dans son propre tampon mono.
 *
 * `slice()` plutôt que la vue : `getChannelData` rend une vue sur de la mémoire native, et garder
 * une vue sans son tampon est un piège que ce dépôt a déjà payé.
 */
function canalSeul(source: AudioBuffer, canal: number): AudioBuffer {
  const mono = new AudioBuffer({
    numberOfChannels: 1, length: source.length, sampleRate: source.sampleRate,
  });
  mono.copyToChannel(source.getChannelData(canal).slice(), 0);
  return mono;
}

export const fiches: FicheAudio[] = ([
  {
    id: "separateur-canaux",
    memoire: "flux", // recopie canal par canal
    nom: "Séparateur canaux",
    nomEn: "Channel Splitter",
    univers: "Traitement",
    famille: "Effets",
    resume: "Sépare un son en un canal par sortie, jusqu'à seize. Sur un stéréo, la sortie 1 est la gauche et la 2 la droite.",
    resumeEn: "Splits a sound into one channel per output, up to sixteen. On a stereo signal, output 1 is left and 2 is right.",
    notice: "Ce composant rend chaque canal du son qu'il reçoit sur une sortie à lui, en mono.\n\n"
      + "Les sorties sont numérotées dans l'ordre des canaux du son reçu. Sur un stéréo, « Canal 1 » "
      + "porte la gauche et « Canal 2 » la droite. Sur un 5.1, l'ordre est celui du format : gauche, "
      + "droite, centre, caisson de graves, surround gauche, surround droite. Sur un champ "
      + "ambisonique, l'ordre est celui des composantes AmbiX, dont la première est "
      + "l'omnidirectionnelle.\n\n"
      + "Le message du composant donne la correspondance, le nombre de canaux reçus et la "
      + "fréquence. Il nomme chaque canal lorsque la disposition du son est déclarée, et signale le "
      + "nombre de canaux qu'il laisse de côté au-delà de la seizième sortie.\n\n"
      + "Les sorties au-delà du nombre de canaux reçus restent vides. Un son mono remplit « Canal 1 » "
      + "seulement, un stéréo les deux premières.\n\n"
      + "Seules les sorties reliées à un autre composant sont calculées. Les seize canaux d'un son de "
      + "trois minutes représentent un demi-gigaoctet de mémoire ; le composant n'en produit que ce "
      + "qui sert.\n\n"
      + "Un son dont la disposition n'est pas déclarée est séparé selon son nombre de canaux. La "
      + "disposition ne s'en déduit pas : quatre canaux correspondent à une quadriphonie comme à une "
      + "ambisonie d'ordre un.",
    noticeEn: "This node returns each channel of the sound it receives on an output of its own, in "
      + "mono.\n\n"
      + "Outputs are numbered in the channel order of the incoming sound. On a stereo signal, "
      + "« Channel 1 » carries the left and « Channel 2 » the right. On 5.1 the order is that of the "
      + "format: left, right, centre, subwoofer, left surround, right surround. On an ambisonic field "
      + "the order is that of the AmbiX components, the first of which is the omnidirectional one.\n\n"
      + "The node's message gives the mapping, the number of channels received and the rate. It names "
      + "each channel when the sound's layout is declared, and reports how many channels it leaves "
      + "aside beyond the sixteenth output.\n\n"
      + "Outputs beyond the number of channels received stay empty. A mono sound fills « Channel 1 » "
      + "only, a stereo signal the first two.\n\n"
      + "Only outputs connected to another node are computed. The sixteen channels of a three-minute "
      + "sound amount to half a gigabyte of memory; the node produces only what is used.\n\n"
      + "A sound whose layout is not declared is split according to its channel count. The layout "
      + "cannot be deduced from it: four channels match quadraphony as well as first-order "
      + "ambisonics.",
    // Ses sorties audio sont des pairs : aucune ne represente le noeud a elle seule, et un
    // lecteur generique en designerait une au hasard.
    sansApercuAudio: true,
    // UNE SORTIE VIDE EST UN RÉSULTAT VALIDE ICI, et c'est ce qui permet de ne calculer que les
    // sorties branchées : un séparateur dont rien n'est encore câblé n'a pas ÉCHOUÉ. Le filet
    // « tout-null » du moteur ne vaut donc plus pour lui, et l'absence d'entrée se déclare en
    // toutes lettres ci-dessous.
    sortieNullePermise: true,
    // DEUX SORTIES À LA NAISSANCE, SEIZE SI ON LES DEMANDE. Les seize existent toujours — le
    // moteur, la validation et les projets enregistrés les voient toutes — mais un nœud n'en
    // dessine que ce qu'il emploie. Sans cela il naîtrait haut de quatre cent quarante-huit pixels
    // pour montrer quatorze ports vides, alors que la stéréo est le cas de très loin le plus
    // fréquent. Le « − » se refuse tant qu'une sortie câblée se trouve au-dessus du compte
    // demandé : un câble ne disparaît jamais parce qu'on a raccourci le nœud.
    sortiesExtensibles: { min: 1, defaut: 2 },
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: Array.from({ length: SORTIES }, (_, i) => ({
      nom: `Canal ${i + 1}`, nomEn: `Channel ${i + 1}`, type: "audio", sousType: "mono",
    })),
    parametres: [],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      const vide = Array.from({ length: SORTIES }, () => null);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: vide, erreur: true, message: traduire("msg.aucune_entr_e") };
      }
      // SANS LE GUICHET DES SORTIES, ON REND TOUT. Un appelant qui ne peut pas dire ce qui est
      // câblé — le banc, un cas unitaire — doit recevoir les canaux, et non le vide : c'est
      // l'inverse du choix de `sortie-audio.ts`, dont la sortie d'appoint est chère et facultative.
      const sait = typeof ctx.sortieBranchee === "function";
      const voulu = (rang: number) => !sait || ctx.sortieBranchee(rang);

      const valeurs: (AudioBuffer | null)[] = vide.slice();
      const rendus = Math.min(audio.numberOfChannels, SORTIES);
      for (let c = 0; c < rendus; c++) valeurs[c] = voulu(c) ? canalSeul(audio, c) : null;

      const d = dispositionDe(audio);
      const noms = d && d.hautParleurs.length === audio.numberOfChannels
        ? d.hautParleurs.map((h, i) => `${i + 1}=${h.nom}`).join(" ")
        : "";
      // ET CE QUI EST IGNORÉ SE DIT. C'est tout l'objet de cette version : l'ancienne en jetait
      // quatre sur six en silence. Au-delà de seize, il n'y a plus de sortie où les mettre.
      const perdus = audio.numberOfChannels - rendus;
      // LA DISPOSITION NON DÉCLARÉE NE SE DIT QU'AU-DELÀ DE DEUX CANAUX. Sur un stéréo elle
      // n'apprend rien — le nombre de canaux dit déjà tout — et ce serait du bruit sur le cas
      // courant. À partir de quatre elle compte : c'est elle qui explique pourquoi les canaux ne
      // sont pas nommés, une quadriphonie et une ambisonie d'ordre un ne se distinguant pas.
      const parts = [
        d ? (d.fr ?? d.id)
          : (audio.numberOfChannels > 2 ? traduire("msg.disposition_non_declaree") : ""),
        traduire(audio.numberOfChannels > 1 ? "msg.n_canaux" : "msg.un_canal")
          .replace("{n}", String(audio.numberOfChannels)),
        noms,
        d && d.famille === "ambisonie" ? `ordre ${d.ordre} · ${nombreDeCanaux(d)} composantes` : "",
        perdus > 0
          ? traduire(perdus > 1 ? "msg.canaux_ignores" : "msg.canal_ignore").replace("{n}", String(perdus))
          : "",
      ].filter(Boolean);
      return { valeurs, message: `${parts.join(" · ")} · ${audio.sampleRate} Hz` };
    },
  },
] as FicheAudio[]).map(avecDoc);
