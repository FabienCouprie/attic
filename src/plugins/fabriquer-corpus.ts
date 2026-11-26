// plugins/fabriquer-corpus.ts — Une boucle à passes qui fabrique un corpus, une pièce par passe.
//
// LE CORPS EST REJOUÉ À CHAQUE PASSE PAR LE PILOTE (`ui/moteur/pilotes.ts`), générateurs sans entrée
// compris : un nœud qui alimente la fin est un ancêtre de la fin, donc dans le corps. C'EST LA SEULE
// BOUCLE À PASSES QUI DEMANDE SES GRAINES (`grainesDeLaBoucle`) : une base pour tout le run, et le
// numéro de la pièce mêlé à chaque graine du corps, de sorte que la même graine refait le même corpus.
//
// UNE PASSE ARRÊTÉE LAISSE LE CORPUS COMMENCÉ : chaque passe rend ce qui a été fabriqué jusqu'à elle,
// et non la seule pièce du moment, au contraire des autres fins de boucle.
//
// LE DÉBUT SAIT AUSSI LIRE UN DOSSIER DE FICHIERS MIDI, une pièce par fichier (`corpus-dossier.ts`),
// demandé par Fabien le 2026-11-25 pour faire un corpus à quatre voix de ses pièces de piano : aucune
// boucle ne parcourait les fichiers MIDI d'un dossier. La fin nomme alors la pièce d'après son fichier.

import { fiche } from "./fiche";
import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { estSequence, type Sequence } from "../audio/sequence";
import type { Corpus, PieceDuCorpus } from "../audio/corpus";
import { corpusVersJson, empreinteCorpus } from "../audio/corpus-fichier";
import { sequenceVersMidiParVoix } from "../audio/corpus-midi";
import { sequenceVersMusicXMLParVoix } from "../audio/musicxml-parties";
import { tonaliteDesNotes } from "../audio/corpus-tonalite";
import { CLES } from "../audio/cles";
import { GRAINES_PAR_TOUR, REGLAGE_GRAINES } from "../core/boucle-graphe";
import { boucleDeLaFin, boucleDuDebut, decouvrirPour, FICHE_CORPUS_DEBUT, FICHE_CORPUS_FIN, GRAINES_PAR_PIECE, recolterPour } from "./boucleSequencesGlobal";
import { assainirNomFichier, joindre } from "./lotGlobal";
import { ecrireOuLever } from "./pont-electron";
import { dossierDe, memeDossier, nomDePieceLue, passeDuDossier, pieceDeLaPasse, SOURCE_DOSSIER } from "./corpus-dossier";

const en = () => langueCourante() === "en";

/** Ce que la fin dépose à chaque passe : la pièce, et sa ligne de journal. */
interface Recolte { piece: PieceDuCorpus; ligne: string }

export { empreinteCorpus };

const EXTENSION = { midi: "mid", musicxml: "musicxml" } as const;

export const fiches: FicheAudio[] = ([
  fiche({
    id: FICHE_CORPUS_DEBUT,
    boucleParPasses: true,
    nom: "Fabriquer un corpus (début)", nomEn: "Make a Corpus (Start)",
    univers: "Autres", famille: "Harmonisation",
    resume: "Ouvre une boucle qui fabrique un corpus : ce qui précède la fin est calculé une fois par pièce.",
    resumeEn: "Opens a loop that makes a corpus: what feeds the end is computed once per piece.",
    notice: "Ce composant ouvre une boucle qui fabrique un corpus : tout ce qui alimente « Fabriquer un corpus (fin) » est calculé une fois par pièce, les générateurs sans entrée compris, et chaque passe donne une pièce.\n\n« Source » dit d'où viennent les pièces. « Nombre de pièces » les fait calculer par la chaîne, et « Pièces » fixe leur nombre. « Dossier » prend une pièce par fichier MIDI, .mid ou .midi, du dossier désigné par le réglage du même nom, dans l'ordre alphabétique des noms ; le nombre de pièces est alors celui des fichiers gardés, et « Pièces » n'agit pas. Chaque fichier est lu une voix par piste qui porte des notes, ses changements de tempo suivis. Tous les fichiers sont lus à la première passe : un fichier illisible ou sans note est écarté, et le message le nomme avec sa raison à chaque passe.\n\n« Graines » dit ce que deviennent les réglages « Graine » des composants calculés à chaque passe. « Une par pièce » mêle le numéro de la pièce à chaque graine : les pièces diffèrent, et la même graine avec le même nombre de pièces refait toujours le même corpus. « Identiques » donne la même graine à toutes les pièces. Dans les deux cas, une graine à zéro est tirée une seule fois pour toutes les pièces, et le message du composant qui l'a tirée la rend : la reposer refait le corpus entier.\n\nLa sortie « Rang » rend le numéro de la pièce en cours, à partir de un. Branchée sur l'entrée « Rang » de la fin, elle relie les deux bouts de la boucle. Sous « Dossier », la sortie « Séquence » rend la séquence du fichier de la passe, et la sortie « Nom » le nom de ce fichier ; sous « Nombre de pièces », elles ne rendent rien. Le message donne le numéro de la pièce sur le nombre de pièces, suivi sous « Dossier » du nom du fichier.",
    noticeEn: "This component opens a loop that makes a corpus: everything that feeds « Make a Corpus (End) » is computed once per piece, generators without input included, and every pass gives one piece.\n\n« Source » says where the pieces come from. « Number of pieces » has the chain compute them, and « Pieces » sets their number. « Folder » takes one piece per MIDI file, .mid or .midi, of the folder named by the setting of the same name, in the alphabetical order of the names; the number of pieces is then that of the files kept, and « Pieces » has no effect. Every file is read one voice per track that carries notes, its tempo changes followed. All the files are read at the first pass: a file that is unreadable or has no note is left out, and the message names it with its reason at every pass.\n\n« Seeds » says what becomes of the « Seed » settings of the components computed at every pass. « One per piece » mixes the number of the piece into every seed: the pieces differ, and the same seed with the same number of pieces always makes the same corpus again. « Identical » gives the same seed to every piece. Either way, a seed at zero is drawn once for all the pieces, and the message of the component that drew it gives it back: putting it back makes the whole corpus again.\n\nThe « Rank » output returns the number of the current piece, from one. Connected to the « Rank » input of the end, it links the two ends of the loop. Under « Folder », the « Sequence » output returns the sequence of the file of the pass, and the « Name » output the name of that file; under « Number of pieces », they return nothing. The message gives the number of the piece out of the number of pieces, followed under « Folder » by the name of the file.",
    entrees: [],
    // « SÉQUENCE » ET « NOM » VIENNENT APRÈS « RANG » : un graphe enregistré désigne un port par son
    // rang, et les câbles déjà tirés depuis « Rang » restent où ils sont.
    sorties: [
      { nom: "Rang", nomEn: "Rank", type: "texte" },
      { nom: "Séquence", nomEn: "Sequence", type: "sequence" },
      { nom: "Nom", nomEn: "Name", type: "texte" },
    ],
    parametres: [
      { nom: "Source", nomEn: "Source", type: "choix",
        options: ["Nombre de pièces", "Dossier"], optionsEn: ["Number of pieces", "Folder"],
        optionIds: ["nombre", SOURCE_DOSSIER], defaut: "Nombre de pièces", defautEn: "Number of pieces",
        doc: "« Nombre de pièces » fait calculer les pièces par la chaîne, autant que « Pièces » en demande ; « Dossier » prend une pièce par fichier MIDI du dossier désigné par « Dossier ».",
        docEn: "« Number of pieces » has the chain compute the pieces, as many as « Pieces » asks for; « Folder » takes one piece per MIDI file of the folder named by « Folder »." },
      // INERTE SOUS « DOSSIER », À DESSEIN : le compte est alors celui des fichiers gardés, et sa doc le dit.
      { nom: "Pièces", nomEn: "Pieces", plage: [1, Infinity], pas: 1, defaut: 8,
        doc: "Combien de pièces, donc combien de fois la chaîne est calculée. Le nombre est libre ; le message donne le numéro de la pièce sur le nombre demandé, de sorte qu'un nombre que la limite totale des passes ne laisse pas atteindre se voit. Sous « Dossier », le nombre de pièces est celui des fichiers gardés, et ce réglage n'agit pas.",
        docEn: "How many pieces, hence how many times the chain is computed. The number is free; the message gives the number of the piece out of the number asked for, so that a number the total pass limit does not allow shows up. Under « Folder », the number of pieces is that of the files kept, and this setting has no effect." },
      { nom: "Dossier", nomEn: "Folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Le dossier dont les fichiers MIDI sont lus quand « Source » vaut « Dossier ». Le bouton « … » ouvre le sélecteur du système.",
        docEn: "The folder whose MIDI files are read when « Source » is « Folder ». The « … » button opens the system picker." },
      // CE RÉGLAGE N'EST PAS UNE GRAINE, et ne porte donc pas le rôle : c'est un CHOIX qui dit ce que
      // les graines du corps deviennent, comme celui d'un début de boucle de graphe.
      { nom: REGLAGE_GRAINES, nomEn: "Seeds", type: "choix",
        options: [GRAINES_PAR_PIECE, "Identiques"], optionsEn: ["One per piece", "Identical"],
        optionIds: [GRAINES_PAR_TOUR, "Identiques"], defaut: GRAINES_PAR_PIECE, defautEn: "One per piece",
        doc: "« Une par pièce » mêle le numéro de la pièce à chaque graine du corps, « Identiques » leur donne à toutes la même. Une graine à zéro est tirée une fois pour tout le corpus, et la reposer le refait entier.",
        docEn: "« One per piece » mixes the number of the piece into every seed of the body, « Identical » gives them all the same one. A seed at zero is drawn once for the whole corpus, and putting it back makes it whole again." },
    ],
    async executer(ctx) {
      if (ctx.paramTexte("Source", "nombre") === SOURCE_DOSSIER) return passeDuDossier(ctx);
      const combien = Math.max(1, Math.round(ctx.paramNombre("Pièces", 8)));
      // LA DÉCOUVERTE : le pilote lance une passe et lit le compte. Les morceaux ne portent que le rang.
      decouvrirPour(ctx.noeud.id, Array.from({ length: combien }, (_, i) => i));
      const b = boucleDuDebut(ctx.noeud.id);
      const rang = (b?.index ?? 0) + 1;
      const total = b?.morceaux.length ?? combien;
      return { valeurs: [String(rang), null, null], message: `${en() ? "piece" : "pièce"} ${rang}/${total}` };
    },
  }),
  fiche({
    id: FICHE_CORPUS_FIN,
    boucleParPasses: true,
    nom: "Fabriquer un corpus (fin)", nomEn: "Make a Corpus (End)",
    univers: "Autres", famille: "Harmonisation",
    resume: "Referme la boucle qui fabrique un corpus : chaque passe y dépose une pièce, écrite en fichier si on le demande.",
    resumeEn: "Closes the loop that makes a corpus: every pass lays one piece in it, written to a file when asked.",
    notice: "Ce composant referme la boucle ouverte par « Fabriquer un corpus (début) » : à chaque passe, la séquence reçue devient une pièce du corpus, avec ses voix et sa tonalité estimée sur ses notes.\n\n« Format » dit si chaque pièce est aussi écrite en fichier. « MIDI » écrit une piste par voix, chacune sur son canal ; « MusicXML » écrit une partie par voix, en clé de fa pour une voix dont la plupart des notes sont sous le do central ; « Aucun » n'écrit rien, et le corpus ne vit que dans le graphe. Les fichiers vont dans le dossier désigné par « Dossier ».\n\n« Préfixe » commence le nom de chaque fichier, suivi du numéro de la pièce sur trois chiffres au moins : piece-001.mid, piece-002.mid.\n\nQuand le début de la boucle lit un dossier, chaque pièce prend le nom de son fichier sans extension, après le préfixe et un tiret ; un préfixe vide laisse le nom du fichier seul : piece-gymnopedie.mid, ou gymnopedie.mid. Aucune pièce n'est alors écrite dans le dossier des fichiers lus, et le journal dit la raison.\n\n« Si le fichier existe » décide de ce qui arrive quand un fichier de ce nom est déjà dans le dossier : « Erreur » laisse le fichier en place et n'écrit pas la pièce, « Écraser » le remplace.\n\nL'entrée « Rang » reçoit le numéro de la pièce rendu par le début de la boucle ; sans elle, le numéro est celui de la passe. Quand le début lit un dossier, le nom vient du fichier, et le numéro n'entre pas dans le nom.\n\nLa sortie « Corpus » rend les pièces fabriquées jusqu'à la passe en cours, marquées comme un corpus en fabrication ; à la dernière, le corpus entier. Une exécution arrêtée garde ainsi ce qui a été fait. La sortie « Journal » donne une ligne par pièce : son nom, son nombre de notes et de voix, sa tonalité, et le fichier écrit ou la raison du refus. Le message donne, à la dernière passe, le nombre de pièces et une empreinte du corpus : deux corpus de même empreinte sont les mêmes.",
    noticeEn: "This component closes the loop opened by « Make a Corpus (Start) »: at every pass, the received sequence becomes a piece of the corpus, with its voices and its key estimated on its notes.\n\n« Format » says whether every piece is also written to a file. « MIDI » writes one track per voice, each on its channel; « MusicXML » writes one part per voice, in bass clef for a voice most of whose notes are below middle C; « None » writes nothing, and the corpus only lives in the graph. Files go to the folder named by « Folder ».\n\n« Prefix » begins the name of every file, followed by the number of the piece on at least three digits: piece-001.mid, piece-002.mid.\n\nWhen the start of the loop reads a folder, every piece takes the name of its file without extension, after the prefix and a hyphen; an empty prefix leaves the name of the file alone: piece-gymnopedie.mid, or gymnopedie.mid. No piece is then written into the folder of the files read, and the log gives the reason.\n\n« If the file exists » decides what happens when a file of that name is already in the folder: « Error » leaves the file in place and does not write the piece, « Overwrite » replaces it.\n\nThe « Rank » input receives the number of the piece returned by the start of the loop; without it, the number is that of the pass. When the start reads a folder, the name comes from the file, and the number does not enter the name.\n\nThe « Corpus » output returns the pieces made up to the current pass, marked as a corpus being made; at the last one, the whole corpus. A stopped run thus keeps what was done. The « Log » output gives one line per piece: its name, its number of notes and voices, its key, and the file written or the reason for the refusal. The message gives, at the last pass, the number of pieces and a fingerprint of the corpus: two corpora with the same fingerprint are the same.",
    entrees: [
      { nom: "Séquence", nomEn: "Sequence", type: "sequence", requis: true },
      { nom: "Rang", nomEn: "Rank", type: "texte", requis: false },
    ],
    sorties: [
      { nom: "Corpus", nomEn: "Corpus", type: "corpus" },
      { nom: "Journal", nomEn: "Log", type: "texte" },
    ],
    parametres: [
      { nom: "Format", nomEn: "Format", type: "choix",
        options: ["Aucun", "MIDI", "MusicXML"], optionsEn: ["None", "MIDI", "MusicXML"], optionIds: ["aucun", "midi", "musicxml"],
        defaut: "Aucun", defautEn: "None",
        doc: "Aucun fichier, une piste MIDI par voix, ou une partie MusicXML par voix.",
        docEn: "No file, one MIDI track per voice, or one MusicXML part per voice." },
      { nom: "Dossier", nomEn: "Folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Le dossier où les fichiers sont écrits. Le bouton « … » ouvre le sélecteur du système.",
        docEn: "The folder where files are written. The « … » button opens the system picker." },
      { nom: "Préfixe", nomEn: "Prefix", type: "texte", defaut: "piece", defautEn: "piece",
        doc: "Le début du nom de chaque fichier, avant le numéro de la pièce, ou avant le nom du fichier lu quand le début de la boucle lit un dossier ; vide, il laisse alors ce nom seul.",
        docEn: "The beginning of the name of every file, before the number of the piece, or before the name of the file read when the start of the loop reads a folder; empty, it then leaves that name alone." },
      { nom: "Si le fichier existe", nomEn: "If the file exists", type: "choix",
        options: ["Erreur", "Écraser"], optionsEn: ["Error", "Overwrite"], optionIds: ["erreur", "ecraser"],
        defaut: "Erreur", defautEn: "Error",
        doc: "« Erreur » laisse en place un fichier du même nom et n'écrit pas la pièce ; « Écraser » le remplace.",
        docEn: "« Error » leaves a file of the same name in place and does not write the piece; « Overwrite » replaces it." },
    ],
    async executer(ctx) {
      const entree = ctx.entree(0);
      if (!estSequence(entree) || entree.notes.length === 0) {
        return { valeurs: [null, null], erreur: true, message: en() ? "Connect a sequence to the Sequence input." : "Aucune séquence sur l'entrée Séquence." };
      }
      const b = boucleDeLaFin(ctx.noeud.id);
      const passe = b?.index ?? 0;
      const total = b?.morceaux.length ?? 1;
      const rangRecu = Number(ctx.entree(1));
      const rang = Number.isInteger(rangRecu) && rangRecu > 0 ? rangRecu : passe + 1;
      const prefixe = assainirNomFichier(ctx.paramTexte("Préfixe", "piece"));
      // UNE PIÈCE LUE DANS UN DOSSIER GARDE LE NOM DE SON FICHIER, et le corpus se relit pièce à pièce
      // contre le dossier d'où il vient. Le préfixe vide y laisse le nom seul.
      const lue = pieceDeLaPasse(b);
      const nom = lue
        ? nomDePieceLue(lue, prefixe)
        : `${prefixe || "piece"}-${String(rang).padStart(Math.max(3, String(total).length), "0")}`;
      const format = ctx.paramTexte("Format", "aucun");
      const voix = new Set(entree.notes.map((n) => n.voix ?? 0)).size;
      const tonalite = tonaliteDesNotes(entree);
      let source = nom;
      let fichier = en() ? "no file" : "aucun fichier";

      if (format === "midi" || format === "musicxml") {
        const dossier = ctx.paramTexte("Dossier", "").trim();
        const api = typeof window !== "undefined" ? (window as any).api : undefined;
        const nomFichier = `${nom}.${EXTENSION[format]}`;
        if (!dossier) fichier = en() ? "not written: no folder chosen" : "non écrite : aucun dossier choisi";
        // LE GARDE-FOU QUI COMPTE : sous un préfixe vide et « Écraser », chaque pièce remplacerait son
        // propre fichier source. Le dossier lu n'est jamais un dossier d'écriture.
        else if (lue && memeDossier(dossier, dossierDe(lue.chemin))) {
          fichier = en() ? "not written: this is the folder being read" : "non écrite : c'est le dossier des fichiers lus";
        } else if (!api?.ecrireFichier) fichier = en() ? "not written: requires the desktop application" : "non écrite : demande l'application de bureau";
        else {
          const presents: { nom: string }[] = ctx.paramTexte("Si le fichier existe", "erreur") === "ecraser" ? [] : ((await api.lireDossier?.(dossier)) ?? []);
          if (presents.some((f) => f.nom.toLowerCase() === nomFichier.toLowerCase())) {
            fichier = `${en() ? "not written: already exists" : "non écrite : existe déjà"} · ${nomFichier}`;
          } else {
            const donnees = format === "midi" ? await sequenceVersMidiParVoix(entree) : new TextEncoder().encode(sequenceVersMusicXMLParVoix(entree, { titre: nom }));
            try {
              await ecrireOuLever(api, joindre(dossier, nomFichier), donnees);
              fichier = nomFichier;
              source = nomFichier;
            } catch (e: any) {
              fichier = `${en() ? "not written" : "non écrite"} : ${e?.message ?? String(e)}`;
            }
          }
        }
      }
      const sequence: Sequence = { ...entree, titre: source };
      const nomTonalite = tonalite
        ? `${CLES.find((c) => c.demiTon === tonalite.tonique)?.[en() ? "en" : "fr"] ?? tonalite.tonique} ${tonalite.mode === "mineur" ? (en() ? "minor" : "mineur") : (en() ? "major" : "majeur")}`
        : "—";
      const ligne = `${source} · ${entree.notes.length} notes · ${voix} ${en() ? "voices" : "voix"} · ${nomTonalite} · ${fichier}`;
      const recolte: Recolte = { piece: { sequence, source, tonalite }, ligne };
      recolterPour(ctx.noeud.id, recolte);

      const recoltes = (b ? b.recoltes.slice(0, passe + 1) : [recolte]).filter(Boolean) as Recolte[];
      const corpus: Corpus = { pieces: recoltes.map((r) => r.piece) };
      const journal = recoltes.map((r) => r.ligne).join("\n");
      if (!b || passe >= total - 1) {
        const empreinte = empreinteCorpus(corpusVersJson(corpus, { nom: "", source: "", licence: "" }));
        return { valeurs: [corpus, journal], message: `${corpus.pieces.length} ${en() ? "pieces" : "pièces"} · ${en() ? "fingerprint" : "empreinte"} ${empreinte}` };
      }
      // LE CORPUS D'UNE PASSE QUI N'EST PAS LA DERNIÈRE SE DIT EN COURS : l'aval de la boucle rejoue à
      // chaque passe, et un apprentissage refait sur chaque corpus commencé multipliait son coût par
      // le nombre de pièces. Relevé sur `un-corpus-appris.json` : 120 s pour quarante pièces.
      return { valeurs: [{ ...corpus, enCours: { piece: passe + 1, pieces: total } }, journal], message: `${en() ? "piece" : "pièce"} ${passe + 1}/${total}` };
    },
  }),
] as FicheAudio[]).map(avecDoc);
