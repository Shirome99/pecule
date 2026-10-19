# syntax=docker/dockerfile:1
# Image unique : l'API Express sert aussi le front buildé, sur un seul port.

# 1) build du client (React + PWA)
FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2) dépendances de production du serveur (better-sqlite3 embarque ses binaires précompilés, cf. server/.npmrc)
FROM node:24-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json server/.npmrc ./
RUN npm ci --omit=dev

# 3) image finale
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/data/money.db
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY server/src ./server/src
COPY --from=client /app/client/dist ./client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "server/src/index.js"]
