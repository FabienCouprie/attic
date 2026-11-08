// electron/ipc-modeles.cjs — Les téléchargements et les modèles : l'adresse qu'on va chercher, l'inventaire, la file, et les deux arrêts.
//
// TIRÉ DE `main.cjs` LE 2026-11-08, tel quel, par le lot 5 de la revue d'architecture du
// 2026-10-31. C'est le quatrième des six modules qui reprennent par famille les canaux de
// `main.cjs`, après `ipc-maj.cjs`, `ipc-scripts.cjs` et `ipc-fichiers.cjs`. Aucune ligne de calcul
// n'a été retouchée : le bloc est le même, indenté d'un cran dans la fonction qui l'installe.
//
// LES CINQ CANAUX : `telecharger:url`, `modeles:etat`, `modeles:annuler`, `travail:annuler` et
// `modeles:telecharger`. `travail:annuler` n'arrête pas un téléchargement : c'est l'arrêt d'une
// exécution, qui tue les processus enfants de la fenêtre qui le demande. Il vient quand même avec
// les autres, parce que son commentaire est écrit contre celui de `modeles:annuler`, juste au-dessus,
// et que les deux arrêts se lisent mieux côte à côte.
//
// IL SORT AVANT LES MOTEURS, PARCE QUE DEUX MOTEURS EN DÉPENDENT. `stable-audio-3:generer` et
// `sdcpp:moss` prennent eux-mêmes leur paquet à la première utilisation, par le même
// téléchargement que le bouton des modèles. La fonction qui installe les canaux leur rend donc le
// manifeste, les sondes et le téléchargement, et `main.cjs` les leur passera quand ils partiront à
// leur tour.
//
// UNE SEULE LIGNE NOUVELLE, ET ELLE NE CALCULE RIEN DE NEUF. Ces deux moteurs lisaient
// `annulationModeles`, une variable que chaque téléchargement réaffecte. Une variable ne traverse
// pas la frontière d'un module : `main.cjs` en aurait gardé la valeur du chargement, `null`, et
// n'aurait jamais vu un téléchargement en cours. Ils appellent désormais `telechargementEnCours()`,
// qui rend l'expression même qu'ils écrivaient.
//
// IL REÇOIT CE DONT IL A BESOIN, et ne requiert pas `electron` : c'est la forme d'`ipc-maj.cjs`.
// `ipcMain` lui vient déjà emballé, et le contexte des ressources comme le dossier des ressources
// de l'utilisateur restent dans `main.cjs`, qui les retient et que tous les moteurs consultent.
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { URL: UrlModele } = require("url");
const { annulerLesTravaux, travauxEnCours } = require("./travaux.cjs");
const { HOTES_TELECHARGEMENT, hoteDeTelechargementAutorise } = require("./hotes-telechargement.cjs");
const { sondesRessources } = require("./chemins-ressources.cjs");
const {
  inventaire: inventaireModeles, avancement: avancementModeles,
  telechargerFichier, poser: poserFichier,
} = require("./telechargement-modeles.cjs");

/**
 * Installe les cinq canaux `telecharger:url`, `modeles:` et `travail:annuler`.
 *
 * @param ipcMain                        le récepteur des IPC, déjà emballé par `main.cjs` ;
 * @param contexteRessources             le contexte de résolution des ressources de `main.cjs` ;
 * @param dossierRessourcesUtilisateur   le dossier où les modèles descendent, que `main.cjs` retient.
 * @returns ce dont les deux moteurs qui prennent leur paquet ont besoin : `lireManifesteModeles`,
 *   `sondesModeles`, `telechargerModeles` et `telechargementEnCours`.
 */
function installerIpcModeles({ ipcMain, contexteRessources, dossierRessourcesUtilisateur }) {
  // --- IPC : télécharger le contenu d'une URL (via Node.js, sans CORS) ---
  function telechargerRedirections(url, profondeur = 0) {
    return new Promise((resolve) => {
      if (profondeur > 5) {
        return resolve({ erreur: "Trop de redirections" });
      }
      // LA VERIFICATION EST ICI ET NON CHEZ L'APPELANT, donc CHAQUE REDIRECTION y repasse : une
      // liste qui ne regarderait que la premiere adresse se contournerait par un hote autorise qui
      // renvoie ailleurs, ce qui est la forme la plus courante du detournement.
      if (!hoteDeTelechargementAutorise(url)) {
        console.error(`[attic] telecharger:url REFUSE: ${url.protocol}//${url.hostname}`);
        return resolve({ erreur: `hote refuse : ${url.hostname} (seuls ${HOTES_TELECHARGEMENT.join(", ")} sont servis, en HTTPS)` });
      }
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.get(url, { headers: { "User-Agent": "Attic/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const suivante = new UrlModele(res.headers.location, url);
          return resolve(telechargerRedirections(suivante, profondeur + 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ donnees: Buffer.concat(chunks), statut: res.statusCode }));
      });
      req.on("error", (err) => resolve({ erreur: err.message }));
    });
  }
  ipcMain.handle("telecharger:url", async (_event, urlStr) => {
    try {
      const url = new UrlModele(urlStr);
      return await telechargerRedirections(url, 0);
    } catch (err) {
      return { erreur: String(err) };
    }
  });

  // ─── Les modèles ONNX, téléchargés à la demande ───
  //
  // L'installeur n'en embarque aucun depuis le 2026-10-08 : tout passe par ces gestionnaires. Sur une
  // installation à jour, l'inventaire répond « rien à prendre » et l'icône sert alors à voir ce qui
  // est là et à reprendre un modèle abîmé.

  /** Le manifeste, lu à chaque appel : il est minuscule, et le relire évite un cache à invalider. */
  function lireManifesteModeles() {
    try {
      const chemin = path.join(__dirname, "..", "scripts", "modeles-manifest.json");
      return JSON.parse(fs.readFileSync(chemin, "utf8"));
    } catch (err) {
      console.error("[attic] manifeste des modèles illisible :", err.message);
      return { version: 0, modeles: [] };
    }
  }

  /**
   * Les sondes de l'inventaire, branchées sur le MÊME résolveur que les nœuds.
   *
   * C'est ce qui garantit que « présent » veut dire la même chose pour l'icône et pour le nœud qui
   * ouvrira le modèle : un fichier vu ici est un fichier que `lireModeleEmbarque` trouvera, qu'il
   * vienne des ressources livrées ou du dossier de l'utilisateur.
   */
  function sondesModeles() {
    return sondesRessources(contexteRessources());
  }

  ipcMain.handle("modeles:etat", () => {
    const inv = inventaireModeles(lireManifesteModeles(), sondesModeles());
    return { ...inv, dossier: dossierRessourcesUtilisateur() };
  });

  let annulationModeles = null;

  ipcMain.handle("modeles:annuler", () => {
    annulationModeles?.abort();
    return { ok: true };
  });

  // ═══ LE SECOND CANAL D'ANNULATION, ET IL MANQUAIT ═══
  //
  // Celui du dessus n'arrête que des requêtes HTTP. Tout le reste — une génération de chanson, une
  // séparation de pistes, un script de l'utilisateur — vit dans un processus ENFANT, que personne ne
  // tuait : « Arrêter » rendait la main au rendu pendant que la carte graphique restait occupée, et
  // l'ordonnanceur attendait la fin du travail abandonné avant de lancer le suivant.
  //
  // IL REND CE QU'IL A TOUCHÉ, et non `{ ok: true }`. Un canal d'annulation qui répond toujours la
  // même chose ne se mesure pas ; celui-ci dit combien de travaux tournaient, ce qu'un cas peut lire.
  //
  // ET IL NE VISE QUE LA FENÊTRE QUI LE DEMANDE. Toutes les fenêtres partagent ce processus : tuer
  // tout, c'était arrêter la séparation qu'une autre fenêtre attendait.
  ipcMain.handle("travail:annuler", (event) => {
    const fenetre = event.sender.id;
    const avant = travauxEnCours(fenetre);
    const tues = annulerLesTravaux(fenetre);
    return { ok: true, tues, avant };
  });

  /**
   * Télécharge une file de modèles, et pose ce qu'elle rapporte.
   *
   * UN SEUL CHEMIN POUR DEUX APPELANTS. Le bouton « Récupérer les modèles IA » et la récupération
   * automatique d'un composant passent par ici : la vérification d'empreinte, l'extraction entrée par
   * entrée et le refus des chemins qui sortent du dossier ne doivent exister qu'une fois. `dire`
   * reçoit l'avancement ; l'appelant décide où il l'envoie, ou l'ignore.
   */
  async function telechargerModeles(file, dire = () => {}) {
    annulationModeles = new AbortController();
    const signal = annulationModeles.signal;
    const racine = dossierRessourcesUtilisateur();
    const faits = [];

    try {
      for (const modele of file) {
        if (signal.aborted) break;
        const suivi = (octetsRecus) => dire({
          phase: "telechargement", modele: modele.id, nom: modele.nom,
          ...avancementModeles({ faits, courant: modele, octetsRecus, file }),
        });
        suivi(0);

        // Une archive descend sous son propre nom, un fichier unique sous le chemin qu'il aura.
        const archive = modele.source.type === "archive";
        const destination = archive
          ? path.join(racine, `${modele.id}.zip`)
          : path.join(racine, modele.fichiers[0].chemin);

        const res = await telechargerFichier(modele.source.url, destination, { onProgress: suivi, signal });
        if (!res.ok) {
          if (res.annule) { dire({ phase: "annule" }); return { ok: false, annule: true, faits }; }
          dire({ phase: "erreur", modele: modele.id, erreur: res.erreur });
          return { ok: false, erreur: res.erreur, modele: modele.id, faits };
        }
        // L'EMPREINTE EST VÉRIFIÉE ICI, et nulle part ailleurs : c'est le seul moment où l'on tient
        // les octets. Un modèle qui ne correspond pas est jeté — mieux vaut pas de modèle qu'un
        // modèle faux, qui se manifesterait par un nœud aux résultats inexplicables.
        if (modele.source.sha256 && res.sha256 !== modele.source.sha256) {
          try { fs.unlinkSync(res.temporaire); } catch { /* déjà parti */ }
          const erreur = `Empreinte incorrecte pour ${modele.id}`;
          dire({ phase: "erreur", modele: modele.id, erreur });
          return { ok: false, erreur, modele: modele.id, faits };
        }

        if (archive) {
          dire({ phase: "extraction", modele: modele.id, nom: modele.nom,
            ...avancementModeles({ faits, courant: modele, octetsRecus: modele.octets, file }) });
          const AdmZip = require("adm-zip");
          const zip = new AdmZip(res.temporaire);
          // LA RACINE VIENT DU MANIFESTE, et non plus de `oonx` en dur : les points de contrôle
          // Magenta vivent sous `magenta/`, et une archive dépliée au mauvais endroit donnerait un
          // modèle introuvable sans rien dire. Le premier segment du premier fichier la porte.
          const premier = modele.fichiers?.[0]?.chemin ?? "oonx/";
          const dossierModele = path.join(racine, premier.split("/")[0]);
          fs.mkdirSync(dossierModele, { recursive: true });
          const dossierOonx = dossierModele;
          // Chaque entrée est posée nous-mêmes, jamais `extractAllTo` : c'est la précaution que
          // décrit `extraire-node-zip.cjs`, et elle ne dépend pas de la version d'adm-zip.
          for (const entree of zip.getEntries()) {
            if (entree.isDirectory) continue;
            const cible = path.resolve(dossierOonx, entree.entryName);
            if (!cible.startsWith(path.resolve(dossierOonx) + path.sep)) {
              throw new Error(`Chemin hors du dossier : ${entree.entryName}`);
            }
            fs.mkdirSync(path.dirname(cible), { recursive: true });
            fs.writeFileSync(cible, entree.getData());
          }
          fs.unlinkSync(res.temporaire);
        } else {
          poserFichier(res.temporaire, destination);
        }
        faits.push(modele);
      }
    } catch (err) {
      dire({ phase: "erreur", erreur: String(err && err.message ? err.message : err) });
      return { ok: false, erreur: String(err && err.message ? err.message : err), faits };
    } finally {
      annulationModeles = null;
    }

    dire({ phase: "fini", ...avancementModeles({ faits, courant: null, file }) });
    return { ok: true, faits: faits.map((m) => m.id) };
  }

  ipcMain.handle("modeles:telecharger", async (evenement, ids) => {
    if (annulationModeles && !annulationModeles.signal.aborted) {
      return { ok: false, erreur: "Un téléchargement est déjà en cours" };
    }
    const manifeste = lireManifesteModeles();
    const inv = inventaireModeles(manifeste, sondesModeles());
    const voulus = Array.isArray(ids) && ids.length > 0 ? ids : inv.manquants;
    const file = manifeste.modeles.filter((m) => voulus.includes(m.id) && m.source?.url);
    if (file.length === 0) return { ok: true, faits: [], rien: true };

    const res = await telechargerModeles(file, (etat) => evenement.sender.send("modeles:progression", etat));
    return res.ok
      ? { ...res, etat: inventaireModeles(lireManifesteModeles(), sondesModeles()) }
      : res;
  });

  /**
   * Un téléchargement de modèles tourne-t-il ? Les deux moteurs qui prennent leur paquet eux-mêmes
   * le demandent avant d'en lancer un second. C'est l'expression qu'ils lisaient sur la variable,
   * qui ne les suit pas hors de ce module.
   */
  const telechargementEnCours = () => annulationModeles && !annulationModeles.signal.aborted;

  return { lireManifesteModeles, sondesModeles, telechargerModeles, telechargementEnCours };
}

module.exports = { installerIpcModeles };
