// audio/depart-bwf.ts — L'heure d'enregistrement, attachée au son qui la porte.
//
// CE QUE CE MODULE REND POSSIBLE. `audio/bext.ts` lit l'heure du premier échantillon dans le bloc
// `bext` d'un fichier BWF ; elle n'était que DITE, dans le message de l'entrée audio, et rien ne la
// transportait dans le graphe. Deux prises du même tournage ne pouvaient donc toujours pas se
// replacer l'une par rapport à l'autre autrement qu'à l'oreille.
//
// UNE TABLE FAIBLE, ET LE PRÉCÉDENT EST DANS LE DÉPÔT. `audio/multicanal.ts` attache de la même
// façon la disposition des haut-parleurs à un tampon, avec la raison écrite : « écrire une propriété
// sur un `AudioBuffer` ne survivrait à rien et polluerait un objet du navigateur ; une table faible
// ne retient pas le tampon en mémoire, et disparaît avec lui. » Le même argument vaut ici, et la
// même mécanique d'héritage, posée au même endroit du moteur.
//
// CE QUI DIFFÈRE DE LA DISPOSITION, ET POURQUOI LA RÈGLE D'HÉRITAGE N'EST PAS LA MÊME. Une
// disposition suit le NOMBRE DE CANAUX : un égaliseur rend douze canaux, ce sont les douze mêmes.
// Une heure de départ, elle, suit le TEMPS : un composant qui rogne, étire ou rallonge déplace le
// premier échantillon, et transmettre l'heure d'avant la rendrait fausse sans que rien ne le dise.
// L'héritage exige donc une durée et une fréquence inchangées, et une seule entrée qui porte une
// heure — deux sources ne se départagent pas.
//
// LA LIMITE CONNUE, ÉCRITE PLUTÔT QUE CACHÉE : un effet qui DÉPLACE le son à l'intérieur d'un tampon
// de même longueur — un retard dont la sortie seule est gardée — garde l'heure. Elle désigne alors
// l'origine du FICHIER et non le premier son entendu. C'est exactement ce qu'on veut pour replacer
// des prises les unes par rapport aux autres, qui est l'objet de ce module ; ce ne le serait pas
// pour dater une attaque.

/** Les secondes depuis minuit du premier échantillon, par tampon. */
const departs = new WeakMap<object, number>();

/** Attache une heure de départ à un tampon, et le rend pour qu'on puisse chaîner. */
export function poserDepart<T extends object>(tampon: T, secondesDepuisMinuit: number): T {
  if (Number.isFinite(secondesDepuisMinuit) && secondesDepuisMinuit > 0) {
    departs.set(tampon, secondesDepuisMinuit);
  }
  return tampon;
}

/** L'heure de départ d'un tampon, si quelqu'un l'a déclarée. */
export function departDe(tampon: unknown): number | undefined {
  return tampon && typeof tampon === "object" ? departs.get(tampon) : undefined;
}

/** Ce qu'il faut de deux tampons pour dire qu'aucun temps n'a été déplacé entre eux. */
const memeTemps = (a: AudioBuffer, b: AudioBuffer) =>
  a.length === b.length && a.sampleRate === b.sampleRate;

/**
 * Transmet l'heure de départ des entrées aux sorties qui n'en portent pas.
 *
 * TROIS CONDITIONS, ET CHACUNE ÉCARTE UN MENSONGE POSSIBLE. Une seule entrée porte une heure —
 * sinon rien ne dit laquelle le mélange adopte. La sortie a la même longueur — sinon on a rogné ou
 * rallongé, et le premier échantillon n'est plus le même. La même fréquence — sinon on a étiré, et
 * une seconde ne vaut plus une seconde. Dans le doute, l'heure est PERDUE : une heure absente se
 * voit, une heure fausse ne se voit pas.
 */
export function heriterDepart(sorties: readonly unknown[], entrees: readonly unknown[]): void {
  const porteuses = entrees.filter((e): e is AudioBuffer =>
    departDe(e) !== undefined && typeof (e as AudioBuffer)?.length === "number");
  if (porteuses.length !== 1) return;
  const source = porteuses[0];
  const heure = departDe(source)!;
  for (const s of sorties) {
    const sortie = s as AudioBuffer;
    if (!s || typeof sortie?.length !== "number" || departDe(s) !== undefined) continue;
    if (memeTemps(sortie, source)) poserDepart(s as object, heure);
  }
}

/**
 * Les décalages à appliquer à des pistes pour qu'elles se replacent à leur heure.
 *
 * LA PLUS ANCIENNE DONNE L'ORIGINE, et non minuit : une prise de dix heures et demie placée à
 * 37 800 secondes sortirait de toute ligne de temps, et le réglage de départ du Montage ne va que
 * jusqu'à 3 600. Ce qui compte entre deux prises est leur ÉCART, pas leur heure absolue.
 *
 * UNE SEULE PISTE DATÉE NE DÉCALE RIEN : il n'y a alors rien à quoi la comparer, et la poser à zéro
 * reviendrait à annoncer un calage qui n'a pas eu lieu.
 */
export function decalagesDepuisDeparts(
  heures: ReadonlyMap<number, number>,
): Map<number, number> {
  const decalages = new Map<number, number>();
  if (heures.size < 2) return decalages;
  const origine = Math.min(...heures.values());
  for (const [piste, heure] of heures) decalages.set(piste, heure - origine);
  return decalages;
}
