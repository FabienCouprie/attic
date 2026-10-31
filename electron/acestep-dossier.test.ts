// electron/acestep-dossier.test.ts — Un débruiteur que le panneau voit est un débruiteur que le pont trouve.
//
// LA FORME DU PIÈGE : deux résolutions de la même ressource. Le panneau des modèles sonde chaque
// fichier du manifeste, dans le dossier de l'utilisateur puis dans les ressources livrées ; le pont
// ACE-Step résolvait le DOSSIER `acestep`, et s'arrêtait au premier qui existe. Relevé le 2026-10-31
// sur la machine de Fabien : le rapide dans le dossier de l'utilisateur, la base seulement dans
// `public/acestep`. Le panneau disait la base présente et n'offrait rien à prendre ; « Reprendre une
// chanson » sur « Base » refusait en renvoyant vers ce même panneau.
//
// LE CAS CONFRONTE LES DEUX CÔTÉS RÉELS : l'inventaire du panneau avec ses propres sondes
// (`sondesRessources`), et le dossier que le pont passe au moteur. Les fichiers du manifeste y sont
// écrits en miniature, leur taille ramenée à quelques octets dans une copie du manifeste : les
// chemins, les paquets et leurs nœuds restent ceux qui sont livrés.
import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Contexte = { empaquete: boolean; racineProjet?: string; racineRessources?: string; dossierUtilisateur?: string };
type Paquet = { id: string; noeuds?: string[]; octets: number; fichiers: { chemin: string; octets: number }[] };

const requerir = createRequire(import.meta.url);
const { rendre, dossierDuDebruiteur } = requerir("./acestep.cjs") as {
  rendre: (options: Record<string, unknown>, surAvancement: () => void, contexte: Contexte)
    => Promise<{ ok: boolean; journal?: string }>;
  dossierDuDebruiteur: (fichier: string, contexte: Contexte) => string;
};
const { MODELES } = requerir("./acestep-plan.cjs") as { MODELES: Record<string, string> };
const { sondesRessources } = requerir("./chemins-ressources.cjs") as {
  sondesRessources: (contexte: Contexte) => unknown;
};
const { inventaire } = requerir("./telechargement-modeles.cjs") as {
  inventaire: (manifeste: { modeles: Paquet[] }, sondes: unknown) => { modeles: { id: string; complet: boolean }[] };
};

const OCTETS = 7;

/** Les paquets ACE-Step du manifeste livré, leurs fichiers ramenés à quelques octets. */
const PAQUETS: Paquet[] = (requerir("../scripts/modeles-manifest.json") as { modeles: Paquet[] }).modeles
  .filter((m) => m.fichiers.length > 0 && m.fichiers.every((f) => f.chemin.startsWith("acestep/")))
  .map((m) => ({ ...m, octets: OCTETS * m.fichiers.length, fichiers: m.fichiers.map((f) => ({ ...f, octets: OCTETS })) }));
const nomDe = (f: { chemin: string }) => f.chemin.slice("acestep/".length);
const paquetDe = (fichier: string) => PAQUETS.find((m) => m.fichiers.some((f) => nomDe(f) === fichier));
const TOUS = PAQUETS.flatMap((m) => m.fichiers.map(nomDe));

const temporaires: string[] = [];
afterEach(() => {
  while (temporaires.length > 0) {
    try { fs.rmSync(temporaires.pop()!, { recursive: true, force: true }); } catch { /* sans conséquence */ }
  }
});

function poser(dossier: string, fichiers: string[]) {
  fs.mkdirSync(dossier, { recursive: true });
  for (const f of fichiers) fs.writeFileSync(path.join(dossier, f), Buffer.alloc(OCTETS));
}

/**
 * Une disposition du disque : ce que porte le dossier de l'utilisateur, ce que portent les
 * ressources livrées (`public/acestep` en développement, `resources/acestep` empaqueté).
 */
function disposition(empaquete: boolean, chezUtilisateur: string[] | null, livres: string[] | null): Contexte {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "attic-acestep-dossier-"));
  temporaires.push(racine);
  const dossierUtilisateur = path.join(racine, "utilisateur");
  if (chezUtilisateur) poser(path.join(dossierUtilisateur, "acestep"), chezUtilisateur);
  const base = path.join(racine, empaquete ? "resources" : "projet");
  if (livres) poser(path.join(base, empaquete ? "acestep" : path.join("public", "acestep")), livres);
  fs.mkdirSync(base, { recursive: true });
  return empaquete
    ? { empaquete, racineRessources: base, dossierUtilisateur }
    : { empaquete, racineProjet: base, dossierUtilisateur };
}

const sauf = (fichier: string) => TOUS.filter((f) => f !== fichier);

/** Les dispositions éprouvées, la première étant celle de la machine de Fabien le 2026-10-31. */
const DISPOSITIONS: [string, () => Contexte][] = [
  ["développement, la base livrée seulement", () => disposition(false, sauf(MODELES.base), TOUS)],
  ["développement, le rapide livré seulement", () => disposition(false, sauf(MODELES.rapide), TOUS)],
  ["développement, tout chez l'utilisateur", () => disposition(false, TOUS, null)],
  ["développement, rien chez l'utilisateur", () => disposition(false, null, TOUS)],
  ["installé, tout chez l'utilisateur", () => disposition(true, TOUS, null)],
  ["installé, la base pas encore prise", () => disposition(true, sauf(MODELES.base), null)],
];

describe("le débruiteur, vu par le panneau et par le pont", () => {
  it("chaque débruiteur choisi est un fichier du manifeste", () => {
    for (const [id, fichier] of Object.entries(MODELES)) expect(paquetDe(fichier), id).toBeDefined();
  });

  it.each(DISPOSITIONS)("%s : présent au panneau si et seulement si le pont le trouve", (_nom, fabriquer) => {
    const contexte = fabriquer();
    const inv = inventaire({ modeles: PAQUETS }, sondesRessources(contexte));
    for (const [id, fichier] of Object.entries(MODELES)) {
      const complet = inv.modeles.find((m) => m.id === paquetDe(fichier)!.id)!.complet;
      const trouve = fs.existsSync(path.join(dossierDuDebruiteur(fichier, contexte), fichier));
      expect(trouve, `${id} : le panneau le dit ${complet ? "présent" : "absent"}`).toBe(complet);
    }
  });

  it("le rendu sur la base ne se refuse plus quand elle n'est que dans les ressources livrées", async () => {
    // LE MOTEUR N'EST PAS DANS LA DISPOSITION, et c'est ce qui rend le cas sûr : passé le contrôle
    // du débruiteur, le pont cherche `ace-synth` sur le chemin et ne le trouve pas. Le refus
    // « pas sur le disque » est ce que le défaut rendait ; tout autre échec dit qu'il est passé.
    const contexte = disposition(false, sauf(MODELES.base), TOUS);
    const plan = JSON.stringify({ caption: "une ballade", lyrics: "[Instrumental]", duration: 10 });
    const r = await rendre(
      { plan, tache: "cover-nofsq", modele: "base", audioSource: new Uint8Array(44) }, () => {}, contexte,
    );
    expect(r.ok).toBe(false);
    expect(r.journal).not.toMatch(/pas sur le disque/);
  });
});
