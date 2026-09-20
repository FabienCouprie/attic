// audio/mixage.ts — Mise à niveau des bus avant la somme.
//
// POURQUOI UN BUS À LA FOIS
//
// La Groove Box ramenait le mix ENTIER à 0,9 de son pic, et ce pic, ce sont les
// frappes de batterie : tout le reste descendait avec elles. Mesuré dans
// l'application, à graine égale, le mix sortait à −23,1 dB RMS avec la batterie à
// 100 % et à −13,9 dB sans elle — neuf décibels perdus par les parties mélodiques à
// cause de transitoires qui durent quelques millisecondes. Baisser le volume de la
// batterie n'y suffisait pas : à 25 % il restait 4,5 dB d'écart, la frappe portant
// toujours le pic.
//
// Mettre chaque bus à son propre pic avant de les additionner rend le niveau des
// parties mélodiques indépendant de la batterie, et fait du réglage de batterie un
// vrai rapport entre les deux.

/** Pic absolu, tous canaux confondus. */
export function picTampon(buffer: AudioBuffer): number {
  let pic = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < canal.length; i++) {
      const a = Math.abs(canal[i]);
      if (a > pic) pic = a;
    }
  }
  return pic;
}

/**
 * Amène le tampon à `cible` de pic, EN PLACE. Ne fait rien sur un tampon muet — il
 * n'y a pas de niveau à corriger, et le diviser par son pic ferait exploser le bruit
 * numérique — ni pour une cible nulle ou négative, qui signifie « bus coupé ».
 */
export function normaliserPic(buffer: AudioBuffer, cible: number): void {
  if (cible <= 0) return;
  const pic = picTampon(buffer);
  if (pic < 1e-6) return;
  const gain = cible / pic;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < canal.length; i++) canal[i] *= gain;
  }
}

/**
 * Filet de sécurité après la somme : n'intervient QUE si le plafond est dépassé, donc
 * aux seuls instants où deux bus culminent ensemble. C'est la différence avec une
 * normalisation systématique, qui rabaissait le morceau entier.
 */
export function limiterPic(buffer: AudioBuffer, plafond: number): void {
  const pic = picTampon(buffer);
  if (pic <= plafond) return;
  const gain = plafond / pic;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < canal.length; i++) canal[i] *= gain;
  }
}
