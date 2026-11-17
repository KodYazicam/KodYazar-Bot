# syntax=docker/dockerfile:1

# Build stage: install dev dependencies, compile TypeScript, then drop devDependencies.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build \
 && npm prune --omit=dev

# Runtime stage: tini as PID 1, unprivileged user, health check against /healthz.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app
RUN apk add --no-cache tini \
 && addgroup -S bot \
 && adduser -S -G bot bot \
 && mkdir -p /app/data \
 && chown bot:bot /app/data
COPY --from=build --chown=bot:bot /app/package.json /app/package-lock.json ./
COPY --from=build --chown=bot:bot /app/node_modules ./node_modules
COPY --from=build --chown=bot:bot /app/dist/src ./dist/src
USER bot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"
ENTRYPOINT ["/sbin/tini", "--", "node", "dist/src/index.js"]
