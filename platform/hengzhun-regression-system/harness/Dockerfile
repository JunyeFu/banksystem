# node:20.20.2-bookworm-slim, pinned to the published multi-platform digest.
FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY harness/src ./harness/src
COPY harness/migrations ./harness/migrations
RUN node node_modules/typescript/bin/tsc

FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18788 \
    HENGZHUN_PRODUCT_ROOT=/app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY harness/migrations ./harness/migrations

USER node
EXPOSE 18788
CMD ["node", "dist/harness/src/index.js"]
