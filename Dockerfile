# One container runs both halves of BMERC: the NestJS API on 127.0.0.1:4000 (not exposed) and the
# Next.js site on $PORT. The site forwards /api/v1 to the API, so the browser only sees one origin.
FROM node:22-slim

ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's engines look for OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Dependencies first, so code changes do not reinstall them. The API's postinstall runs `prisma generate`,
# which needs the schema and a database URL (not used at build time).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
ENV MIGRATE_DATABASE_URL=postgresql://build@localhost/build
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build -w @bmerc/api \
 && API_ORIGIN=http://127.0.0.1:4000 npm run build -w @bmerc/web

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "deploy/start.sh"]
