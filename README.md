# automatic-tracker-change

A lightweight CLI and Dockerized tool that logs into a qBittorrent Web UI and rewrites tracker URLs in bulk using a JavaScript regular expression and replacement pattern. It can run once (CLI) or continuously (loop mode) in a container.

**Important: This project was created end‑to‑end using Junie Pro from JetBrains.**


## Features
- Authenticate to qBittorrent Web UI and iterate over torrents
- Inspect all trackers or a filtered set of torrents (by hash, category, tag, state)
- Rewrite tracker announce URLs by applying a regex pattern with a replacement
- Dry‑run mode for safe previews
- Docker image with a switchable entrypoint (one‑shot CLI or loop mode)
- GitHub Actions workflow to build and publish multi‑arch Docker images with semantic tags


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
- `index.js` — Main CLI tool
- `loop.sh` — Simple wrapper to re-run the CLI on an interval (used by Docker loop mode)
- `Dockerfile` — Container image definition with switchable entrypoint via `RUN_SCRIPT`
- `package.json` — Node package manifest


## License
This project is released under the ISC License.


## Acknowledgments
This project was created only using Junie Pro from JetBrains.