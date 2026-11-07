// src/workers/transcription-worker.ts — Le Transcripteur MIDI, hors du fil de l'interface.
//
// Le dialogue est dans `servir-par-lot`, le calcul dans `audio/transcription-mesures.ts` : ce
// fichier ne fait que les joindre. UNE SEULE TÂCHE : le tempo deviné, quand le réglage n'a pas été
// touché, et la transcription monophonique se mesurent sur les mêmes canaux. Le polyphonique, par
// Basic Pitch, reste dans la page, qui en attend déjà le modèle sans geler.
//
// **Relevé avant, sur les trois secondes du son d'essai et sans qu'un seul message passe : 127 ms
// en monophonique. Le polyphonique gelait de 96 à 119 ms, par le tempo deviné d'un bloc.**
import { mesurerTranscription, type DemandeTranscription, type MesuresTranscription } from "../audio/transcription-mesures";
import { servirUneFois } from "./servir-par-lot";

servirUneFois<DemandeTranscription, MesuresTranscription>(mesurerTranscription);
