// @vitest-environment jsdom
//
// plugins/graines-noeuds.test.ts — Le câblage des paramètres « Graine », nœud
// par nœud.
//
// Ce n'est pas l'arithmétique du générateur qui casse — elle est testée dans
// core/hasard.test.ts — mais le CÂBLAGE : une faute de frappe sur le nom du
// paramètre, et `paramNombre` rend silencieusement la valeur par défaut. Le
// nœud tourne, ne signale rien, et la graine reste sans effet. C'est le mode de
// défaillance le plus coûteux du dispositif, parce qu'il ressemble à « ça ne
// marche pas très bien » plutôt qu'à une erreur.
//
// La convention vérifiée ici a deux régimes, et le test les distingue :
//   - défaut 0  → tiré au sort à chaque exécution, ET la graine retenue doit
//                 apparaître dans le message, sinon le rendu est irretrouvable ;
//   - défaut fixe → deux exécutions sans rien régler donnent le même résultat.
import "node-web-audio-api/polyfill.js";
import { describe, it, expect } from "vitest";
import { registre } from "../audio/adaptateur";

function ctxParams(params: Record<string, string | number>, entree: unknown = null) {
  return {
    entree: () => entree,
    entrees: () => [entree],
    paramTexte: (nom: string, def: string) => String(params[nom] ?? def),
    paramNombre: (nom: string, def: number) => Number(params[nom] ?? def),
    onProgress: () => {},
    noeud: { id: "n1", data: {} },
    runtime: null,
    repertoireTravail: "",
  };
}

/** Empreinte d'un buffer : suffisante pour distinguer deux rendus. */
function empreinte(b: AudioBuffer): string {
  const d = b.getChannelData(0);
  let somme = 0;
  for (let i = 0; i < d.length; i++) somme += Math.abs(d[i]) * (i % 97 + 1);
  return `${b.length}:${somme.toFixed(6)}`;
}

async function rendre(ficheId: string, params: Record<string, string | number>, entree: unknown = null) {
  const f = registre.trouverDef(ficheId)!;
  expect(f, `fiche « ${ficheId} » introuvable`).toBeTruthy();
  const res = await f.executer(ctxParams(params, entree) as any);
  return { valeurs: res.valeurs, message: res.message ?? "" };
}

function sinus(dureeS = 0.3, freq = 220, sr = 44100): AudioBuffer {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: Math.round(dureeS * sr), sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(2 * Math.PI * freq * i / sr) * 0.5;
  }
  return buf;
}

// ── Régime « défaut 0 » : le hasard est l'effet recherché ──

describe("mélodie aléatoire", () => {
  const BASE = { Clé: "Do", Gamme: "Majeur", "Signature temporelle": "4/4", Tempo: 120, Mesures: 2, Volume: 80 };

  it("une même graine rejoue la même mélodie", async () => {
    const a = await rendre("melodie-aleatoire", { ...BASE, Graine: 4242 });
    const b = await rendre("melodie-aleatoire", { ...BASE, Graine: 4242 });
    expect(empreinte(a.valeurs[0] as AudioBuffer)).toBe(empreinte(b.valeurs[0] as AudioBuffer));
  });

  it("changer la graine change la mélodie", async () => {
    const a = await rendre("melodie-aleatoire", { ...BASE, Graine: 4242 });
    const b = await rendre("melodie-aleatoire", { ...BASE, Graine: 4243 });
    expect(empreinte(a.valeurs[0] as AudioBuffer)).not.toBe(empreinte(b.valeurs[0] as AudioBuffer));
  });

  it("graine à 0 : la graine tirée est affichée, et la recopier rejoue la mélodie", async () => {
    // Le point qui rend le régime « 0 » utilisable : sans cet affichage, une
    // mélodie qu'on voudrait garder serait définitivement perdue.
    const tiree = await rendre("melodie-aleatoire", { ...BASE, Graine: 0 });
    const graine = Number(/graine (\d+)/.exec(tiree.message)?.[1]);
    expect(Number.isInteger(graine), `message sans graine : « ${tiree.message} »`).toBe(true);
    expect(graine).toBeGreaterThan(0);
    const rejouee = await rendre("melodie-aleatoire", { ...BASE, Graine: graine });
    expect(empreinte(rejouee.valeurs[0] as AudioBuffer)).toBe(empreinte(tiree.valeurs[0] as AudioBuffer));
  });
});

describe("rythme de Cantor", () => {
  const BASE = { Tempo: 120, Profondeur: 3, Subdivision: "3", "Partie retirée": "random", Instrument: "all", Mesures: 1, Swing: 0, Volume: 80 };

  it("une même graine rejoue la même grille", async () => {
    const a = await rendre("rythme-cantor", { ...BASE, Graine: 77 });
    const b = await rendre("rythme-cantor", { ...BASE, Graine: 77 });
    expect(empreinte(a.valeurs[0] as AudioBuffer)).toBe(empreinte(b.valeurs[0] as AudioBuffer));
  });

  it("graine à 0 : la graine tirée est affichée et rejouable", async () => {
    const tiree = await rendre("rythme-cantor", { ...BASE, Graine: 0 });
    const graine = Number(/graine (\d+)/.exec(tiree.message)?.[1]);
    expect(Number.isInteger(graine), `message sans graine : « ${tiree.message} »`).toBe(true);
    const rejoue = await rendre("rythme-cantor", { ...BASE, Graine: graine });
    expect(empreinte(rejoue.valeurs[0] as AudioBuffer)).toBe(empreinte(tiree.valeurs[0] as AudioBuffer));
  });
});

// ── Régime « défaut fixe » : le hasard est un détail d'implémentation ──

describe("nœuds à graine fixe : deux exécutions sans rien régler donnent le même rendu", () => {
  // C'est exactement ce qui n'était PAS vrai avant : ces nœuds rendaient un
  // fichier différent à chaque exécution, sans que rien ne le signale.
  const CAS: { id: string; params: Record<string, string | number>; entree?: () => unknown }[] = [
    { id: "sequenceur-batterie", params: { Tempo: 120, "Nombre de pas": "16", Swing: 0, Mesures: 1, Volume: 90 } },
    { id: "boite-rythmes", params: { Tempo: 120, Patron: "Rock", Mesures: 1, Kick: 80, "Caisse claire": 70, Charley: 60 } },
    { id: "reverberation", params: { Taille: 50, Decay: 1, Mix: 50 }, entree: () => sinus() },
  ];

  for (const cas of CAS) {
    it(cas.id, async () => {
      const a = await rendre(cas.id, cas.params, cas.entree?.());
      const b = await rendre(cas.id, cas.params, cas.entree?.());
      expect(a.valeurs[0]).toBeInstanceOf(AudioBuffer);
      expect(empreinte(a.valeurs[0] as AudioBuffer)).toBe(empreinte(b.valeurs[0] as AudioBuffer));
    });

    it(`${cas.id} — changer la graine change le rendu`, async () => {
      const a = await rendre(cas.id, { ...cas.params, Graine: 1 }, cas.entree?.());
      const b = await rendre(cas.id, { ...cas.params, Graine: 2 }, cas.entree?.());
      expect(empreinte(a.valeurs[0] as AudioBuffer)).not.toBe(empreinte(b.valeurs[0] as AudioBuffer));
    });
  }
});

// ── Le paramètre existe-t-il seulement sur la fiche ? ──

describe("déclaration du paramètre", () => {
  it("chaque nœud migré déclare une Graine dans une plage cohérente avec son régime", () => {
    // Garde-fou contre l'oubli le plus bête : câbler `ctx.paramNombre(\"Graine\")`
    // sans déclarer le paramètre. Le nœud fonctionnerait, mais la graine
    // n'apparaîtrait jamais dans l'inspecteur — or c'est tout l'objet.
    const TIRE_AU_SORT = ["generateur-bruit", "melodie-aleatoire", "rythme-cantor", "camelot", "arpege-midi", "magenta-improvisation"];
    const FIXE = ["sequenceur-batterie", "sequenceur-batterie-avance", "boite-rythmes", "reverberation",
      "reverb-progressive", "paulstretch", "paulstretch-logistique", "griffin-lim", "piece-lucier",
      "palette-harmonique", "dessin-sonore"];

    for (const id of [...TIRE_AU_SORT, ...FIXE]) {
      const def = registre.trouverDef(id);
      if (!def) continue;   // nœud absent de ce build : rien à vérifier
      const p = def.parametres.find((x) => x.nom === "Graine");
      expect(p, `« ${id} » ne déclare aucun paramètre Graine`).toBeTruthy();
      const minimum = p!.plage?.[0];
      if (TIRE_AU_SORT.includes(id)) {
        expect(p!.defaut, `« ${id} » devrait tirer au sort par défaut`).toBe(0);
        expect(minimum, `« ${id} » doit accepter 0`).toBe(0);
      } else {
        expect(p!.defaut, `« ${id} » devrait avoir une graine fixe`).not.toBe(0);
        expect(minimum, `« ${id} » n'a pas de régime « tiré au sort », sa plage doit démarrer à 1`).toBe(1);
      }
    }
  });
});
