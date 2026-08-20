// audio/timbres.ts — Normalisation des paramètres « Timbre ».
//
// Ces paramètres ont longtemps eu pour seule identité leur libellé français
// (« Sinus », « Douce »…), comparé tel quel dans la couche audio. Depuis
// l'ajout des `optionIds`, `paramTexte` renvoie un id stable — mais les projets
// déjà enregistrés contiennent encore les anciens libellés FR ou EN. Ces deux
// fonctions acceptent les trois formes et renvoient l'id canonique, ou
// `undefined` si la valeur est inconnue : c'est à l'appelant de choisir son
// repli, car il diffère d'un nœud à l'autre (triangle ici, sine là).

export type FormeOndeId = "sine" | "square" | "sawtooth" | "triangle";

const FORMES_ONDE: Record<string, FormeOndeId> = {
  // ids canoniques (= valeurs OscillatorType du Web Audio, et mêmes ids que
  // le paramètre « Forme » de l'Oscillateur, déjà migré)
  sine: "sine", square: "square", sawtooth: "sawtooth", triangle: "triangle",
  // anciens libellés français
  sinus: "sine", "carré": "square", carre: "square", scie: "sawtooth",
  // ancien libellé anglais spécifique (les autres coïncident avec les ids)
  saw: "sawtooth",
};

export function formeOndeDepuisTimbre(valeur: string): FormeOndeId | undefined {
  return FORMES_ONDE[String(valeur).trim().toLowerCase()];
}

export type CaractereTimbreId = "douce" | "brillante" | "percutante";

const CARACTERES: Record<string, CaractereTimbreId> = {
  douce: "douce", brillante: "brillante", percutante: "percutante",
  soft: "douce", bright: "brillante", percussive: "percutante",
};

export function caractereTimbre(valeur: string): CaractereTimbreId {
  return CARACTERES[String(valeur).trim().toLowerCase()] ?? "douce";
}
