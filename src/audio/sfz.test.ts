// audio/sfz.test.ts — Relire du SFZ, et le prouver par un ALLER-RETOUR.
//
// Un analyseur de format se teste mal sur des exemples inventés : on écrit le fichier qu'on sait
// lire. Ici nous disposons de l'autre bout de la chaîne — `versSfz`, l'exportateur d'Attic —, et le
// test qui compte lui donne une banque, relit le texte produit, et vérifie que la banque reconstruite
// couvre les mêmes touches avec les mêmes racines et les mêmes boucles. Si l'écriture ou la lecture
// dérive, l'aller-retour le dit.
//
// Le reste des tests vient de fichiers RÉELS, et chacun correspond à un piège du format : les
// espaces dans les noms de fichiers, l'héritage des opcodes, les noms de notes, `default_path`, les
// couches de vélocité. La hauteur jouée, elle, est MESURÉE au suiveur de hauteur : une erreur de
// racine ou de désaccord s'y voit, là où une comparaison de nombres ne fait que répéter le calcul.
import "./polyfill-audiobuffer";
import { describe, expect, it } from "vitest";
import {
  analyserOpcodes, analyserSfz, banqueDepuisSfz, chargerSfz, cheminsAChargerSfz, dossierDe,
  estKitSfz, noteSfz, resoudreChemin,
} from "./sfz";
import {
  NOTE_DO8, NOTE_LA0, choisirZone, construireBanque, nomEchantillon, rendreNotes, versSfz,
  voixPourNote, type Banque,
} from "./clavier-banque";
import { hauteurMediane, suivreHauteur } from "./hauteur";

const SR = 16000;
const hertz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Un son harmonique à une hauteur donnée. */
function sonSource(dureeSec: number, note: number): AudioBuffer {
  const n = Math.round(dureeSec * SR);
  const audio = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: SR });
  const d = audio.getChannelData(0);
  const f = hertz(note);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    d[i] = 0.6 * Math.min(1, t / 0.005) * (Math.sin(2 * Math.PI * f * t) + Math.sin(4 * Math.PI * f * t) / 2);
  }
  return audio;
}

/** Un échantillon quelconque, quand seul le nombre d'échantillons compte. */
const audioVide = (longueur: number): AudioBuffer =>
  new AudioBuffer({ numberOfChannels: 1, length: longueur, sampleRate: SR });

describe("l'aller-retour avec notre propre exportateur", () => {
  const banqueSource = (): Banque => construireBanque(sonSource(0.3, 57), {
    racineSource: 57, largeur: 2, transposer: (a) => a, suiviTouche: 0, boucle: true, boucleDebut: 0.5,
  });

  it("retrouve autant de régions que la banque avait de zones, aux mêmes bornes", () => {
    const banque = banqueSource();
    const sfz = analyserSfz(versSfz(banque, { dossier: "ma-banque" }));
    expect(sfz.problemes).toEqual([]);
    expect(sfz.regions.length).toBe(banque.zones.length);
    for (const z of banque.zones) {
      const r = sfz.regions.find((x) => x.racine === z.racine);
      expect(r, `zone ${z.racine}`).toBeDefined();
      expect(r!.lokey).toBe(z.basse);
      expect(r!.hikey).toBe(z.haute);
      expect(r!.sample).toBe(`ma-banque/${nomEchantillon(z)}`);
    }
  });

  it("reconstruit une banque jouable qui couvre les 88 touches une fois chacune", () => {
    const banque = banqueSource();
    const sfz = analyserSfz(versSfz(banque, { dossier: "b" }));
    // Les mêmes échantillons, indexés par le chemin qu'écrit l'exportateur : c'est ce que fera le
    // nœud après avoir lu les WAV du disque.
    const audios = new Map(banque.zones.map((z) => [`b/${nomEchantillon(z)}`, z.audio]));
    const { banque: relue, manquants, couchesEcartees } = banqueDepuisSfz(sfz, audios);
    expect(manquants).toEqual([]);
    expect(couchesEcartees).toBe(0);
    expect(relue.zones.length).toBe(banque.zones.length);
    expect(relue.noteBasse).toBe(NOTE_LA0);
    expect(relue.noteHaute).toBe(NOTE_DO8);
    expect(relue.largeur).toBe(banque.largeur);
    // Touche par touche, la zone choisie doit être la même dans les deux banques : c'est ce qui
    // garantit qu'on entendra la même chose qu'à l'export.
    for (let n = NOTE_LA0; n <= NOTE_DO8; n++) {
      expect(choisirZone(relue, n)!.racine, `touche ${n}`).toBe(choisirZone(banque, n)!.racine);
    }
  });

  it("retrouve la boucle de maintien, aux mêmes échantillons", () => {
    const banque = banqueSource();
    const sfz = analyserSfz(versSfz(banque, { dossier: "b" }));
    const audios = new Map(banque.zones.map((z) => [`b/${nomEchantillon(z)}`, z.audio]));
    const relue = banqueDepuisSfz(sfz, audios).banque;
    for (const z of banque.zones) {
      const r = relue.zones.find((x) => x.racine === z.racine)!;
      expect(r.boucle?.debut).toBe(z.boucle!.debut);
      expect(r.boucle?.fin).toBe(z.boucle!.fin);
    }
  });

  it("n'invente pas de boucle quand la banque exportée n'en avait pas", () => {
    const sans = construireBanque(sonSource(0.3, 57), {
      racineSource: 57, transposer: (a) => a, suiviTouche: 0, boucle: false,
    });
    const sfz = analyserSfz(versSfz(sans, { dossier: "b" }));
    const audios = new Map(sans.zones.map((z) => [`b/${nomEchantillon(z)}`, z.audio]));
    const relue = banqueDepuisSfz(sfz, audios).banque;
    expect(relue.zones.every((z) => z.boucle === undefined)).toBe(true);
  });

  it("relit le relâchement de l'enveloppe globale", () => {
    const sfz = analyserSfz(versSfz(banqueSource(), { dossier: "b", relachement: 0.45 }));
    expect(sfz.relachement).toBeCloseTo(0.45, 3);
  });
});

describe("les pièges du format", () => {
  it("garde un nom de fichier CONTENANT DES ESPACES — la valeur court jusqu'au prochain opcode", () => {
    const sfz = analyserSfz("<region>\nsample=Grand Piano C4 forte.wav lokey=58 hikey=62 pitch_keycenter=60\n");
    expect(sfz.regions[0].sample).toBe("Grand Piano C4 forte.wav");
    expect(sfz.regions[0].lokey).toBe(58);
    expect(sfz.regions[0].hikey).toBe(62);
  });

  it("rend les clés en minuscules, valeur non touchée", () => {
    const o = analyserOpcodes("SAMPLE=Do4.wav LoKey=60");
    expect(o.get("sample")).toBe("Do4.wav");
    expect(o.get("lokey")).toBe("60");
  });

  it("accepte les opcodes sur plusieurs lignes, et plusieurs par ligne", () => {
    const a = analyserSfz("<region> sample=a.wav lokey=60 hikey=60");
    const b = analyserSfz("<region>\n sample=a.wav\n lokey=60\n hikey=60\n");
    expect(b.regions).toEqual(a.regions);
  });

  it("tolère les espaces autour du signe égal", () => {
    const sfz = analyserSfz("<region> sample = a.wav lokey = 60 hikey=60");
    expect(sfz.regions[0].sample).toBe("a.wav");
    expect(sfz.regions[0].lokey).toBe(60);
  });

  it("hérite de <global>, <master> et <group>, le plus proche gagnant", () => {
    const sfz = analyserSfz(`
      <global> ampeg_release=0.5 volume=-3
      <master> loop_mode=loop_sustain
      <group> hikey=64 volume=-6
      <region> sample=a.wav lokey=60 pitch_keycenter=60
      <region> sample=b.wav lokey=65 hikey=70 pitch_keycenter=67 volume=0
    `);
    expect(sfz.regions[0].hikey).toBe(64);
    expect(sfz.regions[0].volume).toBe(-6);        // le groupe, plus proche que le global
    expect(sfz.regions[0].modeBoucle).toBe("loop_sustain"); // hérité du master
    expect(sfz.regions[1].volume).toBe(0);         // la région elle-même, plus proche que le groupe
    expect(sfz.regions[1].hikey).toBe(70);
    expect(sfz.relachement).toBeCloseTo(0.5, 6);
  });

  it("repart à zéro à chaque nouveau <group> : un opcode ne fuit pas d'un groupe au suivant", () => {
    const sfz = analyserSfz(`
      <group> volume=-12
      <region> sample=a.wav key=60
      <group> lokey=70 hikey=72
      <region> sample=b.wav pitch_keycenter=71
    `);
    expect(sfz.regions[0].volume).toBe(-12);
    expect(sfz.regions[1].volume).toBe(0);
  });

  it("lit les noms de notes comme le format les définit — do4 = 60", () => {
    expect(noteSfz("c4")).toBe(60);
    expect(noteSfz("C4")).toBe(60);
    expect(noteSfz("a0")).toBe(NOTE_LA0);
    expect(noteSfz("c8")).toBe(NOTE_DO8);
    expect(noteSfz("c#3")).toBe(49);
    expect(noteSfz("db3")).toBe(49);
    expect(noteSfz("c-1")).toBe(0);
    expect(noteSfz("60")).toBe(60);
    expect(noteSfz("bonjour")).toBeNull();
    expect(noteSfz("200")).toBeNull();
  });

  it("mélange noms de notes et nombres dans un même fichier", () => {
    const sfz = analyserSfz("<region> sample=a.wav lokey=c4 hikey=64 pitch_keycenter=e4");
    expect(sfz.regions[0].lokey).toBe(60);
    expect(sfz.regions[0].hikey).toBe(64);
    expect(sfz.regions[0].racine).toBe(64);
  });

  it("traite `key` comme la façon courte d'écrire une région d'une seule touche", () => {
    const r = analyserSfz("<region> sample=a.wav key=d#4").regions[0];
    expect([r.lokey, r.hikey, r.racine]).toEqual([63, 63, 63]);
  });

  it("plie `transpose` dans la racine : jouer la touche n transposée de t revient à jouer n+t", () => {
    const r = analyserSfz("<region> sample=a.wav key=60 transpose=12").regions[0];
    expect(r.racine).toBe(48);
  });

  it("supprime les commentaires, y compris en fin de ligne d'opcodes", () => {
    const sfz = analyserSfz(`
      // un commentaire d'en-tête
      <region> sample=a.wav key=60 // et la zone du do central
    `);
    expect(sfz.regions.length).toBe(1);
    expect(sfz.regions[0].sample).toBe("a.wav");
  });

  it("substitue les #define, les plus longs d'abord", () => {
    const sfz = analyserSfz(`
      #define $RACINE 60
      #define $RACINEHAUTE 72
      <region> sample=a.wav key=$RACINE
      <region> sample=b.wav key=$RACINEHAUTE
    `);
    expect(sfz.regions.map((r) => r.racine)).toEqual([60, 72]);
  });

  it("SIGNALE un #include au lieu de le suivre en silence", () => {
    const sfz = analyserSfz('#include "regions.sfz"\n<region> sample=a.wav key=60');
    expect(sfz.problemes).toContainEqual({ code: "include", detail: "regions.sfz" });
    expect(sfz.regions.length).toBe(1);
  });

  it("collecte les opcodes qu'il ne sait pas traduire, sans les répéter", () => {
    const sfz = analyserSfz(`
      <region> sample=a.wav key=60 pan=-30 fil_cutoff=800 ampeg_attack=0.01
      <region> sample=b.wav key=61 pan=30
    `);
    expect(sfz.ignores).toEqual(["pan", "fil_cutoff", "ampeg_attack"]);
  });

  it("dit qu'un fichier n'a aucune région, plutôt que de rendre une banque vide sans raison", () => {
    const sfz = analyserSfz("// rien que des commentaires\n<global> volume=0\n");
    expect(sfz.problemes).toContainEqual({ code: "aucuneRegion", detail: "" });
  });

  it("écarte une région sans échantillon et le dit", () => {
    const sfz = analyserSfz("<region> key=60\n<region> sample=b.wav key=61");
    expect(sfz.regions.length).toBe(1);
    expect(sfz.problemes[0].code).toBe("sansEchantillon");
  });

  it("lit les opcodes de boucle de la version 1 comme ceux de la version 2", () => {
    const v1 = analyserSfz("<region> sample=a.wav key=60 loopmode=loop_sustain loopstart=100 loopend=900").regions[0];
    const v2 = analyserSfz("<region> sample=a.wav key=60 loop_mode=loop_sustain loop_start=100 loop_end=900").regions[0];
    expect(v1).toEqual(v2);
  });
});

describe("les chemins", () => {
  it("préfixe `default_path` et convertit les antislashs", () => {
    const sfz = analyserSfz("<control> default_path=Samples\\Piano\\\n<region> sample=C4.wav key=60");
    expect(sfz.cheminParDefaut).toBe("Samples\\Piano\\");
    expect(resoudreChemin("E:/sons/piano", sfz.cheminParDefaut, sfz.regions[0].sample))
      .toBe("E:/sons/piano/Samples/Piano/C4.wav");
  });

  it("laisse un chemin absolu tranquille", () => {
    expect(resoudreChemin("E:/sons", "Samples/", "D:/autre/a.wav")).toBe("D:/autre/a.wav");
    expect(resoudreChemin("E:/sons", "Samples/", "/usr/share/a.wav")).toBe("/usr/share/a.wav");
  });

  it("résout sans dossier de base ni chemin par défaut", () => {
    expect(resoudreChemin("", "", "a.wav")).toBe("a.wav");
    expect(resoudreChemin("E:/sons", "", "./a.wav")).toBe("E:/sons/a.wav");
  });

  it("trouve le dossier d'un fichier, quelles que soient les barres", () => {
    expect(dossierDe("E:\\sons\\piano\\banque.sfz")).toBe("E:/sons/piano");
    expect(dossierDe("/home/f/banque.sfz")).toBe("/home/f");
    expect(dossierDe("banque.sfz")).toBe("");
  });

  it("ne demande qu'une fois un fichier partagé par plusieurs régions", () => {
    const sfz = analyserSfz(`
      <region> sample=a.wav lokey=60 hikey=60 lovel=0 hivel=63
      <region> sample=a.wav lokey=60 hikey=60 lovel=64 hivel=127
      <region> sample=b.wav key=61
    `);
    expect(cheminsAChargerSfz(sfz, "d")).toEqual(["d/a.wav", "d/b.wav"]);
  });
});

describe("la banque reconstruite", () => {
  it("GARDE les deux couches de vélocité, et joue celle qui convient", () => {
    // Avant, la plus forte était retenue et l'autre comptée : un piano joué doucement sonnait dur,
    // un échantillon forte baissé restant un échantillon forte.
    const sfz = analyserSfz(`
      <region> sample=doux.wav lokey=60 hikey=60 pitch_keycenter=60 lovel=0 hivel=63
      <region> sample=fort.wav lokey=60 hikey=60 pitch_keycenter=60 lovel=64 hivel=127
    `);
    const audios = new Map([["doux.wav", audioVide(100)], ["fort.wav", audioVide(200)]]);
    const { banque, couchesEcartees, couches } = banqueDepuisSfz(sfz, audios);
    expect(couchesEcartees).toBe(0);
    expect(couches).toBe(2);
    expect(banque.couches).toBe(2);
    expect(banque.zones.length).toBe(2);
    // La longueur de l'échantillon sert de marque : 100 pour la couche douce, 200 pour la forte.
    expect(voixPourNote(banque, 60, 30)!.zone.audio.length).toBe(100);
    expect(voixPourNote(banque, 60, 100)!.zone.audio.length).toBe(200);
  });

  it("n'écarte que les VRAIS doublons : mêmes touches ET même vélocité", () => {
    const sfz = analyserSfz(`
      <region> sample=a.wav key=60 lovel=0 hivel=63
      <region> sample=b.wav key=60 lovel=0 hivel=63
      <region> sample=c.wav key=60 lovel=64 hivel=127
    `);
    const audios = new Map([["a.wav", audioVide(100)], ["b.wav", audioVide(150)], ["c.wav", audioVide(200)]]);
    const { banque, couchesEcartees } = banqueDepuisSfz(sfz, audios);
    expect(couchesEcartees).toBe(1);
    expect(banque.zones.length).toBe(2);
    expect(voixPourNote(banque, 60, 30)!.zone.audio.length).toBe(100); // la première des deux
  });

  it("liste les échantillons introuvables et garde les autres zones", () => {
    const sfz = analyserSfz("<region> sample=a.wav key=60\n<region> sample=absent.wav key=61");
    const { banque, manquants } = banqueDepuisSfz(sfz, new Map([["a.wav", audioVide(100)]]));
    expect(manquants).toEqual(["absent.wav"]);
    expect(banque.zones.length).toBe(1);
  });

  it("MESURE la largeur des zones au lieu de la supposer : c'est la qualité du fichier lu", () => {
    const parOctave = analyserSfz(`
      <region> sample=a.wav lokey=54 hikey=65 pitch_keycenter=60
      <region> sample=b.wav lokey=66 hikey=77 pitch_keycenter=72
    `);
    const audios = new Map([["a.wav", audioVide(100)], ["b.wav", audioVide(100)]]);
    expect(banqueDepuisSfz(parOctave, audios).banque.largeur).toBe(6);
  });

  it("borne la boucle à l'échantillon, plutôt que de laisser un lecteur sortir du tampon", () => {
    const sfz = analyserSfz("<region> sample=a.wav key=60 loop_mode=loop_sustain loop_start=50 loop_end=99999");
    const zone = banqueDepuisSfz(sfz, new Map([["a.wav", audioVide(1000)]])).banque.zones[0];
    expect(zone.boucle!.debut).toBe(50);
    expect(zone.boucle!.fin).toBeLessThan(1000);
  });

  it("boucle quand seules les bornes sont déclarées, et pas du tout sur `no_loop`", () => {
    const bornes = analyserSfz("<region> sample=a.wav key=60 loop_start=50 loop_end=900");
    expect(banqueDepuisSfz(bornes, new Map([["a.wav", audioVide(1000)]])).banque.zones[0].boucle).toBeDefined();
    const sans = analyserSfz("<region> sample=a.wav key=60 loop_mode=no_loop loop_start=50 loop_end=900");
    expect(banqueDepuisSfz(sans, new Map([["a.wav", audioVide(1000)]])).banque.zones[0].boucle).toBeUndefined();
  });

  it("traduit `volume` en gain linéaire et `tune` en cents", () => {
    const sfz = analyserSfz("<region> sample=a.wav key=60 volume=-6 tune=-25");
    const zone = banqueDepuisSfz(sfz, new Map([["a.wav", audioVide(100)]])).banque.zones[0];
    expect(zone.gain).toBeCloseTo(0.501, 3);
    expect(zone.accord).toBe(-25);
  });

  it("ne décode qu'une fois chaque fichier, même partagé par plusieurs régions", async () => {
    const texte = `
      <region> sample=a.wav lokey=60 hikey=60 lovel=0 hivel=63
      <region> sample=a.wav lokey=60 hikey=60 lovel=64 hivel=127
      <region> sample=b.wav key=61
    `;
    const demandes: string[] = [];
    const progres: string[] = [];
    const charge = await chargerSfz(texte, "d", async (c) => { demandes.push(c); return audioVide(100); },
      { surProgres: (f, t) => progres.push(`${f}/${t}`) });
    expect(demandes).toEqual(["d/a.wav", "d/b.wav"]);
    expect(progres).toEqual(["1/2", "2/2"]);
    // Trois régions, deux fichiers : les deux couches du do central partagent le même échantillon,
    // ce qui est courant quand une bibliothèque ne varie que le niveau. Elles restent deux zones.
    expect(charge.banque.zones.length).toBe(3);
    expect(charge.couches).toBe(2);
  });
});

describe("ce qu'on entend d'une banque lue", () => {
  // Ici on ne compare plus des nombres : on JOUE la banque reconstruite et on mesure la hauteur du
  // son rendu. Une racine mal lue, un désaccord dans le mauvais sens ou une zone mal choisie ne
  // ressortent d'aucune égalité d'entiers — ils s'entendent, et le suiveur de hauteur les voit.
  const cents = (mesure: number, attendu: number) => 1200 * Math.log2(mesure / attendu);
  const hauteurDe = (audio: AudioBuffer) =>
    hauteurMediane(suivreHauteur(audio.getChannelData(0), audio.sampleRate, { cadence: 100 }));

  /** Un SFZ d'une seule région, avec son échantillon, prêt à jouer. */
  function banqueDUneRegion(opcodes: string, racineSon: number) {
    const sfz = analyserSfz(`<region> sample=a.wav ${opcodes}`);
    return banqueDepuisSfz(sfz, new Map([["a.wav", sonSource(0.5, racineSon)]])).banque;
  }

  it("joue la note demandée à la bonne hauteur, à travers tout le fichier SFZ", () => {
    // Une région large, comme en écrivent les bibliothèques économes : ±6 demi-tons autour du la3.
    const banque = banqueDUneRegion("lokey=51 hikey=63 pitch_keycenter=57", 57);
    for (const note of [51, 57, 63]) {
      const rendu = rendreNotes([{ note, velocite: 100, debut: 0, fin: 0.3 }], banque, { volume: 0.9 });
      const mesuree = hauteurDe(rendu);
      expect(Math.abs(cents(mesuree, hertz(note))), `note ${note} : ${mesuree.toFixed(1)} Hz`).toBeLessThan(20);
    }
  });

  it("applique `tune` dans le bon sens : un tune de -100 cents descend d'un demi-ton", () => {
    const juste = banqueDUneRegion("key=57", 57);
    const desaccorde = banqueDUneRegion("key=57 tune=-100", 57);
    const h1 = hauteurDe(rendreNotes([{ note: 57, velocite: 100, debut: 0, fin: 0.3 }], juste, {}));
    const h2 = hauteurDe(rendreNotes([{ note: 57, velocite: 100, debut: 0, fin: 0.3 }], desaccorde, {}));
    expect(cents(h1, hertz(57))).toBeLessThan(20);
    expect(cents(h2, h1)).toBeGreaterThan(-115);
    expect(cents(h2, h1)).toBeLessThan(-85);
  });

  it("donne au jeu en direct exactement le rapport du rendu hors ligne", () => {
    // La même fonction sert aux deux : ce test verrouille l'égalité, car une divergence de quelques
    // cents entre ce qu'on entend au clavier et ce que rend le graphe ne s'entend pas à l'oreille.
    const banque = banqueDUneRegion("lokey=51 hikey=63 pitch_keycenter=57 tune=-25", 57);
    const voix = voixPourNote(banque, 61, 100, 1)!;
    expect(voix.ratio).toBeCloseTo(Math.pow(2, 4 / 12 - 25 / 1200), 10);
    const rendu = rendreNotes([{ note: 61, velocite: 100, debut: 0, fin: 0.3 }], banque, { volume: 1 });
    const attendue = hertz(57) * voix.ratio;
    expect(Math.abs(cents(hauteurDe(rendu), attendue))).toBeLessThan(15);
  });

  it("baisse bien le niveau quand la région déclare un volume négatif", () => {
    const crete = (b: AudioBuffer) => {
      let c = 0; for (const v of b.getChannelData(0)) c = Math.max(c, Math.abs(v)); return c;
    };
    const fort = banqueDUneRegion("key=57", 57);
    const doux = banqueDUneRegion("key=57 volume=-12", 57);
    const note = [{ note: 57, velocite: 127, debut: 0, fin: 0.3 }];
    const rapport = crete(rendreNotes(note, fort, { volume: 1 })) / crete(rendreNotes(note, doux, { volume: 1 }));
    expect(rapport).toBeGreaterThan(3.5);   // -12 dB = un facteur 4
    expect(rapport).toBeLessThan(4.5);
  });
});

describe("un KIT de percussion, où une touche est un son et non une hauteur", () => {
  // CE QUI A ÉTÉ MESURÉ AVANT CE CODE, sur un vrai kit chargé comme une banque de hauteurs : la
  // touche 37, absente du kit, jouait la GROSSE CAISSE un demi-ton plus haut (×1,059), et la touche
  // 60 le CRASH à ×1,888. Une banque de hauteurs cherche toujours « la zone la plus proche » ; un kit
  // n'a pas de plus proche qui ait un sens. Les tests ci-dessous verrouillent les deux différences :
  // pas de repli, pas de transposition.
  const KIT = `
    <region> sample=kick.wav key=36
    <region> sample=snare.wav key=38
    <region> sample=hatC.wav key=42
    <region> sample=crash.wav key=49
  `;
  const KIT_EXPLICITE = `
    <global> pitch_keytrack=0
    <region> sample=kick.wav lokey=35 hikey=36 pitch_keycenter=36
    <region> sample=snare.wav lokey=37 hikey=40 pitch_keycenter=38
  `;
  const ETALE = `
    <region> sample=a.wav lokey=51 hikey=63 pitch_keycenter=57
    <region> sample=b.wav lokey=64 hikey=76 pitch_keycenter=70
  `;
  const audiosKit = () => new Map(["kick.wav", "snare.wav", "hatC.wav", "crash.wav"]
    .map((n) => [n, audioVide(512)] as const));

  it("se reconnaît à ses régions d'une seule touche", () => {
    expect(estKitSfz(analyserSfz(KIT).regions)).toBe(true);
    expect(estKitSfz(analyserSfz(ETALE).regions)).toBe(false);
  });

  it("se reconnaît aussi quand il le DÉCLARE, même avec des régions larges", () => {
    // `pitch_keytrack=0` est la façon explicite de dire « ne transpose pas avec la touche ».
    expect(estKitSfz(analyserSfz(KIT_EXPLICITE).regions)).toBe(true);
  });

  it("une seule région ne fait pas un kit : c'est un son étalé, et le repli y est voulu", () => {
    expect(estKitSfz(analyserSfz("<region> sample=a.wav key=60").regions)).toBe(false);
  });

  it("NE JOUE RIEN sur une touche sans son, au lieu d'en transposer une autre", () => {
    const banque = banqueDepuisSfz(analyserSfz(KIT), audiosKit()).banque;
    expect(banque.kit).toBe(true);
    expect(choisirZone(banque, 36)?.racine).toBe(36);
    expect(choisirZone(banque, 37)).toBeNull();   // la touche qui jouait la grosse caisse +1 demi-ton
    expect(choisirZone(banque, 60)).toBeNull();   // celle qui jouait le crash à ×1,888
    expect(voixPourNote(banque, 37)).toBeNull();
  });

  it("joue chaque son TEL QU'IL EST, sans rééchantillonnage", () => {
    const banque = banqueDepuisSfz(analyserSfz(KIT_EXPLICITE), new Map([
      ["kick.wav", audioVide(512)], ["snare.wav", audioVide(512)],
    ])).banque;
    // La caisse claire couvre 37 à 40 avec sa racine à 38 : sans `pitch_keytrack=0`, la touche 40
    // sortirait à ×1,122. Elle doit sortir à 1,000.
    for (const note of [37, 38, 39, 40]) {
      expect(voixPourNote(banque, note)!.ratio, `touche ${note}`).toBeCloseTo(1, 10);
    }
    expect(voixPourNote(banque, 35)!.ratio).toBeCloseTo(1, 10);
  });

  it("le mode imposé gagne sur la détection, dans les deux sens", () => {
    // Un kit lu comme une banque de hauteurs : le repli revient, et c'est l'ancien comportement.
    const hauteurs = banqueDepuisSfz(analyserSfz(KIT), audiosKit(), { mode: "hauteurs" }).banque;
    expect(hauteurs.kit).toBeUndefined();
    expect(choisirZone(hauteurs, 37)?.racine).toBe(36);
    expect(voixPourNote(hauteurs, 37)!.ratio).toBeCloseTo(Math.pow(2, 1 / 12), 6);
    // Et même quand le fichier écrit « pitch_keytrack=0 », le mode imposé gagne : il décide de la
    // sémantique, le fichier ne fait qu'informer le choix automatique.
    const explicite = banqueDepuisSfz(analyserSfz(KIT_EXPLICITE), new Map([
      ["kick.wav", audioVide(512)], ["snare.wav", audioVide(512)],
    ]), { mode: "hauteurs" }).banque;
    expect(explicite.kit).toBeUndefined();
    expect(voixPourNote(explicite, 40)!.ratio).toBeCloseTo(Math.pow(2, 2 / 12), 6);
    // Un son étalé lu comme un kit : plus de repli hors de ses bornes, et plus de transposition.
    const kit = banqueDepuisSfz(analyserSfz(ETALE), new Map([
      ["a.wav", audioVide(512)], ["b.wav", audioVide(512)],
    ]), { mode: "kit" }).banque;
    expect(kit.kit).toBe(true);
    expect(choisirZone(kit, 30)).toBeNull();
    expect(voixPourNote(kit, 63)!.ratio).toBeCloseTo(1, 10);
  });

  it("CE QU'ON ENTEND : le son du kit garde sa propre hauteur sur toutes ses touches", () => {
    // Un « kick » qui est en réalité un la1 (110 Hz) : quelle que soit la touche de sa région, le
    // rendu doit sortir à 110 Hz. C'est la mesure qui distingue un kit d'une banque de hauteurs.
    const source = sonSource(0.4, 45); // la2 = 110 Hz
    const banque = banqueDepuisSfz(analyserSfz(KIT_EXPLICITE), new Map([
      ["kick.wav", source], ["snare.wav", source],
    ])).banque;
    const hauteurDe = (audio: AudioBuffer) =>
      hauteurMediane(suivreHauteur(audio.getChannelData(0), audio.sampleRate, { cadence: 100 }));
    for (const note of [37, 40]) {
      const rendu = rendreNotes([{ note, velocite: 100, debut: 0, fin: 0.3 }], banque, { volume: 0.9 });
      const cents = 1200 * Math.log2(hauteurDe(rendu) / hertz(45));
      expect(Math.abs(cents), `touche ${note}`).toBeLessThan(20);
    }
    // Et une touche hors du kit ne fait aucun son.
    const muet = rendreNotes([{ note: 100, velocite: 100, debut: 0, fin: 0.3 }], banque, { volume: 1 });
    let crete = 0;
    for (const v of muet.getChannelData(0)) crete = Math.max(crete, Math.abs(v));
    expect(crete).toBe(0);
  });
});

describe("les couches de vélocité, mesurées", () => {
  // LA MESURE QUI COMPTE. Trois couches dont les échantillons n'ont PAS la même hauteur — 220, 440 et
  // 880 Hz — jouées sur la même touche à trois vélocités. La hauteur rendue dit laquelle a sonné, ce
  // qu'aucune comparaison de longueurs ne prouverait aussi clairement. C'est un substitut du timbre :
  // dans une vraie bibliothèque, les trois couches diffèrent par l'attaque et le spectre, pas par la
  // hauteur, mais le mécanisme de choix est le même.
  const TROIS_COUCHES = `
    <region> sample=doux.wav key=57 lovel=1 hivel=42 pitch_keytrack=0
    <region> sample=moyen.wav key=57 lovel=43 hivel=85 pitch_keytrack=0
    <region> sample=fort.wav key=57 lovel=86 hivel=127 pitch_keytrack=0
  `;
  const banqueTroisCouches = () => banqueDepuisSfz(analyserSfz(TROIS_COUCHES), new Map([
    ["doux.wav", sonSource(0.4, 45)],   // la2 = 110 Hz
    ["moyen.wav", sonSource(0.4, 57)],  // la3 = 220 Hz
    ["fort.wav", sonSource(0.4, 69)],   // la4 = 440 Hz
  ])).banque;
  const hauteurDe = (audio: AudioBuffer) =>
    hauteurMediane(suivreHauteur(audio.getChannelData(0), audio.sampleRate, { cadence: 100 }));

  it("chaque vélocité fait sonner SA couche", () => {
    const banque = banqueTroisCouches();
    expect(banque.couches).toBe(3);
    const attendu = [[20, 45], [60, 57], [110, 69]] as const;
    for (const [velocite, note] of attendu) {
      const rendu = rendreNotes([{ note: 57, velocite, debut: 0, fin: 0.3 }], banque, { volume: 1 });
      const cents = 1200 * Math.log2(hauteurDe(rendu) / hertz(note));
      expect(Math.abs(cents), `vélocité ${velocite}`).toBeLessThan(25);
    }
  });

  it("une vélocité dans un TROU de plages prend la couche la plus proche, au lieu de se taire", () => {
    // Beaucoup de fichiers laissent un trou : ici la vélocité 0 n'appartient à aucune couche, les
    // plages commençant à 1. Se taire serait pire que jouer la couche douce.
    const banque = banqueTroisCouches();
    const voix = voixPourNote(banque, 57, 0);
    expect(voix).not.toBeNull();
    expect(voix!.zone.velBasse).toBe(1);
  });

  it("le NIVEAU ne baisse plus deux fois quand le fichier le demande", () => {
    // `amp_veltrack=0` : la vélocité choisit la couche et ne touche plus au niveau. Sans cela, la
    // couche douce était en plus divisée par trois, et les notes piano disparaissaient.
    const avec = banqueDepuisSfz(analyserSfz(`
      <global> amp_veltrack=0
      <region> sample=doux.wav key=57 lovel=1 hivel=63
      <region> sample=fort.wav key=57 lovel=64 hivel=127
    `), new Map([["doux.wav", sonSource(0.4, 57)], ["fort.wav", sonSource(0.4, 57)]])).banque;
    const sans = banqueTroisCouches();
    const crete = (b: AudioBuffer) => {
      let c = 0; for (const v of b.getChannelData(0)) c = Math.max(c, Math.abs(v)); return c;
    };
    const jouer = (banque: typeof avec, velocite: number) =>
      crete(rendreNotes([{ note: 57, velocite, debut: 0, fin: 0.3 }], banque, { volume: 1 }));
    // Avec `amp_veltrack=0`, une vélocité de 20 sonne au même niveau qu'une de 120.
    expect(jouer(avec, 20)).toBeCloseTo(jouer(avec, 120), 2);
    // Sans, le niveau suit la vélocité comme il l'a toujours fait.
    expect(jouer(sans, 20)).toBeLessThan(jouer(sans, 120) * 0.5);
  });

  it("l'ALLER-RETOUR garde les couches : un fichier par couche, et les bornes réécrites", () => {
    const banque = banqueTroisCouches();
    const texte = versSfz(banque, { dossier: "b" });
    // Trois noms de fichiers DISTINCTS : sans la vélocité dans le nom, l'export écrivait un seul WAV
    // et le désignait trois fois.
    const noms = banque.zones.map((z) => nomEchantillon(z));
    expect(new Set(noms).size).toBe(3);
    expect(texte).toContain("lovel=1 hivel=42");
    expect(texte).toContain("lovel=86 hivel=127");
    // Et relu, il redonne trois couches qui se choisissent comme avant.
    const audios = new Map(banque.zones.map((z) => [`b/${nomEchantillon(z)}`, z.audio]));
    const relue = banqueDepuisSfz(analyserSfz(texte), audios).banque;
    expect(relue.couches).toBe(3);
    expect(hauteurDe(rendreNotes([{ note: 57, velocite: 20, debut: 0, fin: 0.3 }], relue, {})))
      .toBeCloseTo(hertz(45), 0);
    expect(hauteurDe(rendreNotes([{ note: 57, velocite: 110, debut: 0, fin: 0.3 }], relue, {})))
      .toBeCloseTo(hertz(69), 0);
  });

  it("une banque SANS couche se comporte exactement comme avant", () => {
    const sfz = analyserSfz("<region> sample=a.wav lokey=51 hikey=63 pitch_keycenter=57");
    const banque = banqueDepuisSfz(sfz, new Map([["a.wav", sonSource(0.4, 57)]])).banque;
    expect(banque.couches).toBeUndefined();
    expect(banque.zones[0].velBasse).toBeUndefined();
    // Le nom d'export ne porte alors aucune vélocité.
    expect(nomEchantillon(banque.zones[0])).toBe("zone-057.wav");
    // Et la vélocité ne fait que le niveau, comme toujours.
    expect(voixPourNote(banque, 57, 127, 1)!.gain).toBeCloseTo(1, 6);
    expect(voixPourNote(banque, 57, 64, 1)!.gain).toBeCloseTo(64 / 127, 6);
  });
});
