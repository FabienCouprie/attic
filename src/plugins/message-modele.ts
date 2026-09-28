// plugins/message-modele.ts — Ce qu'un nœud dit quand son modèle n'est pas encore sur le disque.
//
// POURQUOI UN SEUL ENDROIT. Onze nœuds tirent un modèle de la release `assets` à leur première
// exécution, et **un seul** prévenait : « Bruitage IA ». Les dix autres se taisaient, donc une
// attente de plusieurs minutes y passait pour un gel. Et celui qui prévenait le faisait deux fois
// à sa façon : son texte bilingue était écrit en dur avec `en() ? … : …`, là où le reste du dépôt
// passe par une clé de traduction, et il annonçait « plus d'un gigaoctet » — juste pour son paquet
// de 1,79 Go, faux pour les 33 Mo de la séparation MDX, soit un facteur soixante.
//
// ET IL PRÉVENAIT MÊME QUAND LE MODÈLE ÉTAIT DÉJÀ LÀ, ce qui est le défaut le plus gênant : un
// avertissement qui paraît à chaque exécution finit par ne plus rien vouloir dire. L'inventaire du
// processus principal sait ce qui manque, `manquants` et `octetsManquants` par paquet : le message
// ne se dit donc que lorsqu'un téléchargement va vraiment avoir lieu, et il en annonce la taille.
//
// LE CHAMP `noeuds` DU MANIFESTE EST CE QUI RELIE un paquet à ses nœuds, et c'est ce module qui en
// devient le premier lecteur. Il était transporté depuis `scripts/modeles.cjs` jusqu'à
// `EtatModeles` sans que rien ne le consulte — d'où trois identifiants qui ne désignaient aucune
// fiche, corrigés avec ce lot : « separation-demucs » et « separation-voix » pour « separateur-ia »,
// « genre-musical » pour « classificateur-genre ». Un champ que personne ne lit ne peut pas être
// juste ; celui-ci le sera désormais, puisque s'en tromper rend le message muet.
import { formaterOctets, type EtatModeles } from "../ui/etat-modeles";
import { traduire } from "../i18n";

/** Ce qui manque à ce nœud pour tourner : la taille à prendre, et les paquets concernés. */
export function manqueAuNoeud(
  etat: EtatModeles | null | undefined,
  noeudId: string,
): { octets: number; paquets: string[] } | null {
  const modeles = etat?.modeles;
  if (!Array.isArray(modeles)) return null;
  let octets = 0;
  const paquets: string[] = [];
  for (const m of modeles) {
    if (!m?.noeuds?.includes(noeudId)) continue;
    // `partiel` compte comme absent : un fichier à moitié pris se reprend en entier.
    if (m.complet && !m.partiel) continue;
    octets += m.octets ?? 0;
    paquets.push(m.id);
  }
  return paquets.length > 0 ? { octets, paquets } : null;
}

/**
 * Le texte à afficher avant un calcul qui peut commencer par un téléchargement.
 *
 * `action` est ce que le nœud dit de lui-même — « Génération du son… » — et il n'est pas touché :
 * homogénéiser veut dire que la NOTE SUR LE MODÈLE est la même partout, pas que les onze nœuds
 * disent la même chose de leur propre travail.
 */
export function texteAvecModele(
  action: string,
  etat: EtatModeles | null | undefined,
  noeudId: string,
): string {
  const manque = manqueAuNoeud(etat, noeudId);
  if (!manque) return action;
  const note = traduire("progress.modele.premiere_fois", formaterOctets(manque.octets));
  return action ? `${action} ${note}` : note;
}

/** L'inventaire, ou `null` hors de l'application de bureau. */
async function inventaire(): Promise<EtatModeles | null> {
  const api = typeof window !== "undefined"
    ? (window as unknown as { api?: { modelesEtat?: () => Promise<EtatModeles> } }).api
    : null;
  if (!api?.modelesEtat) return null;
  try {
    return await api.modelesEtat();
  } catch {
    // Le processus principal n'est pas joignable : mieux vaut le message seul que pas de message.
    return null;
  }
}

/**
 * Annonce le travail, en prévenant du téléchargement s'il doit avoir lieu.
 *
 * L'appel se place JUSTE AVANT le calcul bloquant : `onProgress` remplace la ligne d'état, donc un
 * message émis plus tôt serait recouvert et l'avertissement ne tiendrait pas pendant l'attente.
 */
export async function annoncerModele(
  ctx: { onProgress?: (texte: string) => void },
  noeudId: string,
  action: string,
): Promise<void> {
  const texte = texteAvecModele(action, await inventaire(), noeudId);
  // RIEN À DIRE VEUT DIRE NE RIEN DIRE. Les nœuds dont l'avancement vient d'ailleurs — le score
  // esthétique, les deux voix — passent une action vide : quand le modèle est déjà là, le texte est
  // vide à son tour, et l'émettre effacerait la ligne d'état que le calcul est en train d'écrire.
  // Deux tests du score esthétique l'ont attrapé, l'un comptant un avancement de trop, l'autre
  // lisant une chaîne vide là où il attendait « A · ».
  if (texte) ctx.onProgress?.(texte);
}
