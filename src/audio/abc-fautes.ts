// audio/abc-fautes.ts — Le refus d'un morceau ABC qui jouerait autre chose que ce qui est écrit.
//
// Le lecteur relève quatre fautes que rien ne peut deviner : une durée nulle, un accord jamais
// refermé, une liaison entre deux hauteurs, un n-olet inachevé (`FauteAbc`, dans `abc.ts`). Chaque
// nœud qui lit un morceau pour le jouer ou le vérifier le refuse dès qu'il en porte une, avec ce
// message : la faute, sa ligne comptée depuis le X: du morceau, le texte de cette ligne, et le
// fragment fautif. Ce que le lecteur saute sans changer ce qu'on entend reste un avertissement.

import { traduire } from "../i18n";
import type { MorceauAbc } from "./abc";

/** Le refus d'un morceau qui porte des fautes, ou null s'il n'en porte pas. `quoi` nomme la partition. */
export function refusAbc(m: MorceauAbc, quoi = traduire("msg.abc.partition_var_0", "ABC")): string | null {
  if (m.erreurs.length === 0) return null;
  return [
    traduire("msg.abc.refusee_var_0_var_1", quoi, m.erreurs.length),
    ...m.erreurs.slice(0, 8).map((f) => traduire(`msg.abc.faute.${f.raison}`, f.ligne, f.texte, f.fragment)),
    ...(m.erreurs.length > 8 ? ["…"] : []),
  ].join("\n");
}
