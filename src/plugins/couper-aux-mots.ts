// plugins/couper-aux-mots.ts — Nœud « Couper aux mots » : le montage décidé par ce qui est DIT.
//
// CE QUI LE SÉPARE DU ROGNAGE DES SILENCES, et c'est tout son objet : le rognage décide au NIVEAU,
// ce nœud décide au MOT. Un seuil ne distingue pas une syllabe d'une respiration, d'un froissement
// de papier ou d'un souffle de préampli, et il coupe le mot dit à voix basse en gardant le soupir
// qui le précède. La reconnaissance, elle, rend des frontières là où il y a eu de la parole, et
// nulle part ailleurs.
//
// IL REPREND LE DÉCOUPAGE DU ROGNAGE PLUTÔT QUE D'EN REFAIRE UN. Les intervalles gardés sont des
// `Segment` de `audio/silences.ts`, et c'est `appliquerRognage` qui recolle : seule la façon de
// choisir les intervalles change, pas la façon de les appliquer.
import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { annoncerModele } from "./message-modele";
import { MODELES, chargerModele, transcrire, versMono, vers16k, type MotVosk } from "./vosk-asr";
import { appliquerRognage, type Segment } from "../audio/silences";

/**
 * La forme sous laquelle deux mots se comparent : minuscules, accents retirés.
 *
 * SANS CELA, LA LISTE NE SERT À RIEN EN FRANÇAIS. Le moteur rend « ré » et « élève » avec leurs
 * accents ; une liste tapée au clavier les porte ou non, et deux écritures du même mot ne se
 * reconnaîtraient pas. La ponctuation que le moteur n'émet pas n'est pas traitée : il rend des
 * mots nus.
 */
export const forme = (mot: string): string =>
  mot.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Découpe une liste saisie en mots comparables. */
export const listeDeMots = (texte: string): string[] =>
  String(texte).split(/[\s,]+/).map(forme).filter(Boolean);

export interface ReglagesCoupe {
  /** Les mots sur lesquels la liste agit. Vide : elle n'agit pas, et tous les mots sont gardés. */
  liste: readonly string[];
  /** Vrai : la liste dit ce qu'on RETIRE. Faux : elle dit ce qu'on garde. */
  retirer: boolean;
  /** Ce qui est rendu de part et d'autre de chaque mot, en millisecondes. */
  margeMs: number;
  /** Vrai : les intervalles entre les mots gardés tombent aussi. Faux : seuls les bords. */
  partout: boolean;
  frequence: number;
  /** La longueur du signal, en échantillons : les segments n'en sortent pas. */
  longueur: number;
}

/** Les mots que la liste retient, dans l'ordre où ils ont été dits. */
export function motsRetenus(mots: readonly MotVosk[], reglages: ReglagesCoupe): MotVosk[] {
  if (reglages.liste.length === 0) return [...mots];
  const dedans = new Set(reglages.liste);
  return mots.filter((m) => dedans.has(forme(m.word)) !== reglages.retirer);
}

/**
 * Les intervalles à garder, en échantillons.
 *
 * LA MARGE RECOLLE LES MOTS D'UNE MÊME PHRASE, et c'est pourquoi il n'y a pas de durée minimale
 * d'intervalle ici comme il y en a une au rognage des silences : deux mots séparés de moins de deux
 * marges voient leurs segments se toucher, donc fusionner. À cinquante millisecondes, une parole
 * ordinaire reste d'un seul tenant et seules les respirations tombent ; à zéro, chaque mot est
 * isolé.
 */
export function planDeCoupe(
  mots: readonly MotVosk[], reglages: ReglagesCoupe,
): { gardes: Segment[]; retenus: MotVosk[] } {
  const retenus = motsRetenus(mots, reglages);
  if (retenus.length === 0) return { gardes: [], retenus };
  const marge = Math.max(0, Math.round((reglages.margeMs / 1000) * reglages.frequence));
  const bruts = retenus.map((m) => ({
    debut: Math.max(0, Math.round(m.start * reglages.frequence) - marge),
    fin: Math.min(reglages.longueur, Math.round(m.end * reglages.frequence) + marge),
  })).filter((s) => s.fin > s.debut);
  if (bruts.length === 0) return { gardes: [], retenus };

  // LES MOTS NE SONT PAS TOUJOURS DANS L'ORDRE DU TEMPS. Plusieurs énoncés arrivent par résultats
  // successifs, et un recollement qui supposerait l'ordre écrirait des segments à l'envers.
  bruts.sort((a, b) => a.debut - b.debut);
  const fusionnes: Segment[] = [];
  for (const s of bruts) {
    const dernier = fusionnes[fusionnes.length - 1];
    if (dernier && s.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, s.fin);
    else fusionnes.push({ ...s });
  }
  if (reglages.partout) return { gardes: fusionnes, retenus };
  return {
    gardes: [{ debut: fusionnes[0].debut, fin: fusionnes[fusionnes.length - 1].fin }],
    retenus,
  };
}

/** Ce que le plan laisse de côté : la sortie « Reste ». */
export function complement(gardes: readonly Segment[], longueur: number): Segment[] {
  const out: Segment[] = [];
  let curseur = 0;
  for (const g of gardes) {
    if (g.debut > curseur) out.push({ debut: curseur, fin: g.debut });
    curseur = Math.max(curseur, g.fin);
  }
  if (curseur < longueur) out.push({ debut: curseur, fin: longueur });
  return out;
}

/** Recolle les intervalles d'un tampon, ou rend rien quand il n'en reste aucun. */
function monter(source: AudioBuffer, gardes: readonly Segment[]): AudioBuffer | null {
  if (gardes.length === 0) return null;
  const canaux = appliquerRognage(
    Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c)), gardes);
  if (canaux[0].length === 0) return null;
  const out = new AudioBuffer({
    numberOfChannels: source.numberOfChannels, length: canaux[0].length, sampleRate: source.sampleRate,
  });
  canaux.forEach((x, c) => out.getChannelData(c).set(x));
  return out;
}

export const fiches: FicheAudio[] = ([
  {
    id: "couper-aux-mots", nom: "Couper aux mots", nomEn: "Cut at Words",
    univers: "Traitement", famille: "Montage",
    resume: "Monte une prise aux frontières des mots reconnus, et non à un seuil de niveau.",
    resumeEn: "Edits a take at the boundaries of the recognised words, and not at a level threshold.",
    entrees: [{ nom: "Audio", nomEn: "Audio", type: "audio" }],
    sorties: [
      { nom: "Audio", nomEn: "Audio", type: "audio" },
      { nom: "Reste", nomEn: "Remainder", type: "audio" },
      { nom: "Texte", nomEn: "Text", type: "texte" },
    ],
    // Une prise sans parole reconnue est un résultat, et non une panne : le nœud a tourné.
    sortieNullePermise: true,
    parametres: [
      { nom: "Langue", nomEn: "Language", type: "choix",
        options: ["Français", "Anglais"], optionsEn: ["French", "English"],
        optionIds: ["fr", "en"], defaut: "Français", defautEn: "French",
        doc: "Le modèle de reconnaissance employé. Chaque langue a le sien, dédié.",
        docEn: "The recognition model used. Each language has its own, dedicated." },
      { nom: "Vocabulaire", nomEn: "Vocabulary", type: "texte", defaut: "", defautEn: "",
        placeholder: "do ré mi fa sol", placeholderEn: "do re mi fa sol",
        doc: "Liste de mots séparés par des espaces ou des virgules, qui restreint ce que le moteur peut reconnaître. Elle agit sur la reconnaissance, donc sur les frontières : un lexique fermé les resserre. Laissée vide, le vocabulaire entier du modèle est employé.",
        docEn: "Words separated by spaces or commas, restricting what the engine may recognise. It acts on recognition, hence on the boundaries: a closed lexicon tightens them. Left empty, the model's whole vocabulary is used." },
      { nom: "Mots", nomEn: "Words", type: "texte", defaut: "", defautEn: "",
        placeholder: "euh hein bah", placeholderEn: "um uh er",
        doc: "Liste de mots séparés par des espaces ou des virgules, sur laquelle « Action » agit. La comparaison se fait en minuscules et sans accents, de sorte que « ré » et « re » désignent le même mot. Laissée vide, toute la parole est gardée et « Action » n'a rien à faire.",
        docEn: "Words separated by spaces or commas, on which « Action » acts. Matching ignores case and accents, so that a word typed without its accent still finds the spoken one. Left empty, all the speech is kept and « Action » has nothing to do." },
      { nom: "Action", nomEn: "Action", type: "choix",
        options: ["Garder ces mots", "Retirer ces mots"], optionsEn: ["Keep these words", "Remove these words"],
        optionIds: ["garder", "retirer"], defaut: "Garder ces mots", defautEn: "Keep these words",
        doc: "Ce que la liste « Mots » désigne. Sans effet quand elle est vide, puisqu'elle ne désigne alors rien.",
        docEn: "What the « Words » list designates. Without effect when it is empty, since it then designates nothing." },
      { nom: "Portée", nomEn: "Scope", type: "choix",
        options: ["Bords", "Partout"], optionsEn: ["Edges", "Everywhere"],
        optionIds: ["bords", "partout"], defaut: "Bords", defautEn: "Edges",
        doc: "Aux bords, seuls le début et la fin tombent : ce qui s'est passé entre le premier et le dernier mot gardé est conservé tel quel, respirations comprises. Partout, les intervalles entre les mots gardés tombent aussi.",
        docEn: "At the edges, only the start and the end fall: what happened between the first and the last kept word is left as it is, breaths included. Everywhere, the intervals between the kept words fall too." },
      { nom: "Marge", nomEn: "Margin", type: "curseur", plage: [0, 500], pas: 5, defaut: 50, unite: "ms",
        doc: "Ce qui est rendu de part et d'autre de chaque mot. Une frontière de mot tombe sur l'attaque de la consonne, et couper là en retire le début. La marge recolle aussi les mots voisins : deux mots séparés de moins de deux marges ne forment plus qu'un seul morceau.",
        docEn: "What is given back on either side of each word. A word boundary falls on the consonant's attack, and cutting there removes its beginning. The margin also joins neighbouring words: two words less than two margins apart form a single piece." },
    ],
    async executer(ctx: any) {
      const audio = ctx.entree(0);
      if (!(audio instanceof AudioBuffer)) {
        return { valeurs: [null, null, null], message: traduire("msg.aucune_entr_e_audio") };
      }
      const langue = ctx.paramTexte("Langue", "fr");
      const choisi = MODELES[langue] ?? MODELES.fr;
      await annoncerModele(ctx, "couper-aux-mots", traduire("progress.vosk.chargement"));
      const modele = await chargerModele(choisi.fichier);
      const seize = await vers16k(versMono(audio), audio.sampleRate);
      const { mots } = await transcrire(modele, seize, {
        grammaire: listeDeMots(ctx.paramTexte("Vocabulaire", "")),
        surPartiel: (p) => ctx.onProgress?.(p),
      });
      if (mots.length === 0) {
        return { valeurs: [null, audio, ""], message: traduire("msg.coupe.aucunMot") };
      }

      const { gardes, retenus } = planDeCoupe(mots, {
        liste: listeDeMots(ctx.paramTexte("Mots", "")),
        retirer: ctx.paramTexte("Action", "garder") === "retirer",
        margeMs: ctx.paramNombre("Marge", 50),
        partout: ctx.paramTexte("Portée", "bords") === "partout",
        frequence: audio.sampleRate,
        longueur: audio.length,
      });
      const garde = monter(audio, gardes);
      const reste = monter(audio, complement(gardes, audio.length));
      const texte = retenus.map((m) => m.word).join(" ");
      if (!garde) {
        return { valeurs: [null, audio, texte], message: traduire("msg.coupe.rienDeGarde", String(mots.length)) };
      }
      return {
        valeurs: [garde, reste, texte],
        message: traduire("msg.coupe.resume",
          String(retenus.length), String(mots.length),
          audio.duration.toFixed(2), (garde.length / audio.sampleRate).toFixed(2),
          String(gardes.length)),
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
