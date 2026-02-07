FROM node:18-alpine

# Install SQLite
RUN apk add --no-cache sqlite

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/scheduler ../packages/scheduler

# Install dependencies
RUN npm ci --production

# Copy source
COPY src ./src

# Create data directory for SQLite
RUN mkdir -p /data

# Expose HTTP port
EXPOSE 9876

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:9876/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Set environment variables
ENV PROMPD_SERVICE_PORT=9876
ENV PROMPD_SERVICE_HOST=0.0.0.0
ENV PROMPD_DB_PATH=/data/schedules.db
ENV NODE_ENV=production

# Run service
CMD ["node", "src/server.js"]
