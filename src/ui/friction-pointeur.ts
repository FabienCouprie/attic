// ui/friction-pointeur.ts — Le pointeur qu'on entend frotter.
//
// CE QUE FAIT CE MODULE. Un bruit continu suit le pointeur : plus il va vite, plus le frottement est
// fort et aigu ; à l'arrêt, il se tait. C'est une texture pseudo-haptique, la main croyant sentir
// une matière que seule l'oreille reçoit.
//
// LE BRUIT EST ROSE ET NON BLANC, et ce n'est pas un détail de goût. Un bruit blanc porte autant
// d'énergie par hertz, donc deux fois plus d'énergie dans chaque octave que dans la précédente : il
// siffle. Un bruit rose porte autant d'énergie par OCTAVE, ce qui est l'échelle sur laquelle
// l'oreille juge, et c'est la couleur des frottements du monde, du sable au tissu. La recette de
// filtres en cascade est celle de Paul Kellett, qui approche la pente de trois décibels par octave à
// moins d'un demi-décibel près sur toute la bande utile.
//
// TROIS RÈGLES GOUVERNENT LE RESTE, et elles viennent de ce que l'illusion coûte cher à obtenir et
// rien à perdre.
//
//   — LE RETARD. Au-delà d'une vingtaine de millisecondes entre le geste et le son, l'illusion
//     tombe et il ne reste qu'un bruit gênant. Le son est donc réglé DANS le gestionnaire de
//     déplacement, sans passer par une image d'animation, et la vitesse est prise sur l'horloge
//     monotone plutôt que sur la date du jour, qui saute quand la machine remet l'heure.
//   — L'EXTINCTION. Rien ne s'arrête net dans la matière. Le niveau et la fréquence sont conduits
//     par des rampes exponentielles, quinze millisecondes pour le niveau et vingt pour la
//     fréquence, faute de quoi chaque arrêt de la main serait un clic.
//   — LA CONGRUENCE. Le grain doit ressembler à ce qu'on croit toucher. Ici la fréquence du filtre
//     monte avec la vitesse, de deux cents hertz, qui s'entend lourd et rugueux, à mille huit cents,
//     qui s'entend fin et rapide.

/** Le niveau le plus fort que la friction atteint, en gain linéaire. */
export const NIVEAU_MAX = 0.4;

/** La vitesse, en pixels par seconde, au-delà de laquelle la friction ne monte plus. */
export const VITESSE_PLEINE = 3000;

/**
 * La part de la vitesse pleine au-dessous de laquelle le pointeur est tenu pour immobile.
 *
 * Sans ce seuil, le moindre tremblement de main, ou un pixel de déplacement rapporté par le système
 * alors que personne n'a bougé, suffirait à faire chuchoter le bruit en permanence.
 */
export const SEUIL = 0.01;

/** Les deux bornes de la fréquence du filtre, en hertz. */
export const FREQUENCE_BASSE = 200;
export const FREQUENCE_HAUTE = 1800;

/** Les constantes de temps des deux rampes, en secondes. */
export const RAMPE_NIVEAU = 0.015;
export const RAMPE_FREQUENCE = 0.02;

/**
 * Le temps sans le moindre déplacement au bout duquel la friction se tait, en millisecondes.
 *
 * IL FAUT UNE HORLOGE, ET NON UN ÉVÉNEMENT, et c'est ce qui manquait : une main qui s'arrête
 * n'envoie PLUS RIEN. Éteindre le son dans le gestionnaire de déplacement, quand la vitesse tombe
 * sous le seuil, suppose un dernier déplacement lent qui n'arrive pas : les événements cessent d'un
 * coup, le gain reste où il était, et le bruit continue indéfiniment. MESURÉ AVANT CORRECTION : une
 * demi-seconde après la fin du geste, le gain valait encore 0,3333 sur un maximum de 0,4.
 *
 * SOIXANTE MILLISECONDES : au-dessus de l'écart entre deux déplacements d'une main qui bouge, qui
 * est de huit à seize millisecondes, pour ne pas hacher un geste continu ; au-dessous de ce qui
 * s'entend comme une traîne, la rampe d'extinction achevant de fondre le reste.
 */
export const DELAI_SILENCE = 60;

/**
 * La vitesse du pointeur, en pixels par SECONDE.
 *
 * PAR SECONDE ET NON PAR ÉVÉNEMENT, et c'est la seule façon que le même geste sonne pareil d'une
 * machine à l'autre. Un système qui rapporte les déplacements deux fois plus souvent en rapporte
 * des moitiés : compter les pixels par événement ferait sonner le même geste deux fois plus doux
 * sur la machine la plus fine, ce que personne ne verrait jamais en se relisant.
 */
export function vitesseDuPointeur(dx: number, dy: number, dtSecondes: number): number {
  if (!(dtSecondes > 0)) return 0;
  return Math.hypot(dx, dy) / dtSecondes;
}

/** Ce que la vitesse commande au bruit : un niveau et une fréquence de filtre. */
export interface Commande {
  /** Le gain, de 0 à `NIVEAU_MAX`. */
  niveau: number;
  /** La fréquence centrale du filtre, en hertz. */
  frequence: number;
}

/**
 * Ce que la vitesse commande.
 *
 * LA LOI EST CELLE DU FROTTEMENT : l'amplitude monte avec la vitesse, et la fréquence des aspérités
 * rencontrées aussi. Les deux montent ensemble et se plafonnent ensemble, une main qui va deux fois
 * plus vite qu'il n'est prévu n'ayant pas à sonner deux fois plus fort.
 */
export function commandeDepuisVitesse(vitesse: number): Commande {
  const part = Math.min(Math.max(0, vitesse) / VITESSE_PLEINE, 1);
  if (part <= SEUIL) return { niveau: 0, frequence: FREQUENCE_BASSE };
  return {
    niveau: part * NIVEAU_MAX,
    frequence: FREQUENCE_BASSE + part * (FREQUENCE_HAUTE - FREQUENCE_BASSE),
  };
}

/**
 * Un bruit rose, en échantillons.
 *
 * LES SEPT ÉTATS SONT SEPT FILTRES PASSE-BAS de fréquences échelonnées, dont la somme approche la
 * pente en un sur f. Les coefficients sont ceux de Paul Kellett ; le dernier terme n'est pas
 * filtré, c'est lui qui rend l'aigu.
 */
export function echantillonsDeBruitRose(combien: number, tirage: () => number): Float32Array {
  const n = Math.max(0, Math.round(combien));
  const x = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const blanc = tirage() * 2 - 1;
    b0 = 0.99886 * b0 + blanc * 0.0555179;
    b1 = 0.99332 * b1 + blanc * 0.0750759;
    b2 = 0.96900 * b2 + blanc * 0.1538520;
    b3 = 0.86650 * b3 + blanc * 0.3104856;
    b4 = 0.55000 * b4 + blanc * 0.5329522;
    b5 = -0.7616 * b5 - blanc * 0.0168980;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + blanc * 0.5362) * 0.11;
    b6 = blanc * 0.115926;
  }
  return x;
}

/** La durée du tampon de bruit, en secondes. Il tourne en boucle. */
const DUREE_DU_BRUIT = 2;

/** La finesse du filtre. Plus elle monte, plus le grain s'entend métallique. */
const FINESSE = 2;

/**
 * Met la friction en marche, et rend de quoi l'arrêter.
 *
 * LE CONTEXTE NAÎT ET MEURT AVEC LE BOUTON. Un contexte audio laissé ouvert garde un processeur
 * éveillé et une source en boucle qui tourne pour rien ; celui-ci se ferme quand on éteint, et le
 * navigateur récupère tout.
 */
export function demarrerLaFriction(): () => void {
  const Ctx = (window as unknown as {
    AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext;
  }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};

  const ctx = new Ctx();
  const source = ctx.createBufferSource();
  const tampon = ctx.createBuffer(1, Math.round(DUREE_DU_BRUIT * ctx.sampleRate), ctx.sampleRate);
  tampon.getChannelData(0).set(echantillonsDeBruitRose(tampon.length, Math.random));
  source.buffer = tampon;
  source.loop = true;

  const filtre = ctx.createBiquadFilter();
  filtre.type = "bandpass";
  filtre.Q.value = FINESSE;
  filtre.frequency.value = FREQUENCE_BASSE;

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filtre);
  filtre.connect(gain);
  gain.connect(ctx.destination);
  source.start();

  let x = 0;
  let y = 0;
  let quand = 0;
  let extinction = 0;

  const taire = () => { gain.gain.setTargetAtTime(0, ctx.currentTime, RAMPE_NIVEAU); };

  const bouger = (e: PointerEvent) => {
    // Le navigateur tient un contexte fermé tant que rien n'a été touché : le premier mouvement
    // est le geste qui l'autorise.
    if (ctx.state === "suspended") void ctx.resume();

    const maintenant = performance.now() / 1000;
    if (quand === 0) { x = e.clientX; y = e.clientY; quand = maintenant; return; }
    const commande = commandeDepuisVitesse(
      vitesseDuPointeur(e.clientX - x, e.clientY - y, maintenant - quand),
    );
    x = e.clientX;
    y = e.clientY;
    quand = maintenant;

    gain.gain.setTargetAtTime(commande.niveau, ctx.currentTime, RAMPE_NIVEAU);
    filtre.frequency.setTargetAtTime(commande.frequence, ctx.currentTime, RAMPE_FREQUENCE);

    // ET L'HORLOGE DU SILENCE REPART À CHAQUE DÉPLACEMENT : tant que la main bouge, elle n'arrive
    // jamais au bout ; dès qu'elle s'arrête, elle y arrive une fois et le son s'éteint.
    clearTimeout(extinction);
    extinction = window.setTimeout(taire, DELAI_SILENCE);
  };

  // UN SEUL ÉVÉNEMENT POUR LA SOURIS, LE STYLET ET LE DOIGT : « pointermove » les couvre tous les
  // trois, là où « mousemove » laisserait l'écran tactile muet.
  window.addEventListener("pointermove", bouger, { passive: true });

  return () => {
    window.removeEventListener("pointermove", bouger);
    clearTimeout(extinction);
    try { source.stop(); } catch { /* déjà arrêtée */ }
    void ctx.close();
  };
}
