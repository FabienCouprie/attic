// electron/ipc-pdf.cjs — Un SVG et son titre, imprimés en PDF par le Chromium d'Electron.
//
// ═══ POURQUOI CHROMIUM, ET AUCUN PAQUET ═══
//
// Le nœud « SVG vers PDF » reçoit la page que grave « Partition gravée ». Verovio y écrit des chemins,
// des `<use>` vers des glyphes définis une fois, du texte, une feuille de style, et une police musicale
// embarquée en `@font-face` pour les nuances et les signes de tempo. Un convertisseur écrit à la main
// devrait tout cela, et Chromium le sait déjà : il est dans Electron, il imprime en PDF vectoriel, il
// embarque les polices et garde le texte lisible. Relevé le 2026-11-23 sur une gamme gravée avec
// paroles, tempo et deux nuances : une page, 36 Ko, 230 ms, et le texte relu par le lecteur du nœud
// « Extraction PDF » rend le titre, « Allegro » et les huit syllabes.
//
// ═══ UNE VUE DÉTACHÉE, ET NON UNE FENÊTRE CACHÉE ═══
//
// Une `WebContentsView` jamais attachée imprime aussi bien, relevé le même jour, et elle n'entre pas
// dans `BrowserWindow.getAllWindows()`. Une fenêtre cachée y entrerait, et la mise à jour, qui prend
// la première fenêtre vivante de cette liste pour demander la sauvegarde, pourrait tomber sur elle.
//
// ═══ CE QUE LA PAGE A LE DROIT DE FAIRE : RIEN ═══
//
// Le SVG vient d'un graphe, donc de n'importe où. Il est posé en `<img>`, et non dans le document : un
// SVG en image n'exécute aucun script et ne charge aucune ressource externe, et il est lu par
// l'analyseur XML, exactement comme un fichier `.svg`. S'y ajoutent trois verrous : JavaScript coupé
// dans la vue, une session à elle, en mémoire, qui refuse toute requête sauf la page elle-même et les
// adresses `data:`, et une politique de contenu qui n'admet que les images `data:` et le style écrit.
//
// ═══ UN FICHIER TEMPORAIRE, ET NON UNE ADRESSE `data:` ═══
//
// Chromium borne la longueur d'une adresse, et une page de partition dense dépasse vite le mégaoctet
// une fois le SVG en base 64. La page est donc écrite dans un dossier temporaire, effacé après.
"use strict";

const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

/** Les formats de page, en millimètres, portrait. */
const FORMATS = {
  a4: { largeur: 210, hauteur: 297 },
  lettre: { largeur: 215.9, hauteur: 279.4 },
};
const ORIENTATIONS = ["portrait", "paysage"];
const MARGE_MM = 15;
/** Ce qu'on retire à la hauteur utile, pour qu'un arrondi de Chromium n'ouvre pas une page blanche. */
const JEU_MM = 1;
const SVG_MAX = 64 * 1024 * 1024;
const TITRE_MAX = 300;
const DELAI_MS = 60_000;
const PARTITION = "attic-impression-pdf";

const ECHAPPEMENTS = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Un texte rendu inerte dans du HTML : il s'affiche, il ne s'interprète pas. */
function echapperHtml(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ECHAPPEMENTS[c]);
}

/**
 * La demande telle que le rendu l'envoie, vérifiée champ par champ ; un refus porte le nom du champ.
 *
 * LE RENDU VÉRIFIE DÉJÀ, et c'est voulu que ce soit refait ici : le processus principal ne se fie pas
 * à ce qu'une page lui passe.
 */
function demandeValide(d) {
  if (!d || typeof d !== "object") return { ok: false, refus: "forme" };
  const { svg, titre = "", nom = "", format, orientation } = d;
  if (typeof svg !== "string" || !/<svg[\s>]/i.test(svg)) return { ok: false, refus: "svg" };
  if (svg.length > SVG_MAX) return { ok: false, refus: "taille" };
  if (typeof titre !== "string" || titre.length > TITRE_MAX) return { ok: false, refus: "titre" };
  if (typeof nom !== "string" || nom.length > TITRE_MAX) return { ok: false, refus: "nom" };
  if (!Object.hasOwn(FORMATS, format)) return { ok: false, refus: "format" };
  if (!ORIENTATIONS.includes(orientation)) return { ok: false, refus: "orientation" };
  return { ok: true, demande: { svg, titre: titre.trim(), nom: nom.trim(), format, orientation } };
}

/** La taille de la page, en millimètres : largeur, puis hauteur. */
function taillePage(format, orientation) {
  const { largeur, hauteur } = FORMATS[format];
  return orientation === "paysage" ? [hauteur, largeur] : [largeur, hauteur];
}

/**
 * La page à imprimer : le titre en tête s'il y en a un, puis le SVG, à la largeur de la page.
 *
 * UNE SEULE PAGE, QUOI QU'IL ARRIVE. Le corps fait la hauteur utile, le titre prend ce qu'il lui faut,
 * sur autant de lignes qu'il faut, et l'image se réduit dans ce qui reste en gardant ses proportions
 * (`object-fit: contain`). Une image ne se coupe pas d'une page à l'autre : trop haute, elle
 * déborderait sur une seconde page qu'elle ne remplirait pas.
 *
 * LE TITRE DU DOCUMENT est celui de la partition, ou à défaut le nom du fichier : sans lui, Chromium
 * écrit dans les propriétés du PDF le nom de la page temporaire.
 */
function pageDImpression({ svg, titre, nom, format, orientation }) {
  const [largeur, hauteur] = taillePage(format, orientation);
  const image = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`,
    `<title>${echapperHtml(titre || nom)}</title>`,
    "<style>",
    `@page { size: ${largeur}mm ${hauteur}mm; margin: ${MARGE_MM}mm; }`,
    "html, body { margin: 0; background: #fff; }",
    `body { display: flex; flex-direction: column; height: ${Math.round((hauteur - 2 * MARGE_MM - JEU_MM) * 100) / 100}mm; overflow: hidden; }`,
    "h1 { flex: none; margin: 0 0 6mm; font: bold 20pt/1.25 Times, serif; text-align: center; overflow-wrap: anywhere; }",
    "img { display: block; flex: 0 1 auto; min-height: 0; width: 100%; object-fit: contain; object-position: top center; }",
    "</style></head><body>",
    titre ? `<h1>${echapperHtml(titre)}</h1>` : "",
    `<img alt="" src="${image}">`,
    "</body></html>",
  ].join("\n");
}

/** Une promesse qui lève passé ce délai, en nommant ce qui l'a dépassé. */
function avecDelai(promesse, ms, quoi) {
  let minuterie = null;
  const limite = new Promise((_, rejeter) => {
    minuterie = setTimeout(() => rejeter(new Error(`${quoi} : plus de ${ms / 1000} s`)), ms);
  });
  return Promise.race([promesse, limite]).finally(() => clearTimeout(minuterie));
}

// Les pages que la session d'impression laisse charger : celles qu'on vient d'écrire, pas d'autres.
const pagesPermises = new Set();
let sessionPreparee = null;

/** La session de l'impression, préparée une fois : en mémoire, sans permission, sans réseau. */
function sessionDImpression(session) {
  if (!sessionPreparee) {
    sessionPreparee = session.fromPartition(PARTITION);
    sessionPreparee.webRequest.onBeforeRequest((details, rappel) => {
      rappel({ cancel: !(pagesPermises.has(details.url) || details.url.startsWith("data:")) });
    });
    sessionPreparee.setPermissionRequestHandler((_contenu, _permission, rappel) => rappel(false));
  }
  return sessionPreparee;
}

/** Imprime une demande vérifiée et rend les octets du PDF. */
async function imprimerSvgEnPdf({ WebContentsView, session }, demande) {
  // LE CHEMIN LONG, et non celui que donne `TEMP` : sur la CI Windows, il porte un nom court
  // (`RUNNER~1`), et l'adresse que Chromium demanderait ne serait plus celle qu'on a permise.
  const temporaire = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "attic-pdf-")));
  const page = path.join(temporaire, "page.html");
  const adresse = pathToFileURL(page).href;
  let vue = null;
  try {
    await fsp.writeFile(page, pageDImpression(demande), "utf8");
    pagesPermises.add(adresse);
    vue = new WebContentsView({
      webPreferences: {
        javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false,
        session: sessionDImpression(session),
      },
    });
    vue.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    vue.webContents.on("will-navigate", (e) => e.preventDefault());
    await avecDelai(vue.webContents.loadFile(page), DELAI_MS, "chargement de la page");
    const [largeur, hauteur] = taillePage(demande.format, demande.orientation);
    return await avecDelai(vue.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: { width: largeur / 25.4, height: hauteur / 25.4 },
    }), DELAI_MS, "impression");
  } finally {
    pagesPermises.delete(adresse);
    if (vue) vue.webContents.close();
    await fsp.rm(temporaire, { recursive: true, force: true });
  }
}

/**
 * Installe le canal `pdf:depuis-svg`. Il rend `{ pdf }`, les octets ; `{ refus }`, le champ de la
 * demande qui ne va pas ; ou `{ echec }`, ce que Chromium a levé.
 */
function installerIpcPdf({ ipcMain, WebContentsView, session }) {
  ipcMain.handle("pdf:depuis-svg", async (_evenement, brut) => {
    const v = demandeValide(brut);
    if (!v.ok) return { refus: v.refus };
    try {
      return { pdf: new Uint8Array(await imprimerSvgEnPdf({ WebContentsView, session }, v.demande)) };
    } catch (e) {
      return { echec: String(e?.message ?? e) };
    }
  });
}

module.exports = { FORMATS, ORIENTATIONS, MARGE_MM, echapperHtml, demandeValide, taillePage, pageDImpression, installerIpcPdf };
