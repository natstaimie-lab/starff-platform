# Railway build for the Starff API (replaces Nixpacks).
# NestJS 12 is ESM-only and needs Node >= 22.12 (require(esm)); Nixpacks'
# nodejs_22 is pinned at 22.11, so we use the official image instead.
# Same steps as the old nixpacks.toml: install -> prisma generate -> build api.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm install
RUN npm run db:generate && npm run build --workspace @starff/api

ENV NODE_ENV=production
CMD ["node", "apps/api/dist/main.js"]
