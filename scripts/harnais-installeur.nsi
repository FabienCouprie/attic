; scripts/harnais-installeur.nsi — De quoi COMPILER `build/installer.nsh`, et rien d'autre.
;
; POURQUOI CE FICHIER EXISTE. Le refus d'installer dans un arbre de sources est tenu par
; `scripts/installeur-arbre-de-sources.test.ts`, qui LIT `build/installer.nsh` : il vérifie que le
; refus est posé aux deux endroits et qu'il sonde les quatre marques. Il ne vérifie pas que le
; fichier se compile, et cette limite était écrite le jour où il a été posé.
;
; ELLE A MORDU LE LENDEMAIN. La construction de la v5.0.1 est tombée sur makensis :
;
;   Error: could not resolve label "Attic will not uninstall from here.
;
; `/SD` était écrit avant le texte du `MessageBox` au lieu d'après. Le garde ne pouvait rien voir —
; la ligne était présente, bien formée pour une lecture humaine, et fausse pour NSIS. Et NSIS ne
; tournait nulle part ailleurs que dans le workflow de release, c'est-à-dire APRÈS le tag : une
; faute de syntaxe s'y découvrait toujours une fois de trop.
;
; CE QUE CE HARNAIS EST, ET CE QU'IL N'EST PAS. Il produit un exécutable jetable qui n'installe
; rien : son seul objet est de donner à `makensis` un script complet où nos deux macros sont
; INSÉRÉES, puisqu'une macro jamais insérée n'est jamais analysée. Il ne remplace pas la
; construction de la release, qui seule emploie le modèle d'electron-builder ; il attrape ce qui
; relève de notre fichier, et c'est de là qu'est venue la faute.
;
; `$INSTDIR` vaut ici un dossier temporaire : les macros le lisent, aucune ne l'écrit.

Name "Attic — harnais de compilation"
OutFile "$%TEMP%\attic-harnais-nsis.exe"
InstallDir "$TEMP\attic-harnais"
RequestExecutionLevel user

; `!include` se résout depuis le dossier de CE script, donc le chemin relatif suffit et l'appelant
; n'a rien à passer. Un garde l'accompagne : si le fichier change de place, la compilation le dit.
!include "..\build\installer.nsh"

Section "harnais"
  ; `customInit` tourne normalement dans `.onInit` ; l'insérer ici suffit à la faire analyser,
  ; et c'est l'analyse qu'on cherche.
  !insertmacro customInit
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  ; Idem pour `customUnInit`, qui vit dans `un.onInit`.
  !insertmacro customUnInit
SectionEnd
