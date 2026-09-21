// plugins/csound-orchestre.ts — Cocher des instruments, obtenir un orchestre.
//
// La composition est dans `audio/csound-orchestre.ts`, testée : numérotation, tables partagées par
// `ftgen`, et un seul nombre de canaux pour tout le monde. Ce fichier n'est que la prise, et la vue du
// nœud offre la liste à cocher — l'inspecteur n'ayant pas de type « choix multiple », le réglage est
// un texte, ce qui le laisse lisible, sérialisable et modifiable à la main.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire, langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import {
  INSTRUMENTS_ORCHESTRE, analyserListeInstruments, construireOrchestre, rapportOrchestreLisible,
} from "../audio/csound-orchestre";

/** Les deux premiers de la liste : un orchestre qui sonne dès qu'on pose le nœud. */
const DEFAUT = "wgbow,foscil";

export const fiches: FicheAudio[] = ([
  {
    id: "orchestre-csound", nom: "Orchestre Csound", nomEn: "Csound Orchestra",
    univers: "Autres", famille: "Csound wrapper",
    resume: "Compose un orchestre Csound en cochant plusieurs instruments, et rend une partition d'essai jouable qui les fait sonner chacun à son tour.",
    resumeEn: "Composes a Csound orchestra by ticking several instruments, and outputs a playable test score that sounds each one in turn.",
    entrees: [],
    sorties: [
      { nom: "Orchestre", nomEn: "Orchestra", type: "texte" },
      // Ce port EST une partition : branché sur l'entrée Partition du nœud Csound, il fait sonner
      // les instruments cochés l'un après l'autre. Il portait le nom de « Rapport » et ne faisait
      // que répéter, en plus long, ce que le message du nœud dit déjà.
      { nom: "Partition d'essai", nomEn: "Test score", type: "texte" },
    ],
    parametres: [
      { nom: "Instruments", nomEn: "Instruments", type: "texte", defaut: DEFAUT, defautEn: DEFAUT,
        doc: "Les instruments retenus, par leurs identifiants séparés par des virgules. La liste à cocher du nœud écrit ce champ, et l'ordre y décide des numéros : le premier coché devient `instr 1`, le second `instr 2`. Un identifiant inconnu est écarté sans faire échouer le reste, et un doublon est ignoré — deux fois le même instrument donnerait deux numéros au même son.",
        docEn: "The chosen instruments, by their identifiers separated by commas. The node's tick list writes this field, and the order there decides the numbers: the first ticked becomes `instr 1`, the second `instr 2`. An unknown identifier is dropped without failing the rest, and a duplicate is ignored — the same instrument twice would give two numbers to one sound." },
      { nom: "Canaux", nomEn: "Channels", type: "choix",
        options: ["Mono", "Stéréo"], optionsEn: ["Mono", "Stereo"], optionIds: ["1", "2"],
        defaut: "Mono", defautEn: "Mono",
        doc: "Comment tous les instruments écrivent leur sortie — `out` en mono, `outs` en stéréo. Ce réglage doit être le même que celui du nœud Csound : un orchestre stéréo rendu par un nœud réglé en mono perd un canal sur deux, et l'inverse rend un silence. Le message du nœud rappelle lequel poser.",
        docEn: "How every instrument writes its output — `out` in mono, `outs` in stereo. This must match the Csound node's setting: a stereo orchestra rendered by a node set to mono loses every other channel, and the reverse renders silence. The node's message states which one to set." },
      { nom: "Premier instrument", nomEn: "First instrument", type: "nombre", plage: [1, 90], pas: 1, defaut: 1,
        doc: "Numéro du premier `instr`. À laisser à 1 sauf si l'orchestre est assemblé avec un autre : « Partition Csound » numérote aussi à partir de 1, et les deux doivent coïncider.",
        docEn: "Number of the first `instr`. Leave it at 1 unless the orchestra is assembled with another: « Csound Score » also numbers from 1, and the two must agree." },
      { nom: "Niveau", nomEn: "Level", type: "curseur", plage: [0, 100], pas: 1, defaut: 100, unite: "%",
        doc: "Niveau appliqué à tous les instruments, en plus du gain propre à chacun. Ces gains viennent de la mesure : les opcodes de Csound ne partagent aucune convention d'amplitude — pour une amplitude demandée de 0,6, les crêtes mesurées allaient de 0,10 pour la résonance modale à 0,95 pour la corde frottée, qui touchait le limiteur.",
        docEn: "Level applied to every instrument, on top of each one's own gain. Those gains come from measurement: Csound's opcodes share no amplitude convention — for a requested amplitude of 0.6, measured peaks ranged from 0.10 for the modal resonance to 0.95 for the bowed string, which hit the limiter." },
    ],
    async executer(ctx: any) {
      const ids = analyserListeInstruments(ctx.paramTexte("Instruments", DEFAUT));
      if (ids.length === 0) {
        return { valeurs: [null, null], message: traduire("msg.csound.orchestreVide") };
      }
      const canaux = parseInt(ctx.paramTexte("Canaux", "1"), 10) === 2 ? 2 : 1;
      const { texte, rapport } = construireOrchestre(ids, {
        canaux,
        base: Math.round(ctx.paramNombre("Premier instrument", 1)),
        niveau: ctx.paramNombre("Niveau", 100) / 100,
      });
      const demandes = analyserListeInstruments(ctx.paramTexte("Instruments", DEFAUT)).length;
      const brut = String(ctx.paramTexte("Instruments", DEFAUT)).split(/[,;\s]+/).filter(Boolean).length;
      const ecartes = Math.max(0, brut - demandes);
      return {
        valeurs: [texte, rapportOrchestreLisible(rapport, langueCourante() === "en")],
        message: traduire("msg.csound.orchestreFait",
          String(rapport.instruments.length),
          canaux === 2 ? "stéréo" : "mono",
          rapport.instruments.map((i) => `i${i.numero} ${i.id}`).join(", "))
          + (ecartes > 0 ? ` · ${traduire("msg.csound.orchestreEcartes", String(ecartes))}` : ""),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);

export { INSTRUMENTS_ORCHESTRE };
