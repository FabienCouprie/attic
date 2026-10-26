// plugins/separateur-canaux.test.ts — Le séparateur rend un canal par sortie, et ne jette rien.
//
// ═══ LE DÉFAUT QUE CES CAS GARDENT, ET IL A ÉTÉ MESURÉ ═══
//
// Le séparateur ne connaissait que la stéréo. Sur un tampon à SIX canaux il prenait les deux
// premiers et jetait les quatre autres en silence, son message annonçant « Gauche + Droite ·
// 44100 Hz ». Et ce n'était pas théorique : le sous-type `stereo` de son port d'entrée est
// DÉCORATIF, le type de flux `audio` ne déclarant aucune règle de sous-types. N'importe quel audio
// se branche sur n'importe quel port audio, et ce dépôt produit du 5.1, du 7.1.4, des anneaux de
// seize et de l'ambisonie d'ordre trois.
//
// LES TROIS CAS D'AVANT NE POUVAIENT PAS LE VOIR : ils n'éprouvaient que du stéréo, du mono et
// l'absence d'entrée. Ils sont gardés ici, et quatre autres les rejoignent.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";
import { etiqueter } from "../audio/multicanal";

/**
 * Un contexte d'essai. `branchees` dit quelles sorties sont câblées ; `undefined` ne pose PAS le
 * guichet, ce qui est le cas d'un appelant qui ne peut rien en dire.
 */
function ctx(entrees: unknown[], branchees?: number[]) {
  const base = {
    entree: (idx: number) => entrees[idx],
    entrees: () => entrees,
    paramTexte: (_nom: string, def: string) => def,
    paramNombre: (_nom: string, def: number) => def,
    onProgress: () => {},
    noeud: { data: {} },
    runtime: null,
  };
  return branchees ? { ...base, sortieBranchee: (r: number) => branchees.includes(r) } : base;
}

const def = () => registre.trouverDef("separateur-canaux")!;

/** Un tampon dont chaque canal porte sa propre valeur constante : `canal + 1`. */
function tampon(canaux: number, len = 8, sampleRate = 44100) {
  const b = new AudioBuffer({ numberOfChannels: canaux, length: len, sampleRate });
  for (let c = 0; c < canaux; c++) b.getChannelData(c).fill(c + 1);
  return b;
}

const premiers = (r: { valeurs: unknown[] }) =>
  r.valeurs.map((v) => (v instanceof AudioBuffer ? v.getChannelData(0)[0] : null));

describe("separateur-canaux", () => {
  it("sépare un stéréo en deux mono", async () => {
    const stereo = new AudioBuffer({ numberOfChannels: 2, length: 10, sampleRate: 44100 });
    const l = stereo.getChannelData(0), r = stereo.getChannelData(1);
    for (let i = 0; i < 10; i++) { l[i] = i; r[i] = -i; }
    const res = await def().executer(ctx([stereo]) as never);
    const gauche = res.valeurs[0] as AudioBuffer, droite = res.valeurs[1] as AudioBuffer;
    expect(gauche.numberOfChannels).toBe(1);
    expect(droite.numberOfChannels).toBe(1);
    expect(gauche.length).toBe(stereo.length);
    expect(gauche.getChannelData(0)).toEqual(stereo.getChannelData(0));
    expect(droite.getChannelData(0)).toEqual(stereo.getChannelData(1));
    // Les quatorze autres restent vides : un stéréo n'en remplit que deux.
    expect(res.valeurs.slice(2).every((v) => v === null)).toBe(true);
  });

  it("UN SIX CANAUX SORT SUR SIX SORTIES, ET PLUS SUR DEUX", async () => {
    // ═══ LE CAS QUI AURAIT ATTRAPÉ LE DÉFAUT ═══
    //
    // L'ancien séparateur rendait [1, 2] et jetait 3, 4, 5, 6 sans un mot. Chaque canal porte ici sa
    // valeur, si bien qu'une permutation ou une perte se lit directement.
    const res = await def().executer(ctx([tampon(6)]) as never);
    expect(premiers(res).slice(0, 6), [
      "",
      "LE SÉPARATEUR NE REND PLUS UN CANAL PAR SORTIE.",
      "",
      "C'est le défaut fondateur de ce composant : il ne connaissait que la stéréo et jetait les",
      "canaux suivants en silence. Le sous-type « stereo » de son port d'entrée ne protège de rien,",
      "le type de flux audio ne déclarant aucune règle de sous-types.",
      "",
    ].join("\n")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(res.valeurs).toHaveLength(16);
    expect(String(res.message)).toContain("6 canaux");
  });

  it("ET IL NOMME LES CANAUX QUAND LA DISPOSITION EST DÉCLARÉE", async () => {
    // Le nom d'une sortie ne peut pas suivre ce qu'on y branche : un port est statique. La
    // correspondance passe donc par le message, qui est écrit à l'exécution.
    const cinqUn = etiqueter(tampon(6), "5.1");
    const res = await def().executer(ctx([cinqUn]) as never);
    const m = String(res.message);
    expect(m).toContain("5.1");
    expect(m, "l'ordre du format doit être lisible sur le nœud").toContain("1=L 2=R 3=C 4=LFE 5=Ls 6=Rs");
  });

  it("ET IL DIT CE QU'IL LAISSE DE CÔTÉ AU-DELÀ DE SEIZE SORTIES", async () => {
    // Seize est le plus grand nombre de canaux qu'une disposition de ce dépôt déclare. Au-delà, il
    // n'y a plus de sortie où mettre un canal, et c'est la seule perte qui subsiste : elle se dit.
    const res = await def().executer(ctx([tampon(20)]) as never);
    expect(premiers(res)[15]).toBe(16);
    expect(String(res.message), [
      "",
      "DES CANAUX SONT LAISSÉS DE CÔTÉ SANS QUE LE COMPOSANT LE DISE.",
      "",
      "C'est le silence qui faisait le défaut d'origine, pas la perte elle-même : un son à vingt",
      "canaux n'a que seize sorties où aller, et le nombre ignoré doit paraître sur le nœud.",
      "",
    ].join("\n")).toContain("4 canaux au-delà de la 16e sortie");
  });

  it("NE CALCULE QUE LES SORTIES BRANCHÉES", async () => {
    // Les seize canaux d'un son de trois minutes font un demi-gigaoctet. Le moteur sait quelles
    // sorties sont câblées, et poser la question met le câblage aval dans la clé de cache de ce
    // nœud : c'est le prix, et il est voulu.
    const res = await def().executer(ctx([tampon(6)], [0, 3]) as never);
    expect(premiers(res).slice(0, 6)).toEqual([1, null, null, 4, null, null]);
  });

  it("et sans guichet des sorties, il rend tout", async () => {
    // UN APPELANT QUI NE PEUT PAS DIRE CE QUI EST CÂBLÉ DOIT RECEVOIR LES CANAUX, et non le vide.
    // C'est l'inverse du choix de la sortie d'appoint de `sortie-audio.ts`, dont le calcul est cher
    // et facultatif : ici le calcul est une recopie, et rendre le vide serait une panne muette.
    const res = await def().executer(ctx([tampon(4)]) as never);
    expect(premiers(res).slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it("duplique un signal mono sur... la première sortie seulement", async () => {
    // ═══ CE CAS A CHANGÉ D'ATTENTE, ET IL FAUT LE DIRE ═══
    //
    // Il exigeait qu'un mono sorte sur LES DEUX sorties, ce qui avait un sens quand elles
    // s'appelaient « Gauche » et « Droite » : séparer un mono, c'était le dédoubler. Avec une sortie
    // par canal, un son à un canal remplit une sortie. Dédoubler serait fabriquer un canal qui
    // n'existe pas, et le composant qui dédouble un mono en stéréo est un autre travail.
    const mono = new AudioBuffer({ numberOfChannels: 1, length: 8, sampleRate: 48000 });
    const data = mono.getChannelData(0);
    for (let i = 0; i < 8; i++) data[i] = i * 0.5;
    const res = await def().executer(ctx([mono]) as never);
    expect((res.valeurs[0] as AudioBuffer).getChannelData(0)).toEqual(data);
    expect(res.valeurs[1], "la deuxième sortie n'a pas de canal à porter").toBeNull();
  });

  it("déclare son erreur sans entrée audio, au lieu de compter sur le filet du moteur", async () => {
    // LE FILET « TOUT-NULL » NE VAUT PLUS POUR CE COMPOSANT : il déclare `sortieNullePermise`, sans
    // quoi un séparateur dont rien n'est encore câblé paraîtrait en erreur. L'absence d'entrée se
    // dit donc en toutes lettres.
    const res = await def().executer(ctx([]) as never);
    expect(res.valeurs.every((v) => v === null)).toBe(true);
    expect((res as { erreur?: boolean }).erreur).toBe(true);
  });

  it("et un canal rendu est une COPIE, non une vue sur la mémoire du tampon d'entrée", async () => {
    // `getChannelData` rend une vue sur de la mémoire native. Garder une vue sans son tampon est un
    // piège que ce dépôt a déjà payé : le tampon d'entrée peut être libéré par l'économie de
    // mémoire alors que les canaux rendus circulent encore.
    const source = tampon(2);
    const res = await def().executer(ctx([source]) as never);
    const gauche = res.valeurs[0] as AudioBuffer;
    source.getChannelData(0).fill(99);
    expect(gauche.getChannelData(0)[0], "le canal rendu ne doit pas suivre l'entrée").toBe(1);
  });
});
