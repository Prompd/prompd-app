# Prompd Service - Local Workflow Scheduler

A lightweight Node.js service that runs **locally on your machine** (localhost:9876) to execute scheduled workflows 24/7, independently of the Electron app.

## Overview

**Prompd Service runs on YOUR computer at `http://localhost:9876`** - it's not a cloud service.

- **Local execution** - All workflows run on your machine with your local files and API keys
- **24/7 scheduling** - Runs independently of the Electron app (even when app is closed)
- **Lightweight** - Minimal dependencies, low resource usage
- **Flexible deployment** - Run however you prefer (pm2, docker, systemd, screen, etc.)

## Quick Start

```bash
# Install dependencies
npm install

# Start service (foreground)
npm start

# Service runs at http://localhost:9876
```

## Configuration

All configuration via environment variables (no config files needed):

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPD_SERVICE_PORT` | `9876` | HTTP port to listen on |
| `PROMPD_SERVICE_HOST` | `127.0.0.1` | Host to bind to (use `0.0.0.0` for Docker) |
| `PROMPD_DB_PATH` | `~/.prompd/scheduler/schedules.db` | SQLite database path |

## Deployment Options

### Option 1: PM2 (Recommended for Development)

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start src/server.js --name prompd-service

# Save configuration
pm2 save

# Auto-start on boot
pm2 startup
```

**Benefits:** Auto-restart, monitoring, log management

### Option 2: Docker (Recommended for Isolation)

```bash
# Build image
docker build -t prompd-service .

# Run with volume for persistence
docker run -d \
  -p 9876:9876 \
  -v prompd-data:/data \
  --name prompd-service \
  prompd-service

# Or use docker-compose
cd scripts/deploy-examples
docker-compose up -d
```

**Benefits:** Isolated environment, easy cleanup

### Option 3: Systemd (Recommended for Linux Servers)

```bash
# Edit systemd.service template
# Copy to system: sudo cp scripts/deploy-examples/systemd.service /etc/systemd/system/prompd-service.service

# Enable and start
sudo systemctl enable prompd-service
sudo systemctl start prompd-service

# Check status
sudo systemctl status prompd-service
```

**Benefits:** Runs as system service, auto-start on boot

### Option 4: Screen (Quick & Simple)

```bash
# Start in screen session
screen -dmS prompd npm start

# Reattach to view logs
screen -r prompd

# Detach: Ctrl+A, then D
```

**Benefits:** Simple, no installation needed

### Option 5: Foreground (Testing)

```bash
# Just run it
npm start

# Stop: Ctrl+C
```

**Benefits:** Immediate feedback, easy debugging

## API Endpoints

All endpoints are at `http://localhost:9876/api/`:

### Schedules

- `GET /api/schedules` - List all schedules
- `POST /api/schedules` - Create schedule
- `GET /api/schedules/:id` - Get schedule details
- `PUT /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule
- `POST /api/schedules/:id/execute` - Execute immediately
- `GET /api/schedules/:id/next-runs` - Preview next run times

### Execution History

- `GET /api/executions?workflowId=...&limit=50` - Get execution history

### Health Check

- `GET /health` - Service status

## Database

SQLite database at `~/.prompd/scheduler/schedules.db` contains:

- **schedules** - Cron schedules for workflows
- **execution_history** - Past executions (90-day retention)

**Shared with Tray Mode** - Both tray and service modes use the same database, so schedules work in either mode.

## How It Works

1. **Service starts** → Loads schedules from SQLite
2. **Cron jobs registered** → node-cron watches for triggers
3. **Schedule triggers** → Workflow file executed locally
4. **Results stored** → Execution history saved to database
5. **History cleanup** → Old executions deleted after 90 days

## Security

- **Local only** - Binds to 127.0.0.1 by default (not accessible from network)
- **No authentication** - Assumes localhost is trusted
- **Rate limiting** - 100 requests/minute to prevent abuse

**For remote access:** Use reverse proxy (nginx) with authentication.

## Monitoring

### PM2

```bash
pm2 logs prompd-service  # View logs
pm2 monit                # Resource monitoring
```

### Docker

```bash
docker logs -f prompd-service  # View logs
```

### Systemd

```bash
journalctl -u prompd-service -f  # View logs
```

## Troubleshooting

### Service won't start

```bash
# Check if port is in use
lsof -i :9876  # or: netstat -ano | findstr :9876

# Check database permissions
ls -la ~/.prompd/scheduler/

# Check logs
npm start  # Run in foreground to see errors
```

### Schedules not triggering

```bash
# Check schedule is enabled
curl http://localhost:9876/api/schedules

# Check next run time
curl http://localhost:9876/api/schedules/:id/next-runs

# Manually trigger to test
curl -X POST http://localhost:9876/api/schedules/:id/execute
```

### High resource usage

```bash
# Reduce concurrent executions
# Edit server.js or set environment variable
```

## Upgrading

```bash
# Stop service
pm2 stop prompd-service  # or docker stop, systemctl stop, etc.

# Pull updates
git pull

# Install dependencies
npm install

# Restart service
pm2 restart prompd-service
```

## Uninstalling

```bash
# Stop service
pm2 delete prompd-service  # or docker rm, systemctl disable, etc.

# Remove database (optional)
rm -rf ~/.prompd/scheduler/

# Remove service files
rm -rf /path/to/prompd-service
```

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload
npm run dev

# Run tests (when implemented)
npm test
```

## Support

- Issues: https://github.com/prompd/prompd/issues
- Docs: https://docs.prompd.app

## License

MIT
