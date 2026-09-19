// audio/conformite-clavier.test.ts — « Ce MIDI se joue-t-il à deux mains ? »
//
// Les cas sont FABRIQUÉS, et c'est voulu : la bonne réponse est alors connue avant de lancer le
// test. Un accord de onze notes n'est pas jouable parce qu'il y a onze notes et dix doigts ; do
// et le do trois octaves plus haut ne sont pas tenables d'une main parce qu'ils sont à
// trente-six demi-tons. Ces vérités-là ne dépendent d'aucun fichier.
import { describe, expect, it } from "vitest";
import {
  CANAL_PERCUSSION, NOTE_AIGUE, NOTE_GRAVE,
  adapterAuClavier, analyserConformiteClavier, assignerMains, partitionDeuxMains,
  resumeConformite, type NoteJouee,
} from "./conformite-clavier";
import { NOTE_MAX, NOTE_MIN } from "../ui/clavier-disposition";

const n = (note: number, debut: number, fin = debut + 0.5, canal = 0): NoteJouee =>
  ({ note, debut, fin, canal, velociete: 90 });

/** Un accord plaqué, toutes les notes au même instant. */
const accord = (hauteurs: number[], debut = 0, duree = 1): NoteJouee[] =>
  hauteurs.map((h) => n(h, debut, debut + duree));

describe("les bornes du clavier", () => {
  it("sont celles du clavier affiché — les deux définitions ne doivent pas diverger", () => {
    // L'une sert à juger, l'autre à dessiner : si elles s'écartaient, on déclarerait jouable
    // une note que le clavier ne peut pas montrer.
    expect(NOTE_GRAVE).toBe(NOTE_MIN);
    expect(NOTE_AIGUE).toBe(NOTE_MAX);
  });
});

describe("le partage entre deux mains", () => {
  it("laisse une main prendre un accord qui tient dans l'octave", () => {
    const p = partitionDeuxMains([60, 64, 67]);
    expect(p).not.toBeNull();
    expect([...p!.gauche, ...p!.droite].sort((a, b) => a - b)).toEqual([60, 64, 67]);
  });

  it("partage un accord trop large pour une seule main", () => {
    // Do 3 et do 5 sont à 24 demi-tons : aucune main ne les tient ensemble.
    const p = partitionDeuxMains([48, 52, 72, 76])!;
    expect(p.gauche).toEqual([48, 52]);
    expect(p.droite).toEqual([72, 76]);
  });

  it("refuse onze notes : il n'y a que dix doigts", () => {
    expect(partitionDeuxMains([48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65])).toBeNull();
  });

  it("refuse trois paquets éloignés, que deux mains ne peuvent pas couvrir", () => {
    // Grave, médium, aigu : il faudrait une troisième main.
    expect(partitionDeuxMains([24, 60, 96])).toBeNull();
  });

  it("refuse deux notes trop écartées pour être partagées autrement qu'une par main… et les accepte alors", () => {
    // Une note par main : c'est jouable, si loin soient-elles.
    const p = partitionDeuxMains([21, 108]);
    expect(p).toEqual({ gauche: [21], droite: [108] });
  });

  it("suit l'écart qu'on lui donne : une grande main tient la dixième", () => {
    // Quatre notes dont aucun partage ne laisse les deux côtés sous l'octave : {60,76} et
    // {80,96} font seize demi-tons chacun. Une main ordinaire renonce, une grande main tient.
    expect(partitionDeuxMains([60, 76, 80, 96])).toBeNull();
    expect(partitionDeuxMains([60, 76, 80, 96], { ecartMax: 16 })).not.toBeNull();
  });

  it("choisit le partage le plus équilibré quand plusieurs conviennent", () => {
    const p = partitionDeuxMains([60, 62, 64, 65])!;
    expect(p.gauche.length).toBe(2);
    expect(p.droite.length).toBe(2);
  });

  it("ne rend jamais des mains qui se croisent", () => {
    const p = partitionDeuxMains([55, 59, 62, 67])!;
    if (p.gauche.length && p.droite.length) {
      expect(Math.max(...p.gauche)).toBeLessThan(Math.min(...p.droite));
    }
  });
});

describe("ce que l'analyse décide", () => {
  it("compte les notes hors des 88 touches, en séparant graves et aiguës", () => {
    const c = analyserConformiteClavier([n(12, 0), n(60, 1), n(120, 2)]);
    expect(c.horsClavier.graves).toBe(1);
    expect(c.horsClavier.aigues).toBe(1);
    expect(c.jouable).toBe(false);
  });

  it("repère la percussion à son canal, et non à ses hauteurs", () => {
    // Le 36 du canal 10 est une grosse caisse, pas un do 2 : c'est le canal qui le dit.
    const c = analyserConformiteClavier([n(36, 0, 0.2, CANAL_PERCUSSION), n(38, 0.5, 0.7, CANAL_PERCUSSION)]);
    expect(c.percussion).toBe(2);
    expect(c.jouable).toBe(false);
  });

  it("relève la polyphonie maximale et l'instant où elle tombe", () => {
    const c = analyserConformiteClavier([...accord([60, 64, 67], 0), ...accord([48, 52, 55, 59, 62, 65, 69, 72, 76, 79, 83], 2)]);
    expect(c.polyphonieMax).toBe(11);
    expect(c.instantPolyphonie).toBe(2);
  });

  it("nomme les accords qu'aucune paire de mains ne peut tenir", () => {
    const c = analyserConformiteClavier(accord([24, 60, 96], 1.5));
    expect(c.injouables.length).toBe(1);
    expect(c.injouables[0].instant).toBe(1.5);
    expect(c.injouables[0].hauteurs).toEqual([24, 60, 96]);
  });

  it("déclare conforme un fichier qui l'est", () => {
    // Une main gauche en accords, une main droite en mélodie : du piano ordinaire.
    // Les accords de gauche tiennent dans l'octave : do-sol-do et fa-do-fa. Écrits d'abord en
    // do-sol-mi et fa-do-la, ils couvraient une DIXIÈME — le test les a refusés, et il avait
    // raison : une main ordinaire ne les tient pas.
    const notes = [
      ...accord([48, 55, 60], 0, 1), n(72, 0), n(74, 0.25), n(76, 0.5), n(77, 0.75),
      ...accord([53, 60, 65], 1, 1), n(79, 1), n(77, 1.25), n(76, 1.5), n(74, 1.75),
    ];
    const c = analyserConformiteClavier(notes);
    expect(c.injouables).toEqual([]);
    expect(c.horsClavier.graves + c.horsClavier.aigues).toBe(0);
    expect(c.jouable).toBe(true);
  });

  it("ne garde qu'un canal quand on le lui demande", () => {
    const notes = [n(60, 0, 0.5, 0), n(62, 0, 0.5, 1), n(64, 1, 1.5, 1)];
    expect(analyserConformiteClavier(notes).total).toBe(3);
    expect(analyserConformiteClavier(notes, { canal: 1 }).total).toBe(2);
    // Les canaux sont TOUS recensés, même quand on n'en garde qu'un : c'est ce qui permet de
    // choisir, et le fichier d'orchestre est justement celui où l'on ne sait pas quoi montrer.
    expect(analyserConformiteClavier(notes, { canal: 1 }).canaux.map((c) => c.canal)).toEqual([1, 0]);
  });
});

describe("ce que l'analyse mesure sans juger", () => {
  it("compte les notes par seconde", () => {
    const notes = Array.from({ length: 10 }, (_, i) => n(60 + i, i * 0.1, i * 0.1 + 0.05));
    const c = analyserConformiteClavier(notes);
    expect(c.duree).toBeCloseTo(0.95, 5);
    expect(c.notesParSeconde).toBeGreaterThan(9);
  });

  it("mesure la vitesse PAR MAIN, et non sur le flux entier", () => {
    // Deux mains alternées toutes les 50 ms : chaque main ne joue que toutes les 100 ms.
    const notes: NoteJouee[] = [];
    for (let i = 0; i < 8; i++) notes.push(n(i % 2 === 0 ? 40 : 80, i * 0.05, i * 0.05 + 0.04));
    const c = analyserConformiteClavier(notes);
    expect(c.intervalleMinMain).toBeCloseTo(0.1, 6);
  });

  it("retient le saut le plus dur — le plus grand rapporté au temps donné", () => {
    // Un saut de 12 demi-tons en 1 s, puis de 4 en 20 ms : le second est bien plus dur.
    const c = analyserConformiteClavier([n(60, 0, 0.1), n(72, 1, 1.1), n(76, 1.02, 1.1)]);
    expect(c.sautMax!.demiTons).toBe(4);
    expect(c.sautMax!.secondes).toBeCloseTo(0.02, 6);
  });

  it("compte les notes tenues sous d'autres, qui demandent la pédale", () => {
    // Une longue tenue pendant que la même main joue deux notes.
    const c = analyserConformiteClavier([n(60, 0, 4), n(62, 1, 1.5), n(64, 2, 2.5)]);
    expect(c.tenues).toBe(1);
  });
});

describe("l'attribution des mains", () => {
  it("partage un accord entre les deux", () => {
    const notes = accord([48, 52, 72, 76]);
    expect(assignerMains(notes)).toEqual(["gauche", "gauche", "droite", "droite"]);
  });

  it("donne une note seule à la main la plus proche", () => {
    // La gauche est restée au 48, la droite au 76 : le 50 revient à la gauche.
    const notes = [...accord([48, 76], 0), n(50, 1)];
    expect(assignerMains(notes)[2]).toBe("gauche");
  });

  it("partage au do 4 tant que rien n'a été joué", () => {
    expect(assignerMains([n(55, 0)])[0]).toBe("gauche");
    expect(assignerMains([n(65, 0)])[0]).toBe("droite");
  });

  it("reste lisible même sur un accord injouable, plutôt que d'abandonner", () => {
    const mains = assignerMains(accord([24, 60, 96]));
    expect(new Set(mains).size).toBe(2);
  });
});

describe("l'adaptation, quand elle est demandée", () => {
  it("replie les notes hors clavier par octaves, en gardant la classe de hauteur", () => {
    const r = adapterAuClavier([n(12, 0), n(120, 1)], { replier: true });
    expect(r.repliees).toBe(2);
    expect(r.notes.map((x) => x.note)).toEqual([24, 108]);
    // La classe de hauteur est intacte : c'est ce qui préserve l'harmonie.
    expect(r.notes[0].note % 12).toBe(12 % 12);
    expect(r.notes[1].note % 12).toBe(120 % 12);
  });

  it("retire plutôt que de replier quand on ne demande pas le repliement", () => {
    const r = adapterAuClavier([n(12, 0), n(60, 1)]);
    expect(r.notes.map((x) => x.note)).toEqual([60]);
    expect(r.retirees).toBe(1);
  });

  it("retire la percussion", () => {
    const r = adapterAuClavier([n(36, 0, 0.2, CANAL_PERCUSSION), n(60, 0)], { sansPercussion: true });
    expect(r.notes.map((x) => x.note)).toEqual([60]);
  });

  it("réduit la polyphonie en gardant la basse et le chant", () => {
    const r = adapterAuClavier(accord([48, 52, 55, 60, 64, 67, 72]), { polyphonieMax: 3 });
    const gardees = r.notes.map((x) => x.note).sort((a, b) => a - b);
    expect(gardees).toContain(48);
    expect(gardees).toContain(72);
    expect(gardees.length).toBe(3);
  });

  it("rend jouable ce qui ne l'était pas", () => {
    const sale = [n(12, 0), n(120, 0), n(36, 0, 0.2, CANAL_PERCUSSION), ...accord([60, 64, 67], 1)];
    const avant = analyserConformiteClavier(sale);
    expect(avant.jouable).toBe(false);
    const r = adapterAuClavier(sale, { replier: true, sansPercussion: true });
    expect(analyserConformiteClavier(r.notes).jouable).toBe(true);
  });
});

describe("le rapport", () => {
  it("dit d'abord ce qui empêche, ensuite ce qui se mesure", () => {
    const c = analyserConformiteClavier([n(12, 0), n(60, 0.5), n(64, 1)]);
    const texte = resumeConformite(c);
    expect(texte.indexOf("Empêchements")).toBeLessThan(texte.indexOf("Mesures"));
    expect(texte).toContain("hors des 88 touches");
  });

  it("le dit quand tout va bien, plutôt que de se taire", () => {
    const texte = resumeConformite(analyserConformiteClavier([n(60, 0), n(64, 1)]));
    expect(texte).toContain("Conforme");
    expect(texte).not.toContain("Empêchements");
  });

  it("parle anglais sur demande", () => {
    const texte = resumeConformite(analyserConformiteClavier([n(60, 0)]), "en");
    expect(texte).toContain("Conformant");
  });

  it("ne bute pas sur un flux vide", () => {
    expect(resumeConformite(analyserConformiteClavier([]))).toContain("Aucune note");
  });
});
