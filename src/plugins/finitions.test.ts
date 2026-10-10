// plugins/finitions.test.ts — Les quatre fiches de `finitions.ts`, que nul test ne faisait tourner.
//
// POURQUOI CE FICHIER. L'en-tête de `finitions.ts` dit lui-même ce qu'il est : « la logique est dans
// `audio/reverbes-etendues.ts`, `audio/silences.ts` et `audio/effets-montage.ts`, testées ; ce
// fichier n'est que la prise ». La prise, justement, n'était tenue par rien : des quatre fiches,
// une seule était nommée quelque part, et c'était pour l'EXCLURE d'un contrôle sur le traitement
// par trames. Aucun exécuteur ne tournait.
//
// ET LES NOTICES DE CE FICHIER FONT DES PROMESSES CHIFFRÉES, ce qui est exactement ce qu'un test
// peut mettre en défaut.
//
//   LA RÉVERBÉRATION HACHÉE. « La porte s'ouvre à l'attaque, tient un temps fixe, puis coupe net.
//   Tant que le sec repasse au-dessus du seuil, le compte à rebours repart : une roulade tient donc
//   la porte ouverte, et le couperet tombe après la dernière frappe. » Mesuré, le dernier son
//   s'éteint toujours à la dernière frappe plus le maintien, à quelques millisecondes près : 0,353 s
//   pour une frappe à 0,1 s, 1,153 s pour une roulade finissant à 0,9 s.
//
//   LE SHIMMER. « La réponse de réverbération est normalisée en énergie. Sans cela, chaque
//   convolution ajouterait de l'énergie : la quatrième génération sortirait soixante-quatorze
//   décibels au-dessus de la première, et le réglage de rebouclage ne commanderait rien. Le
//   rebouclage décide seul de l'extinction. » Le nœud affiche le niveau de chaque génération, et
//   c'est donc vérifiable : elles décroissent, et à rebouclage nul il ne reste que la première.
//
//   LE ROGNAGE DES SILENCES. « Ce qui est mesuré est l'enveloppe, pas l'échantillon. Une sinusoïde
//   passe par zéro deux fois par période : au seul examen de l'échantillon, tout son contient des
//   silences de quelques dixièmes de milliseconde, et le mode "Partout" découperait un la 440 en
//   HUIT CENT QUATRE-VINGTS MORCEAUX PAR SECONDE. » Une phrase qui se vérifie en une ligne.
//
//   LA FUSION STÉRÉO. « La durée est celle du plus long, et le plus court est complété par du
//   silence plutôt que bouclé ou étiré : deux prises de longueurs différentes ne sont pas la même
//   prise, et faire coïncider leurs fins inventerait un alignement que personne n'a demandé. »
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { fiches } from "./finitions";
import { luParLExecuteur } from "./effets-aides";

const SR = 22050;

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    onProgress: () => {},
  } as never;
}

const lancer = (id: string, entrees: unknown[], reglages: Record<string, number | string> = {}) =>
  fiche(id).executer(contexte(entrees, reglages));

/** Des frappes sèches aux instants demandés : l'effet suppose des attaques nettes. */
function frappes(instants: number[], secondes = 3, canaux = 1): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let graine = 24680;
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (const t0 of instants) {
      const depart = Math.round(t0 * SR);
      for (let i = 0; i < Math.min(n - depart, Math.round(0.08 * SR)); i++) {
        graine = (graine * 1103515245 + 12345) % 2147483648;
        d[depart + i] += (graine / 2147483648 * 2 - 1) * 0.8 * Math.exp(-i / (0.01 * SR));
      }
    }
  }
  return b;
}

function sinus(f: number, secondes: number, canaux = 1, amplitude = 0.5): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = amplitude * Math.sin(2 * Math.PI * f * i / SR);
  }
  return b;
}

/** Du son entre deux plages de SOUFFLE, et non de silence numérique : c'est ce qui éprouve un seuil. */
function avecSouffle(niveauDb: number, canaux = 1): AudioBuffer {
  const n = Math.round(3 * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  const souffle = 10 ** (niveauDb / 20);
  let graine = 31415;
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      d[i] = (graine / 2147483648 * 2 - 1) * souffle;
      if (i / SR > 1 && i / SR < 2) d[i] += 0.5 * Math.sin(2 * Math.PI * 440 * i / SR);
    }
  }
  return b;
}

/** L'instant du dernier échantillon audible : c'est là que le couperet est tombé. */
function dernierSon(b: AudioBuffer, seuil = 1e-4): number {
  const d = b.getChannelData(0);
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) > seuil) return i / b.sampleRate;
  return 0;
}

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const x = a.getChannelData(c), y = b.getChannelData(c);
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i] - y[i]));
  }
  return m;
}

const pic = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
};

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

const QUATRE = ["reverbe-hachee", "shimmer", "rogner-silences", "fusion-stereo"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("réverbération hachée : un couperet, non une extinction", () => {
  it("LE COUPERET TOMBE APRÈS LA DERNIÈRE FRAPPE, et une roulade tient la porte ouverte", async () => {
    // C'EST LA PROMESSE CENTRALE DE CE NŒUD, et elle est mesurable : « tant que le sec repasse
    // au-dessus du seuil, le compte à rebours repart ». Le dernier son doit donc s'éteindre à la
    // dernière frappe plus le maintien, où que cette frappe se trouve — et c'est ce qui distingue
    // cette porte d'une porte ordinaire, qui écoute ce qu'elle traite et se ferme donc tard.
    const maintien = 0.2;
    for (const instants of [[0.1], [0.1, 0.5], [0.1, 0.3, 0.5, 0.7, 0.9], [0.1, 2.0]]) {
      const res = await lancer("reverbe-hachee", [frappes(instants)], { "Maintien": maintien });
      const fin = dernierSon(res.valeurs[0] as AudioBuffer);
      const derniereFrappe = instants[instants.length - 1];
      expect(fin, `frappes ${instants.join(", ")} : dernier son à ${fin.toFixed(3)} s`)
        .toBeGreaterThan(derniereFrappe + maintien * 0.5);
      expect(fin, "le couperet tombe bien après la dernière frappe, et pas plus tard")
        .toBeLessThan(derniereFrappe + maintien + 0.15);
    }
  });

  it("« MAINTIEN » FIXE LA LONGUEUR DE LA QUEUE ENTENDUE, comme sa documentation le dit", async () => {
    // « C'est lui qui fixe la longueur de la queue entendue : deux dixièmes de seconde donnent la
    // caisse claire de 1985. » Mesuré : le dernier son suit le maintien pas à pas.
    const fins: number[] = [];
    for (const maintien of [0.02, 0.2, 0.6]) {
      const res = await lancer("reverbe-hachee", [frappes([0.1])], { "Maintien": maintien });
      fins.push(dernierSon(res.valeurs[0] as AudioBuffer));
    }
    expect(fins[0]).toBeLessThan(fins[1]);
    expect(fins[1]).toBeLessThan(fins[2]);
    expect(fins[0], "un maintien très court doit couper tout de suite").toBeLessThan(0.3);
  });

  it("« DÉCROISSANCE » CHANGE LA TRAÎNÉE LIBRE, NON LA QUEUE ENTENDUE", async () => {
    // « Elle décide de la densité et de la couleur de ce qu'on entend pendant le maintien, non de
    // la durée finale ; c'est le maintien qui la fixe. » Deux affirmations distinctes, et le message
    // porte les deux traînées : la libre grandit avec la décroissance, l'autre ne bouge pas.
    const courte = chiffres((await lancer("reverbe-hachee", [frappes([0.1])], { "Décroissance": 0.5 })).message!);
    const longue = chiffres((await lancer("reverbe-hachee", [frappes([0.1])], { "Décroissance": 4 })).message!);
    expect(longue[0], "la traînée libre doit suivre la décroissance").toBeGreaterThan(courte[0]);
    expect(longue[1], "la queue entendue ne doit pas bouger").toBeCloseTo(courte[1], 1);
  });

  it("le message annonce les deux traînées, et la libre est la plus longue", async () => {
    const res = await lancer("reverbe-hachee", [frappes([0.1])]);
    const [libre, hachee] = chiffres(res.message!);
    expect(libre, `${res.message}`).toBeGreaterThan(hachee);
    expect(hachee, "hacher doit raccourcir, pas allonger").toBeGreaterThan(0);
  });

  it("LA SORTIE EST PLUS LONGUE QUE L'ENTRÉE : la porte se ferme après la dernière frappe", async () => {
    const src = frappes([0.1], 2);
    const out = (await lancer("reverbe-hachee", [src])).valeurs[0] as AudioBuffer;
    expect(out.length, "une queue coupée doit tout de même tenir dans le tampon")
      .toBeGreaterThan(src.length);
    expect(out.sampleRate).toBe(src.sampleRate);
  });

  it("À MIX ZÉRO, LA SORTIE EST L'ENTRÉE — au bit près", async () => {
    const src = frappes([0.1], 2);
    const out = (await lancer("reverbe-hachee", [src], { "Mix": 0 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(src, out), "« À 0 %, la sortie est l'entrée »").toBe(0);
  });

  it("la même graine rejoue la même pièce, et deux graines ne la rejouent pas", async () => {
    const src = frappes([0.1], 1);
    const a = (await lancer("reverbe-hachee", [src], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("reverbe-hachee", [src], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const c = (await lancer("reverbe-hachee", [src], { "Graine": 99 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b)).toBe(0);
    expect(ecartMax(a, c)).toBeGreaterThan(0.01);
  });

  it("il rend autant de canaux qu'il en reçoit, chacun sonne, ET ILS DIFFÈRENT", async () => {
    // TROIS CONTRÔLES, ET LE PLANTAGE A RÉCLAMÉ LES DEUX DERNIERS. Compter les canaux ne prouve
    // rien : leur nombre vient de l'entrée, de sorte qu'un exécuteur ne traitant que le premier
    // rendrait tout de même un tampon stéréo, le second silencieux. Et vérifier qu'ils sonnent ne
    // suffit pas non plus : recopier le premier dans tous les autres les fait sonner tous, et la
    // stéréo s'effondre en mono sans que rien ne le dise. Il faut donc qu'ils DIFFÈRENT, ce que
    // l'entrée garantit, ses deux canaux portant des tirages distincts.
    for (const canaux of [1, 2]) {
      const out = (await lancer("reverbe-hachee", [frappes([0.1], 1, canaux)])).valeurs[0] as AudioBuffer;
      expect(out.numberOfChannels, `${canaux} canal/canaux`).toBe(canaux);
      for (let c = 0; c < canaux; c++) {
        let crete = 0;
        const d = out.getChannelData(c);
        for (let i = 0; i < d.length; i++) crete = Math.max(crete, Math.abs(d[i]));
        expect(crete, `le canal ${c} est muet`).toBeGreaterThan(0.01);
      }
    }
    const stereo = (await lancer("reverbe-hachee", [frappes([0.1], 1, 2)])).valeurs[0] as AudioBuffer;
    const g = stereo.getChannelData(0), d = stereo.getChannelData(1);
    let ecart = 0;
    for (let i = 0; i < g.length; i++) ecart = Math.max(ecart, Math.abs(g[i] - d[i]));
    expect(ecart, "les deux canaux sont identiques : la stéréo s'est effondrée en mono")
      .toBeGreaterThan(0.01);
  });
});

describe("shimmer : une boucle déroulée en générations", () => {
  it("LES GÉNÉRATIONS DÉCROISSENT, et le message les montre une à une", async () => {
    // « Le nœud affiche le niveau de chacune pour qu'on le voie. » C'est ce niveau qui dit si la
    // normalisation en énergie tient : sans elle, « la quatrième génération sortirait
    // soixante-quatorze décibels au-dessus de la première ».
    const res = await lancer("shimmer", [sinus(220, 1)]);
    const niveaux = chiffres(res.message!);
    expect(niveaux, "quatre générations par défaut").toHaveLength(4);
    expect(niveaux[0], "la première est la référence").toBe(0);
    expect(niveaux[3], "la dernière doit être nettement sous la première").toBeLessThan(-5);
    for (let i = 1; i < niveaux.length; i++) {
      expect(niveaux[i], `la génération ${i + 1} ne décroît pas`).toBeLessThanOrEqual(niveaux[i - 1]);
    }
  });

  it("« GÉNÉRATIONS » DÉCIDE COMBIEN DE TOURS SONT DÉROULÉS, et le message en compte autant", async () => {
    for (const n of [1, 2, 6]) {
      const res = await lancer("shimmer", [sinus(220, 1)], { "Générations": n });
      expect(chiffres(res.message!), `${n} génération(s)`).toHaveLength(n);
    }
  });

  it("REBOUCLAGE À ZÉRO : il ne reste que la première génération", async () => {
    // « Le rebouclage décide seul de l'extinction. » À zéro, rien ne repart dans la boucle : les
    // générations suivantes doivent être au plancher, et non simplement plus basses.
    const res = await lancer("shimmer", [sinus(220, 1)], { "Rebouclage": 0 });
    const niveaux = chiffres(res.message!);
    expect(niveaux[0]).toBe(0);
    for (let i = 1; i < niveaux.length; i++) {
      expect(niveaux[i], `la génération ${i + 1} sonne encore malgré un rebouclage nul`)
        .toBeLessThan(-100);
    }
  });

  it("et un rebouclage fort les tient bien plus haut", async () => {
    const faible = chiffres((await lancer("shimmer", [sinus(220, 1)], { "Rebouclage": 20 })).message!);
    const fort = chiffres((await lancer("shimmer", [sinus(220, 1)], { "Rebouclage": 90 })).message!);
    expect(fort[3], "le rebouclage ne commande pas l'extinction").toBeGreaterThan(faible[3]);
  });

  it("À MIX ZÉRO, LA SORTIE EST L'ENTRÉE — au bit près", async () => {
    const src = sinus(220, 1);
    const out = (await lancer("shimmer", [src], { "Mix": 0 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(src, out), "« À 0 %, la sortie est l'entrée »").toBe(0);
  });

  it("LUI AUSSI GARDE SES DEUX CANAUX DISTINCTS", async () => {
    // Même garde que sur la réverbération hachée, et pour la même raison : les deux fiches
    // écrivent leurs voies dans une boucle, et un indice figé y collapserait la stéréo en silence.
    const src = frappes([0.1], 1, 2);
    const out = (await lancer("shimmer", [src])).valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    const g = out.getChannelData(0), d = out.getChannelData(1);
    let ecart = 0, creteG = 0, creteD = 0;
    for (let i = 0; i < g.length; i++) {
      ecart = Math.max(ecart, Math.abs(g[i] - d[i]));
      creteG = Math.max(creteG, Math.abs(g[i]));
      creteD = Math.max(creteD, Math.abs(d[i]));
    }
    expect(creteG, "le canal gauche est muet").toBeGreaterThan(0.01);
    expect(creteD, "le canal droit est muet").toBeGreaterThan(0.01);
    expect(ecart, "les deux canaux sont identiques : la stéréo s'est effondrée en mono")
      .toBeGreaterThan(0.01);
  });

  it("LA DURÉE NE CHANGE PAS, contrairement à la réverbération hachée", async () => {
    // Les deux réverbérations de ce fichier ne traitent pas la durée de la même façon, et c'est
    // voulu : la hachée ajoute sa queue au tampon, le shimmer déroule ses générations à l'intérieur.
    const src = sinus(220, 1);
    const out = (await lancer("shimmer", [src])).valeurs[0] as AudioBuffer;
    expect(out.length).toBe(src.length);
    expect(out.numberOfChannels).toBe(src.numberOfChannels);
  });

  it("« Transposition » change le son, et la graine rejoue la même pièce", async () => {
    const src = sinus(220, 1);
    const octave = (await lancer("shimmer", [src], { "Transposition": 12 })).valeurs[0] as AudioBuffer;
    const quinte = (await lancer("shimmer", [src], { "Transposition": 7 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(octave, quinte), "« Transposition » est inerte").toBeGreaterThan(0.01);
    const a = (await lancer("shimmer", [src], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("shimmer", [src], { "Graine": 7 })).valeurs[0] as AudioBuffer;
    const c = (await lancer("shimmer", [src], { "Graine": 99 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b)).toBe(0);
    expect(ecartMax(a, c)).toBeGreaterThan(0.01);
  });
});

describe("rogner les silences : l'enveloppe, et non l'échantillon", () => {
  it("UN LA 440 CONTINU N'EST PAS DÉCOUPÉ EN HUIT CENT QUATRE-VINGTS MORCEAUX", async () => {
    // LA PROMESSE LA PLUS PRÉCISE DE CE FICHIER, et elle vient de sa notice : « une sinusoïde passe
    // par zéro deux fois par période : au seul examen de l'échantillon, tout son contient des
    // silences de quelques dixièmes de milliseconde, et le mode "Partout" découperait un la 440 en
    // huit cent quatre-vingts morceaux par seconde ». Un nœud qui mesurerait l'échantillon plutôt
    // que l'enveloppe tomberait ici, et nulle part ailleurs.
    const res = await lancer("rogner-silences", [sinus(440, 2)], { "Portée": "partout" });
    const [avant, apres, morceaux] = chiffres(res.message!);
    expect(morceaux, `${res.message}`).toBe(1);
    expect(apres, "un son continu ne doit rien perdre").toBeCloseTo(avant, 1);
  });

  it("LE SEUIL SE COMPTE EN DÉCIBELS : un souffle à −50 dB est gardé à −60 et retiré à −40", async () => {
    // « Un seuil linéaire à 0,01 paraît petit et vaut quarante décibels sous la pleine échelle,
    // c'est-à-dire un niveau où une respiration, une queue de réverbération ou un souffle de
    // préampli vivent encore. En décibels, on sait ce qu'on coupe. » On le vérifie donc sur du
    // SOUFFLE, et non sur du silence numérique, qui ne distingue aucun seuil de l'autre.
    const souffle = avecSouffle(-50);
    const garde = await lancer("rogner-silences", [souffle], { "Seuil": -60 });
    const retire = await lancer("rogner-silences", [souffle], { "Seuil": -40 });
    expect(chiffres(garde.message!)[1], "à −60 dB, le souffle est au-dessus du seuil et reste")
      .toBeCloseTo(3, 1);
    expect(chiffres(retire.message!)[1], "à −40 dB, il passe dessous et s'en va")
      .toBeLessThan(1.5);
  });

  it("« MARGE » REND DU TEMPS DE PART ET D'AUTRE, pour que l'attaque ne soit pas tronquée", async () => {
    const src = avecSouffle(-50);
    const duree = async (marge: number) =>
      chiffres((await lancer("rogner-silences", [src], { "Seuil": -40, "Marge": marge })).message!)[1];
    const sans = await duree(0);
    const avec = await duree(200);
    expect(avec, "la marge ne rend rien").toBeGreaterThan(sans);
    expect(avec - sans, "deux cents millisecondes de part et d'autre font quatre dixièmes")
      .toBeCloseTo(0.4, 1);
  });

  it("« BORDS » NE TOUCHE PAS AU MILIEU, « PARTOUT » LE FAIT", async () => {
    // « Aux bords, on ne touche pas à ce qui se passe au milieu : un silence entre deux phrases fait
    // partie du jeu, et le retirer change la musique. » Une pièce qui commence et finit sur du son,
    // avec un trou au milieu, n'est donc pas touchée aux bords.
    const n = Math.round(3 * SR);
    const avecTrou = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
    const d = avecTrou.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = (t < 0.8 || t > 2.2) ? 0.5 * Math.sin(2 * Math.PI * 440 * i / SR) : 0;
    }
    const bords = await lancer("rogner-silences", [avecTrou], { "Portée": "bords" });
    expect(chiffres(bords.message!)[1], "les bords ne doivent pas toucher au milieu").toBeCloseTo(3, 1);
    expect(chiffres(bords.message!)[2], "un seul morceau gardé").toBe(1);

    const partout = await lancer("rogner-silences", [avecTrou], { "Portée": "partout" });
    expect(chiffres(partout.message!)[1], "partout doit retirer le trou").toBeLessThan(2.5);
    expect(chiffres(partout.message!)[2], "deux morceaux de part et d'autre du trou").toBe(2);
  });

  it("LES DEUX CANAUX SONT ROGNÉS AUX MÊMES ENDROITS, faute de quoi l'image se décalerait", async () => {
    // Le plan est calculé sur la SOMME des canaux : une stéréo dont un côté commence avant l'autre
    // doit être rognée du début du premier à la fin du dernier, et les deux canaux gardent leur
    // longueur commune. Rogner chaque canal selon son propre silence décalerait l'image.
    const st = new AudioBuffer({ numberOfChannels: 2, length: Math.round(2 * SR), sampleRate: SR });
    const G = st.getChannelData(0), D = st.getChannelData(1);
    for (let i = 0; i < st.length; i++) {
      const t = i / SR;
      if (t > 0.2 && t < 1.5) G[i] = 0.5 * Math.sin(2 * Math.PI * 440 * i / SR);
      if (t > 0.9 && t < 1.8) D[i] = 0.5 * Math.sin(2 * Math.PI * 660 * i / SR);
    }
    const out = (await lancer("rogner-silences", [st])).valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels, "la stéréo doit rester stéréo").toBe(2);
    expect(out.getChannelData(0).length, "les deux canaux ont la même longueur")
      .toBe(out.getChannelData(1).length);
    // Du début du premier (0,2 s) à la fin du dernier (1,8 s), plus deux fois la marge de 50 ms.
    expect(out.duration, `${out.duration.toFixed(3)} s`).toBeCloseTo(1.7, 1);
  });

  it("une piste entièrement silencieuse est refusée avec sa raison", async () => {
    const silence = new AudioBuffer({ numberOfChannels: 1, length: SR, sampleRate: SR });
    const res = await lancer("rogner-silences", [silence]);
    expect(res.valeurs).toEqual([null]);
    expect(res.message, `${res.message}`).toMatch(/silence|seuil/);
  });

  it("le message dit la durée d'avant, celle d'après, et le nombre de morceaux gardés", async () => {
    const src = avecSouffle(-50);
    const res = await lancer("rogner-silences", [src], { "Seuil": -40 });
    const [avant, apres, morceaux] = chiffres(res.message!);
    expect(avant, "la durée d'origine").toBeCloseTo(src.duration, 1);
    expect(apres, "la durée rendue").toBeCloseTo((res.valeurs[0] as AudioBuffer).duration, 1);
    expect(morceaux).toBeGreaterThanOrEqual(1);
  });
});

describe("fusionner en stéréo : deux prises mono, une stéréo", () => {
  it("LA DURÉE EST CELLE DU PLUS LONG, et le plus court est complété par du SILENCE", async () => {
    // « Le plus court est complété par du silence plutôt que bouclé ou étiré : deux prises de
    // longueurs différentes ne sont pas la même prise, et faire coïncider leurs fins inventerait un
    // alignement que personne n'a demandé. » Le silence se vérifie après la fin du plus court.
    const court = sinus(220, 1), long = sinus(880, 2);
    const out = (await lancer("fusion-stereo", [court, long])).valeurs[0] as AudioBuffer;
    expect(out.length, "la durée est celle du plus long").toBe(long.length);
    expect(out.numberOfChannels).toBe(2);
    const apresLaFin = out.getChannelData(0).slice(court.length + 1);
    let reste = 0;
    for (const x of apresLaFin) reste = Math.max(reste, Math.abs(x));
    expect(reste, "le plus court a été bouclé ou étiré au lieu d'être complété").toBe(0);
  });

  it("LA PREMIÈRE PRISE VA À GAUCHE, LA SECONDE À DROITE — au bit près", async () => {
    const gauche = sinus(220, 1), droite = sinus(880, 1);
    const out = (await lancer("fusion-stereo", [gauche, droite])).valeurs[0] as AudioBuffer;
    const ecart = (a: Float32Array, b: Float32Array) => {
      let m = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) m = Math.max(m, Math.abs(a[i] - b[i]));
      return m;
    };
    expect(ecart(out.getChannelData(0), gauche.getChannelData(0)), "le canal gauche n'est pas la première prise").toBe(0);
    expect(ecart(out.getChannelData(1), droite.getChannelData(0)), "le canal droit n'est pas la seconde").toBe(0);
  });

  it("le message annonce les deux durées et celle du résultat, DANS CET ORDRE", async () => {
    // MON PREMIER CAS SE CONTENTAIT DE TROUVER LES CHIFFRES, sans regarder leur place : planté — le
    // message annonçant la durée de gauche à la place de celle du résultat —, il restait vert,
    // puisque le 1 et le 2 y figuraient toujours. Les trois nombres sont donc lus à leur rang, et
    // comparés à ce que la sortie fait vraiment.
    const gauche = sinus(220, 1), droite = sinus(880, 2);
    const res = await lancer("fusion-stereo", [gauche, droite]);
    const [dG, dD, dOut] = chiffres(res.message!);
    expect(dG, "la durée de gauche").toBeCloseTo(gauche.duration, 1);
    expect(dD, "celle de droite").toBeCloseTo(droite.duration, 1);
    expect(dOut, "celle du résultat").toBeCloseTo((res.valeurs[0] as AudioBuffer).duration, 1);
  });

  it("IL EXIGE SES DEUX ENTRÉES, et le dit", async () => {
    for (const entrees of [[null, null], [sinus(220, 1), null], [null, sinus(880, 1)]]) {
      const res = await lancer("fusion-stereo", entrees);
      expect(res.valeurs).toEqual([null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("il n'a aucun réglage : c'est un geste, non un effet", () => {
    expect(fiche("fusion-stereo").parametres ?? []).toHaveLength(0);
    expect((fiche("fusion-stereo").entrees ?? []).map((e) => e.nom)).toEqual(["Gauche", "Droite"]);
  });
});

describe("ce que les quatre fiches déclarent", () => {
  it("chacune refuse une entrée qui n'est pas un son, avec un message", async () => {
    for (const id of QUATRE) {
      const res = await lancer(id, ["du texte", "du texte"]);
      expect(res.valeurs.every((v) => v === null), `${id} a accepté du texte`).toBe(true);
      expect((res.message ?? "").length, `${id} : pas de message`).toBeGreaterThan(0);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    // Les deux bornes d'une modulation sont lues par l'aide partagée qui en fait un mélange, non
    // par l'exécuteur : `luParLExecuteur` en tient compte, le nom du réglage mélangé restant écrit
    // à l'appel.
    for (const id of QUATRE) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(luParLExecuteur(source, p.nom),
          `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toBe(true);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of QUATRE) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });

  it("chacune porte sa notice dans les deux langues", () => {
    for (const id of QUATRE) {
      const f = fiche(id) as unknown as { notice?: string; noticeEn?: string };
      expect(f.notice, `${id} : pas de notice française`).toBeTruthy();
      expect(f.noticeEn, `${id} : pas de notice anglaise`).toBeTruthy();
    }
  });

  it("les deux réverbérations déclarent une graine, les deux gestes de montage non", () => {
    // Une graine est le signe d'un calcul qui tire au sort : un geste de montage n'en a pas à avoir,
    // et un effet qui en aurait une sans la déclarer serait irreproductible.
    for (const id of ["reverbe-hachee", "shimmer"]) {
      const graine = (fiche(id).parametres ?? []).find((p) => (p as { graine?: boolean }).graine);
      expect(graine, `${id} : pas de graine déclarée`).toBeTruthy();
    }
    for (const id of ["rogner-silences", "fusion-stereo"]) {
      expect((fiche(id).parametres ?? []).some((p) => (p as { graine?: boolean }).graine),
        `${id} ne devrait rien tirer au sort`).toBe(false);
    }
  });
});
