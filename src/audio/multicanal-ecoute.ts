// audio/multicanal-ecoute.ts — Entendre au casque un espace composé pour des haut-parleurs.
//
// ON N'ÉCOUTE PAS UN 7.1.4 AU CASQUE, ET C'EST POURTANT LÀ QU'ON COMPOSE. Sans cette étape, un espace
// écrit pour douze haut-parleurs ou un champ ambisonique d'ordre trois reste inaudible sur le poste
// de travail : le lecteur du navigateur replie tout en stéréo par ses propres règles, qui ne savent
// rien de l'ambisonie et mélangent ses composantes comme si c'étaient des enceintes.
//
// LE PROCÉDÉ : DES HAUT-PARLEURS VIRTUELS. Chaque canal d'une disposition à haut-parleurs devient une
// source placée à la direction de son haut-parleur, filtrée par les fonctions de transfert de la tête
// (HRTF) du moteur audio ; un champ ambisonique est d'abord décodé vers vingt-six directions réparties
// sur la sphère, qui deviennent à leur tour autant de sources. Le procédé est le même pour les quatre
// familles, ce qui garantit qu'on compare au casque des choses comparables.
//
// Ce module est séparé de `multicanal.ts` parce qu'il dépend du moteur audio du navigateur, là où
// l'autre est un calcul pur : on éprouve le second pas à pas, on vérifie le premier dans l'application.

import { decoder, dispositionDe, dispositionParId, replierEnStereo, sphereVirtuelle, vecteur, type Disposition, type HautParleur } from "./multicanal";

/**
 * La position d'une direction dans le repère du moteur audio.
 *
 * DEUX CONVENTIONS À RACCORDER, ET C'EST ICI QU'UN ESPACE SE RETOURNE SI L'ON SE TROMPE. Ce module
 * compte l'azimut positif vers la gauche, x devant et z en haut ; le moteur audio place x à droite,
 * y en haut, et l'auditeur regarde vers −z. Une erreur de signe ici et toute la pièce tourne à
 * l'envers au casque — sans que rien ne le signale, puisque le son sort.
 */
export function positionMoteur(azimut: number, elevation: number, rayon = 1): [number, number, number] {
  const [x, y, z] = vecteur(azimut, elevation);
  return [-y * rayon, z * rayon, -x * rayon];
}

/** Les sources à placer pour écouter une disposition : ses haut-parleurs, ou une sphère virtuelle. */
export function sourcesVirtuelles(d: Disposition): HautParleur[] {
  return d.famille === "ambisonie" ? sphereVirtuelle() : d.hautParleurs;
}

/**
 * Rend un tampon multicanal en stéréo binaurale.
 *
 * Le caisson de graves n'a pas de direction : il est ajouté aux deux oreilles, atténué de six
 * décibels, comme le font la plupart des repliements stéréo. Si la somme dépasse le plein calibre,
 * tout le rendu est ramené juste en dessous — c'est une écoute de travail, et un écrêtage y
 * masquerait précisément ce qu'on vient écouter ; la notice du nœud le dit.
 */
export async function rendreBinaural(entree: AudioBuffer, d: Disposition): Promise<AudioBuffer> {
  const sr = entree.sampleRate;
  const canaux = Array.from({ length: entree.numberOfChannels }, (_, c) => entree.getChannelData(c));
  const sources = sourcesVirtuelles(d);
  const signaux = d.famille === "ambisonie" ? decoder(canaux, d.ordre ?? 1, sources) : canaux;

  const ctx = new OfflineAudioContext(2, entree.length, sr);
  sources.forEach((h, k) => {
    const s = signaux[k];
    if (!s) return;
    const mono = ctx.createBuffer(1, entree.length, sr);
    mono.copyToChannel(new Float32Array(s), 0);
    const lecture = ctx.createBufferSource();
    lecture.buffer = mono;
    if (h.lfe) {
      const g = ctx.createGain();
      g.gain.value = 0.5;
      lecture.connect(g);
      g.connect(ctx.destination);
    } else {
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = 1;
      const [x, y, z] = positionMoteur(h.azimut, h.elevation);
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
      lecture.connect(p);
      p.connect(ctx.destination);
    }
    lecture.start(0);
  });
  const rendu = await ctx.startRendering();

  let pic = 0;
  for (let c = 0; c < 2; c++) for (const v of rendu.getChannelData(c)) pic = Math.max(pic, Math.abs(v));
  if (pic > 0.99) {
    const g = 0.99 / pic;
    for (let c = 0; c < 2; c++) {
      const x = rendu.getChannelData(c);
      for (let i = 0; i < x.length; i++) x[i] *= g;
    }
  }
  return rendu;
}

/**
 * Le tampon à mettre dans l'aperçu écoutable d'un nœud : lui-même, ou son repliement stéréo.
 *
 * L'APERÇU ET LE FICHIER SE SÉPARENT ICI, ET C'ÉTAIT INÉVITABLE. Pour la profondeur d'écriture on
 * avait pu garder un seul blob, qui servait d'aperçu et de fichier sauvegardé. Pour le multicanal,
 * c'est intenable : l'aperçu à douze ou seize canaux pesait six à huit fois une stéréo, dans le
 * processus principal, pour un lecteur incapable de le jouer juste. Un tampon étiqueté de plus de
 * deux canaux est donc replié en stéréo pour l'aperçu, et l'enregistrement repart du tampon complet.
 *
 * Un tampon multicanal sans étiquette est laissé tel quel : personne ne sait ce que sont ses
 * canaux, et le replier au hasard serait pire que de ne rien faire.
 */
export function tamponPourApercu(b: AudioBuffer): AudioBuffer {
  const d = dispositionDe(b);
  if (!d || b.numberOfChannels <= 2) return b;
  const canaux = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
  const [g, dr] = replierEnStereo(canaux, d);
  // Une protection de crête, pour l'aperçu seulement : plusieurs haut-parleurs cohérents repliés du
  // même côté peuvent dépasser le plein calibre, et un écrêtage de l'aperçu ferait croire à un défaut
  // de la pièce. Le fichier enregistré n'est pas touché.
  let pic = 0;
  for (let i = 0; i < g.length; i++) pic = Math.max(pic, Math.abs(g[i]), Math.abs(dr[i]));
  const k = pic > 0.99 ? 0.99 / pic : 1;
  const out = new AudioBuffer({ numberOfChannels: 2, length: b.length, sampleRate: b.sampleRate });
  out.copyToChannel(new Float32Array(k === 1 ? g : Float32Array.from(g, (v) => v * k)), 0);
  out.copyToChannel(new Float32Array(k === 1 ? dr : Float32Array.from(dr, (v) => v * k)), 1);
  return out;
}

export { dispositionParId };
