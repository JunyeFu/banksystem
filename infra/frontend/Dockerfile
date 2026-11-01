FROM node:20.20.2-alpine3.23@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS build

ARG APP_NAME
ARG VITE_OIDC_ISSUER
WORKDIR /workspace

RUN case "$APP_NAME" in customer-portal|operations-console|quality-case-portal) ;; *) exit 2 ;; esac
RUN npm install --global npm@11.17.0 --no-audit --no-fund

COPY packages ./packages
COPY contracts/openapi/quality-platform-api.yaml ./contracts/openapi/quality-platform-api.yaml
COPY apps/${APP_NAME}/package.json apps/${APP_NAME}/package-lock.json ./apps/${APP_NAME}/
RUN npm --prefix ./apps/${APP_NAME} ci --no-audit --no-fund
RUN ln -s /workspace/apps/${APP_NAME}/node_modules /workspace/node_modules

COPY apps/${APP_NAME} ./apps/${APP_NAME}
RUN if [ -n "$VITE_OIDC_ISSUER" ]; then export VITE_OIDC_ISSUER; fi; \
    npm --prefix ./apps/${APP_NAME} run build \
    && cp -R ./apps/${APP_NAME}/dist /portal

FROM nginx:1.30.6-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
COPY --from=build /portal/ /usr/share/nginx/html/
