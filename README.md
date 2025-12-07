# automatic-tracker-change

A lightweight CLI and Dockerized tool that logs into a qBittorrent Web UI and rewrites tracker URLs in bulk using a JavaScript regular expression and replacement pattern. It can run once or continuously (built-in loop mode).

**Important: This project was created end‑to‑end using Junie Pro from JetBrains.**


## Features
- Authenticate to qBittorrent Web UI and iterate over torrents
- Inspect all trackers or a filtered set of torrents (by hash, category, tag, state)
- Rewrite tracker announce URLs by applying a regex pattern with a replacement
- Dry‑run mode for safe previews
- Built‑in loop mode (CLI/Docker) via `--loop` and `--interval`, or env: `QBT_LOOP`, `QBT_LOOP_INTERVAL`
- GitHub Actions workflow to build and publish multi‑arch Docker images with semantic tags

## Docker image
- Docker Hub: https://hub.docker.com/r/hichxm/automatic-tracker-change
- Pull: `docker pull hichxm/automatic-tracker-change:latest`

## Docker usage examples

### Run once (preview with --dry-run)
```
docker run --rm \
  -e SCRIPT_ARGS='--baseUrl http://host.docker.internal:8080 \
                  --username admin \
                  --password secret \
                  --pattern "(^|//)(old-tracker\\.example\\.org)(/.*)?$" \
                  --replacement "$1new-tracker.example.org$3" \
                  --dry-run' \
  hichxm/automatic-tracker-change:latest
```

Alternatively, you can use environment variables (they map to the same CLI flags):
```
docker run --rm \
  -e QBT_BASE_URL=http://host.docker.internal:8080 \
  -e QBT_USERNAME=admin \
  -e QBT_PASSWORD=secret \
  -e QBT_PATTERN='(^|//)(old-tracker\.example\.org)(/.*)?$' \
  -e QBT_REPLACEMENT='$1new-tracker.example.org$3' \
  -e SCRIPT_ARGS='--dry-run' \
  hichxm/automatic-tracker-change:latest
```

### Run continuously (loop mode)
```
docker run -d --name automatic-tracker-change \
  --restart unless-stopped \
  -e QBT_BASE_URL=http://host.docker.internal:8080 \
  -e QBT_USERNAME=admin \
  -e QBT_PASSWORD=secret \
  -e QBT_PATTERN='(udp://)tracker-old\.example\.com(:[0-9]+)?/announce' \
  -e QBT_REPLACEMENT='$1tracker-new.example.com$2/announce' \
  -e QBT_LOOP=1 \
  -e QBT_LOOP_INTERVAL=15 \
  hichxm/automatic-tracker-change:latest
```

### Using docker-compose
```
services:
  automatic-tracker-change:
    image: hichxm/automatic-tracker-change:latest
    container_name: automatic-tracker-change
    restart: unless-stopped
    environment:
      QBT_BASE_URL: http://host.docker.internal:8080
      QBT_USERNAME: admin
      QBT_PASSWORD: secret
      QBT_PATTERN: '(^|//)(old-tracker\.example\.org)(/.*)?$'
      QBT_REPLACEMENT: '$1new-tracker.example.org$3'
      QBT_LOOP: '1'
      QBT_LOOP_INTERVAL: '30'
      # Optional: extra flags (e.g., --debug) can be passed via SCRIPT_ARGS
      SCRIPT_ARGS: '--debug'
```

Notes:
- On macOS/Windows, `host.docker.internal` points to the host machine. On Linux, you may need `--network host` or `--add-host=host.docker.internal:host-gateway` (Docker 20.10+).
- Start with `--dry-run` to safely preview changes.
- Store credentials securely (Docker secrets, env files, or orchestrator-specific secret stores).

## Requirements
- qBittorrent with Web UI enabled (Preferences → Web UI)
- Node.js 18+ (for local CLI usage) or Docker runtime


## Quick start (local CLI)
```
node index.js \
  --baseUrl http://localhost:8080 \
  --username admin \
  --password secret \
  --pattern "(^|//)(old-tracker\\.example\\.org)(/.*)?$" \
  --replacement "$1new-tracker.example.org$3" \
  --dry-run
```

Notes:
- Use `--dry-run` to preview what would change without applying it.
- The regex is compiled with the `g` flag and applied to each tracker URL.
- Escape backslashes in shell contexts.


## CLI usage
`index.js` accepts flags or environment variables (env vars act as fallback):

- `--baseUrl <url>` (env: `QBT_BASE_URL`) — Base URL of qBittorrent Web UI, e.g. `http://localhost:8080`
- `--username <u>` (env: `QBT_USERNAME`) — Web UI username
- `--password <p>` (env: `QBT_PASSWORD`) — Web UI password
- `--pattern <regex>` (env: `QBT_PATTERN`) — JavaScript RegExp pattern (without delimiters)
- `--replacement <string>` (env: `QBT_REPLACEMENT`) — Replacement string supporting `$1..$9`
- `--hash <hash>` — Filter by specific torrent hash (repeatable)
- `--category <name>` — Filter by category
- `--tag <tag>` — Filter by tag (repeatable)
- `--state <state>` — Filter by torrent state (e.g., `pausedUP`, `stalledDL`)
- `--dry-run` — Don’t apply changes, only log intended actions
- `--debug` — Verbose debugging output

Examples:
```
# Apply for all torrents, actually modify trackers (no --dry-run)
node index.js \
  --baseUrl http://localhost:8080 \
  --username admin \
  --password secret \
  --pattern "(udp://)tracker-old\\.example\\.com(:[0-9]+)?/announce" \
  --replacement "$1tracker-new.example.com$2/announce"

# Only for a specific torrent (repeat --hash to target multiple)
node index.js \
  --baseUrl http://localhost:8080 \
  --username admin \
  --password secret \
  --hash 0123456789ABCDEF0123456789ABCDEF01234567 \
  --pattern "old" \
  --replacement "new" \
  --dry-run
```

## Safety and troubleshooting
- Start with `--dry-run` and `--debug` to safely preview actions and logs.
- Ensure qBittorrent Web UI is reachable from where the tool runs.
- If authentication fails, verify the credentials and whether qBittorrent enforces CSRF or host origin rules.
- When crafting regexes:
  - Escape special characters properly in your shell
  - Test your regex on a sample URL before running against all torrents


## Project structure
- `index.js` — Main CLI tool (supports single-run and loop mode)
- `lib/QbtClient.js` — qBittorrent Web API client class used by the CLI
- `Dockerfile` — Container image definition; runs `node index.js` and accepts `SCRIPT_ARGS`
- `package.json` — Node package manifest


## License
This project is released under the ISC License.


## Acknowledgments
This project was created only using Junie Pro from JetBrains.