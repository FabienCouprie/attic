// electron/apollo.cjs — La restauration d'un son abîmé par la compression.
//
// MÊME EXÉCUTABLE QUE LES AUTRES FAMILLES D'`audio.cpp`, et ce module reprend de `muscriptor.cjs`
// la résolution du binaire, la traduction du dos de calcul et la lecture du journal.
//
// QUARANTE-QUATRE MILLE CENT HERTZ, ET RIEN D'AUTRE. Le moteur refuse net toute autre cadence —
// « Apollo requires 44.1 kHz input audio » — et c'est la même exigence que le séparateur de voix
// de cette famille d'outils, qui travaille lui aussi en 44,1 kHz quand le reste du dépôt est en
// 48 000. Le composant descend donc le son avant de le passer et le ramène après ; le garde
// ci-dessous refuse avant de lancer, sur l'en-tête du WAV, plutôt que de laisser le moteur charger
// ses poids pour rien.
//
// CE QU'IL FAIT ET CE QU'IL NE FAIT PAS, mesuré le 2026-10-22 et écrit ici parce que la notice du
// composant en dépend. Sur un dommage de codec fabriqué — magnitudes quantifiées bande par bande,
// budget resserré vers l'aigu —, la distance log-spectrale à l'original passe de 0,4329 à 0,3389.
// Le témoin de contrôle est ce qui rend ce chiffre lisible : passer l'ORIGINAL par Apollo donne
// 0,3233, c'est-à-dire qu'il imprime sa propre couleur à n'importe quel signal. Du dommage au-dessus
// de ce plancher, il efface donc 86 %. En revanche IL N'ÉTEND PAS LA BANDE : sur une coupe franche
// à 8 kHz, il remet 0,0092 % de l'énergie là où 1,0837 % manquent. Ce n'est pas un extenseur de
// bande, c'est un réparateur d'artefacts.
//
// ═══ TOUJOURS EN TRANCHES, ET C'EST UNE QUESTION DE MÉMOIRE ET NON DE SON ═══
//
// LE FICHIER ENTIER EN UN SEUL GRAPHE ÉTAIT LE DÉFAUT, et il cassait sur tout morceau. Mesuré le
// 2026-10-31 sur la RTX 2060 de six giga-octets : le moteur demande 2 068 284 octets par trame de
// dix millisecondes, quel que soit le nombre de canaux. 30 s passent avec 5 946 Mio au pic de la
// carte, 31 s tombent, et un morceau de 194 s réclamait 40 143 349 760 octets d'un coup — ce que
// Fabien a reçu : « failed to allocate Vulkan1 buffer of size 40143349760 ». Vulkan1 est bien sa
// carte ; aucune carte grand public ne passe une chanson entière de cette façon.
//
// LE CONTEXTE DE BORD EST CE QUI REND LES TRANCHES INAUDIBLES, et il manquait aussi. Sans lui, sur
// le témoin abîmé de 15 s, des tranches de 5 s s'écartent du rendu entier de −16,1 dB, autant que
// ce qu'Apollo change au son reçu (−15,9 dB) : les coutures sont là, et la pire fenêtre de 50 ms y
// dépasse l'énergie moyenne du son. Avec une seconde calculée de part et d'autre puis écartée, des
// tranches de 10 s rendent un fichier IDENTIQUE OCTET POUR OCTET au rendu entier, sur ce témoin
// comme sur un extrait de musique stéréo, et à −129 dB sur 30 s. Une demi-seconde suffit déjà
// (−114 dB, le plancher du seize bits) : la seconde laisse le double de marge.
//
// DIX SECONDES PAR DÉFAUT, parce que la mémoire suit la tranche et non le morceau : 2 160 Mio au
// pic sur 240 s de stéréo, RTF 0,571 ; vingt secondes ne gagnent que 11 % (RTF 0,508) pour
// 4 446 Mio. Un son plus court qu'une tranche passe d'un seul graphe, mesuré identique.
const path = require("path");
const fs = require("fs");
const os = require("os");

const { resoudreRessource } = require("./chemins-ressources.cjs");
const { cheminBinaire, dosEtCarte, lancer, relevesDuJournal } = require("./muscriptor.cjs");
const { cadenceWav } = require("./parole.cjs");

const MODELE = "apollo-orig.gguf";

/** La seule cadence que le moteur accepte. */
const CADENCE_EXIGEE = 44100;

/** La tranche, en secondes, quand le réglage n'en donne pas une. Voir l'en-tête. */
const TRANCHE_DEFAUT = 10;

/** Ce que chaque tranche calcule de part et d'autre de sa portée, puis écarte. Voir l'en-tête. */
const CONTEXTE_BORD = 1;

/**
 * La durée de tranche passée au moteur.
 *
 * ZÉRO NE VEUT PLUS DIRE « LE FICHIER ENTIER ». C'était l'ancien défaut du réglage, et un nœud le
 * garde dans son projet : les réglages s'enregistrent au moment où le nœud est posé. Changer le
 * seul défaut aurait réparé les nœuds neufs et laissé tomber celui que Fabien a lancé.
 */
function trancheEffective(tranche) {
  return Number.isFinite(tranche) && tranche > 0 ? tranche : TRANCHE_DEFAUT;
}

/** Les options de découpage : toujours en tranches, et toujours avec leur contexte de bord. */
function optionsDeTranche(tranche, recouvrement) {
  const t = trancheEffective(tranche);
  // LE RECOUVREMENT EST LE FONDU, et le moteur le plafonne lui-même à la moitié de la tranche.
  return [
    "--request-option", `audio_chunk_duration_sec=${t}`,
    "--request-option", `audio_chunk_overlap_sec=${Math.min(recouvrement ?? 1, t / 2)}`,
    "--request-option", `edge_pad_duration_sec=${CONTEXTE_BORD}`,
  ];
}

/**
 * Le refus de mémoire du moteur, lu dans son journal ; `null` quand l'échec est d'une autre nature.
 *
 * DEUX FORMES, relevées l'une et l'autre. Au-delà de ce que la carte peut seulement réserver, le
 * moteur nomme le tampon et sa taille ; juste au-dessus de ce qu'elle tient (31 s en un graphe), la
 * réservation passe et c'est l'allocation qui tombe, sans taille.
 */
function memoireRefusee(journal) {
  const texte = String(journal ?? "");
  const m = /failed to allocate (\S+) buffer of size (\d+)/.exec(texte);
  if (m) return { peripherique: m[1], octets: Number(m[2]) };
  if (/ErrorOutOfDeviceMemory|graph allocation failed|out of memory/i.test(texte)) {
    return { peripherique: null, octets: null };
  }
  return null;
}

function cheminModele(contexte) {
  return resoudreRessource(path.join("audiocpp", MODELE), contexte)
    ?? path.resolve(__dirname, "..", "public", "audiocpp", MODELE);
}

function nettoyer(chemin) {
  try { if (fs.existsSync(chemin)) fs.rmSync(chemin, { recursive: true, force: true }); } catch { /* le temporaire reste, sans conséquence */ }
}

/**
 * Restaure un son abîmé par la compression.
 *
 * `options.audio` est un WAV à 44 100 Hz, en octets. `options.tranche` est la durée des tranches ;
 * absente ou nulle, elle vaut `TRANCHE_DEFAUT`. Le retour dit la tranche employée et, sur un refus
 * de mémoire, ce que le moteur demandait.
 */
async function restaurer(options = {}, surAvancement, contexte) {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), "attic-apollo-"));
  try {
    // CE QUI NE DEMANDE RIEN SE VÉRIFIE D'ABORD, et ce n'est pas qu'une question d'ordre : un refus
    // d'entrée doit se prononcer que le modèle soit sur le disque ou non. L'ordre inverse a fait
    // tomber l'intégration continue, où aucun modèle d'`audio.cpp` n'est présent : les deux cas du
    // pont y recevaient « Modèle absent » là où ils attendaient la cadence, et passaient en local
    // par la seule présence du fichier. Un garde qui ne tient que sur ma machine n'en est pas un.
    const cadence = cadenceWav(options.audio);
    if (cadence !== CADENCE_EXIGEE) {
      return {
        ok: false,
        journal: `Ce moteur n'accepte que du ${CADENCE_EXIGEE} Hz ; le son reçu est à `
          + `${cadence === null ? "une cadence illisible" : `${cadence} Hz`}.`,
      };
    }

    const modele = cheminModele(contexte);
    if (!fs.existsSync(modele)) return { ok: false, journal: `Modèle absent : ${modele}` };

    const entree = path.join(travail, "entree.wav");
    fs.writeFileSync(entree, Buffer.from(options.audio));
    const sortie = path.join(travail, "sortie.wav");

    const { backend, device } = dosEtCarte(options.calcul);
    const args = [
      "--task", "s2s", "--family", "apollo", "--model", modele,
      "--backend", backend,
      ...(device === undefined ? [] : ["--device", device]),
      "--audio", entree, "--out", sortie, "--metrics",
      ...optionsDeTranche(options.tranche, options.recouvrement),
    ];
    const tranche = trancheEffective(options.tranche);

    const { code, journal } = await lancer(cheminBinaire(contexte), args, surAvancement);
    if (code !== 0 || !fs.existsSync(sortie)) {
      return { ok: false, journal, tranche, memoire: memoireRefusee(journal) };
    }
    return { ok: true, audio: fs.readFileSync(sortie), releves: relevesDuJournal(journal), journal, tranche };
  } finally {
    nettoyer(travail);
  }
}

module.exports = {
  restaurer, cheminModele, optionsDeTranche, memoireRefusee, CADENCE_EXIGEE, TRANCHE_DEFAUT, CONTEXTE_BORD,
};
