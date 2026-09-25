// ui/generation-code.ts — De quoi demander un script à un modèle local, et en tirer du code.
//
// LE CONTRAT AVANT LA CONSIGNE. Un modèle de un ou deux milliards de paramètres écrit du Python
// plausible et inutilisable si on lui demande « un filtre passe-bas » : il invente des noms de
// variables, lit un fichier qui n'existe pas, écrit où personne ne regarde. Le même modèle réussit
// souvent quand on lui donne le cadre exact du composant — d'où il lit, où il écrit, ce qui est
// déjà chargé pour lui. Ce cadre est écrit ici une fois par langage, et il est le même que celui du
// code par défaut posé dans le nœud.
//
// RIEN NE S'EXÉCUTE TOUT SEUL. Ce module ne fait que fabriquer un texte et en extraire un autre ;
// le code engendré arrive dans l'éditeur, où il se lit et se corrige avant d'être lancé. C'est le
// mode en deux temps qui rend la chose acceptable, et il ne change pas.

export type LangageCode = "python" | "julia";

/**
 * Ce que le composant garantit au script, et ce qu'il attend de lui.
 *
 * Recopié du code par défaut de chaque nœud, dans les mêmes termes : ce sont ces noms-là que le
 * modèle doit employer, et il ne les devinera pas.
 */
export const CONTRATS: Record<LangageCode, string> = {
  python: [
    "Le script est lancé par : python script.py [chemin_wav_entree]",
    "- sys.argv[1] : chemin du WAV d'entrée, absent si aucune entrée n'est branchée.",
    "- os.environ[\"ATTIC_OUTPUT_PATH\"] : chemin du WAV à écrire. Obligatoire.",
    "- os.environ[\"ATTIC_SAMPLE_RATE\"] : fréquence d'échantillonnage, par défaut 44100.",
    "- os.environ[\"ATTIC_TEXT_INPUT\"] : texte d'entrée, si une entrée texte est branchée.",
    "Bibliothèques disponibles : numpy, wave, os, sys. Rien d'autre n'est garanti.",
    "L'audio se lit en int16 et se ramène en float32 entre -1 et 1 ; il se réécrit en int16.",
    "Le script doit écrire le WAV de sortie, sinon le composant ne rend rien.",
  ].join("\n"),
  julia: [
    "Le script est lancé par : julia script.jl [chemin_wav_entree]",
    "- ARGS[2] : chemin du WAV d'entrée, absent si aucune entrée n'est branchée.",
    "- ENV[\"ATTIC_OUTPUT_PATH\"] : chemin du WAV à écrire. Obligatoire.",
    "- ENV[\"ATTIC_SAMPLE_RATE\"] : fréquence d'échantillonnage, par défaut 44100.",
    "- ENV[\"ATTIC_CHANNELS\"] : nombre de canaux, 1 pour mono et 2 pour stéréo.",
    "- ENV[\"ATTIC_TEXT_INPUT\"] : texte d'entrée, si une entrée texte est branchée.",
    "Bibliothèque disponible : WAV (wavread, wavwrite). Rien d'autre n'est garanti.",
    "L'audio est une matrice Float32 de taille (échantillons, canaux).",
    "Le script doit écrire le WAV de sortie, sinon le composant ne rend rien.",
  ].join("\n"),
};

/** Ce que le modèle doit rendre, et rien d'autre. */
const CONSIGNE_FORME = [
  "Rends UNIQUEMENT le code, complet, prêt à exécuter.",
  "Pas d'explication, pas de phrase d'introduction, pas de balises de bloc.",
].join(" ");

export interface DemandeCode {
  langage: LangageCode;
  /** Ce que l'utilisateur demande, dans ses mots. */
  consigne: string;
  /** Le code actuellement dans l'éditeur, s'il faut le modifier plutôt que repartir de zéro. */
  codeActuel?: string;
}

/**
 * Le texte envoyé au modèle.
 *
 * LE CODE ACTUEL N'EST JOINT QUE S'IL Y EN A UN, et il est alors présenté comme un point de départ
 * à modifier. Joindre un squelette vide ferait croire au modèle qu'il doit le compléter ligne à
 * ligne ; ne rien joindre du tout, sur une demande de retouche, lui ferait tout réécrire.
 */
export function construirePrompt(d: DemandeCode): string {
  const nom = d.langage === "python" ? "Python 3" : "Julia";
  const morceaux = [
    `Tu écris un script ${nom} pour un composant de traitement audio.`,
    "",
    "CADRE IMPOSÉ :",
    CONTRATS[d.langage],
    "",
  ];
  const actuel = (d.codeActuel ?? "").trim();
  if (actuel) {
    morceaux.push("CODE ACTUEL, à modifier :", "", actuel, "");
  }
  morceaux.push("DEMANDE :", d.consigne.trim(), "", CONSIGNE_FORME);
  return morceaux.join("\n");
}

/**
 * Le code contenu dans la réponse d'un modèle.
 *
 * POURQUOI CE NETTOYAGE EST NÉCESSAIRE. Un modèle instruit rend presque toujours son code dans un
 * bloc encadré de trois accents graves, souvent précédé d'une phrase et suivi d'une autre. Poser
 * cela tel quel dans l'éditeur produirait un script qui ne s'exécute pas, et l'utilisateur
 * attribuerait l'échec au modèle plutôt qu'au collage.
 *
 * S'il y a plusieurs blocs, le plus long est gardé : les modèles font précéder le vrai script de
 * courts exemples d'appel.
 */
export function extraireCode(reponse: string): string {
  const texte = String(reponse ?? "");
  const blocs: string[] = [];
  const motif = /```[ \t]*([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(texte)) !== null) blocs.push(m[2]);
  if (blocs.length > 0) {
    return blocs.reduce((a, b) => (b.length > a.length ? b : a)).replace(/\s+$/, "");
  }
  // Pas de bloc : un modèle qui a suivi la consigne rend le code nu. On retire seulement une
  // éventuelle clôture orpheline et les blancs de bord.
  return texte.replace(/^```[a-zA-Z0-9_+-]*\r?\n?/, "").replace(/```\s*$/, "").trim();
}

/**
 * Les modèles installés, rangés du plus prometteur au moins.
 *
 * UN MODÈLE DE CODE AVANT UN MODÈLE GÉNÉRAL : sur cette tâche l'écart n'est pas de nuance. Le tri
 * n'interdit rien, il met devant ce qui a le plus de chances de marcher.
 */
export function rangerModeles(modeles: readonly string[]): string[] {
  const rang = (n: string) => {
    const b = n.toLowerCase();
    if (b.includes("coder") || b.includes("code")) return 0;
    if (b.includes("qwen") || b.includes("deepseek") || b.includes("mistral") || b.includes("llama")) return 1;
    return 2;
  };
  return [...modeles].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
}
