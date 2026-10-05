// plugins/syntheses-exotiques.test.ts — Les quatre procédés de synthèse, que nul test ne nommait.
//
// POURQUOI CE FICHIER. Les quatre calculs sont déjà couverts — `audio/scanning.test.ts`,
// `audio/terrain-onde.test.ts`, `audio/fof.test.ts`, `audio/concatenatif.test.ts`. Ce qui n'était
// tenu par rien, ce sont les quatre FICHES : aucun test ne nommait `synthese-scanning`,
// `terrain-onde`, `voyelle-fof` ni `mosaiquage`.
//
// ET CE FICHIER ANNONCE UNE PROMESSE MESURABLE, ce qui est rare : « séparer complètement ce qui
// fait la HAUTEUR de ce qui fait le TIMBRE, de sorte que le second évolue indéfiniment pendant que
// la première reste juste ». Trois des quatre fiches la répètent dans leur documentation — « la
// hauteur ne dépend que de la vitesse de balayage, jamais de la mécanique », « c'est LE réglage de
// timbre […] sans changer la note », « les formants ne bougent pas avec elle ». C'est une
// affirmation qu'on peut mettre en défaut, et c'est donc elle que ce fichier met à l'épreuve.
//
// DEUX MÉTHODES DE MESURE ONT ÉTÉ ÉCARTÉES AVANT LA BONNE, et le dire évite de les reprendre.
// Chercher LA RAIE LA PLUS FORTE ne mesure pas une hauteur : sur ces instruments le partiel
// dominant change à mesure que le timbre évolue, ce qui est leur objet même — mesurée ainsi, une
// note tenue à 110 Hz « montait » à 330 quand on élargissait l'orbite. L'AUTOCORRÉLATION se laisse
// prendre aux sous-harmoniques : une période double corrèle tout aussi bien, et un la 220 se
// relevait à 110. Ce qui est mesuré ici est donc LA PART DE L'ÉNERGIE À UNE FRÉQUENCE DONNÉE,
// rapportée à l'énergie totale : sans ambiguïté d'octave, et comparable d'un réglage à l'autre.
//
// MIEUX ENCORE QUAND LE COMPOSANT COMPTE LUI-MÊME. La FOF annonce son nombre de bouffées, et il
// vaut CINQ FOIS la fréquence multipliée par la durée — une bouffée par formant et par période.
// C'est la mesure de hauteur la plus sûre de tout ce fichier, puisqu'elle ne passe par aucun
// spectre : 110 Hz sur une seconde donnent 550 bouffées, 220 en donnent 1 100.
//
// TROIS DÉFAUTS TROUVÉS ICI, ET CORRIGÉS DEPUIS, dont la trace reste parce qu'elle explique la
// forme actuelle du fichier. « Force » du scanning ne pouvait RIEN changer au résultat : le réglage
// était lu et transmis, mais le calcul rendait un signal déjà normalisé, de sorte que le facteur se
// simplifiait exactement — 1,2·10⁻⁷ d'écart entre Force 1 et Force 100, le bruit de calcul. La
// vélocité MIDI se perdait avec lui, deux notes jouées à 127 et à 15 sortant au même niveau. Et la
// voyelle ne lisait jamais la vélocité, son exécuteur ne la mentionnant pas.
//
// CE QUI A ÉTÉ COMPRIS EN LE CORRIGEANT, et qui vaut pour toute cette famille : un facteur appliqué
// également à toutes les notes se simplifie dans la normalisation du mélange, QUOI QU'ON FASSE en
// amont. Une amplitude globale ne peut donc pas être un réglage. Ce qui survit est l'ÉCART entre
// les notes, et c'est lui qu'on règle désormais : « Force » est devenue « Sensibilité à la
// vélocité », et la voyelle en a reçu une. Les deux calculs portent maintenant leur niveau au lieu
// de l'effacer, comme le veut la règle que `versBuffer` énonce — un modèle ne normalise pas, le
// mélange se normalise une fois. Les cas qui tiennent tout cela sont dans la batterie sœur,
// `syntheses-exotiques-midi.test.ts`, puisque ces réglages n'agissent qu'avec une séquence.
import "../audio/polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import { constante } from "../audio/courbe";
import { fiches } from "./syntheses-exotiques";

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

/** Les trois hauteurs employées, et ce qu'elles valent en hertz. */
const LA2 = 110, LA3 = 220, MI2 = 82.41;

/**
 * La part de l'énergie portée par UNE fréquence, rapportée à l'énergie totale.
 *
 * C'est la seule des trois mesures essayées qui ne se trompe pas d'octave : elle ne cherche pas
 * « la » hauteur, elle demande combien il y a de signal À l'endroit où on l'attend. Prise au tiers
 * du son, pour laisser passer l'attaque.
 */
function part(b: AudioBuffer, f: number): number {
  const d = b.getChannelData(0);
  const depart = Math.max(0, Math.min(Math.floor(d.length / 3), d.length - 16384));
  const n = Math.min(16384, d.length - depart);
  let re = 0, im = 0, energie = 0;
  for (let i = 0; i < n; i++) {
    const x = d[depart + i];
    const a = 2 * Math.PI * f * i / b.sampleRate;
    re += x * Math.cos(a);
    im -= x * Math.sin(a);
    energie += x * x;
  }
  return (re * re + im * im) / (n * energie + 1e-20);
}

/**
 * L'énergie dans une BANDE autour d'une fréquence : c'est ainsi qu'on lit un formant.
 *
 * UN FORMANT N'EST PAS UNE RAIE, et un spectre harmonique n'a rien ENTRE ses raies. Mesurer à
 * 730 Hz exactement sur une voix chantée à 110 Hz, c'est mesurer entre la sixième harmonique
 * (660) et la septième (770), donc à peu près rien : ma première version lisait ainsi et trouvait
 * le I plus fort à 730 qu'à 270, l'inverse de ce que la table dit. En bande, les rapports sont
 * nets — cent à mille quatre cents selon la voyelle.
 */
function bande(b: AudioBuffer, centre: number, largeurRelative = 0.25): number {
  const d = b.getChannelData(0);
  const depart = Math.max(0, Math.min(Math.floor(d.length / 3), d.length - 8192));
  const n = Math.min(8192, d.length - depart);
  let total = 0;
  for (let f = Math.ceil(centre * (1 - largeurRelative)); f <= centre * (1 + largeurRelative); f += 5) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * f * i / b.sampleRate;
      re += d[depart + i] * Math.cos(a);
      im -= d[depart + i] * Math.sin(a);
    }
    total += (re * re + im * im) / (n * n);
  }
  return total;
}

const pic = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  return m;
};

function ecartMax(a: AudioBuffer, b: AudioBuffer): number {
  let m = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a.getChannelData(0)[i] - b.getChannelData(0)[i]));
  return m;
}

const chiffres = (m: string) =>
  (m.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));

/** Un son STRUCTURÉ : du bruit blanc rend tous les grains semblables et ne prouve rien. */
function sonVarie(secondes: number, sr = 44100): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  let graine = 97531;
  for (let i = 0; i < n; i++) {
    const tiers = Math.floor((i / n) * 3);
    graine = (graine * 1103515245 + 12345) % 2147483648;
    const tire = graine / 2147483648 * 2 - 1;
    if (tiers === 0) d[i] = 0.5 * Math.sin(2 * Math.PI * 180 * i / sr);
    else if (tiers === 1) d[i] = 0.5 * tire;
    else d[i] = 0.08 * Math.sin(2 * Math.PI * 2500 * i / sr);
  }
  return b;
}

/** Une sinusoïde tenue : tous ses grains se ressemblent, et c'est ce qui en fait un corpus pauvre. */
function tenu(secondes: number, f: number, sr = 44100): AudioBuffer {
  const n = Math.round(secondes * sr);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = 0.4 * Math.sin(2 * Math.PI * f * i / sr);
  return b;
}

const QUATRE = ["synthese-scanning", "terrain-onde", "voyelle-fof", "mosaiquage"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("terrain d'onde : l'orbite fait la hauteur, le relief fait le timbre", () => {
  it("LA NOTE EST EXACTEMENT OÙ ON LA DEMANDE, et rien ne fuit à côté", async () => {
    // Mesuré : la fréquence demandée porte la moitié de l'énergie, les deux autres candidates
    // moins d'un cent-millième. Un rapport de l'ordre de soixante mille — ce n'est pas « à peu
    // près juste », c'est juste.
    for (const [note, f0] of [["A2", LA2], ["A3", LA3], ["E2", MI2]] as [string, number][]) {
      const out = (await lancer("terrain-onde", [null], { "Durée": 0.8, "Note": note })).valeurs[0] as AudioBuffer;
      expect(part(out, f0), `${note} : la fondamentale demandée`).toBeGreaterThan(0.3);
      for (const autre of [LA2, LA3, MI2].filter((x) => x !== f0)) {
        expect(part(out, autre), `${note} : de l'énergie à ${autre} Hz, qui n'a rien à y faire`)
          .toBeLessThan(part(out, f0) / 100);
      }
    }
  });

  it("AUCUN RÉGLAGE DE TIMBRE NE DÉPLACE LA NOTE, tant que l'orbite reste centrée", async () => {
    // « Rayon : c'est LE réglage de timbre […] sans changer la note. » Mesuré, la fondamentale
    // garde plus de dix-huit mille fois l'énergie de l'octave, et jusqu'à cent cinquante mille.
    for (const [nom, valeur] of [["Rayon", 10], ["Rayon", 300], ["Dérive", 100], ["Aplatissement", 100], ["Orbite", "spirale"], ["Orbite", "ellipse"]] as [string, string | number][]) {
      const out = (await lancer("terrain-onde", [null], { "Durée": 0.8, [nom]: valeur })).valeurs[0] as AudioBuffer;
      expect(part(out, LA2), `${nom}=${valeur} a fait fuir la note`).toBeGreaterThan(0.01);
      expect(part(out, LA3), `${nom}=${valeur} a fait monter la note d'une octave`)
        .toBeLessThan(part(out, LA2) / 1000);
    }
  });

  it("DÉCALER LE CENTRE FAIT MONTER L'OCTAVE SANS DÉPLACER LA NOTE, et c'est de la géométrie", async () => {
    // MA PREMIÈRE VERSION TRAITAIT LE DÉCALAGE DU CENTRE COMME LES AUTRES RÉGLAGES DE TIMBRE, et
    // elle tombait : à Centre X = 50, le second harmonique porte DEUX FOIS l'énergie de la
    // fondamentale. Ce n'est pas un défaut mais la forme du trajet — une orbite décentrée traverse
    // le relief de façon asymétrique, ce qui crée des harmoniques paires. La note, elle, n'a pas
    // bougé : elle est toujours là, et aucune fréquence plus basse n'apparaît. C'est cela qui est
    // exigé ici, et non une domination que la géométrie interdit.
    for (const [nom, valeur] of [["Centre X", 50], ["Centre X", 150], ["Centre Y", 150]] as [string, number][]) {
      const out = (await lancer("terrain-onde", [null], { "Durée": 0.8, [nom]: valeur })).valeurs[0] as AudioBuffer;
      expect(part(out, LA2), `${nom}=${valeur} : la fondamentale a disparu`).toBeGreaterThan(0.05);
      expect(part(out, 55), `${nom}=${valeur} : une note plus basse est apparue`)
        .toBeLessThan(part(out, LA2) / 100);
    }
    // Et l'octave monte bien, ce qui est le timbre que le décalage vient chercher.
    const centre = (await lancer("terrain-onde", [null], { "Durée": 0.8 })).valeurs[0] as AudioBuffer;
    const decale = (await lancer("terrain-onde", [null], { "Durée": 0.8, "Centre X": 50 })).valeurs[0] as AudioBuffer;
    expect(part(decale, LA3), "le décalage doit enrichir le spectre").toBeGreaterThan(part(centre, LA3) * 100);
  });

  it("« SELLE » SONNE L'OCTAVE AU-DESSUS, et sa documentation le dit", async () => {
    // « Selle est symétrique, et fait donc entendre l'octave au-dessus de la vitesse de rotation. »
    // Une prédiction précise, écrite dans la notice, et qui ressemblerait sans elle à un défaut :
    // un terrain qui change la note sur un instrument qui promet de ne pas le faire.
    const out = (await lancer("terrain-onde", [null], { "Durée": 0.8, "Terrain": "selle" })).valeurs[0] as AudioBuffer;
    expect(part(out, LA3), "la symétrie double la fréquence").toBeGreaterThan(0.3);
    expect(part(out, LA2), "et il ne reste rien à la fondamentale de l'orbite")
      .toBeLessThan(part(out, LA3) / 1000);
  });

  it("« ONDES CONCENTRIQUES » NE DONNE RIEN SUR UNE ORBITE CENTRÉE, et le message l'annonce", async () => {
    // « Elle ne donne rien sans décaler le centre de l'orbite, et c'est de la géométrie, non un
    // défaut. » Un cercle centré sur un relief à symétrie de révolution reste à altitude constante.
    // Le message dit « relief parcouru 0.00 », ce qui est exactement l'explication du silence.
    const centre = await lancer("terrain-onde", [null], { "Durée": 0.4, "Terrain": "ondes" });
    expect(pic(centre.valeurs[0] as AudioBuffer), "un cercle centré ne monte ni ne descend").toBe(0);
    expect(chiffres(centre.message!), "et le relief annoncé est nul").toContain(0);

    const decale = await lancer("terrain-onde", [null], { "Durée": 0.4, "Terrain": "ondes", "Centre X": 50 });
    expect(pic(decale.valeurs[0] as AudioBuffer), "décalé, il traverse les ondes").toBeGreaterThan(0.1);
  });

  it("LE RELIEF ANNONCÉ CROÎT AVEC L'ORBITE, puisque c'est ce qu'elle explore", async () => {
    const relief = async (rayon: number) =>
      chiffres((await lancer("terrain-onde", [null], { "Durée": 0.4, "Rayon": rayon })).message!)[1];
    const petit = await relief(10), moyen = await relief(80), grand = await relief(300);
    expect(petit).toBeLessThan(moyen);
    expect(moyen).toBeLessThan(grand);
    expect(petit, "une petite orbite reste dans une zone plate").toBeLessThan(0.5);
  });

  it("une formule illisible donne un message, pas une exception", async () => {
    const res = await lancer("terrain-onde", [null], { "Terrain": "personnalise", "Formule": "sin(" });
    expect(res.valeurs).toEqual([null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
    const bonne = await lancer("terrain-onde", [null], { "Durée": 0.3, "Terrain": "personnalise", "Formule": "x" });
    expect(bonne.valeurs[0], "et une formule lisible rend un son").toBeInstanceOf(AudioBuffer);
  });
});

describe("voyelle chantée : les formants ne bougent pas avec la note", () => {
  const sansTremblement = { "Graine": 7, "Vibrato": 0, "Instabilité": 0 };

  it("LES BOUFFÉES COMPTENT LES PÉRIODES : cinq par période, exactement", async () => {
    // LA MESURE DE HAUTEUR LA PLUS SÛRE DE CE FICHIER, parce qu'elle ne passe par aucun spectre :
    // le composant compte lui-même ses bouffées, et il en fait cinq par période — une par formant.
    // Relevé : 110 Hz sur une seconde donnent 550 bouffées, 220 en donnent 1 105, 55 en donnent
    // 275. La hauteur chantée se lit donc dans le message, au comptage près.
    for (const [note, f0] of [["A1", 55], ["A2", LA2], ["A3", LA3], ["E2", MI2]] as [string, number][]) {
      for (const duree of [0.5, 1]) {
        const res = await lancer("voyelle-fof", [null], { "Durée": duree, "Note": note, ...sansTremblement });
        const bouffees = chiffres(res.message!)[0];
        expect(bouffees / (f0 * duree), `${note} sur ${duree} s : ${bouffees} bouffées`)
          .toBeCloseTo(5, 0);
      }
    }
  });

  it("ni le vibrato ni l'instabilité ne changent le nombre de périodes, à un pour cent près", async () => {
    // Ils le font bouger de CINQ bouffées sur cinq cent cinquante, et c'est normal : le vibrato
    // module la période, donc il en fait tenir un peu plus ou un peu moins dans la même durée.
    // Ma première tolérance était de cinq exactement, et elle tombait d'un cheveu.
    const compte = async (r: Record<string, number>) =>
      chiffres((await lancer("voyelle-fof", [null], { "Durée": 1, ...sansTremblement, ...r })).message!)[0];
    const net = await compte({});
    for (const [nom, v] of [["Vibrato", 100], ["Instabilité", 100], ["Fréquence vibrato", 12], ["Attaque", 20]] as [string, number][]) {
      const avec = await compte({ [nom]: v });
      expect(Math.abs(avec - net) / net, `${nom}=${v} : ${avec} bouffées contre ${net}`)
        .toBeLessThan(0.02);
    }
  });

  it("LE A ET LE I ONT LES FORMANTS DE LA TABLE : 730/1090 contre 270/2290", async () => {
    // « Le A a un premier formant haut et un deuxième bas (730 et 1090 Hz), le I l'inverse (270 et
    // 2290) : c'est le contraste le plus net de la table. » C'est vérifiable, et c'est vérifié :
    // mesuré, chaque voyelle porte vingt fois plus d'énergie à SES formants qu'à ceux de l'autre.
    const voyelle = async (id: string) =>
      (await lancer("voyelle-fof", [null], { "Durée": 0.8, "Voyelle": id, ...sansTremblement })).valeurs[0] as AudioBuffer;
    const a = await voyelle("a"), i = await voyelle("i");
    expect(bande(a, 730) / bande(a, 270), "le A doit chanter à 730 et non à 270").toBeGreaterThan(10);
    expect(bande(a, 1090) / bande(a, 2290), "et à 1090 plutôt qu'à 2290").toBeGreaterThan(5);
    expect(bande(i, 270) / bande(i, 730), "le I doit chanter à 270 et non à 730").toBeGreaterThan(10);
    expect(bande(i, 2290) / bande(i, 1090), "et à 2290 plutôt qu'à 1090").toBeGreaterThan(5);
  });

  it("« TAILLE DU CONDUIT » DÉPLACE TOUS LES FORMANTS ENSEMBLE, d'une octave exactement", async () => {
    // « Décale tous les formants ensemble, ce qui revient à changer la taille du conduit vocal. »
    // Douze demi-tons font une octave : le formant à 730 Hz doit se retrouver à 365 en bas et à
    // 1 460 en haut. Mesuré, et c'est le chiffre même de la notice qui sert de repère.
    const conduit = async (demiTons: number) =>
      (await lancer("voyelle-fof", [null], { "Durée": 0.8, "Taille du conduit": demiTons, ...sansTremblement })).valeurs[0] as AudioBuffer;
    const bas = await conduit(-12), neutre = await conduit(0), haut = await conduit(12);
    expect(bande(neutre, 730) / bande(neutre, 365), "au neutre, le formant est à 730").toBeGreaterThan(10);
    expect(bande(bas, 365) / bande(bas, 730), "une octave plus bas, il est à 365").toBeGreaterThan(5);
    expect(bande(haut, 1460) / bande(haut, 730), "une octave plus haut, à 1460").toBeGreaterThan(10);
  });

  it("LA MÊME GRAINE REND LE MÊME CHANT, et zéro en tire une nouvelle", async () => {
    const son = async (graine: number) =>
      (await lancer("voyelle-fof", [null], { "Durée": 0.4, "Graine": graine })).valeurs[0] as AudioBuffer;
    expect(ecartMax(await son(42), await son(42)), "deux exécutions de même graine diffèrent").toBe(0);
    expect(ecartMax(await son(42), await son(99)), "deux graines rendent le même son")
      .toBeGreaterThan(0.1);
    // Zéro veut dire « tire au sort », et le message dit laquelle : sans cela le chant obtenu
    // serait irretrouvable.
    const a = await lancer("voyelle-fof", [null], { "Durée": 0.3, "Graine": 0 });
    const b = await lancer("voyelle-fof", [null], { "Durée": 0.3, "Graine": 0 });
    const tiree = (m: string) => chiffres(m).slice(-1)[0];
    expect(tiree(a.message!)).toBeGreaterThan(0);
    expect(tiree(a.message!), "deux tirages ne doivent pas tomber sur la même").not.toBe(tiree(b.message!));
  });
});

describe("synthèse par scanning : la note vient du balayage, le timbre de la mécanique", () => {
  it("À CADENCE LENTE, LA NOTE EST EXACTE — c'est là qu'on peut la voir", async () => {
    // La promesse est que la hauteur ne dépend que de la vitesse de balayage. Elle se vérifie à
    // cadence lente, où la table ne change presque pas d'une période à l'autre : mesuré, la
    // fréquence demandée porte un tiers de l'énergie et les octaves voisines dix-mille fois moins.
    for (const [note, f0] of [["A2", LA2], ["A3", LA3], ["E2", MI2]] as [string, number][]) {
      const out = (await lancer("synthese-scanning", [null], { "Durée": 0.8, "Note": note, "Cadence": 60 })).valeurs[0] as AudioBuffer;
      expect(part(out, f0), `${note} à cadence lente`).toBeGreaterThan(0.1);
      for (const autre of [LA2, LA3, MI2].filter((x) => x !== f0)) {
        expect(part(out, autre), `${note} : de l'énergie à ${autre} Hz`)
          .toBeLessThan(part(out, f0) / 100);
      }
    }
  });

  it("LA CADENCE NE DÉPLACE PAS LA NOTE, ELLE ÉTALE LE TIMBRE AUTOUR", async () => {
    // Ce que la cadence change, c'est la vitesse à laquelle la table se déforme : plus elle est
    // rapide, plus la forme d'onde diffère d'une période à la suivante, et plus l'énergie se
    // répartit hors de la fondamentale. Elle ne la DÉPLACE pas pour autant — il n'apparaît rien
    // à l'octave. Relevé : 0,341 à 60 pas par seconde, 0,070 à 100, 0,027 à 200, 0,0004 à 800.
    const parts: number[] = [];
    for (const cadence of [60, 100, 200, 800]) {
      const out = (await lancer("synthese-scanning", [null], { "Durée": 0.8, "Cadence": cadence })).valeurs[0] as AudioBuffer;
      parts.push(part(out, LA2));
      expect(part(out, LA3), `cadence ${cadence} : une octave est apparue`).toBeLessThan(1e-3);
    }
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i], `la cadence ${i} n'étale pas davantage que la précédente`)
        .toBeLessThan(parts[i - 1]);
    }
  });

  it("LE MESSAGE COMPTE LES PAS DE MÉCANIQUE, et ils valent la cadence par la durée", async () => {
    for (const [cadence, duree] of [[800, 0.5], [800, 1], [100, 1]] as [number, number][]) {
      const res = await lancer("synthese-scanning", [null], { "Durée": duree, "Cadence": cadence });
      const [notes, pas] = chiffres(res.message!);
      expect(notes, "une seule note sans MIDI").toBe(1);
      expect(pas / (cadence * duree), `cadence ${cadence} sur ${duree} s : ${pas} pas`)
        .toBeCloseTo(1, 1);
    }
  });

  it("les quatre excitations donnent quatre sons différents", async () => {
    // « Rien ne l'entretient ensuite : c'est donc elle qui décide de tout le son. » Quatre formes
    // de départ, quatre sons — et deux d'entre elles sont nommées par ce qu'elles donnent à la
    // chaîne, un déplacement sans vitesse ou l'inverse.
    const rendus: Record<string, AudioBuffer> = {};
    for (const exc of ["pincee", "frappee", "bruit", "deux-bosses"]) {
      rendus[exc] = (await lancer("synthese-scanning", [null], { "Durée": 0.4, "Excitation": exc })).valeurs[0] as AudioBuffer;
    }
    const noms = Object.keys(rendus);
    for (let i = 0; i < noms.length; i++) {
      for (let j = i + 1; j < noms.length; j++) {
        expect(ecartMax(rendus[noms[i]], rendus[noms[j]]), `« ${noms[i]} » et « ${noms[j]} » se confondent`)
          .toBeGreaterThan(0.1);
      }
    }
  });
});

describe("mosaïquage : la forme de la cible, la matière du corpus", () => {
  const cible = () => sonVarie(0.6);
  const corpus = () => sonVarie(1.4);

  it("LE RAPPORT ET LE MESSAGE DISENT LES MÊMES NOMBRES", async () => {
    // Le rapport est ce que l'utilisateur lit pour savoir si le procédé a pris. Un chiffre qui
    // différerait de celui du message rendrait les deux inutilisables.
    const res = await lancer("mosaiquage", [cible(), corpus(), null], {});
    const [grainsCible, distincts, grainsCorpus] = chiffres(res.message!);
    const rapport = res.valeurs[1] as string;
    expect(rapport).toContain(`: ${grainsCible} grains`);
    expect(rapport).toContain(`: ${grainsCorpus} grains`);
    expect(rapport).toContain(`: ${distincts}`);
    expect(rapport.split("\n"), "cinq lignes : les deux comptes, les distincts, la part, le verdict")
      .toHaveLength(5);
  });

  it("LA SORTIE A LA LONGUEUR DE LA CIBLE : c'est elle qui donne la forme", async () => {
    const c = cible();
    const out = (await lancer("mosaiquage", [c, corpus(), null], {})).valeurs[0] as AudioBuffer;
    expect(out.length).toBe(c.length);
  });

  it("UN CORPUS TROP PAUVRE EST SIGNALÉ, et c'est le défaut le plus audible du procédé", async () => {
    // « Sans cela, un corpus pauvre rend cent fois le même grain, ce qui s'entend comme un
    // bourdonnement. » CE QUI FAIT LA PAUVRETÉ EST LE COUPLE, non le corpus seul : ma première
    // version opposait une sinusoïde à la cible structurée, et le rapport la jugeait « assez
    // variée » — six grains distincts, parce qu'une cible riche va chercher des grains différents
    // même dans un corpus uniforme. Deux sinusoïdes tenues, elles, ne laissent que deux grains
    // distincts sur vingt-neuf, et l'avertissement tombe.
    const res = await lancer("mosaiquage", [tenu(0.6, 440), tenu(0.3, 300), null], {});
    expect(res.valeurs[1], "le rapport doit avertir").toMatch(/bourdonner|drone/);
    const varie = await lancer("mosaiquage", [cible(), corpus(), null], {});
    expect(varie.valeurs[1], "et se taire quand le corpus suffit").toMatch(/assez varié|varied enough/);
  });

  it("« ÉVITER LES RÉPÉTITIONS » FAIT VRAIMENT VARIER LE CHOIX", async () => {
    // Le réglage est le remède que le rapport conseille lui-même, et il fallait vérifier qu'il en
    // est un : sur le couple le plus pauvre, monter la pénalité augmente le nombre de grains
    // distincts employés.
    const distincts = async (eviter: number) => {
      const r = await lancer("mosaiquage", [tenu(0.6, 440), tenu(0.3, 300), null],
        { "Éviter les répétitions": eviter });
      return chiffres(r.message!)[1];
    };
    expect(await distincts(100), "le remède ne remédie à rien").toBeGreaterThan(await distincts(0));
  });

  it("LES TROIS POIDS CHANGENT L'APPARIEMENT — sur un son STRUCTURÉ", async () => {
    // LA LEÇON DE MESURE DE CE FICHIER, et elle a failli faire conclure l'inverse : sur du BRUIT
    // BLANC, les trois poids donnaient exactement le même son, à zéro d'écart. Ce n'était pas un
    // défaut mais le matériau — tous les grains de bruit blanc ont le même niveau, la même
    // brillance et le même taux de passages par zéro, de sorte qu'il n'y a rien à départager.
    // Sur un son fait de trois tranches différentes, les trois poids donnent trois résultats.
    const c = cible(), co = corpus();
    const avec = async (r: Record<string, number>) =>
      (await lancer("mosaiquage", [c, co, null], r)).valeurs[0] as AudioBuffer;
    const niveau = await avec({ "Poids de la brillance": 0, "Poids du bruit": 0 });
    const brillance = await avec({ "Poids du niveau": 0, "Poids du bruit": 0 });
    const bruit = await avec({ "Poids du niveau": 0, "Poids de la brillance": 0 });
    expect(ecartMax(niveau, brillance), "le niveau et la brillance apparient pareil").toBeGreaterThan(0.1);
    expect(ecartMax(brillance, bruit), "la brillance et le bruit apparient pareil").toBeGreaterThan(0.1);
    expect(ecartMax(await avec({ "Taille des grains": 10 }), await avec({ "Taille des grains": 150 })),
      "la taille des grains ne change rien").toBeGreaterThan(0.1);
  });

  it("UNE COURBE PLATE REND CE QUE REND LE RÉGLAGE, à chaque point", async () => {
    const c = cible(), co = corpus();
    for (const [valeur, reglage] of [[0, 0], [0.5, 50], [1, 100]] as [number, number][]) {
      const courbe = (await lancer("mosaiquage", [c, co, constante(valeur, 0.6)],
        { "Modulation min": 0, "Modulation max": 100 })).valeurs[0] as AudioBuffer;
      const fixe = (await lancer("mosaiquage", [c, co, null], { "Volume": reglage })).valeurs[0] as AudioBuffer;
      expect(ecartMax(courbe, fixe), `courbe plate à ${valeur} contre Volume ${reglage} %`).toBe(0);
    }
  });

  it("IL EXIGE SES DEUX ENTRÉES, et le dit", async () => {
    for (const entrees of [[null, null, null], [cible(), null, null], [null, corpus(), null]]) {
      const res = await lancer("mosaiquage", entrees);
      expect(res.valeurs, "deux sorties déclarées, deux valeurs").toEqual([null, null]);
      expect((res.message ?? "").length).toBeGreaterThan(0);
    }
  });

  it("un son plus court qu'un grain est refusé avec sa raison", async () => {
    const court = new AudioBuffer({ numberOfChannels: 1, length: 10, sampleRate: 44100 });
    const res = await lancer("mosaiquage", [court, corpus(), null], {});
    expect(res.valeurs).toEqual([null, null]);
    expect(res.message, `${res.message}`).toMatch(/grain/);
  });
});

describe("ce que les quatre fiches déclarent", () => {
  it("LES TROIS SYNTHÈSES JOUENT SANS MIDI, qui leur est facultatif", async () => {
    for (const id of ["synthese-scanning", "terrain-onde", "voyelle-fof"]) {
      const entree = (fiche(id).entrees ?? [])[0];
      expect(entree.type, `${id} : le premier port`).toBe("midi");
      expect(entree.requis, `${id} : le MIDI doit rester facultatif`).toBe(false);
      const res = await lancer(id, [null], { "Durée": 0.3 });
      expect(res.valeurs[0], `${id} ne joue rien sans MIDI`).toBeInstanceOf(AudioBuffer);
      expect((res.message ?? "").length, `${id} : pas de message`).toBeGreaterThan(0);
    }
    // LES DEUX QUI COMPTENT LEURS NOTES LE DISENT, et la voyelle ne le dit pas : son message
    // commence par la voyelle chantée puis donne ses bouffées. Ma première version exigeait des
    // trois le même gabarit et tombait sur elle.
    for (const id of ["synthese-scanning", "terrain-onde"]) {
      const res = await lancer(id, [null], { "Durée": 0.3 });
      expect(chiffres(res.message!)[0], `${id} : une seule note sans MIDI`).toBe(1);
    }
    const chant = await lancer("voyelle-fof", [null], { "Durée": 0.3 });
    expect(chant.message, "la voyelle chantée s'annonce par son nom").toMatch(/^Voyelle |^Vowel /);
  });

  it("« Volume » dose la sortie des quatre, et zéro rend le silence", async () => {
    const entrees: Record<string, unknown[]> = {
      "synthese-scanning": [null], "terrain-onde": [null], "voyelle-fof": [null],
      "mosaiquage": [sonVarie(0.3), sonVarie(0.8), null],
    };
    for (const id of QUATRE) {
      const muet = (await lancer(id, entrees[id], { "Durée": 0.3, "Volume": 0 })).valeurs[0] as AudioBuffer;
      const fort = (await lancer(id, entrees[id], { "Durée": 0.3, "Volume": 100 })).valeurs[0] as AudioBuffer;
      expect(pic(muet), `${id} à volume zéro`).toBe(0);
      expect(pic(fort), `${id} à volume plein`).toBeGreaterThan(0.5);
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of QUATRE) {
      const source = fiche(id).executer.toString();
      for (const p of fiche(id).parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
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

  it("un choix qui porte des identifiants en porte autant que d'options", () => {
    for (const id of QUATRE) {
      for (const p of fiche(id).parametres ?? []) {
        if (!p.optionIds) continue;
        expect(p.optionIds, `${id} · ${p.nom}`).toHaveLength(p.options!.length);
        expect(p.optionsEn, `${id} · ${p.nom}`).toHaveLength(p.options!.length);
        expect(p.options, `${id} · ${p.nom} : le défaut doit figurer parmi les options`)
          .toContain(String(p.defaut));
      }
    }
  });
});
