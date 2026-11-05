#!/bin/sh
# scripts/outils-linux.sh — Compile les outils natifs Linux dans un conteneur Ubuntu 22.04.
#
# Pourquoi un conteneur : voir l'en-tête de `outils-linux.Containerfile` — le plancher de glibc de
# l'AppImage est celui de la machine qui compile. Le dépôt est monté tel quel ; les outils arrivent
# dans `bin/`, comme avec `npm run outils:construire`, puis se publient par `npm run outils:publier`.
#
# Usage : scripts/outils-linux.sh [id…]   (par défaut : acestep audiocpp sdcpp)
# songsee n'y figure pas : en Go sans cgo, il est statique et se construit sur la machine même.
set -eu

racine=$(cd "$(dirname "$0")/.." && pwd)
image=attic-outils-linux

if [ "$#" -eq 0 ]; then
  set -- acestep audiocpp sdcpp
fi

podman build -t "$image" -f "$racine/scripts/outils-linux.Containerfile" "$racine/scripts"
podman run --rm -v "$racine:/attic" -w /attic "$image" \
  node scripts/outils-natifs.cjs --construire "$@"
