// plugins/sous-titres.ts — Nœud « Sous-titres (SRT) » : la parole devient un fichier de sous-titres.
//
// LA RECONNAISSANCE EST REFAITE ICI, et non reçue d'un nœud « Vosk » en amont. Les mots datés sont
// un TABLEAU D'ENREGISTREMENTS, et rien de tel ne circule sur une arête : le domaine n'admet qu'un
// tampon, un tableau de flottants, un fichier, un texte et une zone. Lire le tableau d'affichage
// de l'autre nœud serait pire, puisque cela couplerait deux composants par un format d'affichage.
// C'est le choix déjà fait par « Parole vers MIDI », pour la même raison et au même prix.
//
// LE FICHIER SORT À CÔTÉ DU FILM, ET N'Y EST PAS INCRUSTÉ. Un SRT se lit par un lecteur, une
// plateforme ou un logiciel de montage, et il reste corrigible après coup ; incruster le texte
// demanderait de décoder les images, ce qui est un autre chantier.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { cheminDansTravail } from "./pont-electron";
import { MODELES, chargerModele, transcrire, versMono, vers16k } from "./vosk-asr";
import { decouperEnSousTitres, versSrt } from "../audio/sous-titres";
import { choixLangues } from "../core/langues";

export const fiches = ([
  {
    id: "sous-titres-srt", nom: "Sous-titres (SRT)", nomEn: "Subtitles (SRT)",
    univers: "Autres", famille: "Vidéo",
    resume: "Transcrit la parole et la découpe en sous-titres, chacun à l'instant de ses mots.",
    resumeEn: "Transcribes speech and cuts it into subtitles, each at the instant of its words.",
    notice: "Ce composant écoute une bande son, reconnaît la parole qu'elle porte, et rend des sous-titres au format SRT. "
      + "Chaque sous-titre commence à l'instant de son premier mot et finit à celui de son dernier.\n\n"
      + "« Langue » choisit le modèle de reconnaissance ; chaque langue a le sien. « Vocabulaire » restreint ce que le "
      + "moteur peut reconnaître à une liste de mots, ce qui sert quand le texte dit est connu d'avance.\n\n"
      + "La découpe suit trois raisons, dans cet ordre. Un silence plus long que « Silence qui coupe » termine le "
      + "sous-titre en cours : couper là où la voix s'arrête donne une unité de sens. Sinon, le sous-titre se termine "
      + "quand un mot de plus ne tiendrait plus dans « Lignes par sous-titre » lignes de « Largeur de ligne » "
      + "caractères. Sinon, il se termine quand il atteint « Durée maximale ».\n\n"
      + "« Durée minimale » allonge la fin d'un sous-titre trop bref pour être lu, sans jamais aller au-delà du début "
      + "du suivant : deux sous-titres qui se recouvrent s'empilent à l'écran.\n\n"
      + "Un mot n'est jamais coupé : un mot plus long que la ligne occupe sa ligne entière. Les lignes en trop "
      + "rejoignent la dernière plutôt que d'être jetées.\n\n"
      + "« Nom du fichier » nomme le fichier écrit dans le répertoire de travail ; l'extension .srt est ajoutée si "
      + "elle manque. La sortie « SRT » rend le texte, et la sortie « Chemin » le chemin du fichier écrit. Hors de "
      + "l'application, le texte est rendu et le fichier n'est pas écrit.",
    noticeEn: "This component listens to a soundtrack, recognises the speech it carries, and returns subtitles in the SRT "
      + "format. Each subtitle starts at the instant of its first word and ends at that of its last.\n\n"
      + "« Language » picks the recognition model; each language has its own. « Vocabulary » restricts what the engine "
      + "may recognise to a list of words, which helps when the spoken text is known in advance.\n\n"
      + "The cutting follows three reasons, in this order. A silence longer than « Splitting silence » ends the current "
      + "subtitle: cutting where the voice stops gives a unit of meaning. Otherwise, the subtitle ends when one more "
      + "word would no longer fit in « Lines per subtitle » lines of « Line width » characters. Otherwise, it ends when "
      + "it reaches « Maximum length ».\n\n"
      + "« Minimum length » extends the end of a subtitle too brief to be read, without ever going past the start of the "
      + "next one: two subtitles that overlap stack up on screen.\n\n"
      + "A word is never cut: a word longer than the line takes its whole line. The lines in excess join the last one "
      + "rather than being dropped.\n\n"
      + "« File name » names the file written in the working directory; the .srt extension is added when missing. The "
      + "« SRT » output renders the text, and the « Path » output the path of the written file. Outside the "
      + "application, the text is rendered and the file is not written.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "SRT", nomEn: "SRT", type: "texte" },
      { nom: "Chemin", nomEn: "Path", type: "texte" },
    ],
    // Une bande son où personne ne parle est un résultat, et non une panne : le nœud a tourné, et
    // il dit ce qu'il a entendu.
    sortieNullePermise: true,
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        ...choixLangues(["fr", "en"]), defaut: "Français", defautEn: "French",
        doc: "Le modèle de reconnaissance employé. Chaque langue a le sien, dédié.",
        docEn: "The recognition model used. Each language has its own, dedicated." },
      { nom: "Vocabulaire", nomEn: "Vocabulary", type: "texte", defaut: "", defautEn: "",
        placeholder: "oui non peut-être", placeholderEn: "yes no maybe",
        doc: "Liste de mots séparés par des espaces ou des virgules. Donnée, elle restreint ce que le moteur peut reconnaître à ces mots seuls. Vide, le vocabulaire entier du modèle sert.",
        docEn: "Words separated by spaces or commas. When given, it restricts what the engine may recognise to those words alone. Empty, the model's whole vocabulary is used." },
      { nom: "Largeur de ligne", nomEn: "Line width", type: "nombre", plage: [20, 60], pas: 1, defaut: 42,
        unite: "caractères", uniteEn: "characters",
        doc: "Caractères par ligne. Au-delà d'une quarantaine, une ligne traverse l'image et se lit mal.",
        docEn: "Characters per line. Past forty or so, a line crosses the image and reads badly." },
      { nom: "Lignes par sous-titre", nomEn: "Lines per subtitle", type: "nombre", plage: [1, 3], pas: 1, defaut: 2,
        doc: "Nombre de lignes affichées en même temps. Les lignes en trop rejoignent la dernière.",
        docEn: "Number of lines shown at once. The lines in excess join the last one." },
      { nom: "Durée maximale", nomEn: "Maximum length", type: "nombre", plage: [1, 12], pas: 0.5, defaut: 6, unite: "s",
        doc: "Durée au-delà de laquelle le sous-titre en cours se termine, même sans silence ni manque de place.",
        docEn: "Length past which the current subtitle ends, even without a silence or a lack of room." },
      { nom: "Silence qui coupe", nomEn: "Splitting silence", type: "nombre", plage: [0.1, 2], pas: 0.05, defaut: 0.6, unite: "s",
        doc: "Silence entre deux mots à partir duquel le sous-titre se termine. C'est la première des trois raisons de couper.",
        docEn: "Silence between two words past which the subtitle ends. This is the first of the three reasons to cut." },
      { nom: "Durée minimale", nomEn: "Minimum length", type: "nombre", plage: [0.3, 4], pas: 0.1, defaut: 1, unite: "s",
        doc: "Durée en dessous de laquelle la fin d'un sous-titre est repoussée, sans jamais atteindre le début du suivant.",
        docEn: "Length below which a subtitle's end is pushed back, without ever reaching the start of the next one." },
      { nom: "Nom du fichier", nomEn: "File name", type: "texte", defaut: "sous-titres.srt", defautEn: "subtitles.srt",
        doc: "Nom du fichier écrit dans le répertoire de travail. L'extension .srt est ajoutée si elle manque.",
        docEn: "Name of the file written in the working directory. The .srt extension is added when missing." },
    ],
    async executer(ctx) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const langue = ctx.paramTexte("Langue", "fr");
      const choisi = MODELES[langue] ?? MODELES.fr;
      await annoncerModele(ctx, "sous-titres-srt", traduire("progress.vosk.chargement"));
      const modele = await chargerModele(choisi.fichier);
      const mono = await vers16k(versMono(audio), audio.sampleRate);
      const vocabulaire = String(ctx.paramTexte("Vocabulaire", ""))
        .split(/[\s,]+/).map((m: string) => m.trim().toLowerCase()).filter(Boolean);
      const { mots } = await transcrire(modele, mono, {
        grammaire: vocabulaire,
        surPartiel: (p: string) => ctx.onProgress?.(p),
      });
      if (mots.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.sousTitres.aucunMot") };
      }
      const sous = decouperEnSousTitres(
        mots.map((m) => ({ mot: m.word, debut: m.start, fin: m.end })),
        {
          largeurLigne: ctx.paramNombre("Largeur de ligne", 42),
          lignesMax: ctx.paramNombre("Lignes par sous-titre", 2),
          dureeMax: ctx.paramNombre("Durée maximale", 6),
          silenceCoupe: ctx.paramNombre("Silence qui coupe", 0.6),
          dureeMin: ctx.paramNombre("Durée minimale", 1),
        },
      );
      const srt = versSrt(sous);
      const demande = String(ctx.paramTexte("Nom du fichier", "sous-titres.srt")).trim() || "sous-titres.srt";
      const nom = /\.srt$/i.test(demande) ? demande : `${demande}.srt`;
      const duree = sous.length > 0 ? sous[sous.length - 1].fin - sous[0].debut : 0;
      const compte = [String(sous.length), String(mots.length), duree.toFixed(1)];
      // LE TEXTE SORT MÊME QUAND LE FICHIER NE PEUT PAS ÊTRE ÉCRIT. L'écriture passe par le pont
      // de l'application, absent d'un navigateur : la transcription a réussi pour autant, et la
      // dire en panne ferait chercher une faute là où il n'y en a pas.
      const api = (window as any).api;
      if (!api?.ecrireFichier) {
        return { valeurs: [srt, null], message: traduire("msg.sousTitres.sansFichier", ...compte) };
      }
      // LE TEXTE SURVIT AU REFUS D'ÉCRIRE : il est déjà calculé, et le perdre pour un répertoire
      // non résolu priverait de la seule chose que ce composant produit sans disque.
      const cible = cheminDansTravail(ctx.repertoireTravail, nom);
      if (!cible.ok) return { valeurs: [srt, null], message: cible.message };
      const chemin = cible.chemin;
      const ecrit = await api.ecrireFichier(chemin, srt);
      if (!ecrit) {
        return { valeurs: [srt, null], message: traduire("msg.sousTitres.ecritureImpossible", nom) };
      }
      return {
        valeurs: [srt, chemin],
        message: traduire("msg.sousTitres.resume", ...compte, nom),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
