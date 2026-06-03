# Web service for Railway. Two-stage: build with full toolchain, run lean.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

FROM node:20-alpine AS builder
WORKDIR /app
# NEXT_PUBLIC_* must exist at build time — Next bakes them into the client bundle.
ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD sh -c "npm start -- --port ${PORT:-3000} --hostname 0.0.0.0"
