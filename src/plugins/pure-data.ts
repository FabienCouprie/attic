// plugins/pure-data.ts — Nœud d'exécution d'un patch Pure Data (.pd).
import type { FicheAudio } from "../audio/types-domaine";
import { avecDoc } from "./notices";

export const fiches: FicheAudio[] = ([
  {
    id: "pure-data",
    nom: "Pure Data",
    nomEn: "Pure Data",
    univers: "Traitement",
    famille: "Effets",
    resume: "Exécute un patch Pure Data (.pd) sur l'audio d'entrée.",
    resumeEn: "Runs a Pure Data patch (.pd) on the input audio.",
    entrees: [{ nom: "Audio", type: "audio" }],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      {
        nom: "Bibliothèques",
        nomEn: "Libraries",
        type: "choix",
        options: ["vanilla", "cyclone", "else", "full"],
        optionsEn: ["vanilla", "cyclone", "else", "full"],
        defaut: "vanilla",
        doc: "Ensemble d'objets Pd disponibles pour le patch. vanilla = objets de base, cyclone/else = objets externes courants, full = tout.",
        docEn: "Set of Pd objects available to the patch. vanilla = core objects, cyclone/else = common externals, full = everything.",
      },
      {
        nom: "Canaux sortie",
        nomEn: "Output channels",
        type: "curseur",
        plage: [1, 8],
        pas: 1,
        defaut: 2,
        unite: "ch",
        doc: "Nombre de canaux de la sortie audio. Le patch doit écrire sur les canaux dac~ correspondants.",
        docEn: "Number of channels of the audio output. The patch must write to the matching dac~ channels.",
      },
      {
        nom: "Bang démarrage",
        nomEn: "Bang on start",
        type: "choix",
        options: ["oui", "non"],
        optionsEn: ["yes", "no"],
        defaut: "oui",
        doc: "Envoie un bang à l'objet [loadbang] au démarrage de l'audio.",
        docEn: "Send a bang to the [loadbang] object when audio starts.",
      },
      {
        nom: "Patch",
        nomEn: "Patch",
        type: "texte",
        defaut: "",
        doc: "Identifiant du patch chargé (mis à jour automatiquement par le sélecteur de fichier). Sert à invalider le cache quand le fichier change.",
        docEn: "Identifier of the loaded patch (updated automatically by the file picker). Used to invalidate the cache when the file changes.",
      },
    ],
    async executer(ctx: any) {
      const buffer = ctx.entree(0);
      if (!(buffer instanceof AudioBuffer)) {
        return { valeurs: [null], erreur: true, message: "Aucune entrée audio." };
      }

      const fichier = ctx.noeud.data.pureDataFichier as File | undefined;
      if (!fichier) {
        return { valeurs: [null], erreur: true, message: "Aucun patch Pure Data chargé." };
      }

      const patchSource = await fichier.text();
      if (!patchSource.trim()) {
        return { valeurs: [null], erreur: true, message: "Patch Pure Data vide." };
      }

      const packages = ctx.paramTexte("Bibliothèques", "vanilla");
      const outputChannels = ctx.paramNombre("Canaux sortie", 2);
      const bangOnStart = ctx.paramTexte("Bang démarrage", "oui") === "oui";

      try {
        const { appliquerPatchPureData } = await import("../audio/pure-data");
        const out = await appliquerPatchPureData(buffer, patchSource, {
          packages,
          outputChannels,
          bangOnStart,
        });
        return { valeurs: [out], message: `Pure Data · ${fichier.name}` };
      } catch (err: any) {
        return { valeurs: [null], erreur: true, message: `Erreur Pure Data : ${err?.message ?? err}` };
      }
    },
  },
] as FicheAudio[]).map(avecDoc);
