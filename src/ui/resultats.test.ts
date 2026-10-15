// ui/resultats.test.ts — Le magasin de ce qu'un run a produit.
//
// CE QUI DOIT ÊTRE TENU, et pourquoi chacun compte :
//
//   - LA RÉFÉRENCE EST STABLE quand rien ne change. `useSyncExternalStore` compare les instantanés
//     par identité : rendre un objet neuf à chaque lecture ferait boucler le rendu à l'infini, et
//     ce défaut-là ne se voit pas, il fige l'application.
//   - UN ABONNÉ N'EST PRÉVENU QUE POUR SON NŒUD. C'est toute la raison d'être du magasin : si tous
//     les nœuds étaient prévenus de tout, on aurait recréé, en plus petit, le défaut qu'on corrige.
//   - UN CHAMP À `undefined` EST RETIRÉ. C'est ainsi que le moteur dit qu'un composant ne rend plus
//     rien à montrer ; sans cela, un nœud garderait à l'écran le résultat du run précédent.
//   - REPOSER LE MÊME CORRECTIF NE PRÉVIENT PERSONNE. Un nœud servi par le cache rend deux fois le
//     même tampon, et chaque pose aurait provoqué un rendu inutile.
//   - `garder` LAISSE PASSER CE QUE LE RUN A DÉSIGNÉ DE SES ENTRÉES, ce qui permet d'entendre un
//     montage pendant qu'on le règle.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESULTAT_VIDE, effacerResultats, poserResultat, resultatDe, resultatsPoses, surResultat,
} from "./resultats";

beforeEach(() => effacerResultats());

describe("lire un résultat", () => {
  it("rend le vide pour un nœud dont aucun run n'a rien dit", () => {
    expect(resultatDe("inconnu")).toBe(RESULTAT_VIDE);
    expect(Object.keys(resultatDe("inconnu"))).toEqual([]);
  });

  it("rend LA MÊME référence tant que rien ne change", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    const premier = resultatDe("a");
    expect(resultatDe("a")).toBe(premier);
    poserResultat("a", { audioResultatUrl: "blob:1" });
    expect(resultatDe("a")).toBe(premier);
  });

  it("rend une NOUVELLE référence quand quelque chose change", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    const premier = resultatDe("a");
    poserResultat("a", { audioResultatUrl: "blob:2" });
    expect(resultatDe("a")).not.toBe(premier);
    expect(resultatDe("a").audioResultatUrl).toBe("blob:2");
  });

  it("fusionne les correctifs successifs au lieu de se remplacer", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    poserResultat("a", { audioResultatMessage: "2,0 s" });
    expect(resultatDe("a")).toMatchObject({ audioResultatUrl: "blob:1", audioResultatMessage: "2,0 s" });
  });
});

describe("un champ à `undefined`", () => {
  it("EST RETIRÉ, et c'est ainsi qu'un composant efface ce qu'il montrait", () => {
    poserResultat("a", { audioResultatUrl: "blob:1", _affichage: { x: 1 } });
    poserResultat("a", { _affichage: undefined });
    expect("_affichage" in resultatDe("a")).toBe(false);
    expect(resultatDe("a").audioResultatUrl).toBe("blob:1");
  });

  it("ne prévient pas quand le champ n'était pas là", () => {
    const vu = vi.fn();
    surResultat("a", vu);
    poserResultat("a", { audioResultatUrl: undefined });
    expect(vu).not.toHaveBeenCalled();
    expect(resultatDe("a")).toBe(RESULTAT_VIDE);
  });

  it("vide complètement un nœud quand c'était son dernier champ", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    poserResultat("a", { audioResultatUrl: undefined });
    expect(Object.keys(resultatDe("a"))).toEqual([]);
  });
});

describe("les abonnements", () => {
  it("préviennent l'abonné de leur nœud", () => {
    const vu = vi.fn();
    surResultat("a", vu);
    poserResultat("a", { audioResultatUrl: "blob:1" });
    expect(vu).toHaveBeenCalledTimes(1);
  });

  it("ET PERSONNE D'AUTRE, ce qui est toute la raison d'être du magasin", () => {
    const vuA = vi.fn(); const vuB = vi.fn();
    surResultat("a", vuA);
    surResultat("b", vuB);
    poserResultat("a", { audioResultatUrl: "blob:1" });
    expect(vuA).toHaveBeenCalledTimes(1);
    expect(vuB).not.toHaveBeenCalled();
  });

  it("ne préviennent pas quand le correctif ne change rien", () => {
    poserResultat("a", { audioResultatUrl: "blob:1", tempsExecution: 42 });
    const vu = vi.fn();
    surResultat("a", vu);
    poserResultat("a", { audioResultatUrl: "blob:1", tempsExecution: 42 });
    expect(vu).not.toHaveBeenCalled();
  });

  it("se désabonnent, et le magasin oublie la liste vide", () => {
    const vu = vi.fn();
    const partir = surResultat("a", vu);
    partir();
    poserResultat("a", { audioResultatUrl: "blob:1" });
    expect(vu).not.toHaveBeenCalled();
  });
});

describe("effacer", () => {
  it("remet les nœuds demandés au vide et prévient", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    poserResultat("b", { audioResultatUrl: "blob:2" });
    const vu = vi.fn();
    surResultat("a", vu);
    effacerResultats(["a"]);
    expect(resultatDe("a")).toBe(RESULTAT_VIDE);
    expect(resultatDe("b").audioResultatUrl).toBe("blob:2");
    expect(vu).toHaveBeenCalledTimes(1);
  });

  it("sans liste, efface tout le monde", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    poserResultat("b", { audioResultatUrl: "blob:2" });
    effacerResultats();
    expect(resultatsPoses()).toEqual([]);
  });

  it("ne prévient pas pour un nœud qui n'avait rien", () => {
    const vu = vi.fn();
    surResultat("jamais-pose", vu);
    effacerResultats(["jamais-pose"]);
    expect(vu).not.toHaveBeenCalled();
  });

  it("GARDE CE QUE LE RUN A DÉSIGNÉ, ce qui permet d'écouter un montage en le réglant", () => {
    // Un réglage périme ce que le run a PRODUIT, non ce qu'il a DÉSIGNÉ de ses entrées : les durées
    // des pistes reçues et leurs tampons viennent des composants d'amont, et les effacer ferait
    // disparaître la ligne de temps à chaque geste.
    poserResultat("a", { audioResultatUrl: "blob:1", _designe: { durees: [1, 2] }, tempsExecution: 42 });
    effacerResultats(["a"], new Set(["_designe"]));
    expect(resultatDe("a")).toEqual({ _designe: { durees: [1, 2] } });
  });

  it("et ne prévient pas quand `garder` laisse tout passer", () => {
    poserResultat("a", { _designe: { durees: [1] } });
    const vu = vi.fn();
    surResultat("a", vu);
    effacerResultats(["a"], new Set(["_designe"]));
    expect(vu).not.toHaveBeenCalled();
    expect(resultatDe("a")._designe).toEqual({ durees: [1] });
  });
});

describe("le résultat ne vit plus dans le tableau des nœuds", () => {
  it("l'instantané rendu est gelé : personne ne peut l'écrire de l'extérieur", () => {
    poserResultat("a", { audioResultatUrl: "blob:1" });
    const lu = resultatDe("a") as Record<string, unknown>;
    expect(() => { lu.audioResultatUrl = "blob:pirate"; }).toThrow();
    expect(resultatDe("a").audioResultatUrl).toBe("blob:1");
  });
});
