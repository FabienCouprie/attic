// plugins/clavier-sfz.ts — Un clavier qui lit du SFZ, au niveau du nœud.
//
// CE QUI MANQUAIT. Attic savait ÉCRIRE du SFZ — « Export SFZ » — mais rien ne savait le relire. Le
// seul clavier jouable de l'application, « Clavier mélodie », joue du SF2 chargé GLOBALEMENT : un
// fichier pour toute la session, le même pour tous les nœuds. Une banque construite dans le graphe ou
// exportée sur le disque n'était donc jouable que dans un autre logiciel.
//
// CE NŒUD FAIT LES DEUX SENS. Il prend sa banque soit d'un fichier `.sfz` qu'on lui désigne — bouton
// 📂 dans sa vue —, soit de son entrée Banque, donc directement de « Étaler sur le clavier » ou de
// « Fin d'instrument », sans passer par le disque. Dans les deux cas le clavier de quatre-vingt-huit
// touches est jouable à la souris ou au clavier de l'ordinateur, et ce qu'on joue s'enregistre : le
// nœud rend l'audio de la séquence, son MIDI, et repasse la banque à la suite du graphe.
//
// LA LECTURE EST DANS `audio/sfz.ts`, pure et testée, aller-retour compris avec notre propre
// exportateur. Ce fichier n'est que la prise : lire le disque, décoder les WAV, rendre la séquence.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { notesVersFichierMidi } from "../audio/midi";
import { rendreNotes, type Banque, type NoteJouee } from "../audio/clavier-banque";
import { chargerSfz, dossierDe } from "../audio/sfz";
import { deposerBanque } from "../audio/banques-vives";

/**
 * Un décodeur d'échantillon appuyé sur Electron.
 *
 * `lireFichierAudio` rend une URL `data:` — c'est ainsi que le reste de l'application lit un fichier
 * du disque depuis le renderer —, et `decodeAudioData` s'en charge ensuite. Un fichier absent ou
 * illisible rend `null` : la région sera comptée comme manquante et annoncée, plutôt que de faire
 * échouer tout le chargement pour un WAV égaré.
 */
export function decodeurElectron(api: any, actx: BaseAudioContext) {
  return async (chemin: string): Promise<AudioBuffer | null> => {
    try {
      const lu = await api?.lireFichierAudio?.(chemin);
      if (!lu?.url) return null;
      const reponse = await fetch(lu.url);
      return await actx.decodeAudioData(await reponse.arrayBuffer());
    } catch {
      return null;
    }
  };
}

/** Une banque est-elle utilisable ? */
const banqueValide = (b: unknown): b is Banque =>
  !!b && Array.isArray((b as Banque).zones) && (b as Banque).zones.length > 0;

export const fiches: FicheAudio[] = ([
  {
    id: "clavier-sfz", nom: "Clavier SFZ", nomEn: "SFZ Keyboard",
    univers: "Entrées", famille: "Génération",
    resume: "Joue une banque SFZ, fichier du disque ou banque du graphe, sur un clavier de 88 touches, et enregistre ce qu'on joue.",
    resumeEn: "Plays an SFZ bank, a file from disk or a bank from the graph, on an 88-key keyboard, and records what you play.",
    // `requis: false` : le clavier joue tres bien un fichier du disque sans que rien n'arrive par
    // le graphe. Sans ce drapeau, la validation refusait le noeud avant meme de l'executer — un nœud
    // en erreur, sans message, et le fichier jamais lu.
    entrees: [{ nom: "Banque", nomEn: "Bank", type: "banque", requis: false }],
    sorties: [
      { nom: "Audio", type: "audio", sousType: "stereo" },
      { nom: "MIDI", type: "midi" },
      { nom: "Banque", nomEn: "Bank", type: "banque" },
    ],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Automatique", "Fichier SFZ", "Banque entrante"],
        optionsEn: ["Automatic", "SFZ file", "Incoming bank"],
        optionIds: ["auto", "fichier", "entree"], defaut: "Automatique", defautEn: "Automatic",
        doc: "D'où vient l'instrument. Automatique : la banque entrante si elle est branchée, sinon le fichier `.sfz` désigné dans la vue du composant. Fichier SFZ : toujours le fichier, même si une banque arrive, utile pour comparer ce qui a été exporté avec ce que le graphe produit maintenant. Banque entrante : toujours l'entrée.",
        docEn: "Where the instrument comes from. Automatic: the incoming bank if one is connected, otherwise the `.sfz` file chosen in the node's view. SFZ file: always the file, even if a bank arrives, useful to compare what was exported with what the graph produces now. Incoming bank: always the input." },
      { nom: "Volume", nomEn: "Volume", type: "curseur", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Niveau de sortie. La vélocité de chaque note le module, et le `volume` d'une région SFZ s'y ajoute.",
        docEn: "Output level. Each note's velocity scales it, and an SFZ region's `volume` adds to it." },
      { nom: "Relâchement", nomEn: "Release", type: "curseur", plage: [1, 2000], pas: 1, defaut: 150, unite: "ms",
        doc: "Temps d'extinction après le relâchement de la touche. Si le fichier SFZ déclare un `ampeg_release`, il est affiché dans le message du composant, mais c'est bien ce réglage qui s'applique, pour que le composant reste maître de ce qu'il rend.",
        docEn: "Fade-out time after the key is released. If the SFZ file declares an `ampeg_release`, it is shown in the node's message, but this setting is what applies, so the node stays in charge of what it renders." },
      { nom: "Fondu de boucle", nomEn: "Loop crossfade", type: "curseur", plage: [1, 200], pas: 1, defaut: 20, unite: "ms",
        doc: "Durée du fondu au raccord de la boucle de maintien, pour le rendu. Trop court, on entend un clic à chaque tour ; trop long, la boucle se met à respirer. Le jeu en direct, lui, boucle par le matériel audio et ne fond pas le raccord.",
        docEn: "Length of the crossfade at the sustain loop's join, for the render. Too short, a click is heard on every turn; too long, the loop starts to breathe. Live playing loops through the audio hardware and does not crossfade the join." },
      { nom: "Tempo", nomEn: "Tempo", type: "curseur", plage: [40, 240], pas: 1, defaut: 120, unite: "BPM",
        doc: "Tempo écrit dans le fichier MIDI de sortie. Il ne change pas l'audio : ce qui a été joué a été joué au temps où on l'a joué.",
        docEn: "Tempo written into the output MIDI file. It does not change the audio: what was played was played at the time it was played." },
    ],
    async executer(ctx: any) {
      const source = ctx.paramTexte("Source", "auto");
      const entrante = ctx.entree(0);
      const chemin = ctx.noeud.data.sfzChemin as string | undefined;

      let banque: Banque | null = null;
      let detail = "";
      const prendreEntree = source === "entree" || (source === "auto" && banqueValide(entrante));
      if (prendreEntree) {
        if (!banqueValide(entrante)) {
          return { valeurs: [null, null, null], message: traduire("msg.banque.absente") };
        }
        banque = entrante;
        detail = traduire("msg.sfz.depuisEntree", String(banque.zones.length));
      } else {
        if (!chemin) return { valeurs: [null, null, null], message: traduire("msg.sfz.sansFichier") };
        const api = (window as any).api;
        if (!api?.lireTexte) return { valeurs: [null, null, null], message: traduire("msg.n_cessite_electron") };
        const texte = await api.lireTexte(chemin);
        if (typeof texte !== "string" || texte === "") {
          return { valeurs: [null, null, null], message: traduire("msg.sfz.illisible", chemin) };
        }
        const charge = await chargerSfz(texte, dossierDe(chemin), decodeurElectron(api, ctx.runtime));
        if (charge.banque.zones.length === 0) {
          return { valeurs: [null, null, null], message: traduire("msg.sfz.aucuneZone", String(charge.manquants.length)) };
        }
        banque = charge.banque;
        // Ce que le fichier contenait ET ce qu'on n'a pas su en tirer : un instrument incomplet doit
        // se voir, faute de quoi on chercherait longtemps pourquoi deux octaves sont muettes.
        const morceaux = [traduire("msg.sfz.lu", String(charge.banque.zones.length), String(charge.banque.largeur))];
        if (charge.couches > 1) morceaux.push(traduire("msg.sfz.nbCouches", String(charge.couches)));
        if (charge.manquants.length) morceaux.push(traduire("msg.sfz.manquants", String(charge.manquants.length)));
        if (charge.couchesEcartees) morceaux.push(traduire("msg.sfz.couches", String(charge.couchesEcartees)));
        if (charge.sfz.ignores.length) {
          morceaux.push(traduire("msg.sfz.ignores", String(charge.sfz.ignores.length), charge.sfz.ignores.slice(0, 3).join(", ")));
        }
        if (charge.sfz.relachement !== null) {
          morceaux.push(traduire("msg.sfz.relachementFichier", (charge.sfz.relachement * 1000).toFixed(0)));
        }
        detail = morceaux.join(" · ");
      }

      // La banque est déposée avant tout rendu : même si rien n'a été joué, la vue peut alors jouer
      // ce que le graphe vient de calculer, ce qui est le cas d'usage le plus fréquent — on branche,
      // on lance, on essaie au clavier.
      // Le nom accompagne la banque : la vue affiche « le fichier untel » ou « banque du graphe »
      // selon ce que le nœud a VRAIMENT utilisé, et non selon ce qu'elle devine de ses données.
      deposerBanque(ctx.noeud.id, banque, prendreEntree ? "" : (chemin ?? "").split(/[\/]/).pop() ?? "");

      const notes = ctx.noeud.data.sequenceNotes as NoteJouee[] | undefined;
      const jouables = Array.isArray(notes) ? notes.filter((n) => n && n.fin > n.debut) : [];
      if (jouables.length === 0) {
        return { valeurs: [null, null, banque], message: `${detail} · ${traduire("msg.sfz.sansSequence")}` };
      }

      const audio = rendreNotes(jouables, banque, {
        volume: ctx.paramNombre("Volume", 80) / 100,
        relachement: ctx.paramNombre("Relâchement", 150) / 1000,
        fonduBoucle: ctx.paramNombre("Fondu de boucle", 20) / 1000,
      });
      const midi = notesVersFichierMidi(jouables as any, ctx.paramNombre("Tempo", 120));
      return {
        valeurs: [audio, midi, banque],
        message: `${detail} · ${traduire("msg.sfz.joue", String(jouables.length), audio.duration.toFixed(1))}`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
