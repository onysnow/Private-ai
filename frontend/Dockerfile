FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so a
# deployment that is not on localhost must pass the public API URL as a build
# argument (docker-compose.prod.yml does). Empty keeps the source fallback
# (http://localhost:8000), which is what docker-compose.yml relies on.
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "require('http').get('http://localhost:3000', res => process.exit(res.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
