FROM node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=18789
WORKDIR /app
COPY model-gateway/src/server.cjs ./model-gateway/src/server.cjs

USER node
EXPOSE 18789
CMD ["node", "model-gateway/src/server.cjs"]
