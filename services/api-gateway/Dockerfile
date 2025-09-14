# Multi-stage Docker build for Constella API Gateway
FROM node:18-alpine AS base

# Install pnpm for faster package management
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Development stage
FROM base AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["pnpm", "run", "dev"]

# Build stage
FROM base AS builder
ENV NODE_ENV=production

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm run build

# Production dependencies only
RUN pnpm install --frozen-lockfile --production

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S constella && \
    adduser -S constella -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=constella:constella /app/dist ./dist
COPY --from=builder --chown=constella:constella /app/node_modules ./node_modules
COPY --from=builder --chown=constella:constella /app/package.json ./package.json

# Create logs directory
RUN mkdir -p logs && chown constella:constella logs

# Switch to non-root user
USER constella

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
