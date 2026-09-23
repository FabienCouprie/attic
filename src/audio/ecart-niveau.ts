// audio/ecart-niveau.ts — De combien un composant change le niveau de ce qu'il reçoit.
//
// POURQUOI CE FICHIER EXISTE.
//
// Certains composants rendent un son plus faible que celui qu'ils ont reçu, et rien ne le dit :
// la chute se découvre à l'oreille, plusieurs composants plus loin, sans qu'on sache lequel en est
// la cause. Ce module mesure l'écart et le rend ; il ne corrige rien.
//
// LA CORRECTION AUTOMATIQUE A ÉTÉ ÉCARTÉE, et il faut dire pourquoi, sinon la question reviendra.
// Redresser chaque sortie sur son entrée casserait :
//   - les composants dont le niveau EST l'objet (normaliseur, gate, ducking, fondu, enveloppe) ;
//   - les garanties de reconstruction (la séparation harmonique/percussive, SMS, le mono grave)
//     dont les sorties, remises ensemble, redonnent le signal d'entrée ;
//   - l'associativité de la chaîne, un méta-composant ne sonnant plus comme ses composants.
// Le composant « Recaler le niveau » fait le travail là où on le demande, et seulement là.
//
// QUELLE MESURE. La sonie intégrée de la norme BS.1770, la même que le VU-mètre, parce qu'elle
// pondère le spectre comme l'oreille le fait : un passe-bas qui retire du grave perd moins en sonie
// qu'en énergie brute. Sous 0,4 seconde la norme ne s'applique pas, la porte relative n'ayant pas
// assez de blocs ; on retombe alors sur le niveau efficace, qui pour un son court dit la même chose
// à quelques dixièmes près.
import { sonieIntegree } from "./vumetre";

/** Le niveau d'un tampon, en décibels. Sonie BS.1770, ou niveau efficace sur un son trop court. */
export function niveauDb(buffer: AudioBuffer): number {
  const s = sonieIntegree(buffer, buffer.sampleRate, buffer.numberOfChannels, buffer.length);
  if (Number.isFinite(s.integree)) return s.integree;
  // Le niveau efficace, tous canaux additionnés comme la sonie les additionne.
  let somme = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) somme += x[i] * x[i];
  }
  const n = buffer.length * Math.max(1, buffer.numberOfChannels);
  const rms = n > 0 ? Math.sqrt(somme / n) : 0;
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** La crête absolue d'un tampon, tous canaux confondus. */
export function creteDb(buffer: AudioBuffer): number {
  let pic = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const x = buffer.getChannelData(c);
    for (let i = 0; i < x.length; i++) {
      const v = Math.abs(x[i]);
      if (v > pic) pic = v;
    }
  }
  return pic > 0 ? 20 * Math.log10(pic) : -Infinity;
}

export interface EcartNiveau {
  /** Le niveau de l'entrée de référence, en dB. */
  entree: number;
  /** Le niveau de la première sortie audio, en dB. */
  sortie: number;
  /** Sortie moins entrée. Négatif quand le composant affaiblit. */
  ecart: number;
}

/**
 * L'écart entre ce qu'un composant rend et ce qu'il a reçu.
 *
 * LA RÉFÉRENCE EST LA PLUS FAIBLE DE SES ENTRÉES. Un composant à plusieurs entrées audio reçoit
 * des niveaux différents ; prendre la plus forte ferait paraître fautif un mélangeur qui ne l'est
 * pas, alors que la plus faible dit ce qu'il faut savoir : de combien la chaîne a baissé depuis le
 * plus discret de ses affluents.
 *
 * Rend `null` quand la mesure n'a pas de sens : aucune entrée audio, aucune sortie audio, ou un
 * silence d'un côté ou de l'autre, dont le niveau n'est pas un nombre.
 */
export function ecartNiveau(
  sorties: readonly unknown[], entrees: readonly unknown[],
  estTampon: (v: unknown) => v is AudioBuffer,
): EcartNiveau | null {
  const sortie = sorties.find(estTampon);
  if (!sortie) return null;
  const tamponsEntree = entrees.filter(estTampon);
  if (tamponsEntree.length === 0) return null;

  const niveauxEntree = tamponsEntree.map(niveauDb).filter((n) => Number.isFinite(n));
  if (niveauxEntree.length === 0) return null;
  const entree = Math.min(...niveauxEntree);

  const niveauSortie = niveauDb(sortie);
  if (!Number.isFinite(niveauSortie)) return null;

  return { entree, sortie: niveauSortie, ecart: niveauSortie - entree };
}
