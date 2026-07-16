FROM node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

WORKDIR /app
COPY --chown=node:node harness/conformance/server.cjs /app/server.cjs

ENV NODE_ENV=production
USER node
EXPOSE 18787
CMD ["node", "/app/server.cjs"]
