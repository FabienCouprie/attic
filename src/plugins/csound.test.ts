// plugins/csound.test.ts — Les cinq fiches Csound que nul test ne nommait.
//
// POURQUOI CE FICHIER, ET OÙ IL REGARDE.
//
// Le rendu lui-même demande un navigateur et WebAssembly : `audio/csound.test.ts` le dit en
// ouverture, et vérifie ce qui se teste sans Csound — l'assemblage du CSD, la partition, le
// filtrage des messages. Ce qui n'était tenu par rien, c'est ce que les CINQ FICHES donnent à
// Csound : le texte qu'elles assemblent à partir des réglages, et ce qu'elles font quand il n'en
// revient rien.
//
// ON SAISIT DONC LE CSD AU PASSAGE. `rendreCsd` est remplacé le temps d'un appel, et l'on inspecte
// la chaîne qu'il aurait reçue. C'est l'endroit exact où vit le câblage : `nchnls` vient de
// « Canaux », `ksmps` de « Taille de bloc », la graine de « Graine », l'orchestre du port ou du
// réglage. Une de ces liaisons qui dérive donne un CSD parfaitement valide et un son qui n'est pas
// celui qu'on a demandé — le genre de défaut qu'aucun test du langage ne peut voir.
//
// ET LE CHEMIN D'ÉCHEC COMPTE AUTANT. Csound est un langage : l'utilisateur écrit du texte, et ce
// texte sera souvent faux. Un orchestre qui ne compile pas doit rendre un rapport lisible et non
// une exception, et c'est la moitié de l'ergonomie de ces cinq nœuds.
import "../audio/polyfill-audiobuffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notesVersFichierMidi } from "../audio/midi-ecriture";

// `vi.mock` ET NON `vi.spyOn`, et la différence n'est pas de style. Le module des fiches lie
// `rendreCsd` à l'import, de sorte que remplacer la propriété de l'espace de noms APRÈS coup ne
// change rien : mon premier essai laissait tourner le vrai rendu, qui cherchait WebAssembly,
// échouait, et faisait rendre `null` partout — quinze cas rouges pour une raison étrangère à ce
// qu'ils mesuraient. `vi.mock` est hissé avant les imports et remplace la liaison elle-même.
const appels: { csd: string; entrees: unknown[] }[] = [];
let reponse: { audio?: AudioBuffer | null; erreur?: string; messages?: string[] } = {};

vi.mock("../audio/csound", async (importOriginal) => {
  const vrai = await importOriginal<typeof import("../audio/csound")>();
  return {
    ...vrai,
    rendreCsd: async (csd: string, entrees: unknown[]) => {
      appels.push({ csd, entrees });
      // LE RÉSULTAT SIMULÉ PORTE TOUS LES CHAMPS DU VRAI : `rapport()` lit `ms` et `crete` sans
      // les vérifier, et une réponse incomplète faisait échouer vingt-sept cas sur un
      // « Cannot read properties of undefined » étranger à ce qu'ils mesurent.
      return {
        audio: reponse.audio === undefined
          ? new AudioBuffer({ numberOfChannels: 1, length: 1000, sampleRate: 16000 })
          : reponse.audio,
        erreur: reponse.erreur ?? null,
        messages: reponse.messages ?? ["rendu simule"],
        blocs: 100,
        ms: 12,
        crete: 0.5,
      };
    },
  };
});

const { fiches } = await import("./csound");

const SR = 16000;

function sonEssai(secondes = 0.5, canaux = 2): AudioBuffer {
  const n = Math.round(secondes * SR);
  const b = new AudioBuffer({ numberOfChannels: canaux, length: n, sampleRate: SR });
  let graine = 4242;
  const tirer = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648 * 2 - 1;
  };
  for (let c = 0; c < canaux; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = tirer() * 0.4;
  }
  return b;
}

/** Quatre noires montantes à 120 : de quoi faire une partition. */
function midiEssai(n = 4): File {
  const duree = 0.5;
  const notes = Array.from({ length: n }, (_, i) => ({
    note: 60 + i * 2, velocite: 100, debut: i * duree, fin: i * duree + duree * 0.9,
  }));
  return notesVersFichierMidi(notes as never, 120);
}

function contexte(entrees: unknown[], reglages: Record<string, number | string> = {}) {
  return {
    entree: (i: number) => entrees[i],
    paramNombre: (nom: string, defaut: number) =>
      (typeof reglages[nom] === "number" ? (reglages[nom] as number) : defaut),
    paramTexte: (nom: string, defaut: string) =>
      (typeof reglages[nom] === "string" ? (reglages[nom] as string) : defaut),
    noeud: { data: {} },
    runtime: null,
    onProgress: () => {},
  } as never;
}

const fiche = (id: string) => {
  const f = fiches.find((x) => x.id === id);
  if (!f) throw new Error(`fiche introuvable : ${id}`);
  return f;
};

/**
 * Exécute une fiche en remplaçant le rendu Csound, et rend le CSD qu'elle a assemblé.
 *
 * `reponse` permet de jouer le cas où Csound ne rend rien : c'est le chemin d'échec, et il est
 * aussi important que l'autre sur un nœud dont l'entrée est du code écrit à la main.
 */
async function executer(
  id: string,
  entrees: unknown[],
  reglages: Record<string, number | string> = {},
  simulee: { audio?: AudioBuffer | null; erreur?: string; messages?: string[] } = {},
) {
  appels.length = 0;
  reponse = simulee;
  const res = await fiche(id).executer(contexte(entrees, reglages));
  reponse = {};
  return { res, csd: appels.length > 0 ? appels[0].csd : null, appels: appels.length };
}

beforeEach(() => { appels.length = 0; reponse = {}; });

const CINQ = ["csound", "csound-instrument", "csound-effet", "csound-instruments-physiques", "csound-spectral"];

// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("les cinq fiches : ce qu'elles font d'une entrée manquante", () => {
  // CHACUNE N'EXIGE PAS LA MÊME CHOSE : « csound » n'a que des entrées facultatives et doit donc
  // rendre du son sans rien recevoir ; les quatre autres demandent un MIDI ou de l'audio.
  const exigent: [string, unknown[]][] = [
    ["csound-instrument", [null, null]],
    ["csound-effet", [null, null, null]],
    ["csound-spectral", [null, null]],
  ];
  for (const [id, entrees] of exigent) {
    it(`${id} : rien en entrée donne un message, pas une exception`, async () => {
      const { res } = await executer(id, entrees);
      expect(res.valeurs).toHaveLength(fiche(id).sorties!.length);
      expect(res.valeurs[0], "aucune sortie audio quand l'entrée obligatoire manque").toBeNull();
      expect((res.message ?? "").length).toBeGreaterThan(0);
    });
  }

  it("csound rend du son SANS AUCUNE ENTRÉE : son orchestre et sa partition suffisent", async () => {
    const { res, appels } = await executer("csound", [null, null, null, null]);
    expect(appels, "il doit malgré tout appeler Csound").toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("csound-instruments-physiques joue sa note de réglage sans MIDI branché", async () => {
    const { res, appels } = await executer("csound-instruments-physiques", [null]);
    expect(appels).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });
});

describe("le CSD assemblé porte les réglages, et c'est là que le câblage se vérifie", () => {
  it("« Canaux » devient nchnls", async () => {
    const mono = await executer("csound", [null, null, null, null], { "Canaux": "1" });
    const stereo = await executer("csound", [null, null, null, null], { "Canaux": "2" });
    expect(mono.csd).toMatch(/nchnls\s*=\s*1/);
    expect(stereo.csd).toMatch(/nchnls\s*=\s*2/);
  });

  it("« Taille de bloc » devient ksmps", async () => {
    const petit = await executer("csound", [null, null, null, null], { "Taille de bloc": 8 });
    const grand = await executer("csound", [null, null, null, null], { "Taille de bloc": 256 });
    expect(petit.csd).toMatch(/ksmps\s*=\s*8/);
    expect(grand.csd).toMatch(/ksmps\s*=\s*256/);
  });

  it("L'ORCHESTRE DU RÉGLAGE SE RETROUVE DANS LE CSD", async () => {
    const signature = "instr 42\n  out oscili(0.3, 220)\nendin";
    const { csd } = await executer("csound", [null, null, null, null], { "Orchestre": signature });
    expect(csd).toContain("instr 42");
  });

  it("ET LE PORT L'EMPORTE SUR LE RÉGLAGE, ce qui est la règle de `texteBranche`", async () => {
    const parPort = "instr 7\n  out oscili(0.2, 330)\nendin";
    const { csd } = await executer("csound", [null, null, parPort, null],
      { "Orchestre": "instr 99\n  out oscili(0.1, 110)\nendin" });
    expect(csd, "un orchestre branché remplace celui du champ").toContain("instr 7");
    expect(csd).not.toContain("instr 99");
  });

  it("la partition du réglage se retrouve aussi, et le port l'emporte de même", async () => {
    const parReglage = await executer("csound", [null, null, null, null], { "Partition": "i1 0 1 440 0.5" });
    expect(parReglage.csd).toContain("i1 0 1 440 0.5");
    const parPort = await executer("csound", [null, null, null, "i1 0 2 880 0.25"],
      { "Partition": "i1 0 1 440 0.5" });
    expect(parPort.csd).toContain("i1 0 2 880 0.25");
  });

  it("un MIDI branché fournit la partition, note par note", async () => {
    const { csd } = await executer("csound", [null, midiEssai(4), null, null]);
    // Quatre notes donnent quatre lignes d'instrument dans la partition.
    const lignes = (csd ?? "").split("\n").filter((l) => /^\s*i\s*1\s/.test(l));
    expect(lignes.length, "une ligne par note").toBeGreaterThanOrEqual(4);
  });
});

describe("csound-instrument : le MIDI commande, et la queue s'ajoute", () => {
  it("il refuse un MIDI sans note en le disant", async () => {
    const { res } = await executer("csound-instrument", [notesVersFichierMidi([] as never, 120), null]);
    expect(res.valeurs).toEqual([null, null]);
    expect((res.message ?? "").length).toBeGreaterThan(0);
  });

  it("« Queue » allonge la durée demandée à Csound", async () => {
    const courte = await executer("csound-instrument", [midiEssai(2), null], { "Queue": 0 });
    const longue = await executer("csound-instrument", [midiEssai(2), null], { "Queue": 10 });
    expect(courte.csd).not.toBe(longue.csd);
  });

  it("« Canaux » et « Taille de bloc » arrivent aussi dans son CSD", async () => {
    const { csd } = await executer("csound-instrument", [midiEssai(2), null],
      { "Canaux": "2", "Taille de bloc": 64 });
    expect(csd).toMatch(/nchnls\s*=\s*2/);
    expect(csd).toMatch(/ksmps\s*=\s*64/);
  });

  it("et son orchestre vient du port quand il y en a un", async () => {
    const { csd } = await executer("csound-instrument", [midiEssai(2), "instr 5\n  out oscili(0.2, 440)\nendin"]);
    expect(csd).toContain("instr 5");
  });
});

describe("csound-effet : un ou deux sons en entrée", () => {
  it("il accepte un seul son", async () => {
    const { res, appels } = await executer("csound-effet", [sonEssai(), null, null]);
    expect(appels).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("et deux, quand le second est branché", async () => {
    const { res, appels } = await executer("csound-effet", [sonEssai(), sonEssai(), null]);
    expect(appels).toBe(1);
    expect(res.valeurs[0]).toBeInstanceOf(AudioBuffer);
  });

  it("« Canaux d'entrée » change la façon dont le son est passé", async () => {
    const mono = await executer("csound-effet", [sonEssai(), null, null], { "Canaux d'entrée": "mono" });
    const stereo = await executer("csound-effet", [sonEssai(), null, null], { "Canaux d'entrée": "stereo" });
    // Le réglage voyage dans les entrées fichier, pas dans le CSD : on vérifie qu'il est lu.
    expect(fiche("csound-effet").executer.toString()).toContain("\"Canaux d'entrée\"");
    expect(mono.appels).toBe(1);
    expect(stereo.appels).toBe(1);
  });
});

describe("csound-instruments-physiques et csound-spectral : les bibliothèques d'opcodes", () => {
  it("« Instrument » choisit l'opcode, et deux choix ne donnent pas le même orchestre", async () => {
    const { OPCODES } = await import("../audio/csound-opcodes");
    const instruments = OPCODES.filter((o) => o.sorte === "instrument");
    expect(instruments.length, "il faut au moins deux instruments pour comparer").toBeGreaterThan(1);
    const a = await executer("csound-instruments-physiques", [null], { "Instrument": instruments[0].id });
    const b = await executer("csound-instruments-physiques", [null], { "Instrument": instruments[1].id });
    expect(a.csd).not.toBe(b.csd);
  });

  it("« Traitement » choisit l'opcode spectral de la même façon", async () => {
    const { OPCODES } = await import("../audio/csound-opcodes");
    const spectraux = OPCODES.filter((o) => o.sorte === "spectral");
    expect(spectraux.length).toBeGreaterThan(1);
    const a = await executer("csound-spectral", [sonEssai(), sonEssai()], { "Traitement": spectraux[0].id });
    const b = await executer("csound-spectral", [sonEssai(), sonEssai()], { "Traitement": spectraux[1].id });
    expect(a.csd).not.toBe(b.csd);
  });

  const reglagesInstrument: [string, number, number][] = [
    ["Pression", 0, 100], ["Position", 0, 100], ["Vibrato", 0, 100],
    ["Fréquence vibrato", 0.5, 12], ["Durée", 0.5, 10],
  ];
  for (const [nom, bas, haut] of reglagesInstrument) {
    it(`csound-instruments-physiques : « ${nom} » change le CSD`, async () => {
      const a = await executer("csound-instruments-physiques", [null], { [nom]: bas });
      const b = await executer("csound-instruments-physiques", [null], { [nom]: haut });
      expect(a.csd, `« ${nom} » n'arrive pas jusqu'à Csound`).not.toBe(b.csd);
    });
  }

  it("« Note » fixe la hauteur jouée sans MIDI", async () => {
    const grave = await executer("csound-instruments-physiques", [null], { "Note": "A1" });
    const aigu = await executer("csound-instruments-physiques", [null], { "Note": "A5" });
    expect(grave.csd).not.toBe(aigu.csd);
  });

  const reglagesSpectral: [string, number | string, number | string][] = [
    ["Morphing", 0, 100], ["Queue", 0, 30],
  ];
  for (const [nom, bas, haut] of reglagesSpectral) {
    it(`csound-spectral : « ${nom} » change le CSD`, async () => {
      const a = await executer("csound-spectral", [sonEssai(), sonEssai()], { [nom]: bas });
      const b = await executer("csound-spectral", [sonEssai(), sonEssai()], { [nom]: haut });
      expect(a.csd, `« ${nom} » n'arrive pas jusqu'à Csound`).not.toBe(b.csd);
    });
  }

  // « TRANSPOSITION » EST INERTE AILLEURS QUE SUR L'ÉTIREMENT, ET SA DOCUMENTATION LE DIT :
  // « employée par l'étirement seul ». C'est le cas que le contrat de composant prévoit — un
  // réglage légitimement inerte porte sa raison écrite à côté de lui. Mon premier cas l'exerçait
  // sur le premier opcode de la liste et l'accusait de ne rien faire ; il l'exerce désormais là
  // où elle agit, et vérifie séparément que la notice dit bien cette restriction.
  it("csound-spectral : « Transposition » agit sur l'étirement, qui est le mode qu'elle sert", async () => {
    const a = await executer("csound-spectral", [sonEssai(), sonEssai()], { "Traitement": "mincer", "Transposition": -24 });
    const b = await executer("csound-spectral", [sonEssai(), sonEssai()], { "Traitement": "mincer", "Transposition": 24 });
    expect(a.csd, "l'étirement doit entendre la transposition").not.toBe(b.csd);
  });

  it("et sa documentation dit qu'elle ne sert qu'à l'étirement", () => {
    const p = fiche("csound-spectral").parametres!.find((x) => x.nom === "Transposition")!;
    expect(p.doc, "un réglage inerte ailleurs doit porter sa raison").toMatch(/étirement/);
    expect(p.docEn).toMatch(/stretch/);
  });
});

describe("quand Csound ne rend rien, les cinq le disent", () => {
  // CSOUND EST UN LANGAGE : l'utilisateur écrit du texte, et ce texte sera souvent faux. Un
  // orchestre qui ne compile pas doit rendre un RAPPORT LISIBLE et non une exception — c'est la
  // moitié de l'ergonomie de ces cinq nœuds, et elle ne se voit que sur ce chemin.
  const avecEntrees: [string, unknown[]][] = [
    ["csound", [null, null, null, null]],
    ["csound-instrument", [midiEssai(2), null]],
    ["csound-effet", [sonEssai(), null, null]],
    ["csound-instruments-physiques", [null]],
    ["csound-spectral", [sonEssai(), sonEssai()]],
  ];

  for (const [id, entrees] of avecEntrees) {
    it(`${id} : un rendu vide donne un rapport, et marque l'erreur`, async () => {
      const { res } = await executer(id, entrees, {}, {
        audio: null, erreur: "erreur de compilation ligne 3", messages: ["erreur de compilation ligne 3"],
      });
      expect(res.valeurs[0], "pas de son").toBeNull();
      expect(res.valeurs[1], "mais un rapport, pour qu'on sache pourquoi").toBeTruthy();
      expect(String(res.message)).toContain("compilation");
    });
  }
});

describe("ce que les cinq fiches déclarent", () => {
  it("chacune rend autant de valeurs que de sorties déclarées", async () => {
    const entrees: Record<string, unknown[]> = {
      "csound": [null, null, null, null],
      "csound-instrument": [midiEssai(2), null],
      "csound-effet": [sonEssai(), null, null],
      "csound-instruments-physiques": [null],
      "csound-spectral": [sonEssai(), sonEssai()],
    };
    for (const id of CINQ) {
      const { res } = await executer(id, entrees[id]);
      expect(res.valeurs, `${id}`).toHaveLength(fiche(id).sorties!.length);
    }
  });

  it("chacune déclare une sortie audio et un rapport en texte", () => {
    for (const id of CINQ) {
      const s = fiche(id).sorties!;
      expect(s[0].type, `${id} : première sortie`).toBe("audio");
      expect(s[1].type, `${id} : seconde sortie`).toBe("texte");
    }
  });

  it("TOUT PARAMÈTRE DÉCLARÉ EST LU PAR SON EXÉCUTEUR", () => {
    for (const id of CINQ) {
      const f = fiche(id);
      const source = f.executer.toString();
      for (const p of f.parametres ?? []) {
        expect(source, `${id} : le paramètre « ${p.nom} » n'est lu nulle part`).toContain(`"${p.nom}"`);
      }
    }
  });

  it("chaque paramètre porte sa documentation dans les deux langues", () => {
    for (const id of CINQ) {
      for (const p of fiche(id).parametres ?? []) {
        expect(p.doc, `${id} · ${p.nom} : pas de documentation française`).toBeTruthy();
        expect(p.docEn, `${id} · ${p.nom} : pas de documentation anglaise`).toBeTruthy();
      }
    }
  });
});
