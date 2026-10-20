// electron/acestep-plan.cjs — Ce qu'une tâche réclame du moteur, et ce qu'elle écrit dans le plan.
//
// RELEVÉ EN MESURANT `ace-synth`, et non lu dans une documentation. Les quatre refus ci-dessous
// sont ses propres phrases, obtenues en les provoquant :
//   · un `task_type` hors de cette table est refusé — « unknown task_type 'x' » ;
//   · six des sept refusent de partir sans audio source — « task 'cover' requires source audio
//     or latents » ;
//   · une plage dont la fin n'est pas après le début est refusée — « [Region] ERROR: end (2.0)
//     <= start (6.0) » ;
//   · `lego`, `extract` et `complete` partent tout de même avec le modèle rapide, mais le moteur
//     avertit lui-même « requires base model, turbo output incoherent » : le son sort, et ne vaut
//     rien. Elles sont déclarées ici parce que le moteur les connaît ; `offerte` dit qu'aucun nœud
//     ne les propose tant que le modèle de base n'est pas publié.
//
// LE REFUS EST RENDU EN FRANÇAIS, et c'est le but de ce module. Sans lui, le moteur s'arrête et
// c'est sa phrase anglaise que le nœud montrerait, au bout d'un chargement de modèle pour rien.

/**
 * Les sept tâches du moteur. `source` dit qu'un audio source est exigé, `base` que le modèle
 * rapide ne suffit pas, `piste` qu'un nom de piste est exigé, `offerte` qu'un nœud la propose.
 */
/**
 * Le débruiteur que le dépôt installe et sur lequel les réglages par défaut sont taillés.
 *
 * UNE REQUÊTE DE RENDU NOMME TOUJOURS SON MODÈLE, et ce n'est pas une précaution de style.
 * `ace-synth` enregistre comme débruiteur TOUT fichier du dossier qui en est un, et sans
 * `synth_model` il prend le premier venu. Mesuré en posant le modèle de base à côté du rapide :
 * le journal annonce alors `acestep-v15-base-Q6_K.gguf -> DiT` et le charge, là où huit pas de
 * débruitage sont taillés pour le rapide. Un fichier déposé dans le dossier changerait donc le
 * son rendu sans que rien ne le dise.
 */
const MODELE_RAPIDE = "acestep-v15-turbo-Q6_K.gguf";

/**
 * Le débruiteur de base, que trois tâches réclament et que le rapide ne remplace pas.
 *
 * MESURÉ PLUTÔT QUE SUPPOSÉ : sur `complete`, le rapide rend une sortie qui corrèle à 0,996 avec
 * l'audio reçu, c'est-à-dire qu'il ne fait rien, et le moteur avertit lui-même que sa sortie est
 * incohérente sur ces tâches. Le modèle de base pèse le même poids à soixante-quatre octets près.
 */
const MODELE_BASE = "acestep-v15-base-Q6_K.gguf";

const TACHES = {
  text2music: { source: false, base: false, piste: false, offerte: true },
  cover: { source: true, base: false, piste: false, offerte: true },
  "cover-nofsq": { source: true, base: false, piste: false, offerte: true },
  repaint: { source: true, base: false, piste: false, offerte: true },
  lego: { source: true, base: true, piste: true, offerte: false },
  extract: { source: true, base: true, piste: true, offerte: false },
  complete: { source: true, base: true, piste: true, offerte: true },
};

/**
 * Les trois façons de planifier. `generate` écrit tout ; `inspire` part d'une phrase courte et
 * invente la description complète ; `format` prend une description et des paroles et ne remplit
 * que les métadonnées.
 *
 * MESURÉ : en `inspire`, une demande de trente secondes est revenue avec `duration: 162.0`. Ce
 * mode choisit sa longueur, et un nœud qui l'emploie ne peut donc pas promettre une durée.
 */
const MODES = { generate: true, inspire: true, format: true };

/**
 * La plage qui prolonge une pièce d'un côté ou de l'autre.
 *
 * MESURÉ, et c'est de là que viennent les deux formules. Sur une source de 11,84 s, la plage
 * `[-8, 0]` rend 19,84 s — huit secondes ajoutées avant le début ; une plage qui dépasse la fin
 * rend une pièce longue de sa propre fin. Le moteur étend donc la durée jusqu'à `min(début, 0)`
 * d'un côté et `max(fin, durée)` de l'autre, ce qui donne les deux cas ci-dessous.
 *
 * LES DEUX FORMES TIENNENT LA CONTRAINTE PAR CONSTRUCTION : dès que l'ajout est positif, la fin
 * est après le début, et le refus « end <= start » ne peut pas se produire.
 */
function plageProlongement(cote, ajout, dureeSource) {
  if (!Number.isFinite(ajout) || ajout <= 0) return null;
  if (!Number.isFinite(dureeSource) || dureeSource < 0) return null;
  return cote === "avant"
    ? { debut: -ajout, fin: 0 }
    : { debut: dureeSource, fin: dureeSource + ajout };
}

/** La plage de retouche que les options demandent : donnée telle quelle, ou calculée. */
function plageDemandee(options) {
  if (options.prolongement) {
    return plageProlongement(options.prolongement.cote, options.prolongement.ajout, options.dureeSource);
  }
  const { debut, fin } = options;
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return null;
  return { debut, fin };
}

/**
 * Enrichit un plan de ce que sa tâche réclame, ou dit en une phrase pourquoi elle ne peut partir.
 *
 * LE PLAN REÇU N'EST JAMAIS MODIFIÉ : un plan se rend plusieurs fois, et deux rendus de tâches
 * différentes ne doivent pas se contaminer par l'objet qu'ils partagent.
 */
function appliquerTache(plan, options = {}) {
  const tache = options.tache || "text2music";
  const fiche = TACHES[tache];
  if (!fiche) return { ok: false, erreur: `Tâche inconnue : « ${tache} ».` };
  if (fiche.source && !options.audioSource) {
    return { ok: false, erreur: `La tâche « ${tache} » réclame un audio source, et rien n'est branché.` };
  }

  // LE DÉBRUITEUR SUIT LA TÂCHE, et non l'appelant : c'est ici que se trouve le relevé de ce que
  // chacune réclame, et un nœud n'a donc pas à nommer un fichier de modèle.
  const sortie = { synth_model: fiche.base ? MODELE_BASE : MODELE_RAPIDE, ...plan, task_type: tache };
  if (options.modele) sortie.synth_model = options.modele;
  if (Number.isFinite(options.guidage)) sortie.guidance_scale = options.guidage;
  if (fiche.base && sortie.synth_model === MODELE_RAPIDE) {
    return {
      ok: false,
      erreur: `La tâche « ${tache} » réclame le modèle de base ; le modèle rapide rend un son incohérent.`,
    };
  }

  if (tache === "cover" || tache === "cover-nofsq") {
    if (Number.isFinite(options.dosage)) sortie.audio_cover_strength = options.dosage;
    if (Number.isFinite(options.bruit)) sortie.cover_noise_strength = options.bruit;
  }

  if (tache === "repaint") {
    const plage = plageDemandee(options);
    if (!plage) {
      return { ok: false, erreur: "La retouche réclame un début et une fin en secondes." };
    }
    if (plage.fin <= plage.debut) {
      return {
        ok: false,
        erreur: `Plage vide : la fin (${plage.fin} s) doit être après le début (${plage.debut} s).`,
      };
    }
    sortie.repainting_start = plage.debut;
    sortie.repainting_end = plage.fin;
  }

  if (fiche.piste) {
    if (!options.piste) return { ok: false, erreur: `La tâche « ${tache} » réclame un nom de piste.` };
    sortie.track = options.piste;
  }

  return { ok: true, plan: sortie };
}

/** Le mode de planification, ou néant s'il n'est pas de ceux que le moteur connaît. */
function modeValide(mode) {
  if (!mode) return null;
  return Object.hasOwn(MODES, mode) ? mode : null;
}

/**
 * La requête de planification, telle que le moteur la lit.
 *
 * LA GRAINE PART DANS LES DEUX CHAMPS DE GRAINE, et c'est ce qui la rend vraie. Mesuré : avec
 * `seed` seul, deux planifications de même graine rendaient deux plans différents, soixante-dix-neuf
 * secondes à 111 BPM puis deux cents secondes à 158 BPM sur la même demande, parce que le modèle
 * de langue tire son propre `lm_seed` au hasard à chaque appel. Les deux champs posés, le plan
 * ressort identique à l'octet. Une graine qui ne part qu'à moitié est une graine qui mentait.
 */
function requetePlanification(options = {}) {
  const graine = Number(options.graine);
  const posee = Number.isFinite(graine) && graine >= 0;
  return {
    caption: options.description || "instrumental",
    ...(options.paroles ? { lyrics: options.paroles } : {}),
    ...(options.dureeSec ? { duration: options.dureeSec } : {}),
    ...(posee ? { seed: graine, lm_seed: graine } : {}),
    vocal_language: options.langue || "fr",
    ...(modeValide(options.mode) ? { lm_mode: modeValide(options.mode) } : {}),
    output_format: "wav16",
  };
}

module.exports = {
  TACHES, MODES, MODELE_RAPIDE, MODELE_BASE,
  appliquerTache, plageProlongement, plageDemandee, modeValide, requetePlanification,
};
