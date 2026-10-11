// audio/retard-granulaire.ts — Une ligne à retard lue par des grains, dont la sortie y retourne.
//
// LA FILIATION, ET CE QU'ELLE N'EST PAS. Aucun article ne fonde ce procédé : son nom vient de la
// pratique logicielle, et sa mise en œuvre de référence est le `DLGranulator` de Ross Bencina dans
// AudioMulch. La classe à laquelle il appartient porte en revanche une définition nette, la
// granulation sur ligne à retard : une ligne est alimentée par l'entrée, et chaque grain y lit à
// son propre retard et à sa propre vitesse. S'y ajoutent deux choses que la ligne rend possibles,
// la réinjection de la sortie dans la ligne et le gel de son contenu.
//
// CE QUI MANQUAIT, ET C'EST STRUCTUREL. Les retards du catalogue RECOPIENT le signal — écho,
// ping-pong, écho flottant — ou le retardent bande par bande. Le gel granulaire, lui, lit le
// tampon SOURCE à une position, un seul grain répété : ni ligne, ni réinjection. Aucun composant
// ne regranule donc sa propre sortie, et c'est tout l'objet de ce module : un grain transposé,
// réinjecté, ressort transposé DEUX fois. La hauteur monte par paliers, un par tour de boucle,
// et la suite est géométrique. C'est ce que rien d'autre ne produit, et c'est aussi ce qui se
// mesure sans ambiguïté.
//
// LA COURSE DE LECTURE, ET POURQUOI UN GRAIN SE RACCOURCIT. Un grain lancé à l'instant t lit la
// ligne à partir de t − D et avance de r échantillons par échantillon. Pour r plus grand que un il
// RATTRAPE la tête d'écriture : il l'atteint au bout de D/(r−1) échantillons, et au-delà il
// lirait ce qui n'est pas encore enregistré. Sa durée est donc bornée par cette course, ce qui
// n'est pas une précaution de confort mais la seule issue : la solution de rechange, laisser le
// grain dépasser, lui fait lire le contenu d'un tour de ligne plus ancien, c'est-à-dire un collage
// au milieu du grain. Le rapport dit combien de grains ont été bornés.
//
// LA SOMME, ET POURQUOI LA COMPENSATION DU MICROMONTAGE NE CONVIENT PAS ICI. Des grains qui se
// recouvrent font croître la somme avec la densité : sans rien faire, tourner le bouton de densité
// reviendrait à tourner un bouton de volume, et un nuage dense écrêterait. Le micromontage divise
// pour cela par la RACINE du recouvrement moyen, ses fragments étant découpés à des endroits
// différents d'une source et posés à des instants tirés au sort : ils s'additionnent sans rapport
// de phase, et leur somme croît comme la racine de leur nombre.
//
// ICI ILS PEUVENT ÊTRE COHÉRENTS, et c'est la différence qui compte. À dispersion nulle et
// transposition nulle, deux grains qui sonnent ensemble lisent la MÊME position de la ligne : leur
// somme croît comme leur nombre, non comme sa racine.
//
// LES DEUX DIVISEURS ONT ÉTÉ MESURÉS DES DEUX CÔTÉS, et aucun ne tient les deux régimes :
//
//   · en RACINE, le niveau d'un nuage décorrélé ne bouge pas, 0,05 dB de quinze à cent soixante
//     grains par seconde ; mais le cas cohérent écrête, crête relevée à +17,1 dB à densité cent
//     soixante avec réinjection, et le retard cesse d'être exact, 1,7 · 10⁻¹ d'écart ;
//   · en SOMME DES FENÊTRES, le cas cohérent est exact à 10⁻⁹ près et rien ne peut écrêter ; mais
//     le niveau d'un nuage décorrélé baisse comme la racine du recouvrement, 10,4 dB sur la même
//     course de densité.
//
// LA SOMME DES FENÊTRES EST RETENUE, pour trois raisons mesurées. Elle ne peut pas écrêter, la
// somme des fenêtres majorant la racine de la somme de leurs carrés. Elle rend le cas identité
// EXACT : un retard granulaire sans écart ni transposition est un retard tout court, ce que la
// racine ne donne pas. Et son coût est une LOI et non une dérive, la baisse étant celle de la
// moyenne de n signaux indépendants, ce que le cas de densité vérifie à un demi-décibel près
// plutôt que de le tolérer dans une marge.
//
// LE DIVISEUR EST DONC LA SOMME DES FENÊTRES ACTIVES, instant par instant, et non une espérance
// tirée des réglages : la somme dépend de l'alignement des grains, que le tirage des retards
// déplace.
//
// LE DIVISEUR NE DESCEND PAS SOUS UN, et ce n'est pas un garde-fou de confort : un grain seul a
// une somme de fenêtres inférieure à un sur ses deux flancs, et diviser par elle y rendrait le
// grain plat. C'est-à-dire défaire la fenêtre, donc rétablir le claquement qu'elle existe pour
// éviter.
//
// LA COMPENSATION S'APPLIQUE AVANT LA RÉINJECTION, sans quoi le gain de boucle vaudrait la
// réinjection multipliée par le recouvrement, et la boucle divergerait sur un réglage que
// l'interface annonce comme stable.
//
// L'ORDRE DE CALCUL. La ligne reçoit, à chaque pas, l'entrée de ce pas-ci et la sortie granulée du
// pas PRÉCÉDENT. C'est le retard d'un échantillon de toute boucle numérique, celui que
// `retard-spectral.ts` écrit pour la même raison : sans lui la boucle n'a pas d'ordre de calcul.
// Il a ici un second effet, utile : la tête d'écriture est à jour quand les grains lisent, de
// sorte que l'interpolation d'un grain qui touche l'échantillon courant lit une valeur écrite et
// non le reste d'un tour précédent.
import { valeurA, valeurMax } from "./courbe";
import { creerAleatoire } from "../core/hasard";
import { fenetre, type Fenetre } from "./micromontage";

export interface OptionsRetardGranulaire {
  sampleRate: number;
  /** Retard central, en secondes. Un tableau le fait varier au fil du son. */
  temps: number | Float32Array;
  /** Étalement des retards de part et d'autre du temps central, en secondes. Un tableau le fait varier. */
  dispersion?: number | Float32Array;
  /** Durée d'un grain, en secondes. */
  taille: number;
  /** Grains lancés par seconde. */
  densite: number;
  /** Transposition d'un grain, en demi-tons. Un tableau la fait varier au fil du son. */
  transposition?: number | Float32Array;
  /** Part de la sortie renvoyée dans la ligne, de 0 à 1. */
  reinjection?: number | Float32Array;
  /** Vrai : la ligne cesse d'être alimentée dès qu'elle a été remplie une fois. */
  gel?: boolean;
  /** Part de son granulé dans la sortie, de 0 à 1. */
  melange?: number | Float32Array;
  fenetre?: Fenetre;
  graine: number;
  /** Queue ajoutée après la fin du son, en échantillons. */
  queue?: number;
}

/** Ce qu'on dit du rendu, de quoi juger les réglages avant de juger l'effet. */
export interface RapportRetardGranulaire {
  /** Grains lancés, queue comprise. */
  grains: number;
  /** Combien sonnent en même temps, en moyenne : le produit du débit par la durée d'un grain. */
  recouvrementMoyen: number;
  /**
   * Le facteur appliqué à la somme, en moyenne sur le rendu.
   *
   * IL EST RELEVÉ, ET NON DÉDUIT DES RÉGLAGES. La somme des fenêtres actives dépend de
   * l'alignement des grains, que le tirage des retards déplace : une espérance tirée de la densité
   * annoncerait un facteur que le rendu n'a pas appliqué.
   */
  compensationMoyenne: number;
  /** Longueur de la ligne, en échantillons. */
  ligne: number;
  /** Grains dont la durée a été bornée par la course de lecture. */
  bornes: number;
}

/**
 * Le plus grand retard que le rendu demandera, en échantillons.
 *
 * IL SE LIT SUR LA BORNE QUAND UNE COURBE EST BRANCHÉE, et non sur le réglage, qui ne sert alors à
 * rien. C'est la règle du retard spectral pour sa traîne : calculer la longueur de la ligne sur le
 * réglage donnerait deux lignes différentes pour un même effet, et l'invariant de la courbe plate
 * tomberait sur cette seule différence.
 */
export const retardMaximal = (
  temps: number | Float32Array, dispersion: number | Float32Array, sampleRate: number,
): number => Math.max(1, Math.round((valeurMax(temps) + Math.max(0, valeurMax(dispersion))) * sampleRate));

/**
 * Combien de tours de boucle restent audibles, pour savoir quelle queue ajouter.
 *
 * Quarante au plus : à réinjection 0,95 la décroissance théorique passe cent tours, et un rendu
 * qui les suivrait tous serait interminable pour une queue que personne n'entend.
 */
export const toursAudibles = (reinjection: number): number => {
  const r = Math.min(0.999, Math.max(0, reinjection));
  return r <= 0 ? 1 : Math.min(40, Math.ceil(Math.log(1e-4) / Math.log(r)));
};

/**
 * La ligne, les grains et la boucle, échantillon par échantillon.
 *
 * Le calcul est séquentiel par nature : la ligne de l'échantillon courant dépend de la sortie du
 * précédent. Son coût est celui du nombre de grains simultanés, soit la densité multipliée par la
 * durée d'un grain, et non celui du nombre de grains lancés.
 */
export function retardGranulaire(
  x: Float32Array, o: OptionsRetardGranulaire,
): { sortie: Float32Array; rapport: RapportRetardGranulaire } {
  const sr = o.sampleRate;
  const taille = Math.max(1, Math.round(Math.max(0.001, o.taille) * sr));
  const densite = Math.max(0.1, o.densite);
  const forme = o.fenetre ?? "gaussienne";
  const gelDemande = o.gel === true;
  const aleatoire = creerAleatoire(Math.max(1, Math.round(o.graine)));

  // LA LIGNE VAUT LE PLUS GRAND RETARD DEMANDÉ PLUS UN GRAIN, et ce n'est pas une marge prise au
  // hasard. Un grain transposé vers le bas prend du retard sur la tête d'écriture, jusqu'à la
  // durée d'un grain pour une octave en dessous : une ligne juste assez longue pour le retard le
  // ferait lire au-delà de son plus vieil échantillon, c'est-à-dire un tour de ligne plus récent.
  const retardMax = retardMaximal(o.temps, o.dispersion ?? 0, sr);
  // LA CONVERSION EN ÉCHANTILLONS SE FAIT DANS LA BOUCLE, en double précision, et non une fois
  // avant : convertir un tableau en simple précision avant de le ranger ferait qu'une courbe plate
  // ne rendrait plus ce que rend le réglage.
  const etalementA = (i: number) => Math.max(0, valeurA(o.dispersion ?? 0, i)) * sr;
  const L = retardMax + taille + 2;
  const ligne = new Float32Array(L);

  const n = x.length + Math.max(0, Math.round(o.queue ?? 0));
  const sortie = new Float32Array(n);

  // Le recouvrement moyen est le produit du débit par la durée d'un grain : c'est une espérance,
  // et elle ne dépend pas du tirage des retards. Elle n'entre pas dans le calcul, qui divise par
  // la somme des fenêtres réellement actives ; elle est là pour le rapport.
  const recouvrementMoyen = (densite * taille) / sr;
  let sommeCompensations = 0;

  /** Un grain en cours de lecture. */
  type Grain = { debut: number; fin: number; lecture: number; pas: number };
  const actifs: Grain[] = [];
  const pasLancement = sr / densite;
  let prochain = 0;
  let grains = 0;
  let bornes = 0;
  // La sortie granulée du pas précédent : le retard d'un échantillon de la boucle.
  let precedent = 0;

  // L'interpolation est linéaire, et elle est indispensable : un pas de lecture irrationnel tombe
  // entre deux échantillons, et prendre le plus proche ferait entendre la quantification de la
  // transposition plutôt que la transposition.
  const lire = (pos: number): number => {
    const p = Math.floor(pos);
    const f = pos - p;
    const a = ligne[((p % L) + L) % L];
    const b = ligne[(((p + 1) % L) + L) % L];
    return a + (b - a) * f;
  };

  for (let i = 0; i < n; i++) {
    const sec = i < x.length ? x[i] : 0;
    // LE GEL PREND EFFET UNE FOIS LA LIGNE REMPLIE, non au premier échantillon : gelée dès le
    // départ, elle serait vide et le nœud ne rendrait rien. Passé ce point elle cesse d'être
    // alimentée, les grains n'y lisent plus que ce qu'elle tient déjà, et la réinjection n'a plus
    // de prise puisque rien n'y entre plus.
    if (!(gelDemande && i >= L)) {
      ligne[i % L] = sec + Math.min(0.999, Math.max(0, valeurA(o.reinjection ?? 0, i))) * precedent;
    }

    while (prochain <= i) {
      // LE RETARD ET LA TRANSPOSITION SE LISENT À L'INSTANT DU LANCEMENT, une valeur par grain.
      // C'est la sémantique du micromontage, où chaque fragment lit la courbe à son instant de
      // pose ; elle a ici une seconde raison, décisive : un pas de lecture qui changerait PENDANT
      // un grain ferait de lui un glissando, et la hauteur du palier cesserait d'être celle que la
      // transposition annonce.
      const centre = Math.max(1, valeurA(o.temps, i) * sr);
      const d = Math.max(1, Math.min(retardMax, centre + (aleatoire() * 2 - 1) * etalementA(i)));
      const pas = Math.pow(2, valeurA(o.transposition ?? 0, i) / 12);
      const course = pas > 1 ? Math.floor(d / (pas - 1)) : Infinity;
      const duree = Math.max(1, Math.min(taille, course));
      if (duree < taille) bornes++;
      actifs.push({ debut: i, fin: i + duree, lecture: i - d, pas });
      grains++;
      prochain += pasLancement;
    }

    let somme = 0;
    let sommeFenetres = 0;
    for (let k = actifs.length - 1; k >= 0; k--) {
      const g = actifs[k];
      if (i >= g.fin) { actifs.splice(k, 1); continue; }
      const w = fenetre(forme, (i - g.debut) / (g.fin - g.debut));
      somme += w * lire(g.lecture);
      sommeFenetres += w;
      g.lecture += g.pas;
    }

    const compensation = 1 / Math.max(1, sommeFenetres);
    sommeCompensations += compensation;
    const mouille = somme * compensation;
    precedent = mouille;
    const m = Math.min(1, Math.max(0, valeurA(o.melange ?? 1, i)));
    sortie[i] = m * mouille + (1 - m) * sec;
  }

  return {
    sortie,
    rapport: {
      grains, recouvrementMoyen, ligne: L, bornes,
      compensationMoyenne: n > 0 ? sommeCompensations / n : 1,
    },
  };
}
