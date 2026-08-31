FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
# better-sqlite3 沒有 prebuild 時需要編譯工具
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod=false

FROM deps AS build
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production DATABASE_PATH=/data/dlsite.db
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY drizzle ./drizzle
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
