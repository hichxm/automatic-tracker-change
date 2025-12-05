import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import functions under test (CJS module imported from ESM test)
import mod from '../index.js';

const { parseArgs, maskSecret, runOnce, sleep } = mod;

describe('maskSecret', () => {
  it('returns empty for falsy', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
    expect(maskSecret(undefined)).toBe('');
  });
  it('masks short strings', () => {
    expect(maskSecret('a')).toBe('*');
    expect(maskSecret('ab')).toBe('**');
  });
  it('keeps last two characters visible for longer strings', () => {
    expect(maskSecret('abc')).toBe('*bc');
    expect(maskSecret('supersecret')).toBe('*********et');
  });
});

describe('parseArgs', () => {
  let origArgv;
  let origEnv;

  beforeEach(() => {
    origArgv = process.argv.slice();
    origEnv = { ...process.env };
  });
  afterEach(() => {
    process.argv = origArgv;
    process.env = origEnv;
  });

  it('parses long options with values and flags', () => {
    process.argv = ['node', 'index.js', '--baseUrl', 'http://localhost:8080', '--username', 'admin', '--password', 'secret', '--pattern', 'old', '--replacement', 'new', '--dry-run', '--debug'];
    const args = parseArgs();
    expect(args.baseUrl).toBe('http://localhost:8080');
    expect(args.username).toBe('admin');
    expect(args.password).toBe('secret');
    expect(args.pattern).toBe('old');
    expect(args.replacement).toBe('new');
    expect(args.dryRun).toBe(true);
    expect(args.debug).toBe(true);
  });

  it('collects repeatable args into arrays (hash, tag)', () => {
    process.argv = ['node', 'index.js', '--hash', 'aaa', '--hash', 'bbb', '--tag', 'tv', '--tag', '1080p'];
    const args = parseArgs();
    expect(args.hash).toEqual(['aaa', 'bbb']);
    expect(args.tag).toEqual(['tv', '1080p']);
  });

  it('uses environment fallbacks when args are missing', () => {
    process.argv = ['node', 'index.js'];
    process.env.QBT_BASE_URL = 'http://env.local:8080';
    process.env.QBT_USERNAME = 'envuser';
    process.env.QBT_PASSWORD = 'envpass';
    process.env.QBT_PATTERN = 'envOld';
    process.env.QBT_REPLACEMENT = 'envNew';
    process.env.QBT_LOOP = '1';
    process.env.QBT_LOOP_INTERVAL = '15';
    process.env.QBT_DEBUG = 'true';
    const args = parseArgs();
    expect(args.baseUrl).toBe('http://env.local:8080');
    expect(args.username).toBe('envuser');
    expect(args.password).toBe('envpass');
    expect(args.pattern).toBe('envOld');
    expect(args.replacement).toBe('envNew');
    expect(args.loop).toBe(true);
    expect(args.interval).toBe('15');
    expect(args.debug).toBe(true);
  });
});

describe('runOnce (early validations)', () => {
  it('returns code 2 when required options are missing', async () => {
    const code = await runOnce({});
    expect(code).toBe(2);
  });

  it('returns code 2 on invalid regex pattern', async () => {
    const code = await runOnce({
      baseUrl: 'http://localhost:8080',
      username: 'u',
      password: 'p',
      pattern: '(', // invalid
      replacement: 'x',
      dryRun: true,
    });
    expect(code).toBe(2);
  });
});

describe('sleep', () => {
  it('resolves after given milliseconds', async () => {
    vi.useFakeTimers();
    const p = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
