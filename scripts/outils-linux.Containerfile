# scripts/outils-linux.Containerfile — L'environnement où se compilent les outils natifs Linux.
#
# UBUNTU 22.04, ET C'EST LE PLANCHER DE GLIBC DE L'APPIMAGE. Un exécutable demande la glibc de la
# machine qui l'a compilé : construits sur Ubuntu 24.04, acestep, audio.cpp et stable-diffusion.cpp
# demandaient 2.38, ce qui écartait Ubuntu 22.04 et Debian 12. Compilés ici, ils demandent 2.35 au
# plus. Electron (2.25) et onnxruntime (2.28) restent en dessous ; songsee, en Go sans cgo, n'en
# demande aucune et se construit hors du conteneur.
#
# LE SDK VULKAN DE LUNARG, ÉPINGLÉ, et non les paquets d'Ubuntu : 22.04 n'a pas `glslc`, que le
# moteur Vulkan de ggml exige pour compiler ses shaders, et ses en-têtes Vulkan sont de 1.3.204.
# Le `glslc` du SDK demande glibc 2.29 ; `libvulkan.so.1`, chargé chez l'utilisateur, est celui de
# son système.
#
# Lancé par `scripts/outils-linux.sh`, qui monte le dépôt et appelle `outils-natifs.cjs --construire`.
FROM docker.io/library/ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build git ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

ARG VULKAN_SDK_VERSION=1.4.309.0
ARG VULKAN_SDK_SHA256=616a25a9d8b33336e83957f97ca273b8e95461649723354300d02c26ae52a1f6
RUN curl -fsSLo /tmp/vulkansdk.tar.xz \
      "https://sdk.lunarg.com/sdk/download/${VULKAN_SDK_VERSION}/linux/vulkansdk-linux-x86_64-${VULKAN_SDK_VERSION}.tar.xz" \
 && echo "${VULKAN_SDK_SHA256}  /tmp/vulkansdk.tar.xz" | sha256sum -c - \
 && mkdir -p /opt/vulkansdk \
 && tar -xJf /tmp/vulkansdk.tar.xz -C /opt/vulkansdk \
 && rm /tmp/vulkansdk.tar.xz
ENV VULKAN_SDK=/opt/vulkansdk/${VULKAN_SDK_VERSION}/x86_64
ENV PATH=${VULKAN_SDK}/bin:${PATH}

# Node, pour `outils-natifs.cjs` : la même version majeure que le dépôt, épinglée par empreinte.
ARG NODE_VERSION=v22.23.4
ARG NODE_SHA256=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
RUN curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" \
 && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
 && rm /tmp/node.tar.xz
