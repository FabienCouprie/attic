// plugins/meta-exemples.ts — Méta-composants embarqués par défaut.
//
// Au premier lancement, ces métas sont enregistrés dans le registre et
// persistés en localStorage. L'utilisateur les voit dans la palette dès le
// démarrage, sans avoir à les créer.
import { enregistrerMeta, tousLesMetas } from "../core";
import { registre } from "../audio/adaptateur";
import type { MetaComposant } from "../core";

const synthetiseurSoustractif: MetaComposant = {
  id: "meta-synth-soustractif",
  nom: "Synthétiseur soustractif",
  entrees: [],
  sorties: [{ nom: "Out 1", type: "audio" }],
  mapEntrees: [],
  mapSorties: [{ noeudInterne: "noeud-3", portIndex: 0 }],
  sousNoeuds: [
    {
      id: "noeud-1",
      position: { x: -140, y: 140 },
      width: 420,
      height: 340,
      data: {
        ficheId: "oscillateur",
        parametres: { Forme: "Dent de scie", Fréquence: 110, Durée: 1.5, Volume: 80 },
      },
    },
    {
      id: "noeud-2",
      position: { x: 70, y: 140 },
      width: 230,
      height: 372,
      data: {
        ficheId: "reponse-filtre",
        parametres: { Type: "passe-bas", Fréquence: 600, Q: 4 },
      },
    },
    {
      id: "noeud-3",
      position: { x: 280, y: 140 },
      width: 420,
      height: 300,
      data: {
        ficheId: "enveloppe-adsr",
        parametres: { Attaque: 5, Déclin: 250, Maintien: 30, Relâchement: 400 },
      },
    },
  ],
  sousAretes: [
    { id: "e-1-2", source: "noeud-1", target: "noeud-2", sourceHandle: "out:0", targetHandle: "in:0" },
    { id: "e-2-3", source: "noeud-2", target: "noeud-3", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
};

const EXEMPLES: MetaComposant[] = [synthetiseurSoustractif];

export function installerMetasExemples(): void {
  const presents = new Set(tousLesMetas().map((m) => m.id));
  for (const meta of EXEMPLES) {
    if (presents.has(meta.id)) continue;
    const tousPresents = meta.sousNoeuds.every((n) => registre.trouverDef(n.data.ficheId) !== undefined);
    if (!tousPresents) {
      console.warn(`[attic] Méta exemple « ${meta.nom} » non installé : fiche(s) manquante(s)`);
      continue;
    }
    enregistrerMeta(meta);
    console.log(`[attic] Méta exemple « ${meta.nom} » installé`);
  }
}
