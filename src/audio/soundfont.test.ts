// audio/soundfont.test.ts — Le nom d'une banque est celui de la banque, et non de son premier preset.
//
// POURQUOI CE TEST EXISTE. Fabien a vu « Gun Shot » là où son écran annonçait par ailleurs « Yamaha
// Grand Piano », et il en a conclu que ce n'était pas un hasard. Il avait raison. Le nom de la
// banque était pris sur `presets[0]`, c'est-à-dire sur le premier preset DANS L'ORDRE DU FICHIER,
// qui n'a aucune raison d'être représentatif : dans la banque General MIDI qu'il emploie, cent
// quatre-vingt-neuf presets, le premier est « Gun Shot », programme 127. L'interface annonçait donc
// une détonation pour une banque entière, et il devenait raisonnable de croire que le moteur jouait
// autre chose que ce qu'on lui demandait.
//
// POURQUOI LE TEST NE LIT AUCUN FICHIER SOUNDFONT. Pas d'abord pour son poids — `FluidR3_GM.sf2`
// fait 141,5 Mo —, mais parce qu'il N'EST PAS DANS LE DÉPÔT : `.gitignore` exclut `public/sf2/`, que
// son commentaire décrit comme des binaires fournis par l'utilisateur. Un test qui lirait ce fichier
// passerait sur la machine où il se trouve et échouerait partout ailleurs, ce qui est pire qu'une
// absence de test. La règle de nommage est donc éprouvée sur des en-têtes RIFF construits ici, qui
// tiennent en quelques octets : c'est exactement la partie qui s'était trompée.
import { describe, expect, it } from "vitest";
import { nomDeBanqueSF2 } from "./soundfont";

/** Un morceau de fichier SF2 réduit à sa liste `INFO` : de quoi éprouver la lecture du nom. */
function enTeteSF2(nom: string | null): DataView {
  const ecrireCc = (o: number[], s: string) => { for (const c of s) o.push(c.charCodeAt(0)); };
  const ecrireUint32 = (o: number[], n: number) => o.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255);

  // Contenu de la liste INFO : « INFO » puis, s'il y a lieu, le sous-chunk INAM.
  const info: number[] = [];
  ecrireCc(info, "INFO");
  if (nom !== null) {
    const octets = [...nom].map((c) => c.charCodeAt(0));
    octets.push(0);
    if (octets.length % 2 === 1) octets.push(0); // les chunks RIFF sont alignés sur deux octets
    ecrireCc(info, "INAM");
    ecrireUint32(info, octets.length);
    info.push(...octets);
  }

  const corps: number[] = [];
  ecrireCc(corps, "sfbk");
  ecrireCc(corps, "LIST");
  ecrireUint32(corps, info.length);
  corps.push(...info);

  const tout: number[] = [];
  ecrireCc(tout, "RIFF");
  ecrireUint32(tout, corps.length);
  tout.push(...corps);
  return new DataView(new Uint8Array(tout).buffer);
}

describe("le nom d'une banque SoundFont", () => {
  it("VIENT DU CHAMP QUE LA SPÉCIFICATION LUI RÉSERVE, `INAM`", () => {
    const v = enTeteSF2("Fluid R3 GM");
    expect(nomDeBanqueSF2(v, v.byteLength)).toBe("Fluid R3 GM");
  });

  it("supporte un nom de longueur impaire, que RIFF fait suivre d'un octet de calage", () => {
    const v = enTeteSF2("Piano");
    expect(nomDeBanqueSF2(v, v.byteLength)).toBe("Piano");
  });

  it("rend la chaîne vide quand le fichier n'en porte pas, au lieu d'inventer", () => {
    // C'est ce vide qui autorise le repli sur le premier preset, et lui seul : un nom inventé ici
    // serait affiché comme s'il venait du fichier.
    const v = enTeteSF2(null);
    expect(nomDeBanqueSF2(v, v.byteLength)).toBe("");
  });

  it("ne confond pas la liste INFO avec une autre", () => {
    const v = enTeteSF2("Fluid R3 GM");
    // Une limite trop courte ne doit pas faire lire au-delà, ni jeter.
    expect(nomDeBanqueSF2(v, 12)).toBe("");
  });
});
