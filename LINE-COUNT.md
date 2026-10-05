# File Line Count

Generated from `src/` — every `.ts`, `.tsx` and `.css` file.
Regenerate with `npm run docs:lignes`; a test fails when this file no longer matches the sources.

**Weight** counts every line. **Code** counts what the repository's size norm measures:
neither blank lines, nor comments, nor documentation (`notice`, `doc`, `resume`), nor
translations (any field whose name ends in `En`, and translation-table entries).

**1266 files, 218436 lines, of which 150251 are code.**
The table lists the 167 files of 200 code lines or more, heaviest first;
the remaining 1099 account for 148956 lines.

**15 files exceed the 400-code-line norm** and are marked « ! ».

| File | Code | Weight | |
|---|---:|---:|---|
| src/ui/atelier.css | 1399 | 1750 | ! |
| src/ui/App.tsx | 1077 | 1444 | ! |
| src/ui/hooks/useExecutionGraphe.ts | 727 | 1514 | ! |
| src/ui/Inspector.tsx | 606 | 763 | ! |
| src/audio/abc.ts | 589 | 764 | ! |
| src/docs/documentation-graphe.ts | 572 | 732 | ! |
| src/ui/AtelierNode.tsx | 523 | 718 | ! |
| src/audio/cercle-pulsant.test.ts | 522 | 718 | ! |
| src/audio/sfz.test.ts | 497 | 619 | ! |
| src/plugins/index.ts | 477 | 489 | ! |
| src/core/boucle-graphe.test.ts | 465 | 588 | ! |
| src/vues-domaine/SelecteurMultiZones.tsx | 459 | 543 | ! |
| src/audio/clavier-banque.test.ts | 439 | 557 | ! |
| src/ui/BarreOutils.tsx | 419 | 456 | ! |
| src/vues-domaine/FormeOnde.tsx | 408 | 484 | ! |
| src/plugins/montage.ts | 390 | 542 |  |
| src/plugins/theorie-avancee.test.ts | 388 | 550 |  |
| src/plugins/csound.ts | 387 | 523 |  |
| src/audio/ia.ts | 382 | 466 |  |
| src/plugins/effets-midi.ts | 382 | 502 |  |
| src/plugins/carte-sonore-plan-cellulaire.ts | 381 | 435 |  |
| src/plugins/spectrogramme-image.test.ts | 377 | 532 |  |
| src/plugins/syntheses-exotiques.test.ts | 372 | 542 |  |
| src/vues-domaine/LigneDeTemps.tsx | 368 | 611 |  |
| src/plugins/magenta.ts | 367 | 467 |  |
| src/audio/soundfont.ts | 360 | 440 |  |
| src/audio/tone-synths.ts | 360 | 494 |  |
| src/plugins/analyse.ts | 360 | 437 |  |
| src/plugins/pochette-svg.ts | 358 | 401 |  |
| src/audio/automate-cellulaire.ts | 355 | 430 |  |
| src/audio/algebre.test.ts | 347 | 421 |  |
| src/plugins/textgen.ts | 343 | 523 |  |
| src/plugins/carte-sonore-formes.ts | 341 | 386 |  |
| src/audio/montage-morceaux.test.ts | 337 | 444 |  |
| src/audio/clavier-banque.ts | 335 | 652 |  |
| src/audio/continuation-spectrale.ts | 335 | 418 |  |
| src/audio/courbe.test.ts | 335 | 422 |  |
| src/audio/effets-verification.test.ts | 334 | 385 |  |
| src/plugins/effets-spectral-modulation.test.ts | 334 | 470 |  |
| src/plugins/theorie-avancee.ts | 334 | 424 |  |
| src/audio/generation-patrons.ts | 333 | 344 |  |
| src/audio/pca-neuronale.ts | 330 | 397 |  |
| src/audio/cercle.test.ts | 328 | 432 |  |
| src/plugins/effets-spectral.ts | 328 | 432 |  |
| src/audio/modulation-effets.test.ts | 327 | 421 |  |
| src/plugins/effets-spectral.test.ts | 327 | 431 |  |
| src/audio/couleurs.ts | 326 | 357 |  |
| src/plugins/tone-synths.ts | 325 | 420 |  |
| src/plugins/generateurs.test.ts | 323 | 450 |  |
| src/vues-domaine/EditeurCode.tsx | 320 | 426 |  |
| src/audio/midi-vers-abc.ts | 319 | 461 |  |
| src/audio/batterie.ts | 318 | 390 |  |
| src/plugins/carte-sonore-decor.ts | 318 | 341 |  |
| src/plugins/effets-temporel.ts | 318 | 442 |  |
| src/audio/csound.test.ts | 317 | 410 |  |
| src/audio/particules.test.ts | 316 | 416 |  |
| src/vues-domaine/MontageVideo.tsx | 314 | 407 |  |
| src/audio/effets-montage.ts | 313 | 414 |  |
| src/plugins/effets-cresson.test.ts | 312 | 405 |  |
| src/quiz/notions.ts | 312 | 337 |  |
| src/audio/conformite-clavier.ts | 311 | 435 |  |
| src/plugins/effets-midi.test.ts | 310 | 428 |  |
| src/quiz/notions-suite.ts | 310 | 319 |  |
| src/ui/demo/useRealisateurDemo.tsx | 310 | 368 |  |
| src/audio/courbe.ts | 308 | 611 |  |
| src/plugins/generateurs-echantillons.ts | 306 | 503 |  |
| src/plugins/optionIds-retrocompat.test.ts | 304 | 419 |  |
| src/plugins/prompt-graphe.ts | 300 | 416 |  |
| src/audio/io-profondeur.test.ts | 299 | 368 |  |
| src/plugins/syntheses-exotiques.ts | 299 | 406 |  |
| src/audio/analyse-genre.ts | 297 | 369 |  |
| src/vues-domaine/vues-claviers.tsx | 297 | 382 |  |
| src/plugins/sherpa-asr.ts | 296 | 411 |  |
| src/plugins/theorie-composition.ts | 296 | 392 |  |
| src/plugins/csound.test.ts | 294 | 383 |  |
| src/core/domaine-nombre.test.ts | 291 | 389 |  |
| src/audio/groove-box.ts | 289 | 377 |  |
| src/audio/multicanal.ts | 289 | 490 |  |
| src/quiz/formules.ts | 288 | 310 |  |
| src/audio/sfz.ts | 287 | 467 |  |
| src/audio/csound.ts | 286 | 577 |  |
| src/plugins/textgen-ia.test.ts | 286 | 412 |  |
| src/audio/groove-box.test.ts | 281 | 331 |  |
| src/core/bulles.test.ts | 281 | 362 |  |
| src/plugins/deplacement.test.ts | 281 | 372 |  |
| src/plugins/visualisation-ecoute.test.ts | 280 | 413 |  |
| src/parcours/exercices.ts | 279 | 401 |  |
| src/plugins/tone-synths-fm.ts | 279 | 358 |  |
| src/plugins/generateurs-sources.ts | 278 | 343 |  |
| src/plugins/magenta-helpers.ts | 274 | 401 |  |
| src/audio/csound-formules.ts | 273 | 333 |  |
| src/audio/multicanal.test.ts | 273 | 333 |  |
| src/audio/motifs-midi.test.ts | 270 | 339 |  |
| src/docs/documentation-graphe.test.ts | 270 | 352 |  |
| src/vues-domaine/vues-images.tsx | 269 | 381 |  |
| src/audio/demonstration-video.ts | 266 | 313 |  |
| src/plugins/python-processor.ts | 266 | 346 |  |
| src/plugins/vexflow-notation.ts | 264 | 333 |  |
| src/audio/io.ts | 257 | 380 |  |
| src/plugins/analyse.test.ts | 256 | 324 |  |
| src/audio/harmonie-spectrale.test.ts | 255 | 344 |  |
| src/core/instrument-graphe.test.ts | 255 | 315 |  |
| src/quiz/sigles.ts | 253 | 278 |  |
| src/audio/objets-sonores.ts | 252 | 360 |  |
| src/audio/hauteur.ts | 250 | 393 |  |
| src/audio/cercle-pulsant.ts | 249 | 543 |  |
| src/audio/effets-spectral.test.ts | 248 | 301 |  |
| src/audio/multi-reservoir.ts | 248 | 325 |  |
| src/audio/abc.test.ts | 247 | 306 |  |
| src/audio/attracteurs.ts | 247 | 289 |  |
| src/core/meta.ts | 246 | 336 |  |
| src/audio/analyse.ts | 244 | 321 |  |
| src/audio/qualites-accords.test.ts | 243 | 326 |  |
| src/audio/pghi.ts | 242 | 377 |  |
| src/audio/reservoir.ts | 242 | 371 |  |
| src/audio/texture-statistique.ts | 241 | 412 |  |
| src/plugins/generateurs-fractals.ts | 241 | 274 |  |
| src/plugins/visualisation.test.ts | 241 | 369 |  |
| src/core/cache.test.ts | 240 | 310 |  |
| src/audio/ondelettes.test.ts | 239 | 330 |  |
| src/core/cache-execution.test.ts | 239 | 353 |  |
| src/plugins/algebre-musicale.ts | 239 | 346 |  |
| src/vues-domaine/vues-lecteur.tsx | 239 | 283 |  |
| src/vues-domaine/vues-analyse.tsx | 237 | 281 |  |
| src/plugins/integration.test.ts | 236 | 274 |  |
| src/audio/algebre.ts | 235 | 332 |  |
| src/parcours/exercices-composition.ts | 233 | 319 |  |
| src/audio/risset.test.ts | 232 | 298 |  |
| src/vues-domaine/ArbreRythmiqueVue.tsx | 232 | 283 |  |
| src/plugins/effets-cresson.ts | 230 | 313 |  |
| src/audio/spectral-cdp.ts | 229 | 371 |  |
| src/core/bulles.ts | 229 | 423 |  |
| src/audio/spectral-wishart.test.ts | 228 | 285 |  |
| src/audio/melodie-sur-accords.test.ts | 227 | 276 |  |
| src/plugins/julia-processor.ts | 227 | 282 |  |
| src/audio/commun.ts | 221 | 364 |  |
| src/core/graphe.test.ts | 221 | 308 |  |
| src/plugins/effets.ts | 221 | 259 |  |
| src/ui/hooks/usePersistance.ts | 221 | 314 |  |
| src/audio/palette-harmonique.ts | 220 | 258 |  |
| src/vues-domaine/ExtraitVideo.tsx | 220 | 261 |  |
| src/audio/cercle.ts | 219 | 496 |  |
| src/plugins/arbre-rythmique.ts | 218 | 311 |  |
| src/audio/objets-sonores.test.ts | 217 | 262 |  |
| src/audio/particules.ts | 216 | 412 |  |
| src/audio/quantification.ts | 216 | 413 |  |
| src/plugins/spectral-cdp.ts | 216 | 318 |  |
| src/audio/assaisonnement.test.ts | 215 | 282 |  |
| src/audio/synthese-features.test.ts | 213 | 272 |  |
| src/vues-domaine/Spectre.tsx | 213 | 246 |  |
| src/audio/csound-orchestre.ts | 212 | 355 |  |
| src/audio/accords.ts | 210 | 343 |  |
| src/audio/automate-cellulaire.test.ts | 209 | 233 |  |
| src/audio/ssp.test.ts | 209 | 273 |  |
| src/plugins/multicanal.ts | 209 | 288 |  |
| src/audio/ecosysteme.ts | 208 | 388 |  |
| src/audio/spectrogramme-mel.ts | 208 | 333 |  |
| src/plugins/effets.test.ts | 208 | 302 |  |
| src/plugins/boucle-creneau.test.ts | 207 | 252 |  |
| src/plugins/cercle-transformations.test.ts | 206 | 257 |  |
| src/plugins/effet-parametres-midi.test.ts | 205 | 322 |  |
| src/plugins/tonal.ts | 205 | 283 |  |
| src/audio/musicxml-arbre.ts | 203 | 314 |  |
| src/plugins/midi-norme.test.ts | 203 | 289 |  |
| src/audio/micromontage.test.ts | 202 | 266 |  |
| src/core/boucle-graphe.ts | 201 | 422 |  |
| src/audio/ondelettes.ts | 200 | 349 |  |
