// Séparation Demucs exécutée en NATIF via onnxruntime-node, dans le process
// principal Electron. onnxruntime-web (WASM 32 bits) ne peut pas charger le
// modèle htdemucs (166 Mo, poids fp16, ~25000 nœuds) : dépassement mémoire.
// Le runtime natif n'a pas cette limite et couvre tous les opérateurs.
//
// Module volontairement sans dépendance à Electron : il peut être testé seul
// en Node pur (voir la vérification dans l'historique de développement).

const ort = require("onnxruntime-node");

// Le modèle htdemucs impose une entrée FIXE [1, 2, 343980] (float32, stéréo).
const CHUNK = 343980;
const CHEVAUCHEMENT = 4410;

const cacheSessions = new Map();

async function obtenirSession(modelePath) {
  const existante = cacheSessions.get(modelePath);
  if (existante) return existante;
  const session = await ort.InferenceSession.create(modelePath, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
  cacheSessions.set(modelePath, session);
  return session;
}

// canaux : tableau de Float32Array (1 pour mono, 2 pour stéréo), même longueur.
// nbStems : 4 (htdemucs classique) ou 6 (htdemucs_6s avec guitare + piano).
// Retourne { batterie, basse, autre, voix, guitare?, piano? }, chacun = [Float32Array G, Float32Array D]
// (stems stéréo) ou null si le stem est silencieux.
async function separerDemucs(modelePath, canaux, surProgres, chevauchement, nbStems = 4) {
  const session = await obtenirSession(modelePath);
  const nomEntree = session.inputNames[0];
  const nomSortie = session.outputNames[0];
  const chev = chevauchement ?? CHEVAUCHEMENT;

  const longueur = canaux[0].length;
  const chGauche = canaux[0];
  const chDroite = canaux.length > 1 ? canaux[1] : canaux[0]; // mono -> dupliqué
  const pas = CHUNK - chev;
  const nbTranches = Math.max(1, Math.ceil((longueur - chev) / pas));

  // Ordre des stems : 4-stem = [batterie, basse, autre, voix]
  //                   6-stem = [batterie, basse, autre, voix, guitare, piano]
  const noms = nbStems === 6
    ? ["batterie", "basse", "autre", "voix", "guitare", "piano"]
    : ["batterie", "basse", "autre", "voix"];

  // Accumulateurs par stem ET par canal (vraie sortie stéréo), enveloppe commune.
  const acc = [];
  for (let s = 0; s < nbStems; s++) {
    acc.push([new Float64Array(longueur), new Float64Array(longueur)]);
  }
  const env = new Float64Array(longueur);

  for (let t = 0; t < nbTranches; t++) {
    const debut = t * pas;
    const fin = Math.min(debut + CHUNK, longueur);
    const tailleTranche = fin - debut;

    // Entrée [1, 2, CHUNK] : canal 0 puis canal 1, complété de zéros si besoin.
    const donnees = new Float32Array(2 * CHUNK);
    for (let i = 0; i < tailleTranche; i++) {
      donnees[i] = chGauche[debut + i];
      donnees[CHUNK + i] = chDroite[debut + i];
    }

    const tenseur = new ort.Tensor("float32", donnees, [1, 2, CHUNK]);
    const sorties = await session.run({ [nomEntree]: tenseur });
    const sortie = sorties[nomSortie];
    const data = sortie.data; // Float32Array, forme [1, nbStems, 2, CHUNK]

    for (let i = 0; i < tailleTranche; i++) {
      const pos = debut + i;
      if (pos >= longueur) break;
      const poids =
        i < chev ? 0.5 * (1 - Math.cos((Math.PI * i) / chev)) : 1;
      for (let s = 0; s < nbStems; s++) {
        const base = s * 2 * CHUNK;
        acc[s][0][pos] += data[base + i] * poids;
        acc[s][1][pos] += data[base + CHUNK + i] * poids;
      }
      env[pos] += poids;
    }

    if (surProgres) surProgres(Math.round(((t + 1) / nbTranches) * 100));
  }

  const resultat = {};
  for (let s = 0; s < nbStems; s++) {
    const g = new Float32Array(longueur);
    const d = new Float32Array(longueur);
    let aSignal = false;
    for (let i = 0; i < longueur; i++) {
      const e = env[i];
      g[i] = e > 1e-6 ? acc[s][0][i] / e : 0;
      d[i] = e > 1e-6 ? acc[s][1][i] / e : 0;
      if (Math.abs(g[i]) > 1e-6 || Math.abs(d[i]) > 1e-6) aSignal = true;
    }
    resultat[noms[s]] = aSignal ? [g, d] : null;
  }
  return resultat;
}

module.exports = { separerDemucs, CHUNK };
