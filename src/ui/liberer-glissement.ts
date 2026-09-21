// ui/liberer-glissement.ts — Décoller un nœud resté accroché au curseur.
//
// LE DÉFAUT. Rarement, après un clic sur un composant, le nœud reste attaché au curseur : le
// glissement ne se termine jamais. Cela arrive quand le bouton de la souris est relâché SANS que la
// fenêtre reçoive l'événement — relâchement hors de la fenêtre, passage sur un second écran,
// Alt-Tab, menu système, fenêtre qui perd le focus pendant le geste. Le navigateur ne délivre alors
// aucun `mouseup`, et rien ne vient clore le geste.
//
// POURQUOI LE FILET PRÉCÉDENT NE POUVAIT PAS MARCHER. Il existait déjà, et il envoyait un
// `pointerup` puis un `pointercancel`. Or React Flow glisse par `d3-drag`, dont la source est sans
// ambiguïté :
//
//     select(event.view).on("mousemove.drag", mousemoved, …).on("mouseup.drag", mouseupped, …)
//
// le geste ne se termine que sur **mouseup** (ou `touchend` au doigt) : `pointerup` ne l'intéresse
// pas. Le filet envoyait donc un événement que personne n'écoutait. Son second défaut était de
// s'armer sur un `pointerdown` écouté en phase de BULLE : une quinzaine de vues d'Attic arrêtent la
// propagation de cet événement pour ne pas déclencher le glissement du nœud, si bien que le filet
// restait désarmé précisément sur les nœuds les plus riches.
//
// DEUX DÉTAILS QUI DÉCIDENT DE TOUT :
//
//  1. `mouseupped` commence par `select(event.view).on("mousemove.drag mouseup.drag", null)` — il se
//     sert de `event.view` pour retirer ses propres écouteurs. Sans `view`, `select(null)` appelle
//     `removeEventListener` sur `null` et JETTE : la fin du geste n'a jamais lieu, et le nœud repart
//     au mouvement suivant. Le `view` n'est pas décoratif, c'est la pièce maîtresse.
//  2. d3 écoute sur la FENÊTRE en phase de capture. Un événement envoyé sur le canevas y remonte, et
//     le `stopPropagation` des vues internes n'y change rien — ce qui est heureux, sans quoi aucun
//     glissement ne se terminerait jamais sur ces nœuds.
//
// On envoie tout de même `pointerup` et `pointercancel` APRÈS le `mouseup` : les vues qui dessinent
// à la souris — forme d'onde, sélecteur multi-zones, clavier — écoutent les événements pointeur, et
// un geste inachevé chez elles laisserait une sélection en cours.

export interface PositionPointeur {
  clientX: number;
  clientY: number;
  pointerId?: number;
  pointerType?: string;
}

/** La fenêtre du document, celle que d3 attend dans `event.view`. */
const fenetreCourante = (): Window | null =>
  typeof document !== "undefined" ? document.defaultView : null;

/**
 * Un `mouseup` portant la fenêtre, ou à défaut un `mouseup` tout court.
 *
 * Le repli existe pour une raison précise et vérifiée : certains environnements refusent la fenêtre
 * au contrôle de type du constructeur — jsdom, sous lequel tournent les tests, répond « member view
 * is not of type Window » même pour son propre `document.defaultView`. Mieux vaut alors un événement
 * sans `view` qu'une exception : le filet doit dégrader, pas tomber.
 */
function construireMouseUp(commun: MouseEventInit, vue: Window | null): MouseEvent {
  if (vue) {
    try {
      return new MouseEvent("mouseup", { ...commun, view: vue });
    } catch {
      // Environnement qui refuse la fenêtre : on continue sans elle.
    }
  }
  return new MouseEvent("mouseup", commun);
}

/**
 * Les événements à envoyer pour clore proprement un geste, dans l'ordre où ils doivent partir.
 *
 * Rendus plutôt qu'envoyés, pour que les tests puissent les examiner un par un.
 */
export function evenementsDeLiberation(
  p: PositionPointeur, vue: Window | null = fenetreCourante(),
): Event[] {
  const commun: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 0,
    clientX: p.clientX,
    clientY: p.clientY,
  };
  const evenements: Event[] = [construireMouseUp(commun, vue)];
  // `PointerEvent` n'existe pas partout : on ne l'exige pas.
  if (typeof PointerEvent === "function") {
    const pointeur = {
      ...commun,
      pointerId: p.pointerId ?? 1,
      pointerType: p.pointerType ?? "mouse",
      isPrimary: true,
    };
    try {
      evenements.push(new PointerEvent("pointerup", pointeur));
      evenements.push(new PointerEvent("pointercancel", pointeur));
    } catch {
      // Idem : les événements pointeur sont un supplément, pas le cœur du filet.
    }
  }
  return evenements;
}

/** Envoie ces événements sur la cible donnée — le canevas, ou la fenêtre à défaut. */
export function libererGlissement(cible: EventTarget | null, p: PositionPointeur): void {
  const ou = cible ?? fenetreCourante();
  if (!ou) return;
  for (const e of evenementsDeLiberation(p)) ou.dispatchEvent(e);
}

/**
 * Faut-il libérer ? Vrai quand on croyait le bouton enfoncé et qu'un mouvement arrive sans bouton.
 *
 * C'est la seule façon de détecter un relâchement qu'on n'a pas vu : le navigateur ne dit jamais
 * « le bouton a été relâché ailleurs », mais il continue d'annoncer l'état des boutons à chaque
 * mouvement, et cet état passe à zéro.
 */
export const relachementManque = (croyaitEnfonce: boolean, boutons: number): boolean =>
  croyaitEnfonce && boutons === 0;
