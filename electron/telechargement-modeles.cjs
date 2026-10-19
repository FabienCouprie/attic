"use strict";

// electron/telechargement-modeles.cjs — Les modèles ONNX, téléchargés à la demande.
//
// POURQUOI CE MODULE. L'installeur ne contient aucun modèle, et c'est le seul qu'on publie depuis
// le 2026-10-08 : tout se récupère depuis l'application, sur demande — pas au premier usage d'un
// nœud, où l'attente arriverait au plus mauvais moment, mais quand l'utilisateur le décide.
//
// CETTE RÈGLE A UNE EXCEPTION DEPUIS LE 25 SEPTEMBRE 2026, à la demande de Fabien : un composant
// qui vient d'être lancé et dont le paquet manque le prend lui-même, au lieu de renvoyer vers le
// bouton de la barre d'outils. La raison du partage : le bouton prend TOUT, et engager 1,9 Go sans
// qu'on l'ait voulu serait abusif ; un composant lancé, lui, porte une intention explicite et ne
// concerne qu'un paquet. Voir `stable-audio-3:generer` dans main.cjs, qui passe par
// `telechargerModeles`, le même chemin que le bouton.
//
// CE QUI EST SÉPARÉ, ET POURQUOI. L'inventaire — qu'est-ce qui est là, qu'est-ce qui manque, quel
// poids reste à prendre — est une fonction PURE, qui reçoit un manifeste et deux sondes. Elle est
// éprouvable sans réseau ni disque, et c'est elle qui porte les décisions : ce qui compte comme
// présent, ce qu'on redemande, ce qu'on annonce. Le téléchargement lui-même n'est qu'un tuyau.
//
// CE QUI COMPTE COMME PRÉSENT : un fichier qui existe ET dont la taille est exactement celle du
// manifeste. L'empreinte n'est PAS vérifiée à l'inventaire — il faudrait relire 1,5 Go à chaque
// ouverture de la fenêtre —, elle l'est à l'arrivée de chaque téléchargement, là où un octet de
// travers doit être refusé. Une taille qui diffère suffit à rattraper un fichier tronqué, qui est
// le cas réel : une connexion coupée en cours de route.

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

/** Un fichier est présent s'il existe et fait exactement la taille annoncée. */
function fichierPresent(f, { existe, taille }) {
  if (!existe(f.chemin)) return false;
  const t = taille(f.chemin);
  return typeof t === "number" && t === f.octets;
}

/**
 * L'inventaire : pour chaque modèle, ce qui est là et ce qui manque.
 *
 * `existe` et `taille` reçoivent le chemin RELATIF du manifeste (`oonx/x.onnx`) : c'est à
 * l'appelant de savoir où il regarde, ce qui permet d'interroger le dossier livré et celui de
 * l'utilisateur avec la même fonction.
 */
function inventaire(manifeste, sondes) {
  const modeles = (manifeste?.modeles ?? []).map((m) => {
    const manquants = m.fichiers.filter((f) => !fichierPresent(f, sondes));
    const octetsManquants = manquants.reduce((s, f) => s + f.octets, 0);
    return {
      id: m.id, nom: m.nom, nomEn: m.nomEn, noeuds: m.noeuds ?? [],
      octets: m.octets,
      complet: manquants.length === 0,
      // Un modèle à moitié là n'est pas exploitable : il se retélécharge en entier. Le dire
      // évite la question « pourquoi reprend-il ce que j'ai déjà ? ».
      partiel: manquants.length > 0 && manquants.length < m.fichiers.length,
      octetsManquants,
      // Sans adresse, il n'est pas téléchargeable : l'interface doit le montrer autrement qu'en
      // promettant un bouton qui ne ferait rien.
      telechargeable: Boolean(m.source?.url),
    };
  });
  const aPrendre = modeles.filter((m) => !m.complet && m.telechargeable);
  return {
    modeles,
    complets: modeles.filter((m) => m.complet).length,
    total: modeles.length,
    // Un modèle partiel se reprend en ENTIER : ce qui reste à télécharger est son poids complet.
    octetsAPrendre: aPrendre.reduce((s, m) => s + m.octets, 0),
    manquants: aPrendre.map((m) => m.id),
    sansAdresse: modeles.filter((m) => !m.complet && !m.telechargeable).map((m) => m.id),
  };
}

/**
 * L'avancement d'une file, en une seule fraction.
 *
 * Le poids déjà acquis compte les modèles terminés ET la portion reçue du modèle courant : une
 * barre qui repart de zéro à chaque modèle ne dit rien de l'attente qui reste, et c'est elle qu'on
 * regarde quand on télécharge un gigaoctet et demi.
 */
function avancement({ faits = [], courant = null, octetsRecus = 0, file = [] }) {
  const poids = (ids) => ids.reduce((s, m) => s + m.octets, 0);
  const total = poids(file);
  const acquis = poids(faits) + (courant ? Math.min(octetsRecus, courant.octets) : 0);
  return {
    octets: acquis,
    total,
    fraction: total > 0 ? Math.min(1, acquis / total) : 1,
    fait: faits.length,
    nombre: file.length,
  };
}

// ── Le tuyau ────────────────────────────────────────────────────────────────────

/**
 * Télécharge une URL vers un fichier, en flux.
 *
 * EN FLUX, ET NON EN MÉMOIRE : `telecharger:url` de main.cjs accumule tout dans un tableau de
 * morceaux avant de répondre, ce qui va très bien pour une image et pas du tout pour un modèle de
 * sept cents mégaoctets. Le fichier s'écrit sous un nom temporaire et n'est renommé qu'une fois
 * vérifié : l'inventaire ne peut donc jamais prendre un modèle à moitié écrit pour un bon.
 *
 * ET UNE COUPURE NE JETTE PLUS CE QUI ÉTAIT LÀ. Relevé par Fabien : cliquer sur l'icône pendant un
 * téléchargement le relançait depuis le début. Le clic interrompt — c'est voulu — mais le
 * `.partiel` était effacé à l'abandon et aucune requête ne portait de `Range` : sur un modèle de
 * 1,7 Go, une seconde d'inattention coûtait tout. Le partiel reste désormais, la requête suivante
 * demande la suite, et c'est l'appelant qui l'efface si l'empreinte ne tombe pas juste.
 *
 * MESURÉ AVANT D'ÊTRE ÉCRIT, sur un asset de release le 2026-10-19 : GitHub rend `206` et
 * `accept-ranges: bytes`, et un fichier pris en deux morceaux par plages est octet pour octet
 * celui du manifeste. Deux pièges en sont sortis, tenus par `telechargement-reprise.test.ts` :
 * c'est l'hôte final qui honore la plage, jamais `github.com`, donc l'en-tête doit traverser la
 * redirection ; et une plage demandée qui revient en `200` n'a pas été honorée, auquel cas on
 * tronque au lieu d'ajouter.
 */
/** L'empreinte d'un fichier, lue sur le disque plutôt que calculée au vol. */
function empreinteDuFichier(chemin) {
  return new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    const lect = fs.createReadStream(chemin);
    lect.on("data", (bloc) => hash.update(bloc));
    lect.on("error", () => resolve(null));
    lect.on("end", () => resolve(hash.digest("hex")));
  });
}

function telechargerFichier(url, destination, o = {}) {
  const { onProgress = () => {}, signal, profondeur = 0, deja = 0 } = o;
  return new Promise((resolve) => {
    if (profondeur > 5) return resolve({ ok: false, erreur: "Trop de redirections" });
    if (signal?.aborted) return resolve({ ok: false, annule: true });

    let cible;
    try { cible = new URL(url); } catch { return resolve({ ok: false, erreur: `URL invalide : ${url}` }); }
    const mod = cible.protocol === "https:" ? https : http;
    const temporaire = `${destination}.partiel`;
    fs.mkdirSync(path.dirname(destination), { recursive: true });

    // CE QUI EST DÉJÀ LÀ SE REPREND. `o.plage` est posé par la redirection : l'octet de départ se
    // décide une seule fois, sur la première requête, sinon une redirection qui arrive après le
    // début de l'écriture relirait une taille entre-temps changée.
    const debut = o.plage ?? (fs.existsSync(temporaire) ? fs.statSync(temporaire).size : 0);
    const entetes = { "User-Agent": "Attic", ...(debut > 0 ? { Range: `bytes=${debut}-` } : {}) };

    const req = mod.get(cible, { headers: entetes }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        // LA PLAGE TRAVERSE LA REDIRECTION, et c'est le point qui décide de tout. Mesuré sur un
        // asset de release le 2026-10-19 : `github.com` rend un 302 sans regarder la plage, et
        // c'est l'hôte final qui l'honore. Un en-tête perdu en route rendrait un 200 avec le
        // fichier entier, qu'on ajouterait à la suite du partiel — fichier du double, empreinte
        // fausse, et découverte après coup seulement.
        return resolve(telechargerFichier(new URL(res.headers.location, cible).href, destination,
          { ...o, profondeur: profondeur + 1, plage: debut }));
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return resolve({ ok: false, erreur: `HTTP ${res.statusCode} sur ${url}` });
      }

      // UNE PLAGE DEMANDÉE QUI REVIENT EN 200 N'A PAS ÉTÉ HONORÉE : le corps est le fichier
      // entier. On repart donc de zéro en tronquant, au lieu d'ajouter — un miroir mal configuré
      // ne doit pas pouvoir fabriquer un fichier du double.
      const reprise = debut > 0 && res.statusCode === 206;
      const sortie = fs.createWriteStream(temporaire, reprise ? { flags: "a" } : {});
      let recus = deja + (reprise ? debut : 0);
      let fini = false;
      const abandonner = (erreur, annule = false) => {
        if (fini) return;
        fini = true;
        res.destroy();
        sortie.destroy();
        // LE PARTIEL RESTE, et c'est tout l'objet de ce lot : il est la reprise. Un partiel
        // corrompu ne survit pas pour autant, l'appelant l'effaçant dès que l'empreinte ne tombe
        // pas juste.
        resolve({ ok: false, erreur, annule, temporaire });
      };
      const surAnnulation = () => abandonner("Annulé", true);
      signal?.addEventListener?.("abort", surAnnulation, { once: true });

      res.on("data", (bloc) => { recus += bloc.length; onProgress(recus); });
      res.on("error", (err) => abandonner(err.message));
      sortie.on("error", (err) => abandonner(err.message));
      res.pipe(sortie);
      sortie.on("finish", async () => {
        signal?.removeEventListener?.("abort", surAnnulation);
        if (signal?.aborted) return abandonner("Annulé", true);
        if (fini) return;
        fini = true;
        // L'EMPREINTE SE LIT SUR LE DISQUE, et non au fil de l'eau. Une reprise devrait sinon
        // réamorcer le calcul sur ce qui était déjà écrit, ce qui ferait deux chemins au lieu
        // d'un ; et lire le fichier achevé vérifie ce qui est VRAIMENT là, non ce qu'on croit y
        // avoir mis. Le prix est une relecture, quelques secondes sur le plus gros modèle.
        const sha256 = await empreinteDuFichier(temporaire);
        const octets = fs.existsSync(temporaire) ? fs.statSync(temporaire).size : 0;
        resolve({ ok: true, temporaire, destination, sha256, octets: deja + octets });
      });
    });
    req.on("error", (err) => resolve({ ok: false, erreur: err.message, temporaire }));
  });
}

/** Renomme le fichier temporaire sur sa destination, en écrasant ce qui s'y trouvait. */
function poser(temporaire, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { force: true });
  fs.renameSync(temporaire, destination);
}

module.exports = { inventaire, avancement, fichierPresent, telechargerFichier, poser };
