# Build stage: tests, builds the client, prunes to runtime dependencies
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries; skip npm's default node-gyp compile
RUN npm ci --ignore-scripts
COPY . .
RUN npm test && npx vite build
# Keep only runtime packages; drop better-sqlite3's C sources and other platforms' binaries
RUN npm prune --omit=dev --ignore-scripts \
 && rm -rf node_modules/better-sqlite3/deps node_modules/better-sqlite3/src \
 && find node_modules/better-sqlite3/prebuilds -type f ! -name "linux-$(node -p process.arch).node" -delete \
 && find node_modules -type d -empty -delete \
 && node -e "new (require('better-sqlite3'))(':memory:')"

# Runtime stage
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data TZ=Europe/Zurich
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY drizzle ./drizzle
EXPOSE 3000
VOLUME /app/data
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx/esm", "src/server/index.ts"]
