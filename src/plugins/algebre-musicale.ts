// plugins/algebre-musicale.ts — Classification d'une collection de pistes par
// PCA + KMeans/GMM (sous-menu Autres → Algèbre musicale). La logique de calcul
// vit dans audio/classification-pistes.ts (testable sans Electron) ; ce
// fichier ne fait que lire le dossier, décoder l'audio et sérialiser les sorties.

import type { FicheAudio } from "../audio/types-domaine";
import { traduire } from "../i18n";
import { avecDoc } from "./notices";
import { classifierPistes, calculerMoyennesParGroupe, type PisteVectorisee, type ResultatClassificationPistes, type RapportMoyennesGroupes } from "../audio/classification-pistes";
import { extraireVecteurFeatures } from "../audio/features-piste";

const EXTENSIONS_AUDIO = [".wav", ".wave", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm"];

// Palette qualitative Okabe-Ito (sûre pour le daltonisme) — cyclée par
// modulo si plus de groupes que de couleurs. Au-delà de 8 groupes, la forme
// change aussi (cercle/carré/triangle/losange) pour rester distinguable sans
// dépendre uniquement de la couleur.
const PALETTE_GROUPES = ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#999999"];
const FORMES_GROUPES = ["cercle", "carre", "triangle", "losange"] as const;

function escapeSvgTexte(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formeSvg(forme: (typeof FORMES_GROUPES)[number], x: number, y: number, taille: number, couleur: string): string {
  const style = `fill="${couleur}" fill-opacity="0.85" stroke="#1a1a1a" stroke-width="0.6"`;
  switch (forme) {
    case "carre": {
      const d = taille * 0.85;
      return `<rect x="${(x - d / 2).toFixed(1)}" y="${(y - d / 2).toFixed(1)}" width="${d.toFixed(1)}" height="${d.toFixed(1)}" ${style} />`;
    }
    case "triangle": {
      const r = taille * 0.62;
      return `<polygon points="${x.toFixed(1)},${(y - r).toFixed(1)} ${(x - r * 0.87).toFixed(1)},${(y + r * 0.5).toFixed(1)} ${(x + r * 0.87).toFixed(1)},${(y + r * 0.5).toFixed(1)}" ${style} />`;
    }
    case "losange": {
      const r = taille * 0.62;
      return `<polygon points="${x.toFixed(1)},${(y - r).toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + r).toFixed(1)} ${(x - r).toFixed(1)},${y.toFixed(1)}" ${style} />`;
    }
    case "cercle":
    default:
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(taille * 0.5).toFixed(1)}" ${style} />`;
  }
}

/**
 * Nuage de points SVG autonome : 2 premiers axes PCA, couleur+forme par
 * groupe, titre de piste au survol (via <title>, aucun JS nécessaire).
 */
export function genererSvgClassification(resultat: ResultatClassificationPistes): string {
  const largeur = 720, hauteur = 480, margeGraphe = 44, largeurLegende = 170, margeHaut = 20;
  const largeurPlot = largeur - largeurLegende - margeGraphe * 2;
  const hauteurPlot = hauteur - margeGraphe - margeHaut - 24;

  const etendue = (vals: number[]): [number, number] => {
    const min = Math.min(...vals), max = Math.max(...vals);
    if (max - min < 1e-9) return [min - 1, max + 1];
    const marge = (max - min) * 0.1;
    return [min - marge, max + marge];
  };
  const [xMin, xMax] = etendue(resultat.coordonnees.map((p) => p.x));
  const [yMin, yMax] = etendue(resultat.coordonnees.map((p) => p.y));

  const px = (x: number) => margeGraphe + ((x - xMin) / (xMax - xMin)) * largeurPlot;
  // Repère mathématique classique (haut = valeurs plus grandes) : on inverse Y.
  const py = (y: number) => margeGraphe + margeHaut + hauteurPlot - ((y - yMin) / (yMax - yMin)) * hauteurPlot;

  const couleurDeGroupe = (g: number) => PALETTE_GROUPES[g % PALETTE_GROUPES.length];
  const formeDeGroupe = (g: number) => FORMES_GROUPES[Math.floor(g / PALETTE_GROUPES.length) % FORMES_GROUPES.length];

  const points = resultat.coordonnees.map((p, i) => {
    const groupe = resultat.rapport[i].groupe;
    const forme = formeSvg(formeDeGroupe(groupe), px(p.x), py(p.y), 11, couleurDeGroupe(groupe));
    return `<g>${forme}<title>${escapeSvgTexte(p.nom)} — groupe ${groupe + 1}</title></g>`;
  }).join("");

  const groupes = [...new Set(resultat.rapport.map((l) => l.groupe))].sort((a, b) => a - b);
  const legende = groupes.map((g, i) => {
    const y = margeGraphe + margeHaut + i * 22;
    const forme = formeSvg(formeDeGroupe(g), largeur - largeurLegende + 12, y, 11, couleurDeGroupe(g));
    const n = resultat.rapport.filter((l) => l.groupe === g).length;
    return `${forme}<text x="${largeur - largeurLegende + 26}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#222">Groupe ${g + 1} (${n})</text>`;
  }).join("");

  const varX = resultat.varianceExpliquee[0] !== undefined ? Math.round(resultat.varianceExpliquee[0] * 100) : null;
  const varY = resultat.varianceExpliquee[1] !== undefined ? Math.round(resultat.varianceExpliquee[1] * 100) : null;
  const yAxeCentre = margeGraphe + margeHaut + hauteurPlot / 2;

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
<rect x="0" y="0" width="${largeur}" height="${hauteur}" fill="#ffffff" />
<text x="${margeGraphe}" y="18" font-size="13" font-weight="600" fill="#111">Classification de ${resultat.rapport.length} pistes en ${resultat.k} groupes</text>
<line x1="${margeGraphe}" y1="${margeGraphe + margeHaut + hauteurPlot}" x2="${margeGraphe + largeurPlot}" y2="${margeGraphe + margeHaut + hauteurPlot}" stroke="#ccc" />
<line x1="${margeGraphe}" y1="${margeGraphe + margeHaut}" x2="${margeGraphe}" y2="${margeGraphe + margeHaut + hauteurPlot}" stroke="#ccc" />
<text x="${margeGraphe + largeurPlot / 2}" y="${hauteur - 6}" font-size="10" fill="#555" text-anchor="middle">Axe 1${varX !== null ? ` (${varX}% variance)` : ""}</text>
<text x="12" y="${yAxeCentre.toFixed(1)}" font-size="10" fill="#555" text-anchor="middle" transform="rotate(-90 12 ${yAxeCentre.toFixed(1)})">Axe 2${varY !== null ? ` (${varY}% variance)` : ""}</text>
${points}
${legende}
</svg>`;
}

function formatNombreMoyenne(v: number): string {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

// Échelle divergente Okabe-Ito (sûre pour le daltonisme) : orange pour une
// moyenne de groupe au-dessus de la moyenne inter-groupes de sa colonne, bleu
// en-dessous, intensité proportionnelle à l'écart (en écarts-types
// inter-groupes de cette colonne) — plus c'est saturé, plus cette variable
// contribue à distinguer ce groupe des autres.
function couleurDeviation(z: number): string {
  const clamp = Math.max(-2.5, Math.min(2.5, z));
  const intensite = Math.abs(clamp) / 2.5;
  const [r, g, b] = clamp >= 0 ? [213, 94, 0] : [0, 114, 178];
  const mr = Math.round(255 + (r - 255) * intensite);
  const mg = Math.round(255 + (g - 255) * intensite);
  const mb = Math.round(255 + (b - 255) * intensite);
  return `rgb(${mr},${mg},${mb})`;
}

/**
 * Tableau SVG lisible (pas du JSON) des moyennes par groupe sur les variables
 * de départ (features brutes) : variables en ligne (40 au plus, mais peu de
 * groupes en pratique), groupes en colonne — évite les 40 colonnes étroites
 * à texte pivoté de la 1re version, illisible. Couleur par cellule
 * proportionnelle à l'écart de cette moyenne par rapport à la moyenne
 * inter-groupes de SA VARIABLE (sa ligne) — met en évidence les variables
 * (et les groupes) responsables de la différence.
 */
export function genererSvgMoyennesGroupes(rapportMoyennes: RapportMoyennesGroupes): string {
  const { etiquettes, groupes, ecartTypeInterGroupes } = rapportMoyennes;
  const nbVar = etiquettes.length;
  const cellW = 100, cellH = 22, labelColW = 190, headerH = 30, margeHaut = 32, margeGauche = 12;
  const largeur = margeGauche + labelColW + groupes.length * cellW + 20;
  const hauteur = margeHaut + headerH + nbVar * cellH + 30;

  const moyennesParVariable = etiquettes.map((_, j) => {
    const vals = groupes.map((g) => g.moyennes[j]);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });

  let entetes = "";
  groupes.forEach((g, gi) => {
    const x = margeGauche + labelColW + gi * cellW + cellW / 2;
    const y = margeHaut + headerH - 10;
    entetes += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" font-weight="600" fill="#111" text-anchor="middle">Groupe ${g.groupe + 1} (${g.n})</text>`;
  });

  let lignes = "";
  for (let j = 0; j < nbVar; j++) {
    const y = margeHaut + headerH + j * cellH;
    lignes += `<text x="${(margeGauche + labelColW - 8).toFixed(1)}" y="${(y + cellH / 2 + 3.5).toFixed(1)}" font-size="10.5" fill="#222" text-anchor="end">${escapeSvgTexte(etiquettes[j])}</text>`;
    const ecart = ecartTypeInterGroupes[j];
    groupes.forEach((g, gi) => {
      const x = margeGauche + labelColW + gi * cellW;
      const z = ecart > 1e-9 ? (g.moyennes[j] - moyennesParVariable[j]) / ecart : 0;
      const couleur = couleurDeviation(z);
      const texteClair = Math.abs(z) > 1.5 ? "#fff" : "#222";
      lignes += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${cellH.toFixed(1)}" fill="${couleur}" stroke="#e5e5e5" stroke-width="0.5" />`;
      lignes += `<text x="${(x + cellW / 2).toFixed(1)}" y="${(y + cellH / 2 + 3.5).toFixed(1)}" font-size="10.5" fill="${texteClair}" text-anchor="middle">${escapeSvgTexte(formatNombreMoyenne(g.moyennes[j]))}</text>`;
    });
  }

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
<rect x="0" y="0" width="${largeur}" height="${hauteur}" fill="#ffffff" />
<text x="${margeGauche}" y="18" font-size="13" font-weight="600" fill="#111">Moyennes par groupe sur les variables de départ</text>
<text x="${margeGauche}" y="${(hauteur - 8).toFixed(1)}" font-size="9" fill="#666">Couleur = écart à la moyenne inter-groupes de la ligne (orange = au-dessus, bleu = en-dessous, saturé = variable qui distingue fortement ce groupe)</text>
${entetes}
${lignes}
</svg>`;
}

// Un seul AudioContext partagé pour tout le dossier plutôt qu'un par piste :
// la création/fermeture d'un AudioContext a un coût fixe non négligeable
// (initialisation du thread audio), sensible dès quelques dizaines de pistes.
const TIMEOUT_DECODAGE_MS = 20000;

export function avecTimeout<T>(promesse: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error("timeout")), ms);
    promesse.then(
      (v) => { clearTimeout(minuteur); resolve(v); },
      (e) => { clearTimeout(minuteur); reject(e); },
    );
  });
}

// Un fichier corrompu ou dans un format que decodeAudioData n'arrive pas à
// lire peut, selon les cas, rejeter proprement OU rester en attente
// indéfiniment (observé sur de grandes collections réelles — un décodage
// bloqué gèle tout le lot, sans distinction possible avec un vrai plantage
// pour l'utilisateur). Chaque étape est donc plafonnée : au-delà du délai,
// la piste est traitée comme un échec de décodage (silencieusement ignorée,
// comme les autres échecs), pas comme une erreur fatale pour le lot entier.
async function decoderPiste(api: any, chemin: string, actx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const lu = await avecTimeout<{ url?: string } | null>(api.lireFichierAudio(chemin), TIMEOUT_DECODAGE_MS);
    if (!lu?.url) return null;
    const rep = await avecTimeout(fetch(lu.url), TIMEOUT_DECODAGE_MS);
    const ab = await avecTimeout(rep.arrayBuffer(), TIMEOUT_DECODAGE_MS);
    return await avecTimeout(actx.decodeAudioData(ab), TIMEOUT_DECODAGE_MS);
  } catch {
    return null;
  }
}

function attendreProchainTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export const fiches: FicheAudio[] = ([
  {
    id: "classification-pistes", nom: "Classification de pistes", nomEn: "Track classification",
    univers: "Autres", famille: "Algèbre musicale",
    resume: "Regroupe une collection de pistes par similarité (features audio → PCA → KMeans/GMM) et estime la probabilité d'appartenance de chaque piste à chaque groupe.",
    resumeEn: "Groups a collection of tracks by similarity (audio features → PCA → KMeans/GMM) and estimates each track's probability of belonging to each group.",
    entrees: [],
    sorties: [
      { nom: "Rapport", nomEn: "Report", type: "texte" },
      { nom: "Coordonnées", nomEn: "Coordinates", type: "texte" },
      { nom: "Graphique", nomEn: "Chart", type: "image" },
      { nom: "Moyennes par groupe", nomEn: "Group averages", type: "image" },
    ],
    parametres: [
      { nom: "Dossier", nomEn: "Folder", type: "dossier", defaut: "", defautEn: "",
        doc: "Dossier contenant les pistes audio à classifier.", docEn: "Folder containing the audio tracks to classify." },
      { nom: "Axes PCA", nomEn: "PCA axes", plage: [2, 20], pas: 1, defaut: 5,
        doc: "Nombre d'axes PCA conservés pour le clustering (toujours au moins 2, pour la visualisation).",
        docEn: "Number of PCA axes kept for clustering (always at least 2, for visualization)." },
      { nom: "Nombre de groupes", nomEn: "Number of groups", plage: [0, 20], pas: 1, defaut: 0,
        doc: "0 = recherche automatique (indice de Calinski-Harabasz) jusqu'au plafond ci-dessous. Une valeur positive fixe le nombre de groupes.",
        docEn: "0 = automatic search (Calinski-Harabasz index) up to the ceiling below. A positive value fixes the number of groups." },
      { nom: "Plafond auto", nomEn: "Auto ceiling", plage: [2, 30], pas: 1, defaut: 10,
        doc: "Nombre maximal de groupes testés en recherche automatique (ignoré si Nombre de groupes > 0).",
        docEn: "Maximum number of groups tested in automatic search (ignored if Number of groups > 0)." },
      { nom: "Graine", nomEn: "Seed", plage: [1, 9999], pas: 1, defaut: 1,
        doc: "Graine d'initialisation (K-means++/GMM) — mêmes pistes et même graine ⇒ même résultat.",
        docEn: "Initialization seed (K-means++/GMM) — same tracks and same seed ⇒ same result." },
    ],
    async executer(ctx: any) {
      const api = (window as any).api;
      if (!api?.lireDossier || !api?.lireFichierAudio) return { valeurs: [null, null, null, null], message: traduire("msg.n_cessite_electron") };

      const chemin = ctx.paramTexte("Dossier", "").replace(/^[/\\]+|[/\\]+$/g, "");
      if (!chemin) return { valeurs: [null, null, null, null], message: traduire("msg.aucun_r_pertoire_sp_cifi") };

      ctx.onProgress(traduire("progress.lecture_du_r_pertoire"));
      let fichiers: { nom: string; chemin: string }[] = (await api.lireDossier(chemin)) ?? [];
      fichiers = fichiers.filter((f: any) => {
        const ext = f.nom.slice(f.nom.lastIndexOf(".")).toLowerCase();
        return EXTENSIONS_AUDIO.includes(ext);
      });
      if (fichiers.length === 0) return { valeurs: [null, null, null, null], message: traduire("msg.aucun_fichier_audio_dans_var_0", chemin) };

      // Décode + extrait le vecteur de features PISTE PAR PISTE, sans jamais
      // accumuler les AudioBuffer décodés de toute la collection en mémoire :
      // `buffer` sort de portée (et redevient éligible au GC) dès que son
      // vecteur est extrait, avant même de passer à la piste suivante. Une
      // version antérieure gardait tous les AudioBuffer décodés jusqu'à la
      // fin de la boucle — pour 240 pistes de plusieurs minutes, plusieurs
      // dizaines de Go de PCM simultanément, confirmé responsable d'un
      // plantage par épuisement mémoire sur une vraie collection.
      const pistes: PisteVectorisee[] = [];
      const ignorees: string[] = [];
      const actx = new AudioContext();
      try {
        for (let i = 0; i < fichiers.length; i++) {
          const f = fichiers[i];
          ctx.onProgress(traduire("progress.lecture_nom_var_0_var_1_var_2", f.nom, i + 1, fichiers.length));
          const buffer = await decoderPiste(api, f.chemin, actx);
          if (!buffer) { ignorees.push(f.nom); continue; }
          ctx.onProgress(traduire("progress.extraction_nom_var_0_var_1_var_2", f.nom, i + 1, fichiers.length));
          const features = extraireVecteurFeatures(buffer);
          pistes.push({ nom: f.nom, chemin: f.chemin, features });
          await attendreProchainTick();
        }
      } finally {
        actx.close();
      }
      if (pistes.length < 3) {
        return { valeurs: [null, null, null, null], erreur: true, message: traduire("msg.classification_minimum_3_pistes_var_0", pistes.length) };
      }

      const nbAxesPCA = Math.round(ctx.paramNombre("Axes PCA", 5));
      const nbGroupes = Math.round(ctx.paramNombre("Nombre de groupes", 0));
      const kMaxAuto = Math.round(ctx.paramNombre("Plafond auto", 10));
      const graine = Math.round(ctx.paramNombre("Graine", 1));

      let resultat;
      try {
        resultat = classifierPistes(pistes, {
          nbAxesPCA,
          k: nbGroupes > 0 ? nbGroupes : "auto",
          kMaxAuto,
          graine,
        });
      } catch (e: any) {
        return { valeurs: [null, null, null, null], erreur: true, message: e?.message ?? String(e) };
      }

      const rapportJson = JSON.stringify(resultat.rapport, null, 2);
      const coordonneesJson = JSON.stringify(resultat.coordonnees, null, 2);
      // Fichier (pas une chaîne brute) : c'est la convention déjà utilisée par
      // les autres nœuds à sortie "image" (ex. Camelot, genererSvgCamelot) —
      // ça permet à Export SVG et au rendu générique d'image de le consommer
      // directement, et ça alimente `imageResultatUrl` sans code spécifique
      // à ce nœud (voir le merge générique dans useExecutionGraphe.ts).
      const svgFichier = new File([genererSvgClassification(resultat)], "classification.svg", { type: "image/svg+xml" });
      const moyennesGroupes = calculerMoyennesParGroupe(pistes, resultat.rapport);
      const svgMoyennesFichier = new File([genererSvgMoyennesGroupes(moyennesGroupes)], "moyennes-par-groupe.svg", { type: "image/svg+xml" });

      let messageIgnorees = "";
      if (ignorees.length > 0) {
        const aperçu = ignorees.slice(0, 5).join(", ");
        const reste = ignorees.length > 5 ? traduire("msg.et_var_0_autres", ignorees.length - 5) : "";
        messageIgnorees = "\n" + traduire("msg.pistes_ignor_es_var_0_var_1", ignorees.length, aperçu + reste);
      }

      return {
        valeurs: [rapportJson, coordonneesJson, svgFichier, svgMoyennesFichier],
        message: traduire("msg.classification_termin_e_var_0_pistes_var_1_groupes", pistes.length, resultat.k) + messageIgnorees,
      };
    },
  },
] as FicheAudio[]).map(avecDoc);
