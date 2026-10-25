// audio/video-essai.test.ts — Le film d'essai est un vrai film, relu comme un decodeur le ferait.
//
// POURQUOI CES CAS, ET CE QU'ILS EMPECHENT. Une piece enregistree en base64 est la chose la plus
// facile a casser sans le voir : un caractere perdu a la copie, et il reste un fichier de la bonne
// taille a peu pres, qui ne se decode plus. Rien ne le dirait avant qu'un composant ne reponde
// « aucune image dans ce fichier » — et l'on accuserait le composant.
//
// LA VERIFICATION QUI COMPTE EST DONC CELLE DU DEPOT LUI-MEME : `ouvrirVideo`, la fonction que
// `separer-image-son` emploie. Si elle y trouve ses deux pistes et ses bonnes dimensions, le film
// est bon pour tout ce qui le lira.
import { describe, expect, it } from "vitest";

import { videoDEssai, videoDEssaiOctets } from "./video-essai";
import { ouvrirVideo } from "./video-sortie";

/** La signature EBML, par laquelle tout Matroska et tout WebM commence. */
const EBML = [0x1a, 0x45, 0xdf, 0xa3];

describe("le film d'essai", () => {
  it("commence par la signature EBML, celle de tout WebM", () => {
    const o = videoDEssaiOctets();
    expect([...o.slice(0, 4)]).toEqual(EBML);
    // La taille est ecrite ici pour qu'une copie tronquee tombe : un base64 ampute rend des octets
    // en moins sans rien dire.
    expect(o.length).toBe(6041);
  });

  it("et il annonce son format dans son en-tete", () => {
    // `webm` figure en clair dans le DocType EBML : c'est ce qui distingue un WebM d'un Matroska.
    const tete = String.fromCharCode(...videoDEssaiOctets().slice(0, 64));
    expect(tete).toContain("webm");
  });

  it("arrive dans le `File` qu'un port video attend", async () => {
    const f = videoDEssai();
    expect(f.name).toBe("essai.webm");
    expect(f.type).toBe("video/webm");
    expect(f.size).toBe(6041);
    expect([...new Uint8Array(await f.arrayBuffer()).slice(0, 4)]).toEqual(EBML);
  });

  it("ET IL EST LE MEME DEUX FOIS : deux empreintes ne se comparent pas autrement", () => {
    const a = videoDEssaiOctets(), b = videoDEssaiOctets();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(`octet ${i} differe`);
  });

  it("LE LECTEUR DU DEPOT Y TROUVE SES DEUX PISTES, et c'est le seul cas qui prouve quelque chose", async () => {
    // `ouvrirVideo` est exactement ce que `separer-image-son` appelle. Les deux pistes sont
    // necessaires : un film MUET rend un son vide, et le noeud le dit — ce qui ne prouverait rien
    // de son decodage audio.
    const v = await ouvrirVideo(await videoDEssai().arrayBuffer());
    expect(v.pisteVideo, "sans piste video, « separer-image-son » refuse le fichier").not.toBeNull();
    expect(v.pisteAudio, "sans piste audio, la moitie « son » ne prouverait rien").not.toBeNull();
    expect(v.largeur).toBe(64);
    expect(v.hauteur).toBe(64);
    expect(v.dureeSec, "seize images a vingt-quatre par seconde").toBeGreaterThan(0.3);
    expect(v.dureeSec).toBeLessThan(2);
  });
});
