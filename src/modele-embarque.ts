// modele-embarque.ts — Lire un modèle ONNX livré avec l'application.
//
// UN SEUL CHEMIN POUR LES DEUX ENVIRONNEMENTS, et c'est tout l'objet du module.
//
// Les modèles vivent dans `public/oonx/`. En développement, Vite sert ce dossier
// à la racine du site : `fetch("oonx/x.onnx")` le trouve. Une fois l'application
// installée, il n'y est plus. La page est chargée depuis
// `resources/app/dist/index.html`, `dist/oonx` est exclu du paquet, et
// electron-builder copie les modèles dans `resources/oonx/`. Le même `fetch`
// cherche alors `resources/app/dist/oonx/x.onnx` — qui n'existe pas.
//
// C'est le défaut qu'avait « Débruitage IA » en 3.2.0 : le nœud marchait en
// développement, où il a été validé, et répondait « modèle absent » dans l'app
// installée, alors que le modèle y était bien livré. `api.lireBinaire` passe par
// `resoudreRessource` dans le processus principal, qui connaît les deux
// dispositions et que ses tests couvrent : c'est lui qu'il faut interroger dès
// qu'il existe. `fetch` ne reste que pour le navigateur seul, où il n'y a pas
// de processus principal.

type ApiBinaire = {
  lireBinaire?: (chemin: string) => Promise<{ donnees: Uint8Array; nom: string } | null>;
};

/**
 * Octets d'un modèle livré, ou `null` s'il est introuvable.
 *
 * @param cheminRelatif chemin sous `oonx/`, par exemple `"oonx/gtcrn.onnx"`.
 * @param api l'API du preload ; par défaut `window.api`. Paramètre pour les tests.
 */
export async function lireModeleEmbarque(
  cheminRelatif: string,
  api: ApiBinaire | undefined = typeof window !== "undefined" ? (window as any).api : undefined,
): Promise<ArrayBuffer | null> {
  if (api?.lireBinaire) {
    const rep = await api.lireBinaire(cheminRelatif);
    if (!rep?.donnees) return null;
    // L'IPC livre une vue : son tampon peut être plus grand qu'elle, et
    // onnxruntime lirait alors des octets étrangers au modèle. On découpe.
    const b = rep.donnees;
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const reponse = await fetch(cheminRelatif);
  return reponse.ok ? reponse.arrayBuffer() : null;
}
