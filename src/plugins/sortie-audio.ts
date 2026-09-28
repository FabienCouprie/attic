// plugins/sortie-audio.ts — La sortie audio que tout composant à séquence reçoit.
//
// POURQUOI UNE ENVELOPPE ET NON VINGT-CINQ RETOUCHES. Le catalogue compte vingt-cinq sorties de
// séquence, et rien ne s'oppose à ce que chacune s'entende : la fonction qui rend une séquence en
// son existe, et elle est la même pour toutes. Ajouter un port et quatre lignes dans vingt-cinq
// fiches aurait produit vingt-cinq occasions de diverger ; une enveloppe posée à l'enregistrement
// n'en laisse qu'une, et un composant à séquence écrit demain l'aura sans qu'on y pense. C'est le
// procédé de `avecDoc`, déjà en place.
//
// LA SORTIE N'EST RENDUE QUE SI ELLE EST BRANCHÉE, et c'est ce qui la rend possible. Mesuré sur la
// synthèse FM : **8,6 ms par seconde de son**, soit une seconde et demie pour une pièce de trois
// minutes, par nœud. Une chaîne de cinq nœuds sur une telle pièce aurait coûté sept secondes et
// demie à chaque lancement, écoutée ou non. Le contrat d'exécution dit désormais si un câble part
// d'une sortie, et sans câble rien n'est calculé.
//
// AUCUN RÉGLAGE DE SYNTHÈSE N'EST AJOUTÉ. Quatre de plus sur vingt-cinq nœuds auraient encombré
// chaque inspecteur pour un service que « Point d'écoute séquence » rend déjà : cette sortie-ci est
// une écoute rapide, en synthèse locale, timbre sinus, à un niveau fixe. Qui veut choisir son
// moteur, son timbre ou son volume branche le point d'écoute, qui est fait pour cela.

import type { FicheAudio } from "../audio/types-domaine";

/** Le niveau de cette écoute rapide, celui que le point d'écoute prend par défaut. */
const VOLUME = 80;

/**
 * Les composants à séquence qui n'en reçoivent pas, et pourquoi.
 *
 * Le début d'une boucle par créneau rend une séquence d'UNE note dont le seul rôle est de porter un
 * instant et une durée : c'est une étiquette, pas de la musique, et l'entendre n'apprend rien.
 */
export const SANS_SORTIE_AUDIO: readonly string[] = ["boucle-creneau-debut"];

/** La phrase ajoutée aux notices, la même partout, pour qu'aucun port ne reste sans mention. */
const MENTION = "La sortie « Audio » fait entendre la séquence, en synthèse locale et timbre sinus. Elle n'est calculée que lorsqu'un câble en part. Pour choisir le moteur, le timbre ou le niveau, brancher un point d'écoute.";
const MENTION_EN = "The « Audio » output plays the sequence, in local synthesis with a sine timbre. It is computed only when a cable leaves it. To choose the engine, the timbre or the level, connect a listening point.";

/**
 * Une fiche qui rend une séquence, augmentée d'une sortie audio.
 *
 * LE PORT EST AJOUTÉ EN DERNIER, toujours. Les ports sont désignés par leur rang, et les graphes
 * déjà enregistrés pointent dessus : glisser le nouveau port ailleurs qu'à la fin rebrancherait
 * chaque arête d'un cran. C'est la règle que la résultante de Schillinger et la boîte à rythmes ont
 * déjà suivie en recevant la leur.
 *
 * LA PREMIÈRE SORTIE DE SÉQUENCE EST CELLE QU'ON ENTEND. Deux composants en rendent deux, les
 * gardées et les écartées d'un filtre par exemple ; en rendre deux audios doublerait le coût pour
 * une écoute que personne n'a demandée, et le port dirait mal lequel il porte.
 */
export function avecSortieAudio(def: FicheAudio): FicheAudio {
  if (SANS_SORTIE_AUDIO.includes(def.id)) return def;
  const sorties = def.sorties ?? [];
  if (sorties.some((s) => s.type === "audio")) return def;
  const rangSequence = sorties.findIndex((s) => s.type === "sequence");
  if (rangSequence < 0) return def;
  const original = def.executer;
  if (typeof original !== "function") return def;

  const rangAudio = sorties.length;
  return {
    ...def,
    sorties: [...sorties, { nom: "Audio", nomEn: "Audio", type: "audio" }],
    notice: def.notice ? `${def.notice}\n\n${MENTION}` : def.notice,
    noticeEn: def.noticeEn ? `${def.noticeEn}\n\n${MENTION_EN}` : def.noticeEn,
    async executer(ctx: any) {
      const rendu = await original.call(def, ctx);
      const valeurs = [...(rendu?.valeurs ?? [])];
      while (valeurs.length < rangAudio) valeurs.push(null);
      valeurs[rangAudio] = await rendreSiBranche(ctx, rangAudio, rendu?.erreur ? null : valeurs[rangSequence]);
      return { ...rendu, valeurs };
    },
  } as FicheAudio;
}

/** Le son d'une séquence, ou rien : rien quand le port est libre, quand la séquence est vide, ou en cas d'échec. */
async function rendreSiBranche(ctx: any, rang: number, valeur: unknown): Promise<AudioBuffer | null> {
  if (typeof ctx?.sortieBranchee !== "function" || !ctx.sortieBranchee(rang)) return null;
  const { estSequence, dureeSequence } = await import("../audio/sequence");
  if (!estSequence(valeur) || valeur.notes.length === 0) return null;
  const { rendreSequence } = await import("../audio/midi-sequence");
  // LE RENDU NE FAIT PAS ÉCHOUER LE NŒUD. Une sortie d'appoint qui casserait le calcul dont elle
  // vient serait pire que son absence : ce qui la précède a réussi, et doit sortir.
  try {
    return await rendreSequence(
      valeur.notes, "FM/Oscillateurs", VOLUME, undefined, undefined, "pur", dureeSequence(valeur));
  } catch {
    return null;
  }
}
