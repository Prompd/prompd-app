# Multi-stage build for production optimization
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache libc6-compat && \
    apk update

# Install dependencies
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Production image
FROM base AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 prompdhub

# Copy dependencies from deps stage
COPY --from=deps --chown=prompdhub:nodejs /app/node_modules ./node_modules

# Copy source code and package.json
COPY --chown=prompdhub:nodejs src/ ./src/
COPY --chown=prompdhub:nodejs package.json ./

# Copy prompts folder (chat mode configurations)
COPY --chown=prompdhub:nodejs prompts/ ./prompts/

# Create data and app directories for local storage
RUN mkdir -p /data/packages /app/uploads /app/cache && \
    chown -R prompdhub:nodejs /data /app/uploads /app/cache

# Switch to non-root user
USER prompdhub

# Expose port (Cloud Run uses PORT env var)
EXPOSE 3010

# Environment variables
ENV NODE_ENV=production
ENV PORT=3010

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
        const port = process.env.PORT || 3010; \
        const options = { hostname: 'localhost', port: port, path: '/health', timeout: 5000 }; \
        const req = http.request(options, (res) => { \
            if (res.statusCode === 200) process.exit(0); \
            else process.exit(1); \
        }); \
        req.on('error', () => process.exit(1)); \
        req.on('timeout', () => process.exit(1)); \
        req.end();"

# Start the application (JavaScript ESM - no build step needed)
CMD ["node", "src/server.js"]
