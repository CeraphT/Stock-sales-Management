# Multi-stage build for the StockFlow web client (Vite → static, served by nginx).
# Build context is the REPO ROOT (workspace package @stockflow/core lives in
# packages/core). The API base URL is baked in at build time.
FROM node:20-alpine AS build
WORKDIR /repo

# Install workspace deps (root package.json defines the npm workspaces).
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=https://api.mfspace.lu
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w pharmastock-web

FROM nginx:alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
