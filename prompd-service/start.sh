#!/bin/bash

# Start Prompd Service (Linux/macOS)

echo "Starting Prompd Service..."
echo ""
echo "Service will run at http://localhost:9876"
echo "Press Ctrl+C to stop"
echo ""

node src/server.js
