#!/usr/bin/env node

/**
 * qBittorrent Tracker URL Rewriter
 *
 * This CLI logs into a qBittorrent Web UI, scans trackers for all (or selected) torrents,
 * and updates tracker URLs whose text matches a provided regex, replacing them using a
 * JavaScript replacement pattern.
 *
 * Requirements:
 * - qBittorrent Web UI enabled (Preferences → Web UI)
 * - Provide base URL, username, password, regex pattern, and replacement
 * - Node.js 18+ (uses global fetch)
 *
 * Example:
 *   node index.js \
 *     --baseUrl http://localhost:8080 \
 *     --username admin \
 *     --password secret \
 *     --pattern "(^|//)(old-tracker\\.example\\.org)(/.*)?$" \
 *     --replacement "$1new-tracker.example.org$3" \
 *     --dry-run
 *
 * Notes:
 * - The regex is evaluated with the "g" flag for each tracker URL.
 * - Use --dry-run to preview changes without applying them.
 * - Use --hash to target a single torrent (can be provided multiple times).
 * - Use --category or --tag to filter torrents.
 */

const { argv, exit } = require('node:process');
const { URL, URLSearchParams } = require('node:url');

let DEBUG = false;
function debug(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}
function maskSecret(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 2) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 2) + s.slice(-2);
}

function parseArgs() {
  const args = {};
  const av = process.argv || [];
  for (let i = 2; i < av.length; i++) {
    const a = av[i];
    if (a && a.startsWith('--')) {
      const key = a.slice(2);
      const next = av[i + 1];
      // flags
      if (a === '--dry-run') {
        args.dryRun = true;
      } else if (a === '--debug') {
        args.debug = true;
      } else if (a === '--loop') {
        args.loop = true;
      } else if (next && !String(next).startsWith('--')) {
        if (key === 'hash') {
          args.hash = args.hash || [];
          args.hash.push(next);
        } else if (key === 'tag') {
          args.tag = args.tag || [];
          args.tag.push(next);
        } else {
          args[key] = next;
        }
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  // Support env vars as fallback
  args.baseUrl = args.baseUrl || process.env.QBT_BASE_URL;
  args.username = args.username || process.env.QBT_USERNAME;
  args.password = args.password || process.env.QBT_PASSWORD;
  args.pattern = args.pattern || process.env.QBT_PATTERN;
  args.replacement = args.replacement || process.env.QBT_REPLACEMENT;
  // Loop support from env vars
  if (args.loop == null) {
    const envLoop = (process.env.QBT_LOOP || process.env.LOOP || '').toString().trim();
    if (envLoop) args.loop = ['1', 'true', 'yes', 'on'].includes(envLoop.toLowerCase());
  }
  if (args.interval == null) {
    const envInt = (process.env.QBT_LOOP_INTERVAL || process.env.LOOP_INTERVAL || '').toString().trim();
    if (envInt) args.interval = envInt;
  }
  // Debug from env: QBT_DEBUG=1 or DEBUG=1
  if (args.debug == null) {
    const envDebug = (process.env.QBT_DEBUG || process.env.DEBUG || '').toString().trim();
    if (envDebug) {
      args.debug = ['1', 'true', 'yes', 'on'].includes(envDebug.toLowerCase());
    }
  }

  return args;
}

function printHelp() {
  console.log(`
qBittorrent Tracker URL Rewriter

Usage:
  node index.js --baseUrl <url> --username <u> --password <p> \
    --pattern <regex> --replacement <string> [options]

Options:
  --baseUrl <url>          Base URL of qBittorrent Web UI (e.g., http://localhost:8080)
  --username <u>           Web UI username
  --password <p>           Web UI password
  --pattern <regex>        JavaScript RegExp (without delimiters). Escape backslashes.
  --replacement <string>   Replacement pattern (supports $1..$9)
  --hash <hash>            Limit to a specific torrent hash (repeatable)
  --category <name>        Limit to torrents in a category
  --tag <tag>              Limit to torrents with a tag (repeatable)
  --state <state>          Limit to torrents by state (e.g., pausedUP, stalledDL)
  --dry-run                Show actions without applying changes
  --loop                   Enable continuous loop mode (see interval)
  --interval <seconds>     Interval between iterations in loop mode (default 10)
  --debug                  Enable verbose debug logging
  --help                   Show this help

Environment variables (fallbacks):
  QBT_BASE_URL, QBT_USERNAME, QBT_PASSWORD, QBT_PATTERN, QBT_REPLACEMENT
  QBT_DEBUG (or DEBUG), QBT_LOOP (or LOOP), QBT_LOOP_INTERVAL (or LOOP_INTERVAL)

Examples:
  # Single run (dry-run)
  node index.js --baseUrl http://localhost:8080 --username admin --password secret \
    --pattern "(^|//)old\\.tracker\\.com(:\\d+)?(/.*)?$" --replacement "$1new.tracker.org$3" --dry-run

  # Loop every 30 seconds
  node index.js --baseUrl http://localhost:8080 --username admin --password secret \
    --pattern "(^|//)old\\.tracker\\.com(:\\d+)?(/.*)?$" --replacement "$1new.tracker.org$3" --loop --interval 30
`);
}

async function qbtLogin(baseUrl, username, password, cookieJar) {
  const loginUrl = new URL('/api/v2/auth/login', baseUrl);
  debug('Login URL:', loginUrl.toString());
  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieJar.cookie || '',
    },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: 'manual',
  });
  debug('Login response:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed: HTTP ${res.status} ${res.statusText} - ${text}`);
  }
  // Capture SID cookie
  const setCookie = res.headers.get('set-cookie') || '';
  debug('Set-Cookie header present:', !!setCookie);
  const m = /SID=([^;]+);/.exec(setCookie);
  if (!m) {
    // Some versions set "qbittorrent_sess" or reuse cookie on 200.
    const m2 = /(SID|qbittorrent_sess)=([^;]+);/.exec(setCookie);
    if (!m2) {
      // qBittorrent may return 200 with existing cookie. Proceed if already set.
      if (!cookieJar.cookie) {
        throw new Error('Login did not return a session cookie. Check credentials or CSRF settings.');
      }
      debug('Proceeding with preexisting cookie.');
    } else {
      cookieJar.cookie = `${m2[1]}=${m2[2]}`;
      debug('Captured session cookie type:', m2[1]);
    }
  } else {
    cookieJar.cookie = `SID=${m[1]}`;
    debug('Captured session cookie: SID');
  }
}

async function qbtGetTorrents(baseUrl, cookieJar, filters) {
  const url = new URL('/api/v2/torrents/info', baseUrl);
  if (filters.category) url.searchParams.set('category', filters.category);
  if (filters.tag && filters.tag.length) url.searchParams.set('tag', filters.tag.join(','));
  if (filters.hash && filters.hash.length === 1) url.searchParams.set('hashes', filters.hash[0]);
  if (filters.state) url.searchParams.set('filter', filters.state);

  debug('Fetching torrents from:', url.toString());
  const res = await fetch(url, {
    headers: { Cookie: cookieJar.cookie || '' },
  });
  debug('Torrents response:', res.status, res.statusText);
  if (!res.ok) throw new Error(`Failed to fetch torrents: ${res.status} ${res.statusText}`);
  const data = await res.json();
  debug('Torrents count:', Array.isArray(data) ? data.length : 'n/a');
  return data;
}

async function qbtGetTrackers(baseUrl, cookieJar, hash) {
  const url = new URL('/api/v2/torrents/trackers', baseUrl);
  url.searchParams.set('hash', hash);
  debug('Fetching trackers for hash:', hash, 'URL:', url.toString());
  const res = await fetch(url, { headers: { Cookie: cookieJar.cookie || '' } });
  debug('Trackers response:', res.status, res.statusText);
  if (!res.ok) throw new Error(`Failed to fetch trackers for ${hash}: ${res.status} ${res.statusText}`);
  const data = await res.json();
  debug('Trackers count for', hash, ':', Array.isArray(data) ? data.length : 'n/a');
  return data;
}

async function qbtEditTracker(baseUrl, cookieJar, hash, origUrl, newUrl) {
  const url = new URL('/api/v2/torrents/editTracker', baseUrl);
  const body = new URLSearchParams({ hash, origUrl, newUrl }).toString();
  debug('Editing tracker for hash:', hash);
  debug('Orig URL:', origUrl);
  debug('New URL:', newUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieJar.cookie || '',
    },
    body,
  });
  debug('Edit tracker response:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to edit tracker (hash=${hash}): ${res.status} ${res.statusText} - ${text}`);
  }
}

async function runOnce(args) {
  if (args.help) {
    printHelp();
    return 0;
  }

  // Enable debug global
  DEBUG = !!args.debug;
  if (DEBUG) {
    const masked = {
      baseUrl: args.baseUrl,
      username: args.username,
      password: maskSecret(args.password),
      pattern: args.pattern,
      replacement: args.replacement,
      category: args.category,
      tag: args.tag,
      state: args.state,
      hash: args.hash,
      dryRun: !!args.dryRun,
    };
    debug('Arguments:', masked);
  }

  const missing = ['baseUrl', 'username', 'password', 'pattern', 'replacement'].filter(k => !args[k]);
  if (missing.length) {
    console.error(`Missing required options: ${missing.join(', ')}`);
    printHelp();
    return 2;
  }

  // Build regex, default to global flag
  let regex;
  try {
    regex = new RegExp(args.pattern, 'g');
  } catch (e) {
    console.error(`Invalid regex pattern: ${e.message}`);
    return 2;
  }
  debug('Using regex:', regex, 'replacement:', args.replacement);

  const cookieJar = { cookie: '' };

  try {
    debug('Attempting login as:', args.username);
    await qbtLogin(args.baseUrl, args.username, args.password, cookieJar);
    debug('Login successful. Cookie set:', !!cookieJar.cookie);
  } catch (e) {
    console.error(e.message);
    return 1;
  }

  let torrents;
  try {
    torrents = await qbtGetTorrents(args.baseUrl, cookieJar, args);
    if (args.hash && args.hash.length > 1) {
      // When multiple hashes are specified, filter manually
      const set = new Set(args.hash.map(h => h.toLowerCase()));
      torrents = torrents.filter(t => set.has((t.hash || '').toLowerCase()));
      debug('Applied manual hash filter, resulting count:', torrents.length);
    }
  } catch (e) {
    console.error(e.message);
    return 1;
  }

  if (!torrents.length) {
    console.log('No torrents matched the filters. Nothing to do.');
    return 0;
  }

  let totalChecked = 0;
  let totalChanged = 0;
  for (const t of torrents) {
    let trackers;
    try {
      trackers = await qbtGetTrackers(args.baseUrl, cookieJar, t.hash);
    } catch (e) {
      console.error(e.message);
      continue;
    }

    for (const tr of trackers) {
      const { url: origUrl } = tr;
      // Skip DHT/PeX or empty URLs if any
      if (!origUrl || !/^https?:\/\//i.test(origUrl)) {
        debug('Skipping non-HTTP(S) tracker or empty URL for torrent:', t.hash);
        continue;
      }
      // Compute replacement
      const newUrl = origUrl.replace(regex, args.replacement);
      totalChecked++;
      if (newUrl !== origUrl) {
        if (args.dryRun) {
          console.log(`[DRY-RUN] ${t.name} (${t.hash}):`);
          console.log(`  ${origUrl} -> ${newUrl}`);
        } else {
          try {
            await qbtEditTracker(args.baseUrl, cookieJar, t.hash, origUrl, newUrl);
            console.log(`Updated: ${t.name} (${t.hash})`);
            console.log(`  ${origUrl} -> ${newUrl}`);
            totalChanged++;
          } catch (e) {
            console.error(`Error updating tracker for ${t.name}: ${e.message}`);
          }
        }
      } else {
        debug('No change for URL:', origUrl);
      }
    }
  }

  console.log(`\nDone. Checked ${totalChecked} tracker URLs. ${args.dryRun ? 'Would change' : 'Changed'} ${totalChanged}.`);
  debug('Finished processing.');
  return 0;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

if (require.main === module) {
  (async () => {
    const args = parseArgs();
    if (args.loop) {
      // Parse interval (seconds) default 10
      let intervalSec = Number(args.interval || 10);
      if (!Number.isFinite(intervalSec) || intervalSec <= 0) intervalSec = 10;
      console.log(`Loop mode enabled. Interval: ${intervalSec}s`);
      while (true) {
        try {
          await runOnce(args);
        } catch (err) {
          console.error('Unexpected error:', err && err.message ? err.message : err);
        }
        await sleep(intervalSec * 1000);
      }
    } else {
      const code = await runOnce(args);
      exit(code);
    }
  })();
}

// Export functions for testing
module.exports = {
  parseArgs,
  maskSecret,
  printHelp,
  qbtLogin,
  qbtGetTorrents,
  qbtGetTrackers,
  qbtEditTracker,
  runOnce,
  sleep,
};
