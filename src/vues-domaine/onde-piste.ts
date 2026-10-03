// ui/onde-piste.ts — La forme d'onde d'une piste, dessinée dans sa barre.
//
// POURQUOI UNE ENVELOPPE ET NON LES ÉCHANTILLONS. Une piste stéréo de cinq minutes porte treize
// millions d'échantillons par canal. Les parcourir à chaque rendu serait impossible : la tête de
// lecture provoque soixante rendus par seconde, et une barre ne fait que quelques centaines de pixels.
// On calcule donc une fois, pour chaque tampon, la crête absolue sur un nombre fixe de tranches ; le
// dessin n'a plus qu'à lire cette table, quelle que soit la largeur.
//
// LE CACHE EST UNE `WeakMap`, et c'est ce qui le rend sûr : la table meurt avec le tampon qu'elle
// décrit. Une piste débranchée, un graphe relancé, et rien ne reste. Un cache par identifiant de
// piste aurait survécu au tampon et décrit un son qui n'existe plus.
//
// LA CRÊTE, ET NON LA MOYENNE. Une moyenne d'échantillons signés tend vers zéro sur toute forme
// symétrique : une sinusoïde pleine échelle dessinerait un trait plat. C'est le maximum de la valeur
// absolue qui dit ce qu'on voit sur un banc de montage.

const POINTS = 2048;
const cache = new WeakMap<AudioBuffer, Float32Array>();

/** La crête absolue du tampon sur `POINTS` tranches égales, tous canaux confondus. */
export function enveloppe(buffer: AudioBuffer): Float32Array {
  const deja = cache.get(buffer);
  if (deja) return deja;
  const n = buffer.length;
  const env = new Float32Array(POINTS);
  if (n > 0) {
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let p = 0; p < POINTS; p++) {
        const de = Math.floor((p * n) / POINTS);
        const a = Math.max(de + 1, Math.floor(((p + 1) * n) / POINTS));
        let m = env[p];
        for (let i = de; i < a && i < n; i++) {
          const v = Math.abs(d[i]);
          if (v > m) m = v;
        }
        env[p] = m;
      }
    }
  }
  cache.set(buffer, env);
  return env;
}

/**
 * Le tracé de l'onde dans une barre, symétrique autour de son milieu.
 *
 * `part` dit quelle fraction du son la barre montre, du début à la fin : une piste dont le début est
 * négatif est rognée par la gauche, et c'est ce qui sonne qu'il faut dessiner, non le son entier.
 */
export function cheminOnde(
  env: Float32Array, x0: number, largeur: number, y: number, hauteur: number,
  part: { de: number; a: number } = { de: 0, a: 1 },
): string {
  if (largeur <= 1 || hauteur <= 1 || env.length === 0) return "";
  const milieu = y + hauteur / 2;
  const demi = hauteur / 2;
  // Un point par pixel suffit : au-delà, deux points tombent sur la même colonne.
  const pas = Math.max(1, Math.round(largeur));
  const haut: string[] = [];
  const bas: string[] = [];
  for (let i = 0; i <= pas; i++) {
    const t = part.de + (part.a - part.de) * (i / pas);
    const p = Math.max(0, Math.min(env.length - 1, Math.round(t * (env.length - 1))));
    const x = (x0 + (largeur * i) / pas).toFixed(2);
    const v = Math.min(1, env[p]) * demi;
    haut.push(`${x},${(milieu - v).toFixed(2)}`);
    bas.push(`${x},${(milieu + v).toFixed(2)}`);
  }
  bas.reverse();
  return `M${haut.join(" L")} L${bas.join(" L")} Z`;
}
