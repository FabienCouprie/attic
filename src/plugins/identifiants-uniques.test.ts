// src/plugins/identifiants-uniques.test.ts — Deux composants ne portent pas le même identifiant.
//
// ÉCRIT D'UNE COLLISION. Un composant neuf a été déclaré sous l'identifiant `separer-voix`, déjà
// porté par la séparation des voix d'une séquence MIDI. Le registre a accepté les deux, et rien ne
// l'a dit : l'échec est sorti d'un tout autre endroit, le document généré sur le catalogue, sous la
// forme « separer-voix: expected 2 to be 1 ». Un message qui ne nomme ni la cause ni le remède.
//
// CE QU'UNE COLLISION FAIT VRAIMENT. L'identifiant sert à retrouver un composant : à l'exécution
// d'un graphe enregistré, au téléchargement d'un modèle par `annoncerModele`, dans la palette. Deux
// fiches sous un même identifiant, et c'est la première trouvée qui répond à tout, l'autre étant
// posable sur le canevas mais jamais résolue. Un graphe enregistré sur la seconde change donc de
// composant en silence.
//
// LE NOM AFFICHÉ COMPTE AUSSI, et c'est le second cas. « Séparer la voix » et « Séparer les voix »
// se distinguent par une lettre, l'un travaillant un audio et l'autre une séquence : deux noms
// qu'on ne peut pas départager dans une liste ne valent guère mieux qu'un identifiant partagé.
//
// MÊME FAMILLE QUE LE GARDE DES RÉGLAGES EN DOUBLE, dans `guidage-rendu.test.ts` : le registre ne
// porte pas deux choses sous un même nom.
import { describe, expect, it } from "vitest";
import { toutesLesFiches } from "./index";

/** Les valeurs qui apparaissent plus d'une fois, avec leur nombre. */
function doublons(valeurs: string[]): string[] {
  const comptes = new Map<string, number>();
  for (const v of valeurs) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  return [...comptes.entries()].filter(([, n]) => n > 1).map(([v, n]) => `${v} (${n} fois)`);
}

describe("le registre des composants", () => {
  it("en porte assez pour que ce garde regarde quelque chose", () => {
    expect(toutesLesFiches.length).toBeGreaterThan(400);
  });

  it("AUCUN IDENTIFIANT N'EST PORTÉ DEUX FOIS", () => {
    expect(doublons(toutesLesFiches.map((f) => f.id)), [
      "Ces identifiants sont portés par deux composants. L'identifiant sert à RETROUVER un",
      "composant : à l'ouverture d'un graphe enregistré, au téléchargement de son modèle, dans la",
      "palette. C'est la première fiche trouvée qui répondra à tout, et la seconde sera posable",
      "sans jamais être résolue, en silence.",
    ].join("\n")).toEqual([]);
  });

  it("AUCUN NOM AFFICHÉ N'EST PORTÉ DEUX FOIS, dans l'une ou l'autre langue", () => {
    const fautifs = [
      ...doublons(toutesLesFiches.map((f) => f.nom)).map((d) => `français : ${d}`),
      ...doublons(toutesLesFiches.map((f) => (f as { nomEn?: string }).nomEn ?? "").filter(Boolean))
        .map((d) => `anglais : ${d}`),
    ];
    expect(fautifs, [
      "Ces noms sont affichés par deux composants. Un nom sert à CHOISIR dans la palette et à se",
      "relire dans un graphe ; deux composants qui le partagent ne peuvent plus être départagés",
      "qu'en lisant leur résumé.",
    ].join("\n")).toEqual([]);
  });
});
