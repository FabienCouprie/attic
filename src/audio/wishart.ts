// audio/wishart.ts — Transformations de wavesets, d'après Trevor Wishart
// (« Audible Design », 1994).
//
// L'idée : découper le son non pas en tranches de durée fixe — ce que fait la
// granulation — mais aux PASSAGES PAR ZÉRO. Chaque segment ainsi obtenu contient
// une pseudo-période du signal, dont la longueur suit donc la hauteur du son au
// lieu d'une horloge extérieure.
//
// Cette différence est tout l'intérêt du procédé. Une granulation impose sa
// grille et produit des artefacts qui n'ont rien à voir avec le matériau ; les
// wavesets, eux, épousent la forme d'onde. Les répéter revient à faire descendre
// la hauteur sans toucher au timbre des segments ; en omettre revient à trouer
// le son d'une manière qui reste corrélée à sa propre périodicité. Et comme les
// segments commencent et finissent à zéro, on peut les découper, réordonner ou
// jeter sans jamais produire de clic — la propriété qui rend la famille entière
// possible.
//
// Sur un son inharmonique ou bruité, le découpage devient erratique : les
// passages par zéro n'y correspondent plus à une périodicité. C'est une limite
// du procédé, pas un défaut de l'implémentation, et Wishart en fait d'ailleurs
// un usage délibéré.

export type OperationWaveset = "repetition" | "omission" | "inversion" | "melange" | "egalisation";

export interface OptionsWaveset {
  operation: OperationWaveset;
  /** Nombre de répétitions, pas d'omission, ou taille du groupe mélangé. */
  facteur: number;
  /** Graine du mélange. Même graine, même résultat. */
  graine?: number;
}

/**
 * Découpe un canal en wavesets : segments délimités par un passage par zéro sur
 * deux, de sorte que chacun contienne une alternance complète — un lobe positif
 * puis un lobe négatif — soit une pseudo-période.
 *
 * Ne retient que les passages par zéro montants comme frontières : découper à
 * CHAQUE passage donnerait des demi-lobes, dont la répétition produirait une
 * composante continue au lieu d'une transposition.
 */
export function decouperWavesets(canal: Float32Array): number[] {
  const frontieres: number[] = [0];
  for (let i = 1; i < canal.length; i++) {
    // Montant : on passe d'une valeur négative ou nulle à une valeur positive.
    if (canal[i - 1] <= 0 && canal[i] > 0) frontieres.push(i);
  }
  if (frontieres[frontieres.length - 1] !== canal.length) frontieres.push(canal.length);
  return frontieres;
}

/** Générateur déterministe : un mélange doit se reproduire à l'identique. */
function alea(graine: number): () => number {
  let etat = (graine | 0) || 1;
  return () => {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    return etat / 0x7fffffff;
  };
}

export function transformerWavesets(buffer: AudioBuffer, options: OptionsWaveset): AudioBuffer {
  const sr = buffer.sampleRate;
  const nCanaux = buffer.numberOfChannels;
  const facteur = Math.max(1, Math.round(options.facteur));

  // Le découpage est calculé sur le PREMIER canal seulement, et appliqué tel
  // quel aux autres : deux canaux d'un même son n'ont pas leurs passages par
  // zéro aux mêmes endroits, et les découper séparément décalerait
  // progressivement les voies l'une par rapport à l'autre — l'image stéréo
  // partirait en morceaux.
  const frontieres = decouperWavesets(buffer.getChannelData(0));
  const segments: { debut: number; fin: number }[] = [];
  for (let i = 0; i + 1 < frontieres.length; i++) {
    if (frontieres[i + 1] > frontieres[i]) segments.push({ debut: frontieres[i], fin: frontieres[i + 1] });
  }

  // Ordre et multiplicité des segments dans la sortie.
  const plan: { segment: number; muet: boolean }[] = [];
  switch (options.operation) {
    case "repetition":
      for (let s = 0; s < segments.length; s++) {
        for (let r = 0; r < facteur; r++) plan.push({ segment: s, muet: false });
      }
      break;
    case "omission":
      // On garde la durée : les segments écartés deviennent du silence de même
      // longueur, au lieu d'être supprimés. Les supprimer raccourcirait le son
      // ET transposerait vers l'aigu, ce qui mélangerait deux effets distincts.
      for (let s = 0; s < segments.length; s++) plan.push({ segment: s, muet: s % facteur !== 0 });
      break;
    case "melange": {
      const tirage = alea(options.graine ?? 1);
      for (let debut = 0; debut < segments.length; debut += facteur) {
        const groupe: number[] = [];
        for (let s = debut; s < Math.min(debut + facteur, segments.length); s++) groupe.push(s);
        for (let i = groupe.length - 1; i > 0; i--) {
          const j = Math.floor(tirage() * (i + 1));
          [groupe[i], groupe[j]] = [groupe[j], groupe[i]];
        }
        for (const s of groupe) plan.push({ segment: s, muet: false });
      }
      break;
    }
    default:
      for (let s = 0; s < segments.length; s++) plan.push({ segment: s, muet: false });
  }

  let longueur = 0;
  for (const p of plan) longueur += segments[p.segment].fin - segments[p.segment].debut;
  const out = new AudioBuffer({ numberOfChannels: nCanaux, length: Math.max(1, longueur), sampleRate: sr });

  for (let c = 0; c < nCanaux; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let ecriture = 0;
    for (const p of plan) {
      const { debut, fin } = segments[p.segment];
      const taille = fin - debut;
      if (!p.muet) {
        if (options.operation === "inversion") {
          for (let i = 0; i < taille; i++) dst[ecriture + i] = src[fin - 1 - i];
        } else if (options.operation === "egalisation") {
          // Chaque waveset est ramené à une amplitude commune : les nuances de
          // niveau disparaissent, la forme reste. C'est la « distorsion
          // harmonique par wavesets » de Wishart, qui aplatit toute dynamique.
          let pic = 0;
          for (let i = debut; i < fin; i++) pic = Math.max(pic, Math.abs(src[i]));
          const gain = pic > 1e-9 ? 0.5 / pic : 0;
          for (let i = 0; i < taille; i++) dst[ecriture + i] = src[debut + i] * gain;
        } else {
          for (let i = 0; i < taille; i++) dst[ecriture + i] = src[debut + i];
        }
      }
      ecriture += taille;
    }
  }
  return out;
}
