// ui/copier.ts — Copie robuste dans le presse-papier.
// navigator.clipboard échoue silencieusement en Electron quand la permission
// « clipboard » n'est pas accordée (cf. setPermissionRequestHandler du main).
// On tente l'API asynchrone puis on retombe sur textarea + execCommand("copy").
// Fichier feuille (aucune dépendance UI) → évite tout import circulaire.
export async function copierTexte(texte: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texte); return; }
  } catch { /* permission refusée → fallback ci-dessous */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = texte;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) { console.error("[attic] Copie dans le presse-papier échouée", e); }
}
