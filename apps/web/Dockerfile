# ================================================================
# Next.js Production Dockerfile — Multi-stage build
# ================================================================
# Stage 1: Install dependencies
# Stage 2: Build the Next.js app
# Stage 3: Minimal runtime image
#
# Build:  docker build -t soundhaus_next .
# Run:    docker run -p 3001:3000 soundhaus_next
# ================================================================

# --- Stage 1: Dependencies ---
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files for dependency installation
COPY package.json ./
# If you have a lockfile, uncomment:
# COPY package-lock.json ./

# Install production + dev dependencies (dev needed for build)
RUN npm install

# --- Stage 2: Build ---
FROM node:20-slim AS builder
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
# NEXT_PUBLIC_* vars must be available at BUILD time
ENV NEXT_TELEMETRY_DISABLED=1
# These will be overridden by docker-compose environment:
ENV NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Build the Next.js app
RUN npm run build

# --- Stage 3: Runtime ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only the build output and necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the Next.js server
# NOTE: This requires `output: 'standalone'` in next.config.ts
# If not using standalone, replace with: CMD ["npm", "start"]
CMD ["node", "server.js"]
