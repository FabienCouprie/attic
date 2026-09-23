// plugins/parfum.ts — Nœud « Parfum → motif ».
//
// Le vocabulaire des odeurs et leurs sources sont dans `audio/parfum.ts` ; la fabrique du motif dans
// `audio/motif-crossmodal.ts`. Les deux sont purs et testés ; ce fichier n'est que la prise.

import type { FicheAudio } from "../audio/types-domaine";
import { langueCourante } from "../i18n";
import { avecDoc } from "./notices";
import { ODEURS, TIMBRES, odeurParId, pointDepuisParfum } from "../audio/parfum";
import { dbDepuisIntensite, hertzDepuisHauteur, motifDepuisPoint, nomDeNote, octetsMidi, rendreAuRegistre, viserNiveau } from "../audio/motif-crossmodal";
import { mesurer, profil } from "../audio/gout";
import { rendreSequence } from "../audio/midi";
import { creerAleatoire } from "../core/hasard";
import { sf2Chargee, normaliserModeSynthèse, PARAMETRE_SYNTHESE, PARAMETRE_INSTRUMENT_SF2_SUIVI } from "./soundfontGlobal";

const en = () => langueCourante() === "en";

export const fiches: FicheAudio[] = ([
  {
    id: "parfum-motif", nom: "Parfum → motif", nomEn: "Odour → Motif",
    univers: "Entrées", famille: "Génération",
    resume: "Fabrique un motif d'après une odeur — registre, consonance et timbre pris des correspondances publiées entre odeurs et sons.",
    resumeEn: "Builds a motif from an odour — register, consonance and timbre taken from the published odour-sound correspondences.",
    notice: "Ce nœud prend une odeur dans une liste et rend un motif de plusieurs voix, en audio et en MIDI, avec le rapport de ce qui a été fait.\n\nCe que l'odeur décide. Son registre : les odeurs fruitées et les agrumes vont vers l'aigu, le musc, le café torréfié, la fumée et le chocolat noir vers le grave. Son agrément porte la consonance, l'agrément et la complexité d'une odeur — et non son intensité — étant ce qui décide de l'appariement dans l'étude dont ce nœud se sert. Sa complexité porte le nombre d'événements par seconde. Son timbre suit trois familles de mots, [brillant, frais, éthéré], [aigu, métallique] et [plein, riche, chaud], auxquelles répondent une flûte, un hautbois et un violoncelle.\n\nCe que l'odeur ne décide pas : l'articulation, dont la littérature des odeurs ne dit rien, et l'intensité, dont elle établit qu'elle ne compte pas dans l'appariement. Les deux se règlent à part et valent 50 % par défaut.\n\nComment le motif est fabriqué. Les voix sonnent simultanément, à la quinte pour un point consonant, en amas de cinq notes pour un point âpre — la rugosité naît de partiels voisins qui battent ensemble, non d'intervalles âpres enchainés l'un après l'autre. La voix du dessous porte l'énergie, les autres sonnent à 60 %. Les attaques sont régulières, une par pas, et le timbre de synthèse est doux, sa médiane d'énergie devant rester proche de sa fondamentale pour que le registre soit atteint.\n\nCe que le nœud atteint. Le registre tombe à 0,03 près du point visé, la vitesse à 0,05 près, l'intensité exactement, sauf sur un motif dont la crête interdit de monter au niveau demandé sans écrêter. L'articulation reste au-dessus de sa valeur visée dans le piqué, la résonance du synthétiseur remplissant une part des silences : autour de 0,28 pour 0,10 demandé. La consonance est la plus faible des cinq dimensions : elle descend de 0,99 à 0,70 environ et pas en dessous, là où la région acide en demanderait 0,15. Le rapport donne les cinq écarts, dimension par dimension.\n\nDeux réserves de l'étude. L'appariement à un instrument n'était fiable que pour un quart environ des odeurs testées : le timbre proposé est un défaut, non un résultat. Et les auteurs n'ont pas publié de valeurs chiffrées par odeur : le rapport dit, pour l'odeur choisie, si l'article la nomme ou si elle est placée par sa famille.\n\nSources. A.-S. Crisinel et C. Spence, « A Fruity Note : Crossmodal Associations Between Odors and Musical Notes », Chemical Senses 37, 2012, p. 151-158 : le registre, l'agrément et la complexité, et la fiabilité limitée de l'instrument. A.-S. Crisinel et C. Spence, « As Bitter as a Trombone », Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994). Pour l'espace à cinq dimensions où le motif est placé : B. Mesz, M. A. Trevisan et M. Sigman, « The Taste of Music », Perception 40, 2011 (doi 10.1068/p6801), et B. Mesz, M. Sigman et M. A. Trevisan, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071).",
    noticeEn: "This node takes an odour from a list and returns a motif of several voices, as audio and as MIDI, with a report of what was done.\n\nWhat the odour decides. Its register: fruity odours and citrus go high; musk, roasted coffee, smoke and dark chocolate go low. Its pleasantness carries the consonance, an odour's pleasantness and complexity — not its intensity — being what drives the matching in the study this node relies on. Its complexity carries the number of events per second. Its timbre follows three families of words, [bright, fresh, ethereal], [sharp, metallic] and [full, rich, warm], answered by a flute, an oboe and a cello.\n\nWhat the odour does not decide: articulation, on which the odour literature is silent, and loudness, of which it establishes that it does not count in the matching. Both are set separately and default to 50%.\n\nHow the motif is built. The voices sound simultaneously, a fifth apart for a consonant point, in a five-note cluster for a harsh one — roughness arises from neighbouring partials beating together, not from harsh intervals played one after another. The lower voice carries the energy, the others sound at 60%. Attacks are regular, one per step, and the synthesis timbre is soft, its energy median having to stay close to its fundamental for the register to be reached.\n\nWhat the node reaches. The register lands within 0.03 of the aimed point, the speed within 0.05, the loudness exactly, except on a motif whose peak forbids reaching the requested level without clipping. Articulation stays above its aimed value in the staccato range, the synthesizer's resonance filling part of the silences: around 0.28 for 0.10 requested. Consonance is the weakest of the five dimensions: it comes down from 0.99 to about 0.70 and no lower, where the sour region would ask for 0.15. The report gives all five gaps, dimension by dimension.\n\nTwo caveats from the study. Instrument matching was reliable for only about a quarter of the odours tested: the proposed timbre is a default, not a result. And the authors published no numerical values per odour: the report says, for the chosen odour, whether the article names it or whether it is placed by its family.\n\nSources. A.-S. Crisinel and C. Spence, “A Fruity Note: Crossmodal Associations Between Odors and Musical Notes”, Chemical Senses 37, 2012, pp. 151-158: register, pleasantness and complexity, and the limited reliability of the instrument. A.-S. Crisinel and C. Spence, “As Bitter as a Trombone”, Attention, Perception & Psychophysics 72, 2010 (doi 10.3758/app.72.7.1994). For the five-dimensional space the motif is placed in: B. Mesz, M. A. Trevisan and M. Sigman, “The Taste of Music”, Perception 40, 2011 (doi 10.1068/p6801), and B. Mesz, M. Sigman and M. A. Trevisan, Frontiers in Human Neuroscience 6, 2012 (doi 10.3389/fnhum.2012.00071).",
    entrees: [],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "MIDI", nomEn: "MIDI", type: "midi" },
      { nom: "Rapport", nomEn: "Report", type: "texte" },
    ],
    parametres: [
      // La liste est construite sur la table elle-même : une odeur ajoutée à `audio/parfum.ts` paraît
      // ici sans qu'on ait à y penser, et les deux ne peuvent pas se contredire.
      { nom: "Parfum", nomEn: "Odour", type: "choix",
        options: ODEURS.map((o) => o.nom), optionsEn: ODEURS.map((o) => o.nomEn),
        optionIds: ODEURS.map((o) => o.id), defaut: "citron", defautEn: "lemon",
        doc: "L'odeur, prise dans la liste des onze odeurs de la table, rangée du plus aigu au plus grave.",
        docEn: "The odour, taken from the list of the table's eleven odours, ordered from the highest register to the lowest." },
      { nom: "Durée", nomEn: "Duration", type: "nombre", plage: [2, 60], pas: 1, defaut: 12, unite: "s",
        doc: "Durée du motif.", docEn: "Motif duration." },
      { nom: "Articulation", nomEn: "Articulation", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Du piqué, avec des silences entre les notes, au lié, où le son ne s'interrompt pas. La littérature des odeurs ne décide pas de cet axe : il reste au milieu par défaut.",
        docEn: "From staccato, with silences between the notes, to legato, where the sound never stops. The odour literature does not decide this axis: it stays in the middle by default." },
      { nom: "Intensité", nomEn: "Loudness", type: "curseur", plage: [0, 100], pas: 1, defaut: 50, unite: "%",
        doc: "Niveau efficace visé, de −40 dB à 0 dB. L'étude établit que l'intensité d'une odeur ne décide pas de son appariement à un son : cette dimension est donc laissée au réglage.",
        docEn: "Target root-mean-square level, from -40 dB to 0 dB. The study establishes that an odour's intensity does not drive its matching to a sound: this dimension is therefore left to be set." },
      { nom: "Graine", nomEn: "Seed", type: "nombre", plage: [1, 999999], pas: 1, defaut: 42,
        doc: "Pour le choix des degrés : à graine égale, le même motif.", docEn: "For the choice of degrees: same seed, same motif." },
      PARAMETRE_SYNTHESE,
      { ...PARAMETRE_INSTRUMENT_SF2_SUIVI,
        doc: "Preset du SoundFont, ou Suivre le MIDI pour garder l'instrument que la famille de timbre de l'odeur a écrit dans le fichier.",
        docEn: "SoundFont preset, or Follow MIDI to keep the instrument that the odour's timbre family wrote into the file." },
      { nom: "Volume", nomEn: "Volume", type: "nombre", plage: [0, 100], pas: 1, defaut: 80, unite: "%",
        doc: "Volume de la synthèse, avant la mise au niveau visé.", docEn: "Synthesis volume, before the target level is applied." },
    ],
    async executer(ctx: any) {
      const anglais = en();
      const choisi = ctx.paramTexte("Parfum", "citron");
      const odeur = odeurParId(choisi);
      if (!odeur) {
        // Inatteignable par la liste, qui est construite sur la table : reste le cas d'un projet dont
        // le fichier porte un identifiant que la table ne connait plus.
        const connues = ODEURS.map((o) => (anglais ? o.nomEn : o.nom)).join(", ");
        return {
          valeurs: [null, null, null], erreur: true,
          message: anglais ? `Unknown odour. Known: ${connues}.` : `Odeur inconnue. Connues : ${connues}.`,
        };
      }
      const duree = ctx.paramNombre("Durée", 12);
      // L'articulation et l'intensité viennent des réglages, non de l'odeur : voir la notice.
      const cible = {
        ...pointDepuisParfum(odeur),
        articulation: ctx.paramNombre("Articulation", 50) / 100,
        intensite: ctx.paramNombre("Intensité", 50) / 100,
      };
      const timbre = TIMBRES[odeur.timbre];
      const premier = motifDepuisPoint(cible, {
        duree, hasard: creerAleatoire(ctx.paramNombre("Graine", 42)), programme: timbre.programme,
      });

      const mode = normaliserModeSynthèse(ctx.paramTexte("Synthèse", "Automatique"));
      const modeRendu: "FM/Oscillateurs" | "SoundFont" = mode === "SoundFont" || (mode === "Automatique" && sf2Chargee()) ? "SoundFont" : "FM/Oscillateurs";
      const instrument = Math.round(ctx.paramNombre("Instrument", -1));
      // Le registre se corrige sur mesure : le biais d'un timbre ne se devine pas, et une flûte ne
      // place pas son énergie où un violoncelle place la sienne.
      // LE TIMBRE EST VOLONTAIREMENT DOUX (rapport 1, indice de modulation 0,7) : un timbre brillant
      // place la médiane de son énergie deux octaves au-dessus de sa fondamentale — mesuré, 6 202 Hz
      // contre 1 227 Hz pour les mêmes notes —, et le registre visé devenait alors hors d'atteinte.
      const { son: brut, motif, correction } = await rendreAuRegistre(premier, cible.hauteur, (m) =>
        rendreSequence(m.notes, modeRendu, ctx.paramNombre("Volume", 80), instrument >= 0 ? instrument : m.programme, 0, "douce"));
      const octets = octetsMidi(motif.notes, motif.tempo, motif.programme);
      const audio = viserNiveau(brut, dbDepuisIntensite(cible.intensite));

      const mesure = mesurer(audio);
      const parts = profil(mesure.dimensions);
      (ctx.noeud.data as Record<string, unknown>)._profilGout = parts.map((p) => ({ gout: p.gout, part: p.part }));

      const midi = new File([octets as unknown as BlobPart], `${odeur.id}.mid`, { type: "audio/midi" });
      const v = (x: number, d = 2) => (anglais ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
      const noms: Record<string, string> = anglais
        ? { "sucré": "sweet", "acide": "sour", "amer": "bitter", "salé": "salty" } : {};
      const nomOdeur = anglais ? odeur.nomEn : odeur.nom;
      const ligne = (etiquette: string, vise: number, mesuree: number) =>
        `  ${etiquette.padEnd(14)} ${v(vise)} → ${v(mesuree)}`;
      const rapport = [
        anglais ? `Odour: ${nomOdeur}` : `Odeur : ${nomOdeur}`,
        odeur.publiee
          ? (anglais ? "  named in the article" : "  nommée dans l'article")
          : (anglais ? "  placed by its family, not named in the article" : "  placée par sa famille, non nommée dans l'article"),
        `  ${anglais ? "timbre" : "timbre"} ${anglais ? timbre.instrumentEn : timbre.instrument} (${anglais ? "General MIDI" : "General MIDI"} ${timbre.programme})`,
          `  ${anglais ? "family" : "famille"} ${anglais ? timbre.motsEn : timbre.mots}`,
        "",
        anglais ? "Motif" : "Motif",
        `  ${(anglais ? "centre" : "centre").padEnd(14)} ${nomDeNote(motif.noteCentre)} (${Math.round(440 * Math.pow(2, (motif.noteCentre - 69) / 12))} Hz)`,
        `  ${(anglais ? "aimed register" : "registre visé").padEnd(14)} ${Math.round(hertzDepuisHauteur(cible.hauteur))} Hz`,
        `  ${(anglais ? "attacks/s" : "attaques/s").padEnd(14)} ${v(motif.attaquesParSeconde, 2)}`,
        `  ${(anglais ? "voices" : "voix").padEnd(14)} ${motif.voix.join(", ")} ${anglais ? "semitones above the melody" : "demi-tons au-dessus de la mélodie"}`,
        `  ${(anglais ? "notes" : "notes").padEnd(14)} ${motif.notes.length}`,
        "",
        anglais ? "Point, aimed → measured" : "Point, visé → mesuré",
        ...(correction !== 0
          ? [anglais
            ? `  register corrected by ${correction > 0 ? "+" : ""}${correction} semitones, measured on the first render`
            : `  registre corrigé de ${correction > 0 ? "+" : ""}${correction} demi-tons, mesuré sur le premier rendu`]
          : []),
        ligne(anglais ? "register" : "registre", cible.hauteur, mesure.dimensions.hauteur),
        ligne(anglais ? "articulation" : "articulation", cible.articulation, mesure.dimensions.articulation),
        ligne(anglais ? "speed" : "vitesse", cible.vitesse, mesure.dimensions.vitesse),
        ligne(anglais ? "consonance" : "consonance", cible.consonance, mesure.dimensions.consonance),
        ligne(anglais ? "loudness" : "intensité", cible.intensite, mesure.dimensions.intensite),
        "",
        anglais ? "Taste profile of the result" : "Profil de goût du résultat",
        ...parts.map((p) => `  ${(noms[p.gout] ?? p.gout).padEnd(8)} ${String(Math.round(p.part * 100)).padStart(3)} %`),
      ];
      const tete = parts.slice(0, 2).map((p) => `${noms[p.gout] ?? p.gout} ${Math.round(p.part * 100)} %`).join(" · ");
      return {
        valeurs: [audio, midi, rapport.join("\n")],
        message: `${nomOdeur} · ${nomDeNote(motif.noteCentre)} · ${tete} · ${audio.duration.toFixed(1)} s`,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
