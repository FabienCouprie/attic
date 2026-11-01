// ui/noeud-atelier.ts — Ce qu'un nœud du canevas porte dans `data`, et le type du nœud lui-même.
//
// Sorti d'`App.tsx` le 2026-11-01, tel quel. Le sac reste ouvert (`[key: string]: unknown`), et
// la revue du 2026-10-31 le dit : saisies, résultats matérialisés et rappels React y cohabitent.
// Le resserrer est un chantier à part ; ici, le type change seulement de fichier.
import type { Node } from "@xyflow/react";

export interface DonneesNoeud {
  ficheId: string;
  parametres: Record<string, number | string>;
  statut: string;
  progression?: string;
  audioResultatUrl?: string;
  audioResultatNom?: string;
  audioResultatBuffer?: AudioBuffer;
  audioResultatMessage?: string;
  audioFichier?: File;
  midiFichier?: File;
  midiFichierSortie?: File;
  modeleFichier?: File;
  enregistrementBlob?: Blob;
  visualisationUrl?: string;
  nomFichier?: string;
  prioritaire?: boolean;
  imageResultatUrl?: string;
  imageResultatFile?: File;
  imageFichier?: File;
  imageNom?: string;
  svgFichier?: File;
  svgNom?: string;
  pdfFichier?: File;
  pdfNom?: string;
  [key: string]: unknown;
}

export type NoeudAtelier = Node<DonneesNoeud, "atelier">;
