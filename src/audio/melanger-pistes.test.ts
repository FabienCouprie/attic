// audio/melanger-pistes.test.ts — La fréquence de sortie d'un mélange ne dépend pas de l'ordre des câbles.
//
// ═══ POURQUOI CES CAS ═══
//
// Point 5 d'une revue du dépôt, le 2026-10-25 : « `melangerPistes` prend la fréquence de la première
// entrée, c'est-à-dire de l'ordre de création des câbles. Réordonner deux câbles change la fréquence
// de sortie, et la conversion est laissée au navigateur. »
//
// VÉRIFIÉ, ET LE MÉCANISME EST PIRE QUE L'ÉNONCÉ. Les ports du mélangeur sont DYNAMIQUES : le
// premier port est le premier câble posé. Débrancher deux entrées et les rebrancher dans l'autre
// ordre changeait donc le fichier rendu — même son, même durée, autre fréquence — sans que rien ne
// le dise. Un ingénieur du son le découvre à la livraison.
//
// ET AUCUN CAS NE REGARDAIT CE COMPOSANT. `effets-montage.test.ts` éprouve `extraireZone` avec un
// `AudioBuffer` de pacotille ; `melangerPistes` passe par un vrai `OfflineAudioContext`, qu'il
// faut donc apporter.
import { describe, expect, it } from "vitest";
import { AudioBuffer, OfflineAudioContext } from "node-web-audio-api";
import { melangerPistes } from "./effets-montage";

globalThis.AudioBuffer = AudioBuffer as never;
globalThis.OfflineAudioContext = OfflineAudioContext as never;

/** Un sifflement d'une demi-seconde, à la fréquence demandée. */
function piste(frequence: number, hauteur = 441): AudioBuffer {
  const n = Math.floor(frequence * 0.5);
  const b = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: frequence });
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.sin((2 * Math.PI * hauteur * i) / frequence) * 0.5;
  return b as unknown as AudioBuffer;
}

describe("la fréquence de sortie d'un mélange", () => {
  it("EST LA PLUS HAUTE DES ENTRÉES, ET NON CELLE DE LA PREMIÈRE", async () => {
    // LA PLUS HAUTE, ET NON LA PLUS BASSE : choisir la plus basse décimerait l'entrée la plus fine,
    // et ce qui passe au-dessus de son Nyquist serait perdu pour de bon. La plus haute n'interpole
    // que les entrées plus grossières, sans rien retirer de ce qu'elles portent.
    const sortie = await melangerPistes([piste(22050), piste(48000)], 0);
    expect(sortie.sampleRate).toBe(48000);
  });

  it("ET ELLE NE CHANGE PAS QUAND ON RÉORDONNE LES CÂBLES : c'est tout le défaut relevé", async () => {
    const a = await melangerPistes([piste(22050), piste(48000)], 0);
    const b = await melangerPistes([piste(48000), piste(22050)], 0);
    expect(b.sampleRate, [
      "",
      "L'ORDRE DES CÂBLES DÉCIDE ENCORE DE LA FRÉQUENCE DE SORTIE.",
      "",
      "Les ports du mélangeur sont dynamiques : le premier port est le premier câble posé. Prendre",
      "`entrees[0].sampleRate` fait donc dépendre le fichier rendu de l'ordre où l'on a branché, ce",
      "qu'aucun écran ne montre et qu'aucun relevé ne dit.",
      "",
    ].join("\n")).toBe(a.sampleRate);
    expect(a.sampleRate).toBe(48000);
  });

  it("ET SUR DES ENTRÉES DE MÊME FRÉQUENCE, RIEN NE CHANGE : aucun graphe existant ne bouge", async () => {
    // C'est le cas ordinaire, et c'est ce qui rend cette correction sans conséquence sur ce qui
    // existe : le maximum d'une liste constante est cette constante.
    for (const f of [44100, 48000]) {
      const sortie = await melangerPistes([piste(f), piste(f), piste(f)], 0);
      expect(sortie.sampleRate).toBe(f);
    }
  });

  it("et le mélange dure aussi longtemps que sa plus longue entrée", async () => {
    // Un garde de voisinage : la fréquence décide de la LONGUEUR du rendu, et se tromper d'un facteur
    // deux sur l'une tronquerait l'autre de moitié sans rien dire.
    const courte = piste(48000);
    const longue = new AudioBuffer({ numberOfChannels: 1, length: 48000, sampleRate: 48000 });
    const sortie = await melangerPistes([courte, longue as unknown as AudioBuffer], 0);
    expect(sortie.duration).toBeCloseTo(1, 2);
  });
});
