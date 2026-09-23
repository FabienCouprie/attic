// plugins/boucle-collection.ts — Les deux nœuds qui encadrent un traitement par lot.
//
// CE QU'ILS AJOUTENT À CE QUI EXISTAIT. Le catalogue savait déjà convertir un dossier entier —
// « Conversion WAV→MP3 » et ses voisines lisent un répertoire et en écrivent un autre. Mais ces
// nœuds n'ont ni entrée ni sortie : l'opération est enfermée dedans, et l'on ne peut rien
// intercaler. Ici, le début et la fin sont deux nœuds ordinaires, avec des ports ordinaires : ce
// qu'on met entre eux est un graphe quelconque, et c'est ce graphe qui s'applique à chaque fichier.
//
// LA FORME EST CELLE DES DEUX AUTRES RÉPÉTITIONS DU PROJET, et ce n'est pas un hasard : un début
// et une fin qui encadrent une chaîne, comme « Début de boucle » / « Fin de boucle » et comme
// « Note » / « Fin d'instrument ». Ce qui change est la MÉCANIQUE. Les deux autres recopient la
// chaîne avant l'exécution, et tous les tours vivent alors ensemble — tenable sur une note de deux
// secondes, intenable sur trente morceaux de trois minutes, qui demanderaient 7,5 Go. Celle-ci
// exécute le graphe une fois par fichier, l'un après l'autre, et la mémoire d'une passe est rendue
// avant la suivante. Voir `plugins/lotGlobal.ts` et `ui/hooks/useExecutionGraphe.ts`.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { decoderSansReechantillonner } from "../audio/frequence-source";
import { FICHE_LOT_DEBUT, FICHE_LOT_FIN, joindre, lotCourant, nomDeSortie } from "./lotGlobal";
import { lireProfondeurExport } from "../ui/profondeur-export";
import { decrire } from "../audio/metadonnees";

export const fiches: FicheAudio[] = ([
  {
    id: FICHE_LOT_DEBUT, nom: "Début de boucle collection", nomEn: "Collection Loop Start",
    univers: "Collections", famille: "Conversion",
    resume: "Ouvre un traitement par lot : le graphe est exécuté une fois par fichier audio du dossier, et ce composant rend le fichier de la passe en cours.",
    resumeEn: "Opens a batch: the graph is run once per audio file in the folder, and this node returns the file of the current pass.",
    notice: "Applique un graphe à chaque fichier d'un dossier. Ce composant et « Fin de boucle collection » encadrent la chaîne à appliquer. Ce qu'on met entre les deux est un graphe quelconque (un égaliseur, une réverbération, une normalisation en sonie, une chaîne entière) et c'est ce graphe qui s'applique à chaque fichier du dossier.\n\nLe graphe est exécuté une fois par fichier, l'un après l'autre, et non recopié autant de fois qu'il y a de fichiers. La distinction n'est pas théorique : une répétition qui déplie la chaîne avant l'exécution fait vivre tous les tours ensemble. C'est sans conséquence sur une note de deux secondes, et cela demanderait 7,5 Go sur trente morceaux de trois minutes. Ici la mémoire d'une passe est rendue avant la suivante, et le nombre de fichiers n'a donc pas de plafond.\n\nL'ordre est celui des noms, et non celui que le système de fichiers rend : un lot dont l'ordre change d'une exécution à l'autre rendrait tout journal incomparable.\n\nUn seul début de boucle collection par graphe. Deux lots imbriqués n'auraient pas de sens ici, chacun voulant commander le nombre de passes.",
    noticeEn: "Applies a graph to every file in a folder. This node and « Collection Loop End » bracket the chain to apply. What is placed between them is any graph at all (an equaliser, a reverb, a loudness normalisation, a whole chain) and it is that graph which is applied to every file in the folder.\n\nThe graph is run once per file, one after another, rather than copied as many times as there are files. The distinction is not theoretical: a repetition that unrolls the chain before execution makes every turn live at once. That is harmless on a two-second note, and would ask for 7.5 GB on thirty three-minute tracks. Here a pass releases its memory before the next one, so the number of files has no ceiling.\n\nThe order is that of the names, not the one the file system returns: a batch whose order changed between runs would make any log incomparable.\n\nOne collection loop start per graph. Two nested batches would make no sense here, each wanting to command the number of passes.",
    entrees: [],
    sorties: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    parametres: [
      { nom: "Dossier", nomEn: "Folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Le dossier dont chaque fichier audio sera traité. Les extensions reconnues sont wav, wave, ogg, mp3, flac, m4a, aac, aif et aiff ; tout le reste est ignoré sans bruit. Le nombre de passes est le nombre de fichiers trouvés, et il se lit sur ce composant dès le lancement.",
        docEn: "The folder whose every audio file will be processed. Recognised extensions are wav, wave, ogg, mp3, flac, m4a, aac, aif and aiff; everything else is quietly ignored. The number of passes is the number of files found, and it is shown on this node as soon as the run starts." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const lot = lotCourant();
      if (!lot) {
        return {
          valeurs: [null],
          message: en
            ? "Batch starts with the graph: press Run."
            : "Le lot démarre avec le graphe : lancez l'exécution.",
        };
      }
      if (lot.fichiers.length === 0) {
        return {
          valeurs: [null],
          message: en ? "No audio file in this folder." : "Aucun fichier audio dans ce dossier.",
        };
      }
      const fichier = lot.fichiers[lot.index];
      if (!fichier) return { valeurs: [null], message: en ? "Pass out of range." : "Passe hors du lot." };

      const api = (window as any).api;
      if (!api?.lireFichierAudio) {
        return { valeurs: [null], message: en ? "Electron required." : "Electron requis." };
      }
      try {
        const lu = await api.lireFichierAudio(fichier.chemin);
        if (!lu?.url) throw new Error(en ? "no data" : "aucune donnée");
        const reponse = await fetch(lu.url);
        const octets = await reponse.arrayBuffer();
        // À la fréquence de la source : un lot ne convertit pas ce qu'on ne lui a pas demandé.
        const audio = await decoderSansReechantillonner(octets);
        return {
          valeurs: [audio],
          message: `${lot.index + 1}/${lot.fichiers.length} · ${fichier.nom}\n${audio.duration.toFixed(1)} s`,
        };
      } catch (e: any) {
        // Un fichier illisible ne doit pas arrêter le lot : la passe échoue, les suivantes passent.
        return {
          valeurs: [null],
          message: `${lot.index + 1}/${lot.fichiers.length} · ${fichier.nom}\n${e?.message ?? String(e)}`,
        };
      }
    },
  },
  {
    id: FICHE_LOT_FIN, nom: "Fin de boucle collection", nomEn: "Collection Loop End",
    univers: "Collections", famille: "Conversion",
    resume: "Referme un traitement par lot : écrit le résultat de chaque passe dans le dossier de sortie, sous le nom du fichier d'origine.",
    resumeEn: "Closes a batch: writes each pass's result into the output folder, under the source file's name.",
    notice: "Ce composant écrit le résultat de chaque passe dans le dossier de sortie, sous le nom de sa source, augmenté du suffixe s'il y en a un. Quand un fichier de ce nom s'y trouve déjà, le réglage décide : la passe est refusée et le fichier existant reste intact, ou il est écrasé.\n\nLe composant ne fait rien d'autre qu'écrire : sans lui, un lot calculerait trente résultats et n'en garderait aucun, chaque passe effaçant la précédente.\n\nLe nom d'un fichier écrit est celui de sa source, son extension remplacée. C'est ce qui rend un lot relisible : le dossier de sortie se compare au dossier d'entrée fichier par fichier, et l'on voit tout de suite ce qui manque. Un suffixe peut s'ajouter pour distinguer deux passages successifs du même lot.\n\nLa profondeur d'écriture est celle de la barre d'outils, comme pour toute sauvegarde, 24 bits par défaut.\n\nLe dossier de sortie doit différer du dossier d'entrée, et le composant refuse s'ils sont les mêmes. À extension identique, chaque fichier écraserait sa propre source, et le lot détruirait ce qu'il traite, sans que rien ne le signale avant la fin.\n\nLa sortie texte est le journal du lot, une ligne par fichier, complet à la dernière passe. C'est ce qu'on relit pour savoir lesquels sont passés.",
    noticeEn: "This node writes the result of each pass into the output folder, under the name of its source, plus the suffix if there is one. When a file of that name is already there, the setting decides: the pass is refused and the existing file left intact, or it is overwritten.\n\nThe node does nothing but write: without it a batch would compute thirty results and keep none, each pass erasing the one before.\n\nA written file's name is its source's, with the extension replaced. That is what makes a batch readable back: the output folder compares to the input folder file by file, and one sees at once what is missing. A suffix can be added to tell two successive runs of the same batch apart.\n\nThe bit depth is the toolbar's, as for any save, 24-bit by default.\n\nThe output folder must differ from the input folder, and the node refuses if they are the same. At identical extension every file would overwrite its own source, and the batch would destroy what it processes, with nothing to say so until the end.\n\nThe text output is the batch log, one line per file, complete at the last pass. It is read back to know which ones went through.",
    entrees: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
    ],
    sorties: [{ nom: "Journal", nomEn: "Log", type: "texte" }],
    parametres: [
      { nom: "Dossier sortie", nomEn: "Output folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Le dossier où chaque résultat est écrit. Il doit différer du dossier d'entrée : à extension identique, chaque fichier écraserait sa propre source, et le lot détruirait ce qu'il traite.",
        docEn: "The folder where each result is written. It must differ from the input folder: at identical extension every file would overwrite its own source, and the batch would destroy what it processes." },
      { nom: "Format", nomEn: "Format", type: "choix",
        options: ["WAV", "MP3"], optionsEn: ["WAV", "MP3"], optionIds: ["wav", "mp3"],
        defaut: "WAV", defautEn: "WAV",
        doc: "Le format des fichiers écrits. Le WAV suit la profondeur choisie dans la barre d'outils ; le MP3 est encodé à 192 kbit/s, et n'a pas de profondeur.",
        docEn: "The format of the written files. WAV follows the bit depth chosen in the toolbar; MP3 is encoded at 192 kbps, and has no bit depth." },
      { nom: "Si le fichier existe", nomEn: "If the file exists", type: "choix",
        options: ["Signaler une erreur", "Écraser"], optionsEn: ["Report an error", "Overwrite"],
        optionIds: ["erreur", "ecraser"], defaut: "Signaler une erreur", defautEn: "Report an error",
        doc: "Ce que fait la passe quand le dossier de sortie contient déjà un fichier de ce nom. « Signaler une erreur » la refuse et passe à la suivante, le fichier existant intact ; « Écraser » le remplace. Un lot relancé sans changer de suffixe réécrit sur ses propres résultats : c'est le cas que ce réglage rend explicite.",
        docEn: "What a pass does when the output folder already contains a file of that name. « Report an error » refuses the pass and moves on, leaving the existing file intact; « Overwrite » replaces it. A batch run again without changing the suffix writes over its own results: that is the case this setting makes explicit." },
      { nom: "Suffixe", nomEn: "Suffix", type: "texte", defaut: "", defautEn: "",
        placeholder: "-traite", placeholderEn: "-processed",
        doc: "Ajouté au nom avant l'extension. Sert à distinguer deux passages successifs du même lot dans un même dossier, ou simplement à marquer ce qui a été traité.",
        docEn: "Added to the name before the extension. Useful to tell two successive runs of the same batch apart in one folder, or simply to mark what has been processed." },
    ],
    async executer(ctx: any) {
      const en = langueCourante() === "en";
      const lot = lotCourant();
      const audio = ctx.entree(0);
      if (!lot) {
        return { valeurs: [null], message: en ? "No batch running." : "Aucun lot en cours." };
      }

      const dossier = ctx.paramTexte("Dossier sortie", "").trim();
      const fichier = lot.fichiers[lot.index];
      const rang = `${lot.index + 1}/${lot.fichiers.length}`;

      const echouer = (raison: string) => {
        lot.journal.push(`  ${rang.padStart(7)}  ${fichier?.nom ?? "?"}  — ${raison}`);
        return { valeurs: [lot.journal.join("\n")], message: `${rang}\n${raison}` };
      };

      if (!dossier) return echouer(en ? "output folder not set" : "dossier de sortie non réglé");
      if (!fichier) return echouer(en ? "pass out of range" : "passe hors du lot");
      if (!(audio instanceof AudioBuffer)) return echouer(en ? "nothing on the input" : "rien sur l'entrée");

      // LE GARDE-FOU QUI COMPTE. À extension identique, écrire dans le dossier d'entrée écraserait
      // chaque source par son propre traitement. Le lot détruirait alors ce qu'il traite, et rien
      // ne le signalerait avant la fin — quand il n'y aurait plus rien à rattraper.
      const memeDossier = (a: string, b: string) =>
        a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();
      const dossierSource = fichier.chemin.slice(0, Math.max(fichier.chemin.lastIndexOf("\\"), fichier.chemin.lastIndexOf("/")));
      if (memeDossier(dossier, dossierSource)) {
        return echouer(en
          ? "output folder is the input folder — the batch would overwrite its own sources"
          : "le dossier de sortie est celui d'entrée — le lot écraserait ses propres sources");
      }

      const api = (window as any).api;
      if (!api?.ecrireFichier) return echouer(en ? "Electron required" : "Electron requis");

      try {
        const format = ctx.paramTexte("Format", "wav") === "mp3" ? "mp3" : "wav";
        const suffixe = ctx.paramTexte("Suffixe", "");

        // LE NOM DE SORTIE EST CELUI DE LA SOURCE, plus le suffixe. Un port « Nom » a existé ici,
        // qui permettait de renommer depuis le graphe ; il demandait de comprendre deux ports pour
        // un usage rare, et deux fichiers renommés pareil s'écrasaient en silence. Retiré à la
        // demande de Fabien : deux sources d'un même dossier ne portant pas le même nom, la
        // collision n'est plus possible.
        const nom = nomDeSortie(fichier.nom, format, suffixe);

        // CE QUI EST DÉJÀ DANS LE DOSSIER DE SORTIE. Écrire par-dessus est le comportement qu'on
        // veut parfois — relancer un lot corrigé — et celui qu'on ne veut jamais par accident : un
        // lot relancé sans changer de suffixe passe sur ses propres résultats. Le dossier est relu
        // à chaque passe plutôt que gardé en mémoire : entre deux passes, l'utilisateur peut avoir
        // vidé ou rempli le dossier, et c'est l'état au moment d'écrire qui décide.
        if (ctx.paramTexte("Si le fichier existe", "erreur") !== "ecraser") {
          const presents = (await api.lireDossier(dossier)) ?? [];
          const deja = presents.some((f: { nom: string }) => f.nom.toLowerCase() === nom.toLowerCase());
          if (deja) {
            return echouer(en
              ? `already in the output folder: ${nom}`
              : `déjà dans le dossier de sortie : ${nom}`);
          }
        }

        const { bufferVersWavBlob, bufferVersMp3Blob } = await import("../audio");
        // La provenance part avec le fichier : dans le dossier de livraison, chaque sortie dit de
        // quelle source elle vient.
        const bits = lireProfondeurExport();
        const provenance = { noeud: "Fin de boucle collection", source: fichier.nom, nomFichier: nom };
        const blob = format === "mp3"
          ? await bufferVersMp3Blob(audio, 192, undefined, decrire(audio, provenance))
          : bufferVersWavBlob(audio, undefined, false, { bits, ixml: decrire(audio, provenance, bits).ixml });
        await api.ecrireFichier(joindre(dossier, nom), await blob.arrayBuffer());
        lot.nomsEcrits.push(nom.toLowerCase());

        const duree = `${audio.duration.toFixed(1)} s`;
        lot.journal.push(`  ${rang.padStart(7)}  ${nom.padEnd(40)}${duree.padStart(9)}`);
        return {
          valeurs: [lot.journal.join("\n")],
          message: `${rang} · ${nom}\n${duree}`,
        };
      } catch (e: any) {
        return echouer(e?.message ?? String(e));
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
