"use strict";

// electron/telechargement-modeles.cjs — Les modèles ONNX, téléchargés à la demande.
//
// POURQUOI CE MODULE. L'installeur allégé ne contient aucun modèle : 1,5 Go de moins, et ce qui
// manque se récupère depuis l'application, sur demande — pas au premier usage d'un nœud, où
// l'attente arriverait au plus mauvais moment, mais quand l'utilisateur le décide.
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
 * sept cents mégaoctets. L'empreinte se calcule au passage, le fichier s'écrit sous un nom
 * temporaire et n'est renommé qu'une fois vérifié — une coupure laisse un `.partiel` à jeter, pas
 * un modèle à moitié écrit que l'inventaire croirait bon.
 */
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

    const req = mod.get(cible, { headers: { "User-Agent": "Attic" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(telechargerFichier(new URL(res.headers.location, cible).href, destination,
          { ...o, profondeur: profondeur + 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ ok: false, erreur: `HTTP ${res.statusCode} sur ${url}` });
      }
      const hash = crypto.createHash("sha256");
      const sortie = fs.createWriteStream(temporaire);
      let recus = deja;
      const abandonner = (erreur, annule = false) => {
        res.destroy();
        sortie.destroy();
        try { fs.unlinkSync(temporaire); } catch { /* déjà parti */ }
        resolve({ ok: false, erreur, annule });
      };
      const surAnnulation = () => abandonner("Annulé", true);
      signal?.addEventListener?.("abort", surAnnulation, { once: true });

      res.on("data", (bloc) => { hash.update(bloc); recus += bloc.length; onProgress(recus); });
      res.on("error", (err) => abandonner(err.message));
      sortie.on("error", (err) => abandonner(err.message));
      res.pipe(sortie);
      sortie.on("finish", () => {
        signal?.removeEventListener?.("abort", surAnnulation);
        if (signal?.aborted) return abandonner("Annulé", true);
        resolve({ ok: true, temporaire, destination, sha256: hash.digest("hex"), octets: recus });
      });
    });
    req.on("error", (err) => resolve({ ok: false, erreur: err.message }));
  });
}

/** Renomme le fichier temporaire sur sa destination, en écrasant ce qui s'y trouvait. */
function poser(temporaire, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { force: true });
  fs.renameSync(temporaire, destination);
}

module.exports = { inventaire, avancement, fichierPresent, telechargerFichier, poser };
