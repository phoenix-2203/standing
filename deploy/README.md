# Deploying Standing on a shared VPS

Standing runs in its own Docker Compose project next to other apps, without touching them:
- its own containers, network and volume; no host folders mounted; no Docker socket;
- the app listens on `127.0.0.1:3100` only, and Caddy is the only way in; the database publishes no port;
- memory and CPU caps; the app runs as a non-root user with a read-only filesystem;
- the 15-minute sync runs in a small scheduler container, so nothing is added to the server's crontab;
- secrets live in `/opt/standing/standing.env` (root-only, mode 600) and are never in the image or the repo.

## First deploy (Ubuntu 24.04, Docker installed, Caddy as the web server)

```bash
mkdir -p /opt/standing && chmod 700 /opt/standing
git clone https://github.com/phoenix-2203/standing.git /opt/standing/app
```

Create `/opt/standing/standing.env` (mode 600) with the keys listed in `.env.example`, plus `DB_PASSWORD`,
`SESSION_SECRET` and `CRON_SECRET` from `openssl rand`. Then:

```bash
cd /opt/standing/app && docker compose -f deploy/docker-compose.yml --env-file /opt/standing/standing.env up -d --build
docker builder prune -af   # drop build leftovers
```

Caddy: put a site block in its own file, readable by the `caddy` user (mode 644), and import it.

```
standing.<your-domain> {
	encode gzip
	reverse_proxy 127.0.0.1:3100
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
```

## Update

```bash
cd /opt/standing/app && git pull && docker compose -f deploy/docker-compose.yml --env-file /opt/standing/standing.env up -d --build && docker builder prune -af
```

Migrations run automatically before the app starts.

## Remove completely

```bash
cd /opt/standing/app && docker compose -f deploy/docker-compose.yml --env-file /opt/standing/standing.env down -v
```

Then delete the `import /etc/caddy/standing.caddy` line and that file, and reload Caddy.
