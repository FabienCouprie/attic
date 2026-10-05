// plugins/effets-spectral-modulation.test.ts — Les quatre ports de modulation du fichier, et les
// deux fiches dont nul test ne faisait tourner l'exécuteur.
//
// POURQUOI UN SECOND FICHIER SUR LE MÊME SOURCE. `effets-spectral.test.ts` tient onze fiches, mais
// le relevé qui l'a produit cherchait les composants que NUL test ne nommait, et il laissait donc
// de côté ceux qu'un autre fichier mentionne. Or mentionner n'est pas exercer :
//
//   `paulstretch` n'apparaît que dans `graines-noeuds.test.ts`, qui vérifie qu'il DÉCLARE un
//   réglage « Graine » portant le rôle. Son exécuteur n'a jamais tourné.
//
//   `reponse-filtre` n'apparaît que dans des tests de GRAPHE et de PORTS — `instrument-graphe`
//   le pose dix-huit fois dans un instrument, `modulation-ports` compte ses ports pilotes,
//   `optionIds-retrocompat` suit un ancien libellé. Aucun ne le fait filtrer quoi que ce soit.
//
// (`reduction-bruit` et `profil-bruit`, eux, sont vraiment exercés : `noise-nodes.test.ts` appelle
// leurs exécuteurs dans un graphe. Rien à refaire ici, et le redoubler serait pire qu'inutile.)
//
// ET LE SUJET QUI N'ÉTAIT TENU NULLE PART : LA COURSE D'UN RÉGLAGE LE LONG D'UNE COURBE. Trois
// fiches de ce fichier portent quatre ports de modulation, et aucun test n'en branchait un seul.
// Ce n'est pas un détail de confort : deux de ces courses sont MULTIPLICATIVES, et le commentaire
// du filtre dit pourquoi — réparti linéairement, un balayage de 200 à 6 000 Hz met sa moitié à
// 3 100 Hz, de sorte que l'octave 200-400, la plus audible du trajet, occupe trois pour cent de la
// course : le balayage se précipite puis s'arrête. Une course qui redeviendrait linéaire ne ferait
// ni erreur ni message. Elle s'entendrait, et rien d'autre ne la verrait.
//
// LA FORME DE CES CAS EST DONC TOUJOURS LA MÊME, et c'est ce qui leur donne leur force : une
// courbe PLATE à un demi doit rendre, échantillon pour échantillon, ce que rend le réglage fixe
// posé à la valeur attendue. Plate à zéro, c'est « Modulation min » ; plate à un, « Modulation
// max » ; plate à un demi, la moyenne GÉOMÉTRIQUE des deux là où la course est multiplicative, et
// l'arithmétique là où elle ne l'est pas. Aucune valeur de référence à inventer : la fiche est
// comparée à elle-même.
import "node-web-audio-api/polyfill.js";
import { describe, expect, it } from "vitest";
import { constante } from "../audio/courbe";
import { fiches } from "./effets-spectral";

const SR = 16000;

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

/** Un son reproductible, dont les deux canaux diffèrent. */
function son(secondes = 1, canaux = 2, sr = SR): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: sr });
  let graine = 24680;
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      d[i] = (graine / 2147483648 * 2 - 1) * 0.4;
    }
  }
  return b;
}

/** Un grave et un aigu, chacun d'amplitude connue : de quoi voir ce qu'un filtre garde. */
function deuxTons(grave: number, aigu: number, secondes = 1, sr = 44100): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    d[i] = 0.4 * Math.sin(2 * Math.PI * grave * i / sr) + 0.4 * Math.sin(2 * Math.PI * aigu * i / sr);
  }
  return b;
}

/** L'amplitude à UNE fréquence, par corrélation directe : un chiffre comparable à la main. */
function ampA(b: AudioBuffer, f: number): number {
  const d = b.getChannelData(0);
  let re = 0, im = 0;
  for (let i = 0; i < d.length; i++) {
    const a = 2 * Math.PI * f * i / b.sampleRate;
    re += d[i] * Math.cos(a);
    im -= d[i] * Math.sin(a);
  }
  return 2 * Math.hypot(re, im) / d.length;
}

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let c = 0; c < Math.min(a.numberOfChannels, b.numberOfChannels); c++) {
    const x = a.getChannelData(c);
    const y = b.getChannelData(c);
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

/** Une rampe de zéro à un, pour voir une course se parcourir. */
const rampe = (points = 200) =>
  ({ valeurs: Float32Array.from({ length: points }, (_, i) => i / (points - 1)), cadence: points });

/** Les trois fiches qui portent un port de modulation. */
const A_MODULATION = ["paulstretch", "formule-echantillons", "reponse-filtre"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("paulstretch : l'étirement, sa graine, et sa course multiplicative", () => {
  it("rien en entrée donne un message, pas une exception", async () => {
    const res = await lancer("paulstretch", [null, null]);
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("LE FACTEUR ANNONCÉ EST CELUI QU'ON A DEMANDÉ, et la durée le suit", async () => {
    // La durée ne vaut pas exactement le facteur : la fenêtre se cale sur une puissance de deux et
    // ajoute un reste. Mesuré, le rapport dépasse le facteur de deux à cinq pour cent. Ce qui doit
    // tenir, c'est que le MESSAGE annonce le facteur demandé et que la durée ne s'en écarte pas.
    const src = son(1);
    for (const facteur of [1, 2, 8, 20]) {
      const res = await lancer("paulstretch", [src, null], { "Stretch": facteur });
      const out = res.valeurs[0] as AudioBuffer;
      expect(chiffres(res.message!), `le message doit porter ${facteur}`).toContain(facteur);
      const rapport = out.duration / src.duration;
      expect(rapport, `${facteur}× : rapport ${rapport.toFixed(3)}`).toBeGreaterThanOrEqual(facteur);
      expect(rapport).toBeLessThan(facteur * 1.1);
    }
  });

  it("LA MÊME GRAINE REND LE MÊME ÉTIREMENT, AU BIT PRÈS — sa notice le pose en contrat", async () => {
    // « Valeur par défaut fixe : un étirement qui change à chaque exécution serait un défaut. »
    // C'est écrit dans la documentation du réglage, et c'était jusqu'ici une promesse sans garde.
    const src = son(1);
    const a = (await lancer("paulstretch", [src, null], { "Stretch": 4, "Graine": 42 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("paulstretch", [src, null], { "Stretch": 4, "Graine": 42 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b), "deux exécutions de même graine diffèrent").toBe(0);
    const c = (await lancer("paulstretch", [src, null], { "Stretch": 4, "Graine": 7 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, c), "deux graines rendent la même texture").toBeGreaterThan(0.5);
  });

  it("« Fenêtre » change la texture, même à longueur égale", async () => {
    // Le piège du cas : à 0,25 et 0,5 seconde la sortie a EXACTEMENT la même longueur, la fenêtre
    // se calant sur une puissance de deux. Un cas qui ne comparerait que les longueurs tiendrait
    // ce réglage pour inerte au-dessus d'un quart de seconde.
    const src = son(1);
    const rendu = async (f: number) =>
      (await lancer("paulstretch", [src, null], { "Stretch": 4, "Fenêtre": f })).valeurs[0] as AudioBuffer;
    const court = await rendu(0.25);
    const long = await rendu(0.5);
    expect(long.length, "ces deux fenêtres rendent bien la même longueur").toBe(court.length);
    expect(ecartMax(court, long), "et pourtant le son doit différer").toBeGreaterThan(0.1);
  });

  // LA COURSE EST MULTIPLICATIVE, et c'est le cas le plus fort de ce fichier : une courbe plate au
  // MILIEU doit donner la moyenne GÉOMÉTRIQUE des deux bornes, non leur moyenne arithmétique. De 1
  // à 64, le milieu vaut 8 et non 32,5 ; chaque doublement dure alors autant que le suivant. Une
  // course redevenue linéaire laisserait les trois cas ci-dessous annoncer 32,5 · 10,5 · 26.
  const courses: [number, number, number][] = [[1, 64, 8], [1, 20, 4.5], [2, 50, 10]];
  for (const [min, max, attendu] of courses) {
    it(`une courbe plate au milieu, entre ${min}× et ${max}×, donne ${attendu}× et non ${(min + max) / 2}×`, async () => {
      const res = await lancer("paulstretch", [son(1), constante(0.5, 1)],
        { "Modulation min": min, "Modulation max": max });
      const lus = chiffres(res.message!);
      expect(Math.sqrt(min * max), "la moyenne géométrique, à l'arrondi du message près")
        .toBeCloseTo(attendu, 1);
      expect(lus, `le message annonce ${res.message}`).toContain(attendu);
      expect(lus, "la moyenne arithmétique ne doit pas y figurer").not.toContain((min + max) / 2);
    });
  }

  it("LES DEUX BORNES DE LA COURBE SONT « Modulation min » ET « Modulation max »", async () => {
    const src = son(1);
    for (const [valeur, attendu] of [[0, 2], [1, 50]]) {
      const res = await lancer("paulstretch", [src, constante(valeur, 1)],
        { "Modulation min": 2, "Modulation max": 50 });
      expect(chiffres(res.message!), `courbe plate à ${valeur}`).toContain(attendu);
    }
  });

  it("AVEC UNE COURBE LE MESSAGE DONNE DEUX FACTEURS, sans courbe un seul", async () => {
    // Le message est la seule chose qui dise entre quelles bornes l'étirement a voyagé : avec une
    // courbe, la durée seule ne le dit plus, et le facteur n'est plus sur le réglage.
    const src = son(1);
    const balaye = await lancer("paulstretch", [src, rampe()], { "Modulation min": 1, "Modulation max": 64 });
    expect(balaye.message, `${balaye.message}`).toContain("à");
    const lus = chiffres(balaye.message!);
    expect(lus, "la borne basse").toContain(1);
    expect(lus, "la borne haute").toContain(64);

    const fixe = await lancer("paulstretch", [src, null], { "Stretch": 10, "Modulation min": 2, "Modulation max": 50 });
    expect(fixe.message, "sans courbe, pas de « à »").not.toContain(" à ");
    expect(chiffres(fixe.message!), "et les bornes n'agissent pas").toContain(10);
  });

  it("il rend autant de canaux qu'il en reçoit", async () => {
    for (const canaux of [1, 2]) {
      const out = (await lancer("paulstretch", [son(0.5, canaux), null], { "Stretch": 2 })).valeurs[0] as AudioBuffer;
      expect(out.numberOfChannels, `${canaux} canal/canaux en entrée`).toBe(canaux);
    }
  });
});

describe("reponse-filtre : quatre types, et deux réglages qui voyagent", () => {
  // Deux sinus d'amplitude 0,4 chacun, un grave et un aigu : ce que le filtre garde se lit
  // directement, sans valeur de référence à inventer.
  const tons = () => deuxTons(200, 5000, 1);

  it("rien en entrée donne un message, pas une exception", async () => {
    const res = await lancer("reponse-filtre", [null, null, null]);
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("LES QUATRE TYPES FONT CE QUE LEUR NOM DIT", async () => {
    // L'exécuteur traduit le libellé en type de biquad par une table. Une entrée de cette table
    // posée de travers donnerait un son filtré, plausible, et faux : le passe-haut couperait les
    // aigus. Rien d'autre que la mesure par bande ne peut le voir.
    const src = tons();
    const bas = (await lancer("reponse-filtre", [src, null, null], { "Type": "Passe-bas", "Fréquence de coupure": 1000 })).valeurs[0] as AudioBuffer;
    expect(ampA(bas, 200), "le passe-bas garde le grave").toBeGreaterThan(0.35);
    expect(ampA(bas, 5000), "et coupe l'aigu").toBeLessThan(0.05);

    const haut = (await lancer("reponse-filtre", [src, null, null], { "Type": "Passe-haut", "Fréquence de coupure": 1000 })).valeurs[0] as AudioBuffer;
    expect(ampA(haut, 200), "le passe-haut coupe le grave").toBeLessThan(0.05);
    expect(ampA(haut, 5000), "et garde l'aigu").toBeGreaterThan(0.35);
  });

  it("LA BANDE PASSANTE ET LA BANDE COUPÉE SONT L'EXACT MIROIR L'UNE DE L'AUTRE", async () => {
    // Le cas le plus sûr des deux, parce qu'il ne dépend d'aucun seuil : centrés sur la MÊME
    // fréquence, l'un garde ce que l'autre retire. Un passe-bande et un coupe-bande échangés
    // passeraient les deux cas précédents sans broncher.
    const src = tons();
    for (const centre of [200, 5000]) {
      const autre = centre === 200 ? 5000 : 200;
      const garde = (await lancer("reponse-filtre", [src, null, null], { "Type": "Passe-bande", "Fréquence de coupure": centre, "Résonance": 8 })).valeurs[0] as AudioBuffer;
      const retire = (await lancer("reponse-filtre", [src, null, null], { "Type": "Coupe-bande", "Fréquence de coupure": centre, "Résonance": 8 })).valeurs[0] as AudioBuffer;
      expect(ampA(garde, centre), `la bande passante garde ${centre} Hz`).toBeGreaterThan(0.35);
      expect(ampA(garde, autre), `et retire ${autre} Hz`).toBeLessThan(0.02);
      expect(ampA(retire, centre), `la bande coupée retire ${centre} Hz`).toBeLessThan(0.02);
      expect(ampA(retire, autre), `et garde ${autre} Hz`).toBeGreaterThan(0.35);
    }
  });

  it("UN TYPE INCONNU RETOMBE SUR LE PASSE-BAS, et le repli est LU DANS LE CODE", async () => {
    // CE CAS A DÛ ÊTRE RÉÉCRIT, et la raison mérite d'être gardée. Sa première version ne faisait
    // que comparer un libellé inconnu au passe-bas ; planté — le `?? "lowpass"` retiré — il restait
    // vert. Mesuré pour comprendre : le polyfill employé ici IGNORE toute valeur hors de
    // l'énumération et garde « lowpass », qui est déjà la valeur par défaut d'un biquad. Un type
    // indéfini, nul ou fantaisiste rendent donc tous le même son, et aucune mesure ne peut
    // distinguer le repli de son absence.
    //
    // Le comportement reste vérifié — un projet enregistré avec un libellé d'autrefois ne doit pas
    // faire tomber le nœud — mais ce qui tient le repli est la lecture de sa FORME : une table
    // suivie d'un repli vers « lowpass », reconnaissable quel que soit le nom donné à la table.
    const src = tons();
    const connu = (await lancer("reponse-filtre", [src, null, null], { "Type": "Passe-bas" })).valeurs[0] as AudioBuffer;
    const inconnu = (await lancer("reponse-filtre", [src, null, null], { "Type": "Trombone" })).valeurs[0] as AudioBuffer;
    expect(ecartMax(connu, inconnu), "un libellé inconnu ne doit pas changer le son").toBe(0);
    expect(fiche("reponse-filtre").executer.toString(), "le repli vers le passe-bas n'est plus écrit")
      .toMatch(/\]\s*\?\?\s*"lowpass"/);
  });

  it("« Résonance » RESSERRE LA BANDE, elle ne hausse pas la crête", async () => {
    // Ce que je croyais mesurer, et qui est faux : à la fréquence de coupure, l'amplitude bouge à
    // peine quand Q monte (0,7998 à Q 0,7 contre 0,7969 à Q 12). Ce que Q fait, c'est RESSERRER :
    // le voisin à 3 000 Hz tombe de 0,186 à 0,012, soit quinze fois moins. Un cas écrit sur la
    // crête aurait l'air de tenir le réglage et ne tiendrait rien.
    const voisin = async (q: number) => {
      const out = (await lancer("reponse-filtre", [deuxTons(1000, 3000, 1), null, null],
        { "Type": "Passe-bande", "Fréquence de coupure": 1000, "Résonance": q })).valeurs[0] as AudioBuffer;
      return ampA(out, 3000);
    };
    const large = await voisin(0.7);
    const serre = await voisin(12);
    expect(large, "à Q faible, le voisin passe encore").toBeGreaterThan(0.1);
    expect(serre, "à Q élevé, il est écarté").toBeLessThan(0.02);
    expect(large / serre, "l'écart se compte en dizaines").toBeGreaterThan(10);
  });

  // LA COUPURE EST UNE FRÉQUENCE, DONC ELLE SE PARCOURT EN MULTIPLIANT, et c'est ici que ça se
  // prouve : la courbe plate au milieu rend, ÉCHANTILLON POUR ÉCHANTILLON, ce que rend la coupure
  // fixe posée à la moyenne géométrique de 200 et 6 000, soit 1 095 Hz. Pas « à peu près » : zéro
  // d'écart, le pas d'un hertz déclaré par le réglage arrondissant les 1 095,45. Posée à 1 094 ou
  // à 1 096, la même mesure donne déjà 1,1·10⁻⁴ : le cas distingue le hertz.
  it("LA COUPURE MODULÉE SE PARCOURT EN MULTIPLIANT, au hertz près", async () => {
    const src = tons();
    const plate = (await lancer("reponse-filtre", [src, constante(0.5, 1), null],
      { "Modulation min": 200, "Modulation max": 6000 })).valeurs[0] as AudioBuffer;
    const fixe = async (hz: number) =>
      (await lancer("reponse-filtre", [src, null, null], { "Fréquence de coupure": hz })).valeurs[0] as AudioBuffer;

    const geometrique = Math.round(Math.sqrt(200 * 6000));
    expect(geometrique, "la moyenne géométrique, arrondie au pas du réglage").toBe(1095);
    expect(ecartMax(plate, await fixe(geometrique)), "la course n'est plus multiplicative").toBe(0);
    expect(ecartMax(plate, await fixe(geometrique + 1)), "le cas doit distinguer le hertz")
      .toBeGreaterThan(0);
    expect(ecartMax(plate, await fixe((200 + 6000) / 2)), "une course linéaire mettrait la moitié à 3 100 Hz")
      .toBeGreaterThan(0.1);
  });

  it("et ses deux bornes sont « Modulation min » et « Modulation max », au bit près", async () => {
    const src = tons();
    for (const [valeur, hz] of [[0, 200], [1, 6000]]) {
      const courbe = (await lancer("reponse-filtre", [src, constante(valeur, 1), null],
        { "Modulation min": 200, "Modulation max": 6000 })).valeurs[0] as AudioBuffer;
      const fixe = (await lancer("reponse-filtre", [src, null, null], { "Fréquence de coupure": hz })).valeurs[0] as AudioBuffer;
      expect(ecartMax(courbe, fixe), `courbe plate à ${valeur} contre coupure ${hz} Hz`).toBe(0);
    }
  });

  it("LE SECOND PORT PILOTE LA RÉSONANCE, et ses bornes tombent elles aussi au bit près", async () => {
    // Deux réglages du même filtre bougent ensemble, et c'est ce qu'aucune mise en série de deux
    // filtres ne reproduit : le port existait, rien ne le branchait.
    const src = tons();
    for (const [valeur, q] of [[0, 0.7], [1, 8]]) {
      const courbe = (await lancer("reponse-filtre", [src, null, constante(valeur, 1)],
        { "Résonance min": 0.7, "Résonance max": 8 })).valeurs[0] as AudioBuffer;
      const fixe = (await lancer("reponse-filtre", [src, null, null], { "Résonance": q })).valeurs[0] as AudioBuffer;
      expect(ecartMax(courbe, fixe), `courbe plate à ${valeur} contre résonance ${q}`).toBe(0);
    }
  });

  it("une courbe qui balaie ne rend pas ce que rend une courbe plate", async () => {
    const src = tons();
    const balaye = (await lancer("reponse-filtre", [src, rampe(), null],
      { "Modulation min": 200, "Modulation max": 6000 })).valeurs[0] as AudioBuffer;
    const plate = (await lancer("reponse-filtre", [src, constante(0.5, 1), null],
      { "Modulation min": 200, "Modulation max": 6000 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(balaye, plate)).toBeGreaterThan(0.1);
  });

  it("il rend autant de canaux qu'il en reçoit, et la même longueur", async () => {
    const src = son(0.3, 2, 44100);
    const out = (await lancer("reponse-filtre", [src, null, null])).valeurs[0] as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    expect(out.length).toBe(src.length);
  });
});

describe("formule-echantillons : son port de volume, que rien ne branchait", () => {
  // La fiche était couverte, mais seulement sur son chemin ordinaire. Sa course est LINÉAIRE —
  // un pourcentage n'est pas une fréquence — et la comparaison au réglage fixe le dit à chaque
  // point, non pas seulement aux bornes.
  const F = { "Formule": "x" };

  it("UNE COURBE PLATE REND EXACTEMENT CE QUE REND LE RÉGLAGE, à chaque point", async () => {
    const src = son(0.5);
    for (const [valeur, reglage] of [[0, 0], [0.25, 25], [0.5, 50], [1, 100]]) {
      const courbe = (await lancer("formule-echantillons", [src, constante(valeur, 0.5)],
        { ...F, "Modulation min": 0, "Modulation max": 100 })).valeurs[0] as AudioBuffer;
      const fixe = (await lancer("formule-echantillons", [src, null], { ...F, "Volume": reglage })).valeurs[0] as AudioBuffer;
      expect(ecartMax(courbe, fixe), `courbe plate à ${valeur} contre Volume ${reglage} %`).toBe(0);
    }
  });

  it("UN MAX SOUS LE MIN INVERSE LE SENS DE LA COURSE, comme sa notice l'annonce", async () => {
    const src = son(0.5);
    const bas = (await lancer("formule-echantillons", [src, constante(0, 0.5)],
      { ...F, "Modulation min": 100, "Modulation max": 0 })).valeurs[0] as AudioBuffer;
    const haut = (await lancer("formule-echantillons", [src, constante(1, 0.5)],
      { ...F, "Modulation min": 100, "Modulation max": 0 })).valeurs[0] as AudioBuffer;
    expect(pic(bas), "le zéro de la courbe vaut alors le gain plein").toBeCloseTo(pic(src), 4);
    expect(pic(haut), "et son un, le silence").toBe(0);
  });

  it("sans courbe branchée, les deux bornes n'agissent pas", async () => {
    const src = son(0.5);
    const a = (await lancer("formule-echantillons", [src, null], { ...F, "Volume": 30, "Modulation min": 0, "Modulation max": 100 })).valeurs[0] as AudioBuffer;
    const b = (await lancer("formule-echantillons", [src, null], { ...F, "Volume": 30, "Modulation min": 90, "Modulation max": 95 })).valeurs[0] as AudioBuffer;
    expect(ecartMax(a, b), "une borne a agi alors qu'aucune courbe n'est branchée").toBe(0);
  });

  it("une rampe fait monter le gain d'un bout du son à l'autre", async () => {
    const src = son(0.5);
    const out = (await lancer("formule-echantillons", [src, rampe(100)],
      { ...F, "Modulation min": 0, "Modulation max": 100 })).valeurs[0] as AudioBuffer;
    const d = out.getChannelData(0);
    const tranche = (a: number, b: number) => {
      let m = 0;
      for (let i = a; i < b; i++) m = Math.max(m, Math.abs(d[i]));
      return m;
    };
    const debut = tranche(0, 1000);
    const fin = tranche(d.length - 1000, d.length);
    expect(fin, "la fin doit être nettement plus forte que le début").toBeGreaterThan(debut * 4);
  });
});

describe("ce que les trois fiches à modulation déclarent", () => {
  it("CHAQUE PORT DE MODULATION NOMME UN RÉGLAGE QUI EXISTE", () => {
    // Le garde cherche une FORME : un port qui porte `module` doit désigner un paramètre que la
    // fiche déclare. Une faute de frappe y rendrait le port silencieusement inerte — pas d'erreur,
    // pas de message, une entrée qu'on branche et qui ne fait rien.
    let ports = 0;
    for (const id of A_MODULATION) {
      const f = fiche(id);
      const noms = new Set((f.parametres ?? []).map((p) => p.nom));
      for (const e of (f.entrees ?? []) as { nom: string; module?: string; requis?: boolean }[]) {
        if (!e.module) continue;
        ports++;
        expect(noms, `${id} · port « ${e.nom} » pilote « ${e.module} », que la fiche ne déclare pas`)
          .toContain(e.module);
        expect(e.requis, `${id} · le port « ${e.nom} » doit rester facultatif`).toBe(false);
      }
    }
    expect(ports, "le fichier porte quatre ports de modulation").toBe(4);
  });

  it("CHAQUE PORT DE MODULATION A SES DEUX BORNES, déclarées sur le réglage qu'il pilote", () => {
    // Sans `modulationDe`, l'inspecteur ne sait pas à quel réglage rattacher les bornes, et une
    // course se parcourt alors entre des valeurs que personne ne peut lire.
    for (const id of A_MODULATION) {
      const f = fiche(id);
      for (const e of (f.entrees ?? []) as { module?: string }[]) {
        if (!e.module) continue;
        const bornes = (f.parametres ?? []).filter((p) => (p as { modulationDe?: string }).modulationDe === e.module);
        expect(bornes, `${id} · « ${e.module} » n'a pas ses deux bornes`).toHaveLength(2);
      }
    }
  });

  it("L'AUDIO RESTE LE PREMIER PORT : les ports se désignent par leur rang", () => {
    // Insérer un port de modulation ailleurs qu'en fin de liste débrancherait l'audio de tous les
    // graphes déjà enregistrés, en silence. C'est écrit à côté du second port du filtre.
    for (const id of A_MODULATION) {
      const entrees = (fiche(id).entrees ?? []) as { type: string }[];
      expect(entrees[0].type, `${id} : le premier port n'est plus l'audio`).toBe("audio");
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of A_MODULATION) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of A_MODULATION) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });
});
