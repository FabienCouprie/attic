// audio/lame.ts — L'encodeur MP3, rendu utilisable.
//
// POURQUOI CE FICHIER. lamejs 1.2.1 est une traduction de LAME écrite pour Node, et plusieurs de ses
// modules se servent de MPEGMode, Lame et BitStream SANS les importer : ils comptaient sur des
// variables globales qu'un script non strict aurait laissé fuir. Une fois empaqueté en modules ES
// par Vite, chaque module est strict et isolé, et le premier `new Mp3Encoder` lève « MPEGMode is not
// defined ». L'erreur était avalée par la reprise de `bufferVersMp3Blob`, qui écrivait alors un WAV :
// chaque fichier « .mp3 » sorti d'Attic était un WAV sous une fausse extension.
//
// On pose donc ces trois globales avant tout encodage, avec les modules mêmes du paquet, pour que
// les comparaisons d'identité de lamejs (`mode == MPEGMode.MONO`) portent sur les mêmes objets.

import MPEGMode from "lamejs/src/js/MPEGMode.js";
import Lame from "lamejs/src/js/Lame.js";
import BitStream from "lamejs/src/js/BitStream.js";

const g = globalThis as any;
g.MPEGMode ??= MPEGMode;
g.Lame ??= Lame;
g.BitStream ??= BitStream;

export { Mp3Encoder } from "lamejs";
