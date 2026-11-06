# Standing: production image. Build context is the repo root:
#   docker build -f deploy/Dockerfile -t standing .
# No secrets are baked in; they come from the env file at runtime.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runs the database migrations, then exits (the `migrate` service in docker-compose.yml).
FROM deps AS migrate
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY src ./src
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S standing && adduser -S standing -G standing
COPY --from=builder --chown=standing:standing /app/.next/standalone ./
COPY --from=builder --chown=standing:standing /app/.next/static ./.next/static
COPY --from=builder --chown=standing:standing /app/public ./public
USER standing
EXPOSE 3000
CMD ["node", "server.js"]
