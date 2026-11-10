// ui/rechargerFichiers.ts — Recharge les File objects à partir du paramètre "Chemin".
// Utilisé à l'import JSON, au restore de l'en-cours localStorage, et au collage d'une coupe venue
// d'une autre fenêtre.
//
// ELLE REND LES NŒUDS RECHARGÉS, ET N'ÉCRIT RIEN DANS CEUX QU'ON LUI PASSE. Point A6 de la revue
// d'architecture du 2026-10-31 : elle posait le fichier, son nom et son URL dans le `data` des nœuds
// reçus, et ne rendait rien. Ses trois appelants lui passaient des nœuds neufs, pas encore posés, si
// bien que l'état de React n'était jamais touché ; mais rien ne l'empêchait, et un appelant qui lui
// aurait passé les nœuds vivants les aurait modifiés sans `setNodes`, sans que rien ne le dise. Un
// nœud qui reçoit un fichier revient donc copié, lui et son `data` ; un nœud qui ne reçoit rien
// revient tel quel. Voir `rechargerFichiers.test.ts`, qui la nourrit de nœuds gelés.

export type NoeudAtelier = any;

/** Ce que le disque rend à un nœud, à poser sur son `data` ; `null` s'il n'a rien à relire. */
async function fichierRelu(data: Record<string, any>, chemin: string, api: any): Promise<Record<string, unknown> | null> {
  if (data.ficheId === "entree-audio" && !data.audioFichier) {
    const res = await api.lireFichierAudio(chemin);
    if (!res) return null;
    const mime = res.url?.match(/data:([^;]+);base64/)?.[1] ?? "audio/wav";
    const blob = new Blob([res.donnees], { type: mime });
    const fichier = new File([blob], res.nom, { type: mime });
    return { audioFichier: fichier, audioNom: res.nom, audioUrl: URL.createObjectURL(fichier) };
  }
  if (data.ficheId === "lecteur-midi" && !data.midiFichier) {
    const res = await api.lireBinaire(chemin);
    if (!res) return null;
    return { midiFichier: new File([res.donnees], res.nom, { type: "audio/midi" }), midiNom: res.nom };
  }
  if (data.ficheId === "lecteur-svg" && !data.svgFichier) {
    const res = await api.lireBinaire(chemin);
    if (!res) return null;
    return { svgFichier: new File([res.donnees], res.nom, { type: "image/svg+xml" }), svgNom: res.nom };
  }
  if (data.ficheId === "entree-image" && !data.imageFichier) {
    const res = await api.lireBinaire(chemin);
    if (!res) return null;
    const type = res.nom?.toLowerCase().endsWith(".png") ? "image/png" : res.nom?.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    return { imageFichier: new File([res.donnees], res.nom, { type }), imageNom: res.nom };
  }
  if (data.ficheId === "explorateur-musique" && !data.audioFichier) {
    // LE CHEMIN DE CE NŒUD EST UN DOSSIER, PAS UNE PISTE. « Chemin » dit où chercher ; la piste
    // choisie, elle, vit dans `audioChemin`. Se rabattre sur l'un quand l'autre manque revenait
    // à lire un dossier comme un fichier audio : tant qu'aucune piste n'était choisie, le nœud
    // se chargeait d'un faux fichier au nom du dossier, et la première exécution échouait sans
    // que rien à l'écran ne l'explique. Sans piste choisie, il n'y a rien à recharger.
    const cheminAudio = data.audioChemin;
    if (!cheminAudio) return null;
    const res = await api.lireFichierAudio(cheminAudio);
    if (!res) return null;
    const mime = res.url?.match(/data:([^;]+);base64/)?.[1] ?? "audio/mpeg";
    const blob = new Blob([res.donnees], { type: mime });
    const fichier = new File([blob], res.nom, { type: mime });
    return { audioFichier: fichier, audioNom: res.nom, audioUrl: URL.createObjectURL(fichier) };
  }
  return null;
}

/** Les nœuds, dans le même ordre, ceux qui ont reçu un fichier étant des copies. */
export async function rechargerFichiersPersistes(nodes: readonly NoeudAtelier[]): Promise<NoeudAtelier[]> {
  const api = (window as any).api;
  if (!api) return [...nodes];
  const rendus: NoeudAtelier[] = [];
  for (const n of nodes) {
    const chemin = n.data?.parametres?.Chemin as string | undefined;
    if (!chemin || !n.data?.ficheId) { rendus.push(n); continue; }
    try {
      const recu = await fichierRelu(n.data, chemin, api);
      rendus.push(recu ? { ...n, data: { ...n.data, ...recu } } : n);
    } catch (e) {
      console.warn(`[attic] Impossible de recharger ${chemin}`, e);
      rendus.push(n);
    }
  }
  return rendus;
}
