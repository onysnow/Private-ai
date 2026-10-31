# The render service (ADR-0005, lines 2 and 18): ECharts drawn as SVG on the
# server, and maps drawn as PNG with MapLibre Native.
# Build context: this directory (docker-compose.yml sets it).

# --- Stage 1: the packages ----------------------------------------------------
FROM node:22.22.2-bookworm-slim AS packages
WORKDIR /srv/render
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 2: the service -----------------------------------------------------
# MapLibre Native's Linux build (@maplibre/maplibre-gl-native 6.4.1) is made
# for Ubuntu 24.04: it needs glibc 2.38 and ICU 74, which Debian's Node
# images lack, so the service runs on Ubuntu 24.04 with Node copied in. It
# draws through OpenGL: Mesa's software renderer (libgl1-mesa-dri) on an X
# virtual frame buffer (xvfb-run), so no GPU is needed.
FROM ubuntu:24.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libopengl0 libglx0 libgl1-mesa-dri libcurl4t64 libuv1t64 libjpeg-turbo8 libpng16-16t64 libwebp7 libicu74 \
       xvfb xauth \
    && rm -rf /var/lib/apt/lists/*
COPY --from=packages /usr/local/bin/node /usr/local/bin/node

WORKDIR /srv/render
ENV NODE_ENV=production
COPY --from=packages /srv/render/node_modules ./node_modules
COPY package.json server.mjs map.mjs ./

# Nothing here needs root: the service reads its own files and the base map
# (mounted read-only at /basemap) and answers HTTP.
USER ubuntu
EXPOSE 8070
ENV PORT=8070 HOST=0.0.0.0 BASEMAP_DIR=/basemap

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:8070/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# xvfb-run gives MapLibre Native the X display it opens its GL context on;
# ECharts needs none.
CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1x1x24", "node", "server.mjs"]
