// audio/effets-restauration.ts — Deverberer, et retirer les clics.
//
// Une part de ce qui tenait dans un seul fichier, decoupee selon ses dependances. Aucune ligne
// de calcul n'a ete retouchee au passage.
//
// ═══ CE QUE LA DEREVERBERATION FAIT VRAIMENT, MESURE LE 2026-10-25 ═══
//
// FABIEN A SENTI QU'ELLE NE FONCTIONNAIT PAS. Eprouvee par `executer` sur un graphe de dix noeuds —
// une source, une reverberation, et la dereverberation a 0 %, 60 % et 100 % cote a cote — les trois
// reglages rendaient la MEME crete.
//
// LE RELEVE SE FAIT PAR TRANCHES, ET C'EST CE QUI L'A RENDU HONNETE. Un premier chiffre, pris sur
// une fenetre « de deux a six secondes », annoncait -38 dB de queue retires : il etait FAUX, parce
// que ce fichier ne porte que trois secondes et demie de son et que le reste est du silence
// numerique. Mesurer une attenuation sur du silence rend un grand nombre qui ne veut rien dire.
//
// PROFIL REEL PAR DEMI-SECONDE, sur la reverberation du depot (2 s de source) :
//
//   tranche      entree    memoire 5 s   memoire 20 s
//   0  - 0,5 s   -25,5       -25,6         -25,7      ← le son DIRECT, intact dans les deux cas
//   0,5 -  1 s   -38,5       -44,8         -57,3      ← -6,3 dB contre -18,8 dB
//   1  - 1,5 s   -42,3       -45,8         -66,3      ← -3,5 dB contre -24,0 dB
//   1,5 -  2 s   -47,0       -49,0         -78,3
//   2  - 2,5 s   -54,0       -56,5         -92,1
//   3,5 s et +   silence numerique
//
// L'ALGORITHME EST BON : dans la region qui s'entend, il retire dix-neuf a vingt-quatre decibels de
// reverberation en ne touchant au son direct que de DEUX DIXIEMES. Ce qui l'etouffait est
// `memoireSec`, le temps sur lequel le PIC de reference decroit : a cinq secondes il tombe de douze
// decibels par seconde, soit a peu pres aussi vite que la queue qu'il doit mesurer. Le pic suit donc
// la queue dans sa chute, le rapport ne descend jamais sous le seuil, et le portillon reste ferme.
//
// ET LE SEUIL NE COMPTE PRESQUE PAS, mesure : 50, 70 ou 90 donnent le meme ordre de grandeur des que
// la memoire est longue. Il reste donc code en dur, parce qu'un reglage inerte est pire que pas de
// reglage du tout.
//
// MAIS PORTER LE DEFAUT A VINGT SECONDES NE SE FAIT PAS, et c'est la mesure qui l'a arrete. Sur un
// signal SEC ou un passage faible VOULU suit un passage fort, a -34 dB de lui :
//
//   memoire 5 s ..... -3,41 dB sur le passage faible
//   memoire 10 s .... -31,85 dB
//   memoire 20 s .... -40,02 dB
//
// UNE MEMOIRE LONGUE EFFACE UN PIANISSIMO QUI SUIT UN FORTISSIMO. C'est le meme mecanisme que la
// dereverberation elle-meme : le portillon ne sait pas distinguer une queue d'un son faible voulu,
// il ne connait que « bien plus faible que le pic recent ». Force et innocuite sont donc le MEME
// bouton, et le compromis ne peut etre tranche que par celui qui connait la matiere.
//
// LE DEFAUT RESTE DONC A CINQ SECONDES — aucun graphe deja enregistre ne change de son — et la
// memoire devient un REGLAGE, avec son danger ecrit dans la notice.
//
// ET UNE QUEUE SYNTHETIQUE NE REMPLACE PAS UNE VRAIE, mesure aussi : un bruit blanc qui decroit ne
// se fait presque pas portillonner, parce qu'il remplit des bandes que la source n'a jamais
// excitees — dans celles-la le pic n'a jamais ete haut, le rapport vaut un, et rien ne se ferme. Le
// portillon travaille bande par bande contre l'historique de CETTE bande : une queue doit donc
// vivre dans les bandes de la source pour etre reconnue.

import { fft } from "./fft";
import { valeurA } from "./courbe";
import { TAILLE_FFT, SAUT_FFT, creerFenetreHann } from "./commun";

export function dererverberer(
  entree: AudioBuffer,
  force: number,
  seuil: number = 50,
  memoireSec: number = 5,
): AudioBuffer {
  const fenetre = creerFenetreHann(TAILLE_FFT);
  const nbBins = TAILLE_FFT / 2 + 1;
  const sr = entree.sampleRate;
  const resultat = new AudioBuffer({
    numberOfChannels: entree.numberOfChannels,
    length: entree.length,
    sampleRate: sr,
  });

  const decroissance = Math.pow(0.001, SAUT_FFT / (Math.max(0.1, memoireSec) * sr));
  const LISSAGE = 0.85;
  const PLANCHER = 0.01;
  const forceReelle = Math.max(0, Math.min(100, force)) / 100;
  const seuilReel = Math.max(0.01, Math.min(100, seuil)) / 100;

  for (let c = 0; c < entree.numberOfChannels; c++) {
    const entreeCan = entree.getChannelData(c);
    const sortie = new Float64Array(entree.length);
    const enveloppeNorm = new Float64Array(entree.length);
    const magnitudeLissee = new Float64Array(nbBins);
    const pic = new Float64Array(nbBins);
    let premiereTrame = true;

    for (let debut = 0; debut + TAILLE_FFT <= entreeCan.length; debut += SAUT_FFT) {
      const re = new Float64Array(TAILLE_FFT);
      const im = new Float64Array(TAILLE_FFT);
      for (let i = 0; i < TAILLE_FFT; i++) re[i] = entreeCan[debut + i] * fenetre[i];
      fft(re, im, false);

      for (let b = 0; b < nbBins; b++) {
        const magnitude = Math.hypot(re[b], im[b]);
        if (premiereTrame) magnitudeLissee[b] = magnitude;
        else magnitudeLissee[b] = LISSAGE * magnitudeLissee[b] + (1 - LISSAGE) * magnitude;

        if (premiereTrame) pic[b] = magnitudeLissee[b];
        else pic[b] = Math.max(magnitudeLissee[b], pic[b] * decroissance);

        const rapport = pic[b] > 1e-9 ? magnitudeLissee[b] / pic[b] : 1;
        let gain = 1;
        if (rapport < seuilReel) {
          const facteur = Math.max(0, rapport / seuilReel);
          // L'EXPOSANT PART DE ZERO, ET LE « + 0.5 » QUI Y ETAIT ETAIT UN DEFAUT. A force nulle il
          // valait un demi, donc le gain valait la RACINE du rapport — jamais un. Un reglage a zero
          // atteignait ainsi 0,78 dB de la queue, mesure : il doit etre un passe-droit exact.
          //
          // DEUX VINGT-CINQUIEMES PLUTOT QUE DEUX, pour que le maximum soit INCHANGE : l'ancienne
          // forme valait 2 × 1 + 0,5 = 2,5 a force pleine, la nouvelle 2,5 × 1. Seule l'origine
          // bouge, et c'est elle seule qui etait fausse.
          gain = Math.max(PLANCHER, Math.pow(facteur, forceReelle * 2.5));
        }

        const phase = Math.atan2(im[b], re[b]);
        const nouvelleMagnitude = magnitude * gain;

        re[b] = nouvelleMagnitude * Math.cos(phase);
        im[b] = nouvelleMagnitude * Math.sin(phase);
        if (b > 0 && b < TAILLE_FFT - b) {
          re[TAILLE_FFT - b] = re[b];
          im[TAILLE_FFT - b] = -im[b];
        }
      }
      premiereTrame = false;

      fft(re, im, true);
      for (let i = 0; i < TAILLE_FFT; i++) {
        sortie[debut + i] += re[i] * fenetre[i];
        enveloppeNorm[debut + i] += fenetre[i] * fenetre[i];
      }
    }

    const canalSortie = resultat.getChannelData(c);
    for (let i = 0; i < sortie.length; i++) {
      canalSortie[i] = enveloppeNorm[i] > 1e-6 ? sortie[i] / enveloppeNorm[i] : 0;
    }
  }

  return resultat;
}
// Méthode classique en deux passes : on étire d'abord la durée du signal sans
// changer sa hauteur (vocodeur de phase : on corrige la phase de chaque bande
// de fréquence d'une trame à l'autre pour respecter sa fréquence instantanée
// réelle, même quand l'espacement de synthèse diffère de celui d'analyse),
// puis on rééchantillonne ce résultat étiré pour lui rendre sa durée
// d'origine — ce second rééchantillonnage change la hauteur perçue.
// Combiner les deux change la hauteur sans changer la durée globale.
//
// Un simple recouvrement-addition sans correction de phase distord la
// hauteur des sons toniques dès que l'espacement change (vérifié : un ton
// pur à 220 Hz étiré ainsi dérivait vers ~239 Hz). Le vocodeur de phase
// corrige précisément ce défaut.



/**
 * LE SEUIL DE DÉTECTION ACCEPTE UNE COURBE, et la médiane qui lui sert de référence reste globale.
 * Le seuil est un multiple de cette médiane, comparé à la dérivée en chaque point : le moduler resserre
 * ou relâche la détection au fil du son, sur un passage abîmé plutôt que sur tout le fichier.
 */
export function supprimerClics(
  buffer: AudioBuffer,
  seuil: number | Float32Array,
  fenetreMs: number,
): AudioBuffer {
  const fenetre = Math.max(1, Math.round((fenetreMs / 1000) * buffer.sampleRate));
  const resultat = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const entree = buffer.getChannelData(c);
    const sortie = resultat.getChannelData(c);
    const n = entree.length;

    // Dérivée première absolue
    const diff = new Float32Array(n);
    let somme = 0;
    for (let i = 1; i < n; i++) {
      diff[i] = Math.abs(entree[i] - entree[i - 1]);
      somme += diff[i];
    }
    const mediane = somme / n;

    // Marquage : seuil est un multiple de la médiane (seuil > 1 = moins sensible)
    const marque = new Uint8Array(n);
    for (let i = 1; i < n; i++) {
      if (diff[i] > valeurA(seuil, i) * mediane) {
        const debut = Math.max(0, i - fenetre);
        const fin = Math.min(n - 1, i + fenetre);
        for (let j = debut; j <= fin; j++) marque[j] = 1;
      }
    }

    // Correction par interpolation cosinusoïdale sur chaque zone marquée
    let i = 0;
    while (i < n) {
      if (marque[i]) {
        const debut = i;
        while (i < n && marque[i]) i++;
        const fin = i - 1;
        const avant = Math.max(0, debut - 1);
        const apres = Math.min(n - 1, fin + 1);
        const longueur = apres - avant;
        if (longueur < 2) { i++; continue; }
        const valAvant = entree[avant];
        const valApres = entree[apres];
        for (let j = avant; j <= apres; j++) {
          const t = (j - avant) / longueur;
          const poids = 0.5 * (1 - Math.cos(Math.PI * t));
          sortie[j] = valAvant * (1 - poids) + valApres * poids;
        }
      } else {
        sortie[i] = entree[i];
        i++;
      }
    }
  }

  return resultat;
}

// --- Boîte à rythmes (synthèse percussive) ----------------------------------

// --- De-esser : compression dynamique des sibilances ------------------------
/**
 * LE SEUIL ACCEPTE UNE COURBE. C'est lui qui décide, échantillon par échantillon, de ce qui est une
 * sibilance : le faire descendre resserre l'atténuation, le faire remonter la relâche. Il est lu dans
 * la boucle par `valeurA`, comme un nombre l'était, et sans courbe branchée la sortie est celle
 * d'avant, au bit près.
 */
