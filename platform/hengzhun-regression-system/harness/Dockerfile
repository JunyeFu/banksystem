# node:20.20.2-bookworm-slim, pinned to the published multi-platform digest.
FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund \
        --maxsockets=1 \
        --fetch-retries=5 \
        --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=120000 \
        --fetch-timeout=300000 \
    && test -f node_modules/typescript/bin/tsc \
    && node node_modules/typescript/bin/tsc --version
COPY harness/src ./harness/src
COPY harness/migrations ./harness/migrations
RUN node node_modules/typescript/bin/tsc \
    && test -f dist/harness/src/index.js
RUN npm prune --omit=dev --ignore-scripts \
    && npm rebuild better-sqlite3 --foreground-scripts \
    && node -e "const Database=require('better-sqlite3'); const database=new Database(':memory:'); database.exec('SELECT 1'); database.close();" \
    && npm cache clean --force

FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18788 \
    HENGZHUN_PRODUCT_ROOT=/app
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY harness/migrations ./harness/migrations
COPY worker/src/login-profile.cjs worker/src/account-ownership.cjs worker/src/auth-rejection-recovery.cjs ./worker/src/

USER node
EXPOSE 18788
CMD ["node", "dist/harness/src/index.js"]
