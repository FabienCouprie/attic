// plugins/multicanal-traversee.test.ts — Ce qu'un composant fait d'un son à six canaux.
//
// POURQUOI CE BANC EXISTE. Le multicanal est une part entière de la composition dans ce dépôt, et
// la règle qui le porte est que la disposition voyage avec le tampon. Mais rien ne vérifiait ce que
// les 218 composants qui prennent de l'audio et en rendent font des canaux qu'on leur donne. Deux
// classes de défaut y vivaient, toutes deux SILENCIEUSES — le tampon garde la bonne forme et la
// bonne longueur, donc rien en aval ne peut s'en apercevoir :
//
//   1. UN TAMPON ALLOUÉ À N CANAUX ET REMPLI SUR DEUX. Trouvé le 2026-10-21 sur les trois nœuds
//      SoundTouch : la bibliothèque est stéréo de bout en bout, l'ancien code allouait pourtant le
//      nombre de canaux reçu, et un 5.1 ressortait avec quatre canaux MUETS.
//   2. DES ÉCHANTILLONS NON FINIS. Trouvés le même jour dans la continuation spectrale, dont
//      l'entraînement diverge parfois. Un seul NaN rend muette toute somme qui le rencontre.
//
// CE QUE LE BANC NE CONCLUT PAS, et il faut le dire pour qu'on ne le recherche pas deux fois. Trois
// relevés de la première passe étaient des FAUX POSITIFS, chacun pour sa raison :
//   · « Ondelettes », sortie « Retiré » : sur une sinusoïde propre, le débruitage ne retire presque
//     rien, donc cette sortie est minuscule sans être vide. C'est ce qu'elle doit être.
//   · « Spatialiseur » : il bâtit sa propre disposition au lieu de suivre celle de l'entrée, et une
//     source ponctuelle placée devant n'allume que le canal central. C'est ce qu'il doit faire.
//   · Un composant qui RÉDUIT à deux canaux n'est pas fautif par là : trente-neuf le font, et la
//     stéréo est la nature même de la plupart d'entre eux — écoute binaurale, largeur, M/S,
//     panoramique dur. Les trier demande de lire chacun, et c'est un autre travail que celui-ci.
//
// D'où la forme des deux cas ci-dessous : ils cherchent une SIGNATURE, jamais un nom.
import "node-web-audio-api/polyfill.js";
import { beforeAll, describe, expect, it } from "vitest";

import { registre } from "../audio/adaptateur";
import { toutesLesFiches } from "./index";
import { defautCanoniqueChoix, valeurCanoniqueChoix } from "../i18n";
import { etiqueter } from "../audio/multicanal";

const SR = 48000;
const DUREE = 0.5;
/** Six canaux, six fréquences distinctes : on sait lequel survit et lequel a été jeté. */
const FREQ = [110, 165, 220, 330, 440, 660];

function entreeCanaux(canaux: number): AudioBuffer {
  const n = Math.round(SR * DUREE);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * FREQ[c % FREQ.length] * (i / SR));
    b.getChannelData(c).set(x);
  }
  return canaux === 6 ? etiqueter(b, "5.1") : b;
}

function entreeSynthetique(p: { type: string }, canaux: number): unknown {
  if (p.type === "audio") return entreeCanaux(canaux);
  if (p.type === "texte") return "CDEF GABc";
  if (p.type === "nombre") return 60;
  return null;
}

async function executer(fiche: { id: string }, canaux = 6): Promise<unknown[]> {
  const def = registre.trouverDef(fiche.id) as never as {
    parametres?: { nom: string; type?: string; defaut?: unknown }[];
    entrees?: { type: string }[];
    executer: (ctx: unknown) => Promise<{ valeurs?: unknown[] }>;
  };
  const params: Record<string, unknown> = {};
  for (const p of def.parametres ?? []) {
    params[p.nom] = p.type === "choix" ? defautCanoniqueChoix(p as never) : p.defaut;
    if (p.nom === "Graine" && p.defaut === 0) params[p.nom] = 4242;
    // TOUT RÉGLAGE EN SECONDES EST BORNÉ COMME L'ENTRÉE L'EST, et c'est ce qui fait tenir ce banc
    // dans un temps raisonnable. Le banc choisit déjà une entrée d'une demi-seconde ; laisser un
    // réglage de SORTIE à son défaut d'usage mettait son coût à la main d'un choix d'interface.
    // Mesuré le 2026-10-22 : « Durée générée » valant 5 s par défaut, les deux continuations
    // spectrales faisaient générer dix fois ce qu'on leur donnait à lire, et coûtaient à elles
    // seules 180,4 s des 257,9 s de la passe. Ramenées au plus court que leur plage accepte, la
    // passe tombe à 138,8 s — et les CENT QUATRE-VINGT-CINQ composants éprouvés le restent tous,
    // puisque c'est la durée produite qui change, non la liste de ce qui passe.
    //
    // LA FORME EST CHERCHÉE, NON UN NOM : l'unité « s » dit qu'un réglage est une durée, donc un
    // composant neuf qui en porte une sera borné sans qu'on y pense. Nommer les deux coupables
    // aurait laissé le troisième arriver sans garde.
    const q = p as { unite?: string; plage?: [number, number] };
    if (q.unite === "s" && Array.isArray(q.plage)) {
      params[p.nom] = Math.max(q.plage[0], Math.min(q.plage[1], DUREE));
    }
  }
  const ent = (def.entrees ?? []).map((p) => entreeSynthetique(p, canaux));
  const r = await def.executer({
    noeud: { id: "t", data: { parametres: params } }, runtime: null, repertoireTravail: "",
    entree: (i: number) => ent[i] ?? null, entrees: () => ent,
    paramNombre: (n: string, d: number) => (typeof params[n] === "number" ? params[n] as number : d),
    paramTexte: (n: string, d: string) => {
      const p = (def.parametres ?? []).find((x) => x.nom === n);
      return p && typeof params[n] === "string" ? String(valeurCanoniqueChoix(p as never, params[n] as string)) : d;
    },
    onProgress: () => {}, signal: new AbortController().signal,
  });
  return r?.valeurs ?? [];
}

type Fiche = { id: string; entrees?: { type: string }[]; sorties?: { type: string }[] };

/** Les tampons audio qu'un composant rend, avec le rang de leur port. */
async function sortiesAudio(fiche: Fiche, canaux = 6): Promise<{ rang: number; tampon: AudioBuffer }[]> {
  const valeurs = await executer(fiche, canaux);
  const rangs = (fiche.sorties ?? []).map((s, i) => (s.type === "audio" ? i : -1)).filter((i) => i >= 0);
  const out: { rang: number; tampon: AudioBuffer }[] = [];
  for (const rang of rangs) {
    const v = valeurs[rang] as AudioBuffer | null;
    if (v && typeof v.numberOfChannels === "number" && v.length > 0) out.push({ rang, tampon: v });
  }
  return out;
}

const candidats = (toutesLesFiches as unknown as Fiche[]).filter(
  (f) => (f.entrees ?? []).some((e) => e.type === "audio")
    && (f.sorties ?? []).some((s) => s.type === "audio"),
);

/** Le plancher de composants réellement éprouvés : un banc qui n'exerce plus rien passe au vert en
 *  mentant, et c'est le piège où le banc de conformité MIDI est tombé avant d'être repris. */
const PLANCHER_EPROUVES = 170;

/**
 * LES NON-CONFORMITÉS CONNUES, qu'il faut nommer pour les tolérer. La table est VIDE depuis le
 * 2026-10-21, et le but est qu'elle le reste : retirer une entrée fait partie de la correction.
 */
const TOLERES: Record<string, string[]> = {};

// UNE SEULE PASSE POUR LES DEUX PROPRIÉTÉS. Exécuter deux cents composants coûte des minutes, et
// le faire deux fois les doublerait sans rien apprendre de plus : la passe a lieu une fois, les
// deux cas lisent ce qu'elle a relevé. Chacun garde sa propre assertion, de sorte qu'une faute
// d'une classe n'en masque pas une de l'autre.
const nonFinis: string[] = [];
const remplisSurDeux: string[] = [];
const tombentEnMulticanal: string[] = [];
let eprouves = 0;

beforeAll(async () => {
  for (const fiche of candidats) {
    let sorties: { rang: number; tampon: AudioBuffer }[];
    try {
      sorties = await sortiesAudio(fiche);
    } catch (jete) {
      // UN COMPOSANT QUI JETTE ÉTAIT EXCUSÉ EN SILENCE, et c'est ainsi que deux réverbérations
      // ont pu tomber des mois durant sur une disposition 5.1. Le `continue` seul ne distingue
      // pas « il manque un modèle ou un runtime » de « il ne sait pas compter les canaux ».
      //
      // LA STÉRÉO LES SÉPARE, et c'est une forme, non une liste de messages à reconnaître : on
      // redonne le MÊME travail à deux voies. Si le composant tourne alors, ce qu'il n'a pas
      // supporté est le nombre de canaux, et c'est un défaut. S'il tombe aussi en stéréo, il lui
      // manque autre chose, et ce banc n'a rien à en dire.
      try {
        const enStereo = await sortiesAudio(fiche, 2);
        if (enStereo.length > 0) {
          tombentEnMulticanal.push(`${fiche.id} — tourne en stéréo, jette en 5.1 : `
            + String((jete as Error)?.message ?? jete).slice(0, 90));
        }
      } catch { /* il tombe des deux côtés : autre chose lui manque */ }
      continue;
    }
    if (sorties.length > 0) eprouves++;
    for (const { rang, tampon } of sorties) {
      const n = tampon.numberOfChannels;
      const vivants: boolean[] = [];
      for (let c = 0; c < n; c++) {
        const x = tampon.getChannelData(c);
        let mauvais = 0, vivant = false;
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) mauvais++;
          else if (x[i] !== 0) vivant = true;
        }
        vivants.push(vivant);
        if (mauvais > 0) nonFinis.push(`${fiche.id}[${rang}] canal ${c} : ${mauvais} echantillons non finis`);
      }
      if (n > 2 && (vivants[0] || vivants[1]) && !vivants.slice(2).some(Boolean)) {
        const releve = `${n} canaux rendus, seuls les deux premiers remplis`;
        if (!(TOLERES[fiche.id] ?? []).some((t) => releve.startsWith(t))) {
          remplisSurDeux.push(`${fiche.id}[${rang}] — ${releve}`);
        }
      }
    }
  }
}, 1800000);

describe("ce qu'un composant fait d'un son à six canaux", () => {
  it("AUCUNE SORTIE AUDIO NE PORTE D'ÉCHANTILLON NON FINI", () => {
    // Zéro tolérance : un NaN ou un infini ne se répare pas en aval, il contamine. La continuation
    // spectrale en rendait, son modèle divergeant parfois pendant l'entraînement.
    expect(nonFinis).toEqual([]);
    expect(eprouves).toBeGreaterThanOrEqual(PLANCHER_EPROUVES);
  });

  it("AUCUNE SORTIE N'ALLOUE PLUS DE DEUX CANAUX POUR N'EN REMPLIR QUE DEUX", () => {
    // LA SIGNATURE, ET NON UN NOM : plus de deux canaux rendus, l'un des deux premiers vivant, et
    // TOUS les suivants exactement nuls. C'est ce que laisse une bibliothèque stéréo qu'on a
    // laissée écrire dans un tampon plus large. Un composant qui réduit à deux canaux ne la porte
    // pas, et un spatialiseur qui n'allume qu'un canal de douze non plus.
    expect(remplisSurDeux).toEqual([]);
  });

  it("AUCUN COMPOSANT QUI TOURNE EN STÉRÉO NE TOMBE EN 5.1", () => {
    // LE DÉFAUT QUE CE CAS A TROUVÉ, le 2026-10-22 : « Réverbération » et « Reverb Progressive »
    // fabriquaient leur réponse impulsionnelle avec le nombre de canaux de l'entrée, et le moteur
    // audio n'en accepte qu'un, deux ou quatre. Un 5.1 ressortait sur « the convolution buffer
    // must consist of 1, 2 or 4 channels » — l'erreur brute du moteur, en anglais, là où le
    // composant voisin « Convolution de deux sons » refuse la même limite dans les mots du dépôt.
    // Mesuré d'un à huit canaux : trois, cinq, six et huit tombaient, un, deux et quatre non.
    expect(tombentEnMulticanal,
      "une bibliothèque qui ne compte pas au-delà de deux voies ne doit pas faire tomber un 5.1")
      .toEqual([]);
  });

  it("chaque tolérance nommée existe encore, sinon son entrée doit partir", () => {
    // Une tolérance qui ne sert plus est un mensonge qui dort. La table est vide, et ce cas le dit
    // plutôt que de disparaître : le jour où l'on en ajoute une, il faudra qu'elle se vérifie.
    expect(Object.keys(TOLERES)).toEqual([]);
  });
});
