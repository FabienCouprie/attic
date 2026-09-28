// audio/effets-filtres.ts — Egalisation, distorsion, filtrage.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.


export async function equaliser(
  buffer: AudioBuffer,
  ...gainsDb: number[]
): Promise<AudioBuffer> {
  const FREQUENCES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000];
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  let precedent = source as AudioNode;
  for (let i = 0; i < FREQUENCES.length; i++) {
    const filtre = ctx.createBiquadFilter();
    filtre.type = "peaking";
    filtre.frequency.value = FREQUENCES[i];
    filtre.Q.value = 1.4;
    filtre.gain.value = gainsDb[i] ?? 0;
    precedent.connect(filtre);
    precedent = filtre;
  }
  precedent.connect(ctx.destination);

  source.start();
  return ctx.startRendering();
}



export async function appliquerDistorsion(entree: AudioBuffer, gain: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(entree.numberOfChannels, entree.length, entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const shaper = ctx.createWaveShaper();
  const n = 2048;
  const courbe = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    courbe[i] = Math.atan(gain * x) / Math.atan(gain);
  }
  shaper.curve = courbe;
  source.connect(shaper);
  shaper.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}



/**
 * `frequence` accepte une COURBE en plus d'un nombre.
 *
 * Quand c'en est une, elle est confiée à `setValueCurveAtTime` : Web Audio interpole alors
 * lui-même, à l'échantillon près, ce qu'aucune découpe en tranches ne saurait faire aussi
 * proprement. C'est ce qui rend la modulation d'un filtre exacte et gratuite — la coupure suit
 * la courbe sans un craquement, là où changer `.value` par blocs en produirait un à chaque bloc.
 */
export async function appliquerFiltre(
  entree: AudioBuffer,
  type: BiquadFilterType,
  frequence: number | Float32Array,
  q: number | Float32Array
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(entree.numberOfChannels, entree.length, entree.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = entree;
  const filtre = ctx.createBiquadFilter();
  filtre.type = type;
  // LA COUPURE ET LA RÉSONANCE SE POSENT DE LA MÊME FAÇON, et c'est pour cela que cette fonction
  // existe : deux paramètres du même filtre peuvent bouger ensemble, ce qu'aucune mise en série de
  // deux filtres ne reproduit.
  //
  // Une courbe d'un seul point n'est pas acceptée par la spécification, et une courbe à la cadence
  // du son serait démesurée : on la réduit à un millier de points, ce qui suffit largement pour un
  // réglage qui ne module pas au-delà de quelques dizaines de hertz.
  const poser = (cible: AudioParam, valeur: number | Float32Array) => {
    if (typeof valeur === "number") { cible.value = valeur; return; }
    const n = Math.max(2, Math.min(1000, valeur.length));
    const reduite = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      reduite[i] = valeur[Math.min(valeur.length - 1, Math.round((i * (valeur.length - 1)) / (n - 1)))];
    }
    cible.setValueCurveAtTime(reduite, 0, entree.duration);
  };
  poser(filtre.frequency, frequence);
  poser(filtre.Q, q);
  source.connect(filtre);
  filtre.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

// Spatialisation stéréo : positionne le son dans l'espace (gauche/droite).
/**
 * La trajectoire du point sonore, dans l'unité du panoramiseur.
 *
 * POURQUOI CETTE FONCTION EXISTE À PART. Ce qui se passe ensuite — un `PannerNode` en HRTF dans un
 * contexte hors ligne — ne se teste pas : il n'y a pas de Web Audio dans l'environnement de test.
 * La trajectoire, elle, est un simple tableau de nombres, et c'est là que vivent les décisions qui
 * pourraient être fausses : ce que vaut le zéro d'une courbe, ce que vaut son un, et ce que la
 * largeur fait au parcours. On les éprouve ici, et il ne reste derrière qu'un branchement.
 *
 * SANS COURBE, LA TRAJECTOIRE EST UNE CONSTANTE à la valeur du réglage — le même chemin de calcul,
 * pas un second. C'est ce qui garantit qu'ajouter l'entrée n'a rien changé aux graphes existants.
 *
 * @param nPoints nombre de points de la trajectoire ; ils seront étalés sur toute la durée.
 * @param position réglage « Position », entre -1 (gauche) et 1 (droite).
 * @param largeur réglage « Largeur », entre 0 (mono) et 1 (pleine).
 */
