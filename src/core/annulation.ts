// core/annulation.ts — Ce qu'on lève pour arrêter un composant, et comment on le reconnaît.
//
// ═══ LE DÉFAUT, RELEVÉ PAR DEUX REVUES ═══
//
// Point 7 : « l'annulation n'atteint presque aucun composant ». Mesuré sur le catalogue, et le
// chiffre est pire que l'impression : sur 478 exécuteurs, **DEUX** lisent `signal.aborted` pour
// s'arrêter — « Algèbre musicale » et « Esthétique ». Huit fichiers transmettent le signal à un
// sous-traitant, qui l'honore. Tout le reste continue jusqu'au bout après un arrêt demandé.
//
// ET LE PRIX A MONTÉ depuis que l'ordonnanceur sérialise les runs : en politique « attendre », un
// ▶ patiente la fin de celui qui tourne, et une séparation dure des minutes. La politique
// « passer-devant » existe, mais elle ne peut rien tant que les composants ignorent l'arrêt.
//
// ═══ LE LEVIER : `onProgress`, QUE 86 APPELS TRAVERSENT DÉJÀ ═══
//
// Un composant qui travaille longtemps dit où il en est. Le moteur lui donne ce canal ; il suffit
// qu'il LÈVE une fois le run annulé pour que l'exécuteur s'arrête là où il en est. Mesuré :
// **74 exécuteurs** appellent `onProgress` sans consulter l'arrêt, et deviennent interruptibles
// d'un seul geste.
//
// CE QUE LA MESURE A ÉCARTÉ, et c'était la crainte qui retenait ce changement. Sur les 82 appels :
//
//   72 sont hors de tout `try` — l'exception remonte au moteur, qui la reconnaît déjà ;
//    3 sont dans un `try` qui relance ce qui n'est pas son erreur propre ;
//    7 sont dans un `try` qui rendrait une erreur de nœud, dans quatre fichiers ;
//    0 sont AVALÉS EN SILENCE.
//
// Aucun composant ne poursuivrait donc son travail sans rien dire. Les sept sont retouchés pour
// relancer l'annulation, sur le modèle qu'`esthetique.ts` employait déjà.
//
// ═══ POURQUOI UNE MARQUE ET NON `instanceof` ═══
//
// Deux copies d'un module donnent deux classes, et `instanceof` ment alors sans bruit — un défaut
// d'autant plus pénible qu'il ne se montre qu'au paquetage. La marque voyage avec l'objet.

const MARQUE = "attic:annulation";

/** Levée par `onProgress` quand le run a été annulé. */
export class ErreurAnnulation extends Error {
  readonly attic = MARQUE;

  constructor(message = "exécution annulée") {
    super(message);
    this.name = "ErreurAnnulation";
  }
}

/**
 * Cette exception est-elle une annulation ?
 *
 * À CONSULTER AVANT DE CHANGER UNE EXCEPTION EN ERREUR DE NŒUD : une annulation n'est pas un
 * échec du composant, et l'afficher comme tel ferait chercher une panne là où il n'y en a pas.
 */
export const estAnnulation = (e: unknown): boolean =>
  !!e && typeof e === "object" && (e as { attic?: unknown }).attic === MARQUE;
