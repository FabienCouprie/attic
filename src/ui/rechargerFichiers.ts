// ui/rechargerFichiers.ts — Recharge les File objects à partir du paramètre "Chemin".
// Utilisé à l'import JSON et au restore de l'en-cours localStorage.

export type NoeudAtelier = any;

export async function rechargerFichiersPersistes(nodes: NoeudAtelier[]) {
  const api = (window as any).api;
  if (!api) return;
  for (const n of nodes) {
    const chemin = n.data?.parametres?.Chemin as string | undefined;
    if (!chemin || !n.data?.ficheId) continue;
    try {
      if (n.data.ficheId === "entree-audio" && !n.data.audioFichier) {
        const res = await api.lireFichierAudio(chemin);
        if (res) {
          const mime = res.url?.match(/data:([^;]+);base64/)?.[1] ?? "audio/wav";
          const blob = new Blob([res.donnees], { type: mime });
          const fichier = new File([blob], res.nom, { type: mime });
          n.data.audioFichier = fichier;
          n.data.audioNom = res.nom;
          n.data.audioUrl = URL.createObjectURL(fichier);
        }
      } else if (n.data.ficheId === "lecteur-midi" && !n.data.midiFichier) {
        const res = await api.lireBinaire(chemin);
        if (res) {
          const fichier = new File([res.donnees], res.nom, { type: "audio/midi" });
          n.data.midiFichier = fichier;
          n.data.midiNom = res.nom;
        }
      } else if (n.data.ficheId === "lecteur-svg" && !n.data.svgFichier) {
        const res = await api.lireBinaire(chemin);
        if (res) {
          const fichier = new File([res.donnees], res.nom, { type: "image/svg+xml" });
          n.data.svgFichier = fichier;
          n.data.svgNom = res.nom;
        }
      } else if (n.data.ficheId === "entree-image" && !n.data.imageFichier) {
        const res = await api.lireBinaire(chemin);
        if (res) {
          const type = res.nom?.toLowerCase().endsWith(".png") ? "image/png" : res.nom?.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
          const fichier = new File([res.donnees], res.nom, { type });
          n.data.imageFichier = fichier;
          n.data.imageNom = res.nom;
        }
      } else if (n.data.ficheId === "explorateur-musique" && !n.data.audioFichier) {
        const cheminAudio = n.data.audioChemin || chemin;
        if (cheminAudio) {
          const res = await api.lireFichierAudio(cheminAudio);
          if (res) {
            const mime = res.url?.match(/data:([^;]+);base64/)?.[1] ?? "audio/mpeg";
            const blob = new Blob([res.donnees], { type: mime });
            const fichier = new File([blob], res.nom, { type: mime });
            n.data.audioFichier = fichier;
            n.data.audioNom = res.nom;
            n.data.audioUrl = URL.createObjectURL(fichier);
          }
        }
      }
    } catch (e) {
      console.warn(`[attic] Impossible de recharger ${chemin}`, e);
    }
  }
}
