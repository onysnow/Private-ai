# The render service (ADR-0005, line 2): ECharts drawn as SVG on the server.
# Build context: this directory (docker-compose.yml sets it).
FROM node:22-alpine

WORKDIR /srv/render
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./

# Nothing here needs root: the service reads its own files and answers HTTP.
USER node
EXPOSE 8070
ENV PORT=8070 HOST=0.0.0.0

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:8070/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
