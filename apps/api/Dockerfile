FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY package.json ./

RUN npx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node src/import.js --if-empty /app/seed.json && node src/index.js"]
