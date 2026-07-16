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

// Prompt cadrant le LLM pour qu'il sorte pile le format lu par « Texte → MIDI ».
const PROMPT_COMPOSITEUR = `You are a music composer. Output ONLY notes in this EXACT format, nothing else (no explanation, no markdown, no code fences):
- optional first line: TEMPO <bpm>
- then one line per note: <NOTE><OCTAVE> <DURATION_IN_BEATS> [VELOCITY]
- chord: join notes with +   e.g.  C4+E4+G4 1
- rest: "rest <duration>"
Example:
TEMPO 120
C4 0.5
E4 0.5
G4 1
rest 0.5
C4+E4+G4 2

Now compose a cheerful 8-bar melody in C major.`;

// Chaîne « LLM compositeur » : Ollama génère la notation → Texte→MIDI la rend
// (audio + MIDI). Sorties exposées : Audio et MIDI. Double-cliquer pour changer
// le prompt / le modèle Ollama.
const compositeurIA: MetaComposant = {
  id: "meta-compositeur-ia",
  nom: "Compositeur IA (Ollama)",
  entrees: [],
  sorties: [{ nom: "Audio", type: "audio" }, { nom: "MIDI", type: "midi" }],
  mapEntrees: [],
  mapSorties: [{ noeudInterne: "n2", portIndex: 0 }, { noeudInterne: "n2", portIndex: 1 }],
  sousNoeuds: [
    {
      id: "n1",
      position: { x: -180, y: 120 },
      width: 300,
      height: 260,
      data: {
        ficheId: "ollama-llm",
        parametres: { Modèle: "llama3.2", Prompt: PROMPT_COMPOSITEUR, Température: 0.8, "Max tokens": 300 },
      },
    },
    {
      id: "n2",
      position: { x: 220, y: 120 },
      width: 300,
      height: 260,
      data: {
        ficheId: "texte-vers-midi",
        parametres: { Synthèse: "FM/Oscillateurs", Volume: 80, Tempo: 120 },
      },
    },
  ],
  sousAretes: [
    { id: "e-n1-n2", source: "n1", target: "n2", sourceHandle: "out:0", targetHandle: "in:0" },
  ],
};

const EXEMPLES: MetaComposant[] = [synthetiseurSoustractif, compositeurIA];

export function installerMetasExemples(): void {
  const presents = new Set(tousLesMetas().map((m) => m.id));
  for (const meta of EXEMPLES) {
    if (presents.has(meta.id)) continue; // déjà installé (ou restauré depuis localStorage)
    // N'installer que si tous les sous-nodes existent dans le registre.
    const tousPresents = meta.sousNoeuds.every((n) => registre.trouverDef(n.data.ficheId) !== undefined);
    if (!tousPresents) {
      console.warn(`[attic] Méta exemple « ${meta.nom} » non installé : fiche(s) manquante(s)`);
      continue;
    }
    enregistrerMeta(meta);
    console.log(`[attic] Méta exemple « ${meta.nom} » installé`);
  }
}
