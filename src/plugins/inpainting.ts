// plugins/inpainting.ts — Reconstruire un morceau de son qui manque.
//
// D'après Adler, Emiya, Jafari, Elad, Gribonval et Plumbley, IEEE TASLP 20(3), 2012, pour le
// problème ; Janssen, Veldhuis et Vries, IEEE Trans. ASSP 34(2), 1986, pour la méthode. La logique
// est dans `audio/inpainting.ts`, testée ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { boucherTrous, detecterTrous, type Trou } from "../audio/inpainting";

/** Les zones du sélecteur multi-zones, en secondes, converties en échantillons. */
function trousDepuisZones(zones: unknown, sampleRate: number, longueur: number): Trou[] {
  const liste = Array.isArray(zones) ? zones : [];
  return liste
    .filter((z: any) => z && typeof z.debut === "number" && typeof z.duree === "number")
    .map((z: any) => ({
      debut: Math.max(0, Math.round(z.debut * sampleRate)),
      longueur: Math.min(Math.round(z.duree * sampleRate), longueur),
    }))
    .filter((t) => t.longueur > 0 && t.debut < longueur);
}

export const fiches: FicheAudio[] = ([
  {
    id: "remplissage-trou", nom: "Remplissage de trou", nomEn: "Audio Inpainting",
    univers: "Traitement", famille: "Effets",
    resume: "Reconstruit un passage manquant en prolongeant la résonance du son de part et d'autre.",
    resumeEn: "Rebuilds a missing passage by continuing the sound's own resonance from both sides.",
    entrees: [
      { nom: "Audio", type: "audio" },
      { nom: "Zones", nomEn: "Zones", type: "controle", requis: false },
    ],
    sorties: [{ nom: "Audio", type: "audio" }],
    parametres: [
      { nom: "Trous", nomEn: "Gaps", type: "choix",
        options: ["Zones branchées", "Silences détectés"], optionsEn: ["Connected zones", "Detected silences"],
        optionIds: ["zones", "silences"], defaut: "Zones branchées", defautEn: "Connected zones",
        doc: "D'où viennent les trous à boucher. « Zones branchées » les prend sur l'entrée Zones — le Sélecteur multi-zones est fait pour ça : on sélectionne le passage à refaire, et le nœud le rebâtit. « Silences détectés » cherche lui-même les passages muets, ce qui convient aux décrochages d'enregistrement, qui sont exactement à zéro.",
        docEn: "Where the gaps to fill come from. « Connected zones » takes them from the Zones input — the Multi-Zone Selector is made for this: select the passage to rebuild, and the node rebuilds it. « Detected silences » looks for mute passages itself, which suits recording dropouts, being exactly at zero." },
      { nom: "Seuil de silence", nomEn: "Silence threshold", type: "curseur", plage: [-90, -20], pas: 1, defaut: -60, unite: "dB",
        doc: "Niveau en dessous duquel un échantillon est tenu pour manquant, en détection automatique. Pas zéro strict : un fichier passé par un encodage laisse des valeurs d'un millième au lieu du silence exact.",
        docEn: "Level below which a sample counts as missing, in automatic detection. Not strict zero: a file that has been through an encoder leaves values of a thousandth instead of exact silence." },
      { nom: "Durée min", nomEn: "Minimum length", type: "curseur", plage: [0.2, 20], pas: 0.1, defaut: 1, unite: "ms",
        doc: "Durée en dessous de laquelle un silence n'est pas tenu pour un trou, en détection automatique. Sans elle, chaque passage par zéro d'une sinusoïde serait pris pour un trou — c'est l'erreur exacte que fait un détecteur naïf.",
        docEn: "Length below which a silence is not taken for a gap, in automatic detection. Without it, every zero crossing of a sine would be taken for a gap — the exact mistake a naive detector makes." },
      { nom: "Ordre", nomEn: "Order", type: "curseur", plage: [0, 256], pas: 8, defaut: 0,
        doc: "Ordre du modèle autorégressif, c'est-à-dire de combien d'échantillons passés chacun dépend. À ZÉRO, il est choisi tout seul : trois fois la longueur du trou, plafonnée à 256, ce qui est la règle de l'article. Repère utile : une sinusoïde est un processus d'ordre DEUX exactement, si bien qu'un ordre trente porte quinze partielles sans approximation.",
        docEn: "Order of the autoregressive model, that is, on how many past samples each sample depends. At ZERO it is chosen automatically: three times the gap length, capped at 256, which is the paper's rule. A useful landmark: a sine is exactly a second-order process, so an order of thirty carries fifteen partials with no approximation." },
      { nom: "Tours", nomEn: "Passes", type: "curseur", plage: [1, 40], pas: 1, defaut: 12,
        doc: "Tours d'alternance entre l'estimation du modèle et le calcul du trou. Le calcul s'arrête de lui-même dès que le trou ne bouge plus, si bien qu'augmenter ce nombre ne coûte rien quand ce n'est pas utile.",
        docEn: "Alternations between estimating the model and computing the gap. Computation stops of its own accord as soon as the gap stops moving, so raising this number costs nothing when it is not needed." },
      { nom: "Trou max", nomEn: "Max gap", type: "curseur", plage: [5, 500], pas: 5, defaut: 120, unite: "ms",
        doc: "Au-delà, le trou est laissé tel quel et le nœud le dit. Ce n'est pas une limite de principe mais de TEMPS : le calcul croît comme la longueur du trou multipliée par le carré de l'ordre — 90 ms pour un trou de 20 ms, deux secondes et demie pour un trou de 100 ms. Et la qualité baisse : 53 dB à 20 ms, 34 dB à 100 ms.",
        docEn: "Beyond this, the gap is left as it is and the node says so. This is not a limit of principle but of TIME: computation grows as gap length times the square of the order — 90 ms for a 20 ms gap, two and a half seconds for a 100 ms one. And quality drops: 53 dB at 20 ms, 34 dB at 100 ms." },
    ],
    async executer(ctx: any) {
      const entree = ctx.entree(0);
      if (!(entree instanceof AudioBuffer)) {
        return { valeurs: [null], message: traduire("msg.aucune_entr_e") };
      }
      const { numberOfChannels: canaux, length, sampleRate } = entree;
      const automatique = ctx.paramTexte("Trous", "zones") === "silences";
      const seuil = Math.pow(10, ctx.paramNombre("Seuil de silence", -60) / 20);
      const longueurMin = Math.max(1, Math.round((ctx.paramNombre("Durée min", 1) * sampleRate) / 1000));
      const ordre = Math.round(ctx.paramNombre("Ordre", 0));
      const options = {
        ordre: ordre > 0 ? ordre : undefined,
        iterations: Math.round(ctx.paramNombre("Tours", 12)),
        trouMax: Math.round((ctx.paramNombre("Trou max", 120) * sampleRate) / 1000),
      };

      const zones = automatique ? [] : trousDepuisZones(ctx.entree(1), sampleRate, length);
      if (!automatique && zones.length === 0) {
        return { valeurs: [entree], message: traduire("msg.trou.aucuneZone") };
      }

      const sortie = new AudioBuffer({ numberOfChannels: canaux, length, sampleRate });
      let bouches = 0, echantillons = 0, renonces = 0;
      for (let c = 0; c < canaux; c++) {
        ctx.onProgress?.(traduire("msg.trou.canal", String(c + 1), String(canaux)));
        const voie = entree.getChannelData(c);
        // En détection automatique, les trous se cherchent canal par canal : un décrochage peut
        // n'avoir touché qu'une voie.
        const trous = automatique ? detecterTrous(voie, seuil, longueurMin) : zones;
        const r = boucherTrous(voie, trous, options);
        sortie.getChannelData(c).set(r.signal);
        bouches += r.bouches;
        echantillons += r.echantillons;
        renonces += r.renonces;
      }
      const ms = ((1000 * echantillons) / Math.max(1, sampleRate * canaux)).toFixed(0);
      return {
        valeurs: [sortie],
        message: renonces > 0
          ? traduire("msg.trou.bouchesEtRenonces", String(Math.round(bouches / canaux)), ms, String(Math.round(renonces / canaux)))
          : traduire("msg.trou.bouches", String(Math.round(bouches / canaux)), ms),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
