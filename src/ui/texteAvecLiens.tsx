// ui/texteAvecLiens.tsx — Rendu d'un texte de notice (contenu développeur, pas
// une entrée utilisateur) avec les URL http(s) transformées en vrais liens
// cliquables. Les notices sont aujourd'hui affichées en texte brut (Inspecteur
// et popup « ? » du nœud) : impossible d'y placer un lien téléchargeable pour
// un modèle non embarqué (ex. « Texte → image »). Détection volontairement
// simple (regex sur https://) plutôt qu'un parseur markdown complet — inutile
// vu l'unique cas d'usage (un lien de temps en temps dans une notice).
const REGEX_URL = /(https?:\/\/[^\s)]+)/g;

export function TexteAvecLiens({ texte }: { texte: string }) {
  // split() avec un groupe capturant intercale les correspondances dans le
  // résultat : indices impairs = URL capturée, indices pairs = texte autour.
  // (Ne PAS réutiliser REGEX_URL.test() en boucle : stateful avec le flag
  // « g », lastIndex fausserait un match sur deux.)
  const morceaux = texte.split(REGEX_URL);
  return (
    <>
      {morceaux.map((m, i) =>
        i % 2 === 1 ? (
          <a key={i} href={m} target="_blank" rel="noopener noreferrer">{m}</a>
        ) : (
          <span key={i}>{m}</span>
        )
      )}
    </>
  );
}
