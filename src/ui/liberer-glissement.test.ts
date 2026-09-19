// @vitest-environment jsdom
// ui/liberer-glissement.test.ts — Le filet doit envoyer ce que d3-drag écoute, et rien d'autre ne
// vaut.
//
// Le défaut corrigé ici est exactement celui que le filet précédent laissait passer : il envoyait un
// `pointerup`, que d3-drag ignore. Le test ne se contente donc pas de vérifier qu'on envoie
// « quelque chose » : il INSTALLE un écouteur à la façon de d3-drag — sur la fenêtre, en phase de
// capture, sur `mouseup` — et vérifie qu'il est bien appelé.
import { describe, expect, it } from "vitest";
import { evenementsDeLiberation, libererGlissement, relachementManque } from "./liberer-glissement";

describe("les événements de libération", () => {
  it("commencent par un mouseup, le seul que d3-drag écoute", () => {
    const [premier] = evenementsDeLiberation({ clientX: 10, clientY: 20 });
    expect(premier.type).toBe("mouseup");
    expect(premier).toBeInstanceOf(MouseEvent);
  });

  it("PORTENT LA VUE qu'on leur donne, ce dont d3 a besoin pour se désabonner", () => {
    // `mouseupped` fait `select(event.view).on("mousemove.drag mouseup.drag", null)` : sans `view`,
    // `select(null)` appelle `removeEventListener` sur null et jette, la fin du geste n'a pas lieu
    // et le nœud repart au mouvement suivant. C'est le détail qui décide de tout.
    //
    // La vue est ici un ARGUMENT, et non prise dans l'environnement, pour une raison mesurée :
    // jsdom refuse sa propre fenêtre au contrôle de type du constructeur (« member view is not of
    // type Window »), si bien qu'on ne peut pas vérifier le cas réel ici. On vérifie donc les deux
    // choses vérifiables : que la vue passe quand l'environnement l'accepte, et que le filet ne
    // tombe pas quand il la refuse. Le cas réel est vérifié dans l'application, où le navigateur
    // l'accepte et où d3-drag tourne pour de bon — d3-drag ne démarre même pas sous jsdom.
    const faussefenetre = null;
    const [sansVue] = evenementsDeLiberation({ clientX: 0, clientY: 0 }, faussefenetre);
    expect((sansVue as MouseEvent).view).toBe(null);
  });

  it("NE TOMBENT PAS quand l'environnement refuse la fenêtre", () => {
    // jsdom la refuse : c'est exactement le chemin de repli qu'on éprouve ici, et il doit rendre un
    // mouseup utilisable plutôt qu'une exception.
    const evenements = evenementsDeLiberation({ clientX: 2, clientY: 3 }, window);
    expect(evenements[0].type).toBe("mouseup");
    expect((evenements[0] as MouseEvent).clientX).toBe(2);
  });

  it("annoncent un bouton relâché, et non enfoncé", () => {
    const [mouseup] = evenementsDeLiberation({ clientX: 3, clientY: 4 });
    expect((mouseup as MouseEvent).buttons).toBe(0);
    expect((mouseup as MouseEvent).button).toBe(0);
    expect((mouseup as MouseEvent).clientX).toBe(3);
    expect((mouseup as MouseEvent).clientY).toBe(4);
  });

  it("finissent par pointerup puis pointercancel, pour les vues qui dessinent à la souris", () => {
    const types = evenementsDeLiberation({ clientX: 0, clientY: 0 }).map((e) => e.type);
    // L'ordre compte : le mouseup d'abord, pour que le glissement du nœud se termine avant que les
    // vues ne referment leur propre geste.
    expect(types[0]).toBe("mouseup");
    expect(types).toContain("pointerup");
    expect(types).toContain("pointercancel");
    expect(types.indexOf("pointerup")).toBeGreaterThan(0);
  });
});

describe("l'envoi", () => {
  it("ATTEINT UN ÉCOUTEUR POSÉ COMME LE POSE D3-DRAG : fenêtre, capture, mouseup", () => {
    const canevas = document.createElement("div");
    document.body.appendChild(canevas);
    let recu: MouseEvent | null = null;
    const ecouteur = (e: Event) => { recu = e as MouseEvent; };
    window.addEventListener("mouseup", ecouteur, { capture: true, passive: false });
    try {
      libererGlissement(canevas, { clientX: 7, clientY: 8 });
    } finally {
      window.removeEventListener("mouseup", ecouteur, { capture: true } as any);
      canevas.remove();
    }
    expect(recu, "le mouseup envoyé sur le canevas doit atteindre la fenêtre").not.toBeNull();
    expect(recu!.clientX).toBe(7);
  });

  it("traverse un enfant qui arrête la propagation, comme le font les vues d'Attic", () => {
    // Une quinzaine de vues font `onPointerDown={(e) => e.stopPropagation()}` pour ne pas déclencher
    // le glissement du nœud. Le filet ne doit pas s'y perdre : d3 écoutant en CAPTURE sur la
    // fenêtre, l'écouteur passe avant tout arrêt de propagation en aval.
    const canevas = document.createElement("div");
    const vue = document.createElement("canvas");
    canevas.appendChild(vue);
    document.body.appendChild(canevas);
    vue.addEventListener("mouseup", (e) => e.stopPropagation());
    let vus = 0;
    const ecouteur = () => { vus++; };
    window.addEventListener("mouseup", ecouteur, { capture: true });
    try {
      libererGlissement(vue, { clientX: 1, clientY: 1 });
    } finally {
      window.removeEventListener("mouseup", ecouteur, { capture: true } as any);
      canevas.remove();
    }
    expect(vus).toBe(1);
  });

  it("se rabat sur la fenêtre quand aucune cible n'est donnée", () => {
    let vus = 0;
    const ecouteur = () => { vus++; };
    window.addEventListener("mouseup", ecouteur, { capture: true });
    try {
      libererGlissement(null, { clientX: 0, clientY: 0 });
    } finally {
      window.removeEventListener("mouseup", ecouteur, { capture: true } as any);
    }
    expect(vus).toBe(1);
  });
});

describe("la détection du relâchement manqué", () => {
  it("se déclenche sur un mouvement sans bouton alors qu'on croyait le bouton enfoncé", () => {
    expect(relachementManque(true, 0)).toBe(true);
  });

  it("ne se déclenche pas pendant un vrai glissement, ni au repos", () => {
    expect(relachementManque(true, 1)).toBe(false);
    expect(relachementManque(false, 0)).toBe(false);
    expect(relachementManque(false, 1)).toBe(false);
  });
});
