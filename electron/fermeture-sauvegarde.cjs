// electron/fermeture-sauvegarde.cjs — Sauvegarder avant que la fenêtre ne se ferme.
//
// La sauvegarde automatique écrit toutes les 30 secondes ; entre deux battements, jusqu'à
// une demi-minute de travail ne tient qu'en mémoire. Fermer la fenêtre la perdait.
//
// Le renderer ne peut pas écrire un fichier depuis `beforeunload` : l'écriture passe par
// IPC, donc elle est asynchrone, et la page est déjà partie quand la réponse arrive.
// C'est donc le processus principal qui mène la fermeture : il l'interrompt une fois,
// demande la sauvegarde, et ferme quand le renderer a répondu — ou au bout d'un délai,
// car une fenêtre qui refuse de se fermer serait pire que la perte qu'on évite.
const DELAI_MAX_MS = 3000;

/**
 * Installe la séquence sur une fenêtre.
 *
 * @param fenetre        la BrowserWindow ;
 * @param ipcMain        pour recevoir l'accusé du renderer ;
 * @param delaiMs        au-delà, on ferme sans attendre ;
 * @param canal          nom du couple de messages (un par fenêtre, si plusieurs un jour).
 * @returns un objet d'inspection, surtout utile aux tests.
 */
function installerSauvegardeAvantFermeture({
  fenetre,
  ipcMain,
  delaiMs = DELAI_MAX_MS,
  canal = "fermeture",
  minuteur = setTimeout,
  annulerMinuteur = clearTimeout,
} = {}) {
  const etat = { demandee: false, fermee: false, raison: null };

  const fermerPourDeBon = (raison) => {
    if (etat.fermee) return;
    etat.fermee = true;
    etat.raison = raison;
    // `destroy` et non `close` : `close` repasserait par ce même gestionnaire.
    fenetre.destroy();
  };

  fenetre.on("close", (evenement) => {
    // Deuxième passage (ou fermeture forcée) : laisser filer.
    if (etat.demandee) return;
    etat.demandee = true;
    evenement.preventDefault();

    // L'accusé est filtré sur son émetteur : deux fenêtres ouvertes partagent le même
    // canal, et celle qui répond ne doit pas faire fermer l'autre.
    const surPrete = (evenementIpc) => {
      if (evenementIpc && evenementIpc.sender && evenementIpc.sender !== fenetre.webContents) return;
      fin("sauvegarde");
    };
    const attente = minuteur(() => fin("delai"), delaiMs);
    const fin = (raison) => {
      annulerMinuteur(attente);
      ipcMain.removeListener(`${canal}:prete`, surPrete);
      fermerPourDeBon(raison);
    };

    ipcMain.on(`${canal}:prete`, surPrete);
    fenetre.webContents.send(`${canal}:sauvegarder`);
  });

  return etat;
}

module.exports = { installerSauvegardeAvantFermeture, DELAI_MAX_MS };
