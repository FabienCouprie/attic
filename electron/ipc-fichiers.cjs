// electron/ipc-fichiers.cjs — Les fichiers et les dossiers : leurs dialogues, leurs lectures, leurs écritures.
//
// TIRÉ DE `main.cjs` LE 2026-11-08, tel quel, par le lot 5 de la revue d'architecture du
// 2026-10-31. C'est le troisième des six modules qui reprennent par famille les canaux de
// `main.cjs`, après `ipc-maj.cjs` et `ipc-scripts.cjs`. Aucune ligne de calcul n'a été retouchée :
// les trois blocs sont les mêmes, indentés d'un cran dans la fonction qui les installe, et mis bout
// à bout dans leur ordre d'avant.
//
// CE QUI EST VENU AVEC LES CANAUX : le dossier des exemples et le calcul du dossier de travail par
// défaut, que rien d'autre dans `main.cjs` ne calculait. Ce calcul sert aussi au démarrage, qui
// déclare ce dossier racine avant toute fenêtre : la fonction qui installe les canaux le rend donc à
// `main.cjs`.
//
// LES VINGT CANAUX S'ENREGISTRENT ENSEMBLE, à la place du premier des trois blocs. Ceux des deux
// autres s'enregistrent donc un peu plus tôt qu'avant, toujours au chargement et avant toute
// fenêtre ; un canal ne dépend pas de l'ordre où les autres s'inscrivent.
//
// `doc:ouvrir` N'EN EST PAS : il ouvre la documentation en ligne et non un fichier, et il partira
// avec `app:quitter`, son voisin dans `main.cjs`.
//
// IL REÇOIT CE DONT IL A BESOIN, et ne requiert pas `electron` : c'est la forme d'`ipc-maj.cjs`.
// Les deux dialogues lui viennent de `main.cjs`, parce que ce sont eux qui font naître une racine
// quand la personne désigne un endroit ; une copie ici ferait deux portes à tenir. Le contexte des
// ressources aussi, qui dépend du dossier des modèles que `main.cjs` retient.
"use strict";

const fs = require("fs");
const path = require("path");
const { ouvertureAutorisee, ecritureAutorisee, inscrireChemin } = require("./chemin-sur.cjs");
const { declarerRacine, verdictRacine, racinesConnues } = require("./capacites-chemins.cjs");
const { resoudreRessource } = require("./chemins-ressources.cjs");
const { fenetreDe } = require("./fenetres.cjs");

/**
 * Installe les vingt canaux `fichier:`, `dossier:`, `exemples:` et `mp3:`.
 *
 * @param ipcMain               le récepteur des IPC, déjà emballé par `main.cjs` ;
 * @param app                   pour l'empaquetage, `userData`, « Documents » ;
 * @param BrowserWindow         pour rattacher un dialogue à la fenêtre qui le demande ;
 * @param shell                 pour ouvrir un chemin dans l'application par défaut ;
 * @param showSaveDialogSuivi   le dialogue d'enregistrement de `main.cjs`, qui accorde la racine ;
 * @param showOpenDialogSuivi   le dialogue d'ouverture de `main.cjs`, qui accorde la racine ;
 * @param contexteRessources    le contexte de résolution des chemins de ressources de `main.cjs`.
 * @returns `dossierDeTravailParDefaut`, que le démarrage appelle pour déclarer la racine.
 */
function installerIpcFichiers({
  ipcMain, app, BrowserWindow, shell, showSaveDialogSuivi, showOpenDialogSuivi, contexteRessources,
}) {
  // --- IPC : enregistrer un fichier (dialogue + écriture) ---
  ipcMain.handle("fichier:sauvegarder", async (event, options) => {
    const { defaultPath, filters, data } = options;
    const resultat = await showSaveDialogSuivi(fenetreDe(BrowserWindow, event), {
      defaultPath: defaultPath || undefined,
      filters: filters || [{ name: "Tous", extensions: ["*"] }],
    });
    if (resultat.canceled || !resultat.filePath) return null;
    // SÛR PAR CONSTRUCTION — la capacité est mintée et consommée dans le même geste —, MAIS LA RÈGLE
    // D'EXTENSION S'APPLIQUE QUAND MÊME : un appelant peut proposer `piege.bat` en `defaultPath`, et
    // l'on enregistre sans toujours lire le nom. Le relevé note la destination, ce qui apprend aussi
    // les dossiers où l'on enregistre vraiment.
    const vS = ecritureAutorisee(resultat.filePath);
    inscrireChemin("sauvegarder", resultat.filePath, vS.ok, true);
    if (!vS.ok) { console.error(`[attic] fichier:sauvegarder REFUSE: ${resultat.filePath} — ${vS.raison}`); return null; }
    // PROMIS ET NON SYNCHRONE, comme les huit autres lectures et écritures de fichiers entiers des
    // handlers de ce fichier depuis le 2026-11-07 : le processus principal sert la fenêtre, les menus
    // et tous les IPC, et un fichier de 258 Mo le rendait sourd jusqu'à 411 ms. Voir `CHANGELOG.md`.
    await fs.promises.writeFile(resultat.filePath, data, "utf-8");
    return resultat.filePath;
  });

  // --- IPC : ouvrir un fichier binaire (dialogue + lecture brute) ---
  ipcMain.handle("fichier:ouvrir-binaire", async (event, options) => {
    const { defaultPath, filters } = options;
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      defaultPath: defaultPath || undefined,
      filters: filters || [{ name: "Tous", extensions: ["*"] }],
      properties: ["openFile"],
    });
    if (resultat.canceled || resultat.filePaths.length === 0) return null;
    const chemin = resultat.filePaths[0];
    const contenu = await fs.promises.readFile(chemin);
    return { donnees: contenu, nom: path.basename(chemin), chemin };
  });

  // --- IPC : ouvrir un fichier (dialogue + lecture) ---
  /**
   * Le dossier des graphes d'exemple, livré avec l'application.
   *
   * DEMANDÉ PAR FABIEN : le bouton de la barre ouvrait une liste déroulante, qui devient illisible dès
   * que les exemples se multiplient. Il ouvre désormais le classeur à ce dossier, ce qui permet de
   * ranger les exemples dans des sous-dossiers et de les parcourir comme des fichiers.
   *
   * Empaqueté, le dossier est une ressource posée à côté de l'exécutable, comme les SF2 et les
   * modèles ; en développement, c'est celui du dépôt. Même disposition des deux côtés.
   */
  const dossierExemples = () => (app.isPackaged
    ? path.join(process.resourcesPath || "", "exemples")
    : path.join(path.resolve(__dirname, ".."), "exemples"));

  ipcMain.handle("exemples:dossier", () => (fs.existsSync(dossierExemples()) ? dossierExemples() : null));

  ipcMain.handle("fichier:ouvrir", async (event, options) => {
    const { defaultPath, filters } = options;
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      defaultPath: defaultPath || undefined,
      filters: filters || [{ name: "Tous", extensions: ["*"] }],
      properties: ["openFile"],
    });
    if (resultat.canceled || resultat.filePaths.length === 0) return null;
    const chemin = resultat.filePaths[0];
    const contenu = await fs.promises.readFile(chemin, "utf-8");
    return { chemin, contenu, nom: path.basename(chemin) };
  });

  // --- IPC : choisir un fichier et n'en rendre QUE le chemin ---
  // Les deux gestionnaires du dessus lisent le fichier entier, l'un en texte, l'autre en binaire :
  // pour un film de soixante-dix mégaoctets, cela retiendrait tout ce que la lecture par plages évite,
  // et en texte cela n'aurait aucun sens. Un paramètre de type « fichier » ne veut que le chemin.
  ipcMain.handle("fichier:choisir", async (event, options) => {
    const { defaultPath, filters, title } = options ?? {};
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      title: title || undefined,
      defaultPath: defaultPath || undefined,
      filters: filters?.length ? filters : [{ name: "Tous", extensions: ["*"] }],
      properties: ["openFile"],
    });
    if (resultat.canceled || resultat.filePaths.length === 0) return null;
    return resultat.filePaths[0];
  });

  // --- IPC : sauvegarder un fichier binaire (audio WAV) ---
  ipcMain.handle("fichier:sauvegarder-binaire", async (event, options) => {
    const { defaultPath, filters, buffer } = options;
    const resultat = await showSaveDialogSuivi(fenetreDe(BrowserWindow, event), {
      defaultPath: defaultPath || undefined,
      filters: filters || [{ name: "Tous", extensions: ["*"] }],
    });
    if (resultat.canceled || !resultat.filePath) return null;
    // Même règle que la sauvegarde texte, et pour la même raison.
    const vB = ecritureAutorisee(resultat.filePath);
    inscrireChemin("sauvegarder-binaire", resultat.filePath, vB.ok, true);
    if (!vB.ok) { console.error(`[attic] fichier:sauvegarder-binaire REFUSE: ${resultat.filePath} — ${vB.raison}`); return null; }
    const buf = Buffer.from(buffer);
    await fs.promises.writeFile(resultat.filePath, buf);
    return resultat.filePath;
  });

  // --- IPC : choisir un dossier ---
  ipcMain.handle("dossier:choisir", async (event) => {
    const resultat = await showOpenDialogSuivi(fenetreDe(BrowserWindow, event), {
      properties: ["openDirectory"],
    });
    if (resultat.canceled || resultat.filePaths.length === 0) return null;
    return resultat.filePaths[0];
  });

  // --- IPC : lister les fichiers audio d'un dossier ---
  ipcMain.handle("dossier:lire", async (_event, cheminDossier) => {
    try {
      // En production, résoudre les chemins relatifs vers resourcesPath
      const chemin = resoudreRessource(cheminDossier, contexteRessources());
      const fichiers = fs.readdirSync(chemin);
      const audios = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma", ".mid", ".midi"];
      const resultats = [];
      for (const f of fichiers) {
        const ext = path.extname(f).toLowerCase();
        if (audios.includes(ext)) {
          resultats.push({ nom: f, chemin: path.join(chemin, f) });
        }
      }
      resultats.sort((a, b) => a.nom.localeCompare(b.nom));
      return resultats;
    } catch {
      return null;
    }
  });

  // --- IPC : lire un fichier audio et retourner ses octets ---
  //
  // LE PROCESSUS PRINCIPAL NE FABRIQUE PLUS L'ADRESSE BASE64, ET C'ÉTAIT UNE FUITE. Il renvoyait le
  // tampon ET le même fichier encodé en base64, une chaîne de 1,33 fois sa taille, avant de copier les
  // deux vers la fenêtre. Mesuré sur une instance neuve : une lecture d'un fichier de 50 Mo faisait
  // passer le processus principal de 48 à 224 Mo, six lectures à 273 Mo, et vingt secondes d'inactivité
  // ne rendaient rien — un processus qui n'alloue presque rien d'autre ne relance pas son ramasse-miettes,
  // et ne rend pas au système le tas qu'une grande chaîne a fait grossir. Recharger la fenêtre n'y
  // pouvait rien, puisque ce n'est pas elle qui retenait. Après quelques heures d'entrées audio et de
  // lots, 1,7 Go. L'adresse est désormais construite côté fenêtre (preload.cjs), qui rend sa mémoire.
  //
  // La lecture est asynchrone : un fichier de plusieurs centaines de mégaoctets lu de façon synchrone
  // figeait tout le processus principal, fenêtres comprises, le temps de la lecture.
  ipcMain.handle("fichier:lire-audio", async (_event, cheminFichier) => {
    try {
      const chemin = resoudreRessource(cheminFichier, contexteRessources());
      const donnees = await fs.promises.readFile(chemin);
      const ext = path.extname(cheminFichier).toLowerCase();
      const mime = ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : "audio/wav";
      return { donnees, mime, nom: path.basename(cheminFichier) };
    } catch {
      return null;
    }
  });

  // --- IPC : écrire un fichier binaire à un chemin donné (sans dialogue) ---
  ipcMain.handle("fichier:ecrire", async (_event, { chemin, buffer }) => {
    // LE PREMIER MAILLON DE LA CHAINE EST COUPE ICI. Ce pont ecrivait a n'importe quel chemin en
    // creant les dossiers, sans une ligne de validation ; combine a `fichier:ouvrir-chemin`, « ecrire
    // un script puis l'ouvrir » etait complet a partir d'un fichier recu. La regle vit dans
    // `chemin-sur.cjs`. ELLE NE DISTINGUE PLUS CE QUI S'ECRIT DE CE QUI S'OUVRE : l'exemption des
    // interpretes a ete retiree le 2026-10-26, sa justification etant fausse — `python:executer` et
    // `julia:executer` materialisent eux-memes leurs scripts, et ne passent jamais par ce pont.
    const verdict = ecritureAutorisee(chemin);
    // ET LE BORNAGE PAR RACINES, dont la sanction est ARMÉE par défaut depuis le 2026-10-27 :
    // hors racine, on refuse. `ATTIC_RACINES_STRICTES=0` l'éteint pour un diagnostic. Le refus rend
    // `null`, et chaque appelant le DIT : `src/docs/contrat-ecritures-refusees.test.ts` y veille.
    const racine = verdict.ok ? verdictRacine(chemin) : { ok: false, sousRacine: false };
    inscrireChemin("ecrire", chemin, verdict.ok && racine.ok, racine.sousRacine);
    if (!verdict.ok || !racine.ok) {
      const pourquoi = verdict.raison || racine.raison;
      console.error(`[attic] fichier:ecrire REFUSE: ${chemin} — ${pourquoi}`);
      if (racine.raison) console.error(`[attic] racines déclarées : ${racinesConnues().join(", ") || "aucune"}`);
      return null;
    }
    try {
      const dir = path.dirname(chemin);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = typeof buffer === "string" ? Buffer.from(buffer, "utf-8") : Buffer.from(buffer);
      await fs.promises.writeFile(chemin, data);
      console.log(`[attic] fichier:ecrire OK: ${chemin} (${data.length} octets)`);
      return chemin;
    } catch (err) {
      console.error(`[attic] fichier:ecrire ECHEC: ${chemin} — ${err?.message || err}`);
      return null;
    }
  });

  // --- IPC : copier un fichier binaire d'un chemin à un autre ---
  ipcMain.handle("fichier:copier", async (_event, { source, cible }) => {
    // CE CANAL ÉTAIT UN CONTOURNEMENT COMPLET DE LA BARRIÈRE D'ÉCRITURE, et je l'avais manqué :
    // j'avais borné `fichier:ecrire` en annonçant « le premier maillon est coupé », alors que `copier`
    // écrit lui aussi à une CIBLE ARBITRAIRE, en créant les dossiers. Copier un exécutable déjà
    // présent vers un dossier de démarrage n'a besoin de rien d'autre.
    //
    // Relevé en comptant les écritures directes du processus principal : il y en a DIX, et la barrière
    // n'en couvrait qu'UNE. C'est la cible qui est contrôlée, la source n'étant que lue.
    const verdictC = ecritureAutorisee(cible);
    const racineC = verdictC.ok ? verdictRacine(cible) : { ok: false, sousRacine: false };
    inscrireChemin("copier", cible, verdictC.ok && racineC.ok, racineC.sousRacine);
    if (!verdictC.ok || !racineC.ok) {
      console.error(`[attic] fichier:copier REFUSE: ${cible} — ${verdictC.raison || racineC.raison}`);
      return null;
    }
    try {
      const dir = path.dirname(cible);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await fs.promises.copyFile(source, cible);
      return cible;
    } catch {
      return null;
    }
  });

  // --- IPC : ouvrir un chemin dans l'application par défaut (navigateur pour .html) ---
  ipcMain.handle("fichier:ouvrir-chemin", async (_event, chemin) => {
    // LE REFUS EST ICI, DU COTE PRIVILEGIE, et non dans l'interface : un controle pose dans le
    // rendu se contourne, puisque c'est precisement le rendu qu'un noeud installe habite. La regle
    // et sa raison vivent dans `chemin-sur.cjs`, avec ses cas.
    const verdict = ouvertureAutorisee(chemin);
    const racineO = verdict.ok ? verdictRacine(chemin) : { ok: false, sousRacine: false };
    inscrireChemin("ouvrir", chemin, verdict.ok && racineO.ok, racineO.sousRacine);
    if (verdict.ok && !racineO.ok) {
      console.error(`[attic] fichier:ouvrir-chemin REFUSE: ${chemin} — ${racineO.raison}`);
      return { ok: false, erreur: racineO.raison };
    }
    if (!verdict.ok) {
      console.error(`[attic] fichier:ouvrir-chemin REFUSE: ${chemin} — ${verdict.raison}`);
      return { ok: false, erreur: verdict.raison };
    }
    try {
      const resultat = await shell.openPath(chemin);
      return { ok: resultat === "", erreur: resultat || undefined };
    } catch (err) {
      return { ok: false, erreur: err?.message || String(err) };
    }
  });

  // --- IPC : extraire l'image (pochette) d'un fichier MP3 (tag ID3 APIC) ---
  ipcMain.handle("mp3:extraire-pochette", async (_event, cheminFichier) => {
    try {
      const buf = await fs.promises.readFile(cheminFichier);
      if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
        const versionMinor = buf[3]; // 3 = ID3v2.3, 4 = ID3v2.4
        const headerSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
        let offset = 10;
        const end = 10 + headerSize;
        while (offset + 10 < end) {
          const frameId = buf.toString("ascii", offset, offset + 4);
          if (frameId.charCodeAt(0) === 0) break; // padding
          let frameSize;
          if (versionMinor === 4) {
            // ID3v2.4: synchint
            frameSize = ((buf[offset + 4] & 0x7f) << 21) | ((buf[offset + 5] & 0x7f) << 14) | ((buf[offset + 6] & 0x7f) << 7) | (buf[offset + 7] & 0x7f);
          } else {
            // ID3v2.3: taille sur 4 octets, big-endian (pas synchint)
            frameSize = buf.readUInt32BE(offset + 4);
          }
          if (frameSize <= 0 || offset + 10 + frameSize > buf.length) break;

          if (frameId === "APIC") {
            let pos = offset + 10;
            const encoding = buf[pos]; pos++;
            // MIME type (null-terminated ASCII)
            let mimeEnd = pos;
            while (mimeEnd < pos + 80 && buf[mimeEnd] !== 0) mimeEnd++;
            const mime = buf.toString("ascii", pos, mimeEnd);
            pos = mimeEnd + 1;
            pos++;
            // Description (null-terminated, encoding-dependent)
            if (encoding === 1 || encoding === 2) {
              // UTF-16: null-terminated with 2 bytes
              while (pos + 1 < buf.length && !(buf[pos] === 0 && buf[pos + 1] === 0)) pos += 2;
              pos += 2;
            } else {
              while (pos < buf.length && buf[pos] !== 0) pos++;
              pos++;
            }
            // Le reste = données de l'image
            const imgStart = pos;
            const imgEnd = offset + 10 + frameSize;
            if (imgEnd > imgStart && imgEnd <= buf.length) {
              const imgData = buf.subarray(imgStart, imgEnd);
              const b64 = imgData.toString("base64");
              return { ok: true, mime: mime || "image/jpeg", data: b64 };
            }
          }
          offset += 10 + frameSize;
        }
      }
      return { ok: false };
    } catch (err) {
      console.error(`[attic] mp3:extraire-pochette ECHEC: ${cheminFichier} — ${err?.message || err}`);
      return { ok: false };
    }
  });

  // Retourne le chemin <projet>/Music s'il existe, sinon null.
  ipcMain.handle("dossier:music-projet", () => {
    const candidat = path.resolve(__dirname, "..", "..", "Music");
    return fs.existsSync(candidat) ? candidat : null;
  });

  // Retourne (en le créant au besoin) le dossier de travail par défaut :
  // <projet>/work en dev, <Documents>/Attic en version packagée.
  // C'est le répertoire par défaut des dialogues d'export/import, et celui où les
  // scripts Python et Julia écrivent leurs sorties.
  function dossierDeTravailParDefaut() {
    // LE DOSSIER DE L'EXÉCUTABLE N'EST PLUS CANDIDAT, et c'était le premier.
    //
    // Relevé par Fabien : « par défaut le work se trouve à l'intérieur du programme, ce qui le range
    // dans une installation classique dans Program Files -> attic -> work. Cela ne correspond pas aux
    // conventions windows. » L'installeur est `perMachine`, donc une installation classique va bien
    // dans C:\Program Files\Attic.
    //
    // ET LE REPLI NE SUFFISAIT PAS À RATTRAPER LA CONVENTION. Pour un utilisateur standard, créer
    // « work » dans Program Files lève et l'on se rabattait sur userData : le résultat était correct
    // par accident. Mais que l'application tourne UNE FOIS en élevé, et l'écriture réussit : « work »
    // est créé dans Program Files, la sonde continue d'y réussir en élevé et d'échouer en usage
    // normal, et il y a dès lors DEUX dossiers de travail selon le contexte d'élévation, sans que
    // rien ne le dise.
    //
    // DOCUMENTS PLUTÔT QU'APPDATA, parce que le contenu appartient à la personne : des graphes
    // exportés, des sorties de script. `%APPDATA%` est fait pour l'état qu'on ne doit pas avoir à
    // chercher ; ici, elle doit pouvoir le trouver sans qu'on le lui dise. userData reste en repli,
    // un profil verrouillé ou un « Documents » redirigé pouvant n'être pas inscriptible.
    const candidats = app.isPackaged
      ? [path.join(app.getPath("documents"), "Attic"), path.join(app.getPath("userData"), "work")]
      : [path.join(path.resolve(__dirname, ".."), "work")];
    for (const dossier of candidats) {
      try {
        fs.mkdirSync(dossier, { recursive: true });
        // Sonde d'écriture RÉELLE : accessSync(W_OK) ne consulte pas les ACL sous
        // Windows (il ne reflète que l'attribut lecture-seule, ignoré pour les
        // dossiers) — un work/ pré-existant dans Program Files passait le test
        // alors que toute écriture échouait ensuite.
        const temoin = path.join(dossier, `.attic-sonde-${Date.now()}`);
        fs.writeFileSync(temoin, "");
        fs.unlinkSync(temoin);
        // LE DOSSIER DE TRAVAIL EST UNE RACINE, et il l'est LÉGITIMEMENT SANS DIALOGUE : c'est le
        // côté privilégié qui le choisit, dans la liste de candidats ci-dessus, et non le rendu qui
        // le nomme. Un nœud installé ne peut donc pas s'en fabriquer une.
        //
        // RELEVÉ PAR LA MESURE, le 2026-10-25 : le premier journal de Fabien portait une écriture,
        // `E:/attic/work/export.svg`, marquée HORS RACINE. Elle était pourtant parfaitement
        // légitime — c'est là que l'application est faite pour écrire. Sans cette déclaration, la
        // sanction rallumée aurait cassé tous les exports, ce qui est exactement la raison pour
        // laquelle elle est restée éteinte le temps du relevé.
        declarerRacine(dossier);
        return dossier;
      } catch { /* candidat suivant */ }
    }
    console.error("[attic] Aucun répertoire de travail inscriptible parmi :", candidats);
    return null;
  }

  // LE CALCUL EST SÉPARÉ DU CANAL, et il le fallait : la racine ne doit pas dépendre d'un APPEL DU
  // RENDU. `src/ui/App.tsx` ne demande ce dossier que si son réglage `attic-repertoire` est vide ;
  // pour qui emploie Attic depuis une semaine, le canal ne s'allume donc plus jamais, et la racine
  // n'était déclarée que chez un utilisateur neuf. Elle l'est maintenant au démarrage.
  ipcMain.handle("dossier:travail-defaut", () => dossierDeTravailParDefaut());

  // --- IPC : la taille d'un fichier, et une PLAGE d'octets ---
  //
  // POURQUOI LIRE PAR PLAGES. Un démultiplexeur n'a pas besoin de tout le fichier : il lit l'index,
  // puis les paquets qu'il recopie, et rien d'autre. Charger un film de 72 Mo pour en recopier l'image
  // retient 72 Mo qui ne servent à personne, et un film de deux gigaoctets ne tiendrait pas du tout.
  // Avec ces deux appels, la bibliothèque média demande ce dont elle a besoin, quand elle en a besoin,
  // et garde huit mébioctets en cache.
  //
  // Le descripteur est ouvert et refermé à chaque plage. C'est un aller-retour de plus par lecture,
  // mais le cache de l'appelant les espace, et un descripteur gardé ouvert survivrait à la fenêtre qui
  // l'a demandé — ce qui, sur un fichier que l'utilisateur voudrait déplacer, se paie plus cher.
  ipcMain.handle("fichier:taille", async (_event, cheminRelatif) => {
    try {
      const chemin = resoudreRessource(cheminRelatif, contexteRessources());
      if (!chemin || !fs.existsSync(chemin)) return null;
      return (await fs.promises.stat(chemin)).size;
    } catch {
      return null;
    }
  });

  ipcMain.handle("fichier:lire-plage", async (_event, { chemin: cheminRelatif, debut, fin }) => {
    try {
      const chemin = resoudreRessource(cheminRelatif, contexteRessources());
      if (!chemin || !fs.existsSync(chemin)) return null;
      const longueur = Math.max(0, Number(fin) - Number(debut));
      if (longueur === 0) return Buffer.alloc(0);
      const fd = await fs.promises.open(chemin, "r");
      try {
        const tampon = Buffer.alloc(longueur);
        const { bytesRead } = await fd.read(tampon, 0, longueur, Number(debut));
        // Une plage tronquée est rendue tronquée : inventer des zéros donnerait un fichier valide en
        // apparence et faux en contenu.
        return bytesRead === longueur ? tampon : tampon.subarray(0, bytesRead);
      } finally {
        await fd.close();
      }
    } catch {
      return null;
    }
  });

  // --- IPC : Lire un fichier binaire par chemin (sans dialogue) ---
  ipcMain.handle("fichier:lire-binaire", async (_event, cheminRelatif) => {
    try {
      // Le repli vers public/ en développement vit maintenant dans
      // resoudreRessource, et s'applique donc aussi aux six autres gestionnaires
      // qui ne l'avaient pas.
      const chemin = resoudreRessource(cheminRelatif, contexteRessources());
      if (!chemin || !fs.existsSync(chemin)) return null;
      const buf = await fs.promises.readFile(chemin);
      return { donnees: buf, nom: path.basename(chemin) };
    } catch {
      return null;
    }
  });

  // --- IPC : Lire un fichier texte par chemin ---
  ipcMain.handle("fichier:lire-texte", async (_event, cheminRelatif) => {
    try {
      const chemin = resoudreRessource(cheminRelatif, contexteRessources());
      if (!chemin || !fs.existsSync(chemin)) return null;
      return await fs.promises.readFile(chemin, "utf-8");
    } catch {
      return null;
    }
  });

  // --- IPC : Supprimer un fichier ---
  // ═══ LA SUPPRESSION PASSE PAR LES MEMES RACINES QUE L'ECRITURE, DEPUIS LE 2026-10-26 ═══
  //
  // Releve par une revue critique : « `fichier:supprimer` n'a aucune garde. Il supprime n'importe
  // quel fichier que l'utilisateur a le droit de supprimer, et il n'est soumis ni a la regle des
  // racines, ni au journal des chemins. Le bornage porte sur l'ecriture et l'ouverture, pas sur la
  // suppression ; meme armee, la sanction ne le couvrirait pas. » Verifie, et vrai : un
  // `fs.unlinkSync` sans une ligne de validation.
  //
  // L'EXTENSION NE DECIDE DE RIEN ICI, et c'est la difference avec l'ecriture. Refuser de supprimer
  // un `.exe` ne protegerait personne : ce qui se perd dans une suppression, c'est le fichier de
  // quelqu'un, et c'est l'ENDROIT qui le dit. Le verdict de racine est donc le seul garde qui vaille.
  //
  // ET IL FAUDRA QUE LE DOSSIER TEMPORAIRE SOIT UNE RACINE AVANT D'ARMER LA SANCTION : `python:executer`
  // et `julia:executer` y ecrivent leurs scripts, et les noeuds y suppriment leurs fichiers de
  // travail. Armer sans l'avoir declare casserait ces suppressions-la, en silence.
  ipcMain.handle("fichier:supprimer", async (_event, chemin) => {
    const racine = verdictRacine(chemin);
    inscrireChemin("supprimer", chemin, racine.ok, racine.sousRacine);
    if (!racine.ok) {
      console.error(`[attic] fichier:supprimer REFUSE: ${chemin} — ${racine.raison}`);
      return false;
    }
    try {
      if (fs.existsSync(chemin)) fs.unlinkSync(chemin);
      return true;
    } catch {
      return false;
    }
  });

  return { dossierDeTravailParDefaut };
}

module.exports = { installerIpcFichiers };
