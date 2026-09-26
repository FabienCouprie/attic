// audio/series-intervalles.ts — Les séries qui emploient les onze intervalles, chacun une fois.
//
// CE QUE C'EST. Une série dodécaphonique ordonne les douze classes de hauteurs. Une série à tous
// les intervalles fait davantage : les onze intervalles qui séparent ses notes successives sont
// tous différents, donc ils épuisent les onze intervalles possibles. Le matériau est alors aussi
// varié dans ses mouvements que dans ses hauteurs, ce qu'une série ordinaire ne garantit pas : une
// série peut fort bien monter six fois d'un demi-ton.
//
// L'EXEMPLE FAMEUX est la série de la « Suite lyrique » de Berg, fa mi do la sol ré la♭ ré♭ mi♭
// sol♭ si♭ si. Le procédé est étudié depuis les années cinquante ; le dénombrement des séries qui
// commencent sur do est publié, et sert ici de contrôle.
//
// POURQUOI UNE RECHERCHE ET NON UNE FORMULE. Il n'existe pas de construction directe qui les donne
// toutes ; on les cherche en essayant, et l'on élague dès qu'un intervalle ou une hauteur se
// répète. L'élagage est sévère, et la recherche complète tient en une fraction de seconde.

/** Les intervalles successifs d'une série, orientés, de 1 à 11. */
export function intervallesDe(serie: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < serie.length; i++) {
    out.push((((serie[i] - serie[i - 1]) % 12) + 12) % 12);
  }
  return out;
}

/**
 * Cette série emploie-t-elle les douze hauteurs et les onze intervalles, chacun une fois ?
 *
 * Les deux conditions sont distinctes et toutes deux nécessaires : une suite peut épuiser les
 * hauteurs sans épuiser les intervalles, et c'est le cas le plus fréquent.
 */
export function estSerieTousIntervalles(serie: readonly number[]): boolean {
  if (serie.length !== 12) return false;
  if (new Set(serie.map((n) => ((n % 12) + 12) % 12)).size !== 12) return false;
  const ints = intervallesDe(serie);
  if (ints.some((i) => i === 0)) return false;
  return new Set(ints).size === 11;
}

/**
 * Toutes les séries à tous les intervalles qui commencent sur zéro.
 *
 * IL Y EN A 3856, et ce nombre est le contrôle de la recherche. Il est publié depuis le
 * dénombrement de Bauer-Mengelberg et Ferentz, en 1965 ; une recherche qui en rendrait un autre
 * serait fausse, et c'est ce qu'un test vérifie.
 *
 * LA DERNIÈRE NOTE EST TOUJOURS À SIX DEMI-TONS DE LA PREMIÈRE, et ce n'est pas une curiosité mais
 * une conséquence : la somme des onze intervalles vaut 1 + 2 + … + 11 = 66, et 66 modulo 12 fait 6.
 * Toute série à tous les intervalles se referme donc sur un triton.
 *
 * `limite` arrête la recherche après ce nombre de séries, pour n'en vouloir qu'une poignée.
 */
export function seriesTousIntervalles(limite = Infinity): number[][] {
  const trouvees: number[][] = [];
  const serie = [0];
  const hauteurUtilisee = Array.from({ length: 12 }, () => false);
  const intervalleUtilise = Array.from({ length: 12 }, () => false);
  hauteurUtilisee[0] = true;

  const explorer = (): void => {
    if (trouvees.length >= limite) return;
    if (serie.length === 12) { trouvees.push([...serie]); return; }
    const derniere = serie[serie.length - 1];
    for (let intervalle = 1; intervalle <= 11; intervalle++) {
      if (intervalleUtilise[intervalle]) continue;
      const suivante = (derniere + intervalle) % 12;
      if (hauteurUtilisee[suivante]) continue;
      intervalleUtilise[intervalle] = true;
      hauteurUtilisee[suivante] = true;
      serie.push(suivante);
      explorer();
      serie.pop();
      hauteurUtilisee[suivante] = false;
      intervalleUtilise[intervalle] = false;
      if (trouvees.length >= limite) return;
    }
  };

  explorer();
  return trouvees;
}

/**
 * La série de rang donné, transposée sur la note de départ voulue.
 *
 * LE RANG BOUCLE PLUTÔT QUE DE SORTIR DU CATALOGUE : un réglage qui dépasse rend la première, et
 * non rien. La recherche s'arrête au rang demandé, sans dérouler les 3856 pour en prendre une.
 */
export function serieTousIntervalles(rang: number, depart = 0): number[] {
  const n = Math.max(0, Math.floor(rang));
  const lot = seriesTousIntervalles(n + 1);
  const choisie = lot[Math.min(n, lot.length - 1)] ?? [];
  const d = ((Math.round(depart) % 12) + 12) % 12;
  return choisie.map((x) => (x + d) % 12);
}

/** Une ligne lisible : la série, puis ses intervalles dans l'ordre. */
export function decrireSerie(serie: readonly number[], noms: readonly string[]): string {
  const hauteurs = serie.map((n) => noms[((n % 12) + 12) % 12]).join(" ");
  const ints = intervallesDe(serie).join(" ");
  return `${hauteurs}\n${ints}`;
}
