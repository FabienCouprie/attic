// audio/banques-vives.ts — La dernière banque vue par un nœud, pour que sa vue puisse la jouer.
//
// LE PROBLÈME. Une banque de clavier est un objet VIVANT : dix-neuf AudioBuffer, quelques mégaoctets.
// Elle circule d'un nœud à l'autre pendant l'exécution du graphe, mais rien n'en reste dans les
// données du nœud — contrairement à une URL audio, qui s'y range et que la vue relit. Un clavier
// jouable branché sur « Étaler sur le clavier » n'avait donc RIEN à jouer : l'exécution avait la
// banque, la vue ne l'avait pas.
//
// LA SOLUTION, et ses limites. Le nœud dépose ici la banque qu'il vient d'utiliser, la vue la
// reprend. C'est un cache en mémoire, volontairement minuscule :
//
//  · il faut avoir LANCÉ le graphe une fois pour que la vue ait quelque chose — un clavier qui lit un
//    `.sfz` du disque, lui, n'a besoin de rien ;
//  · rien n'est sauvegardé : au rechargement de l'application, il est vide ;
//  · il ne garde que les DERNIÈRES banques, faute de quoi une session de travail finirait par tenir
//    en mémoire chaque banque jamais calculée, à quelques mégaoctets la pièce.
import type { Banque } from "./clavier-banque";

/** Combien de banques on garde au plus. Quatre claviers ouverts à la fois, c'est déjà beaucoup. */
export const MAX_BANQUES = 4;

/** Une banque déposée, et d'où elle vient — un nom de fichier, ou rien pour « du graphe ». */
export interface BanqueDeposee {
  banque: Banque;
  nom: string;
}

const vives = new Map<string, BanqueDeposee>();

/**
 * Le nœud dépose la banque qu'il vient d'utiliser, avec son origine.
 *
 * LE NOM COMPTE : le nœud sait, lui, s'il a lu un fichier ou pris l'entrée du graphe — la vue ne peut
 * que le deviner, et le devinait mal quand un chemin restait mémorisé alors que le nœud jouait la
 * banque entrante. C'est donc le déposant qui l'annonce.
 */
export function deposerBanque(noeudId: string, banque: Banque, nom = ""): void {
  // Réinsérer déplace la clé en fin de Map : la plus ancienne est donc toujours la première.
  vives.delete(noeudId);
  vives.set(noeudId, { banque, nom });
  while (vives.size > MAX_BANQUES) {
    const plusAncienne = vives.keys().next();
    if (plusAncienne.done) break;
    vives.delete(plusAncienne.value);
  }
}

/** La banque déposée par ce nœud, s'il en reste une. */
export const banqueVive = (noeudId: string): BanqueDeposee | null => vives.get(noeudId) ?? null;

/** Oublie la banque d'un nœud — quand la vue en charge une autre, ou que le nœud disparaît. */
export const oublierBanque = (noeudId: string): void => void vives.delete(noeudId);

/** Combien de banques sont en mémoire. Pour les tests, et pour le diagnostic. */
export const nombreBanquesVives = (): number => vives.size;
