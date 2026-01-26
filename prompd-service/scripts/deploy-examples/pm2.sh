#!/bin/bash

# PM2 Deployment for Prompd Service
# PM2 is a process manager for Node.js with built-in monitoring and auto-restart

echo "Deploying Prompd Service with PM2..."

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing PM2..."
    npm install -g pm2
fi

# Navigate to service directory
cd "$(dirname "$0")/../.."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Stop existing instance if running
pm2 stop prompd-service 2>/dev/null || true
pm2 delete prompd-service 2>/dev/null || true

# Start service with PM2
pm2 start src/server.js --name prompd-service

# Save PM2 process list
pm2 save

# Configure PM2 to start on system boot
pm2 startup

echo ""
echo "✓ Prompd Service deployed with PM2"
echo ""
echo "Useful commands:"
echo "  pm2 status           - View service status"
echo "  pm2 logs prompd-service  - View logs"
echo "  pm2 restart prompd-service  - Restart service"
echo "  pm2 stop prompd-service  - Stop service"
echo "  pm2 monit            - Monitor resources"
echo ""
