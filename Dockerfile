FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS frontend-deps
ENV NODE_ENV=development
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

FROM frontend-deps AS frontend-build
COPY frontend/ ./
RUN npm run build

FROM base AS backend-deps
ENV NODE_ENV=development
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM backend-deps AS builder
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json tsconfig.scripts.json ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY frontend/package*.json ./frontend/
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
