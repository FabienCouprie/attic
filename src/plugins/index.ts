// plugins/index.ts — Importe tous les plugins
import "./typesFlux";   // types de flux du domaine (à charger en premier)
import "./entrees";
import "./effets";
import "./analyse";
import "./sorties";
import "./sortie-texte";
// Anciennement « complements.ts », découpé par famille :
import "./entrees-extra";
import "./generateurs";
import "./montage";
import "./sortie-conversion";
import "./separation";
import "./collections";
import "./visualisation";
import "./sequenceurs";
import "./enveloppe";
import "./instruments";
import "./styles-musicaux";
import "./emotions";
import "./tessitures";
import "./generateur-script-ia";
import "./musicgen";
import "./texte-provider";
import "./tts";
import "./speech-to-text";
import "./traduction";
import "./prompt-graphe";
import "./pochette";
import "./textgen";
import "./generateur-paroles";
import "./galerie-exposition";
import "./gestion-nodes";
import "./python-processor";
import "./frontiere";

// Empêche le tree-shaking
export const _plugins_loaded = true;
