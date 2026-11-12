#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_API = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10000;

function usage() {
  return [
    'Usage:',
    '  snip add <url>    Create a short link',
    '  snip ls           List all links',
    '  snip open <code>  Open the original URL in your browser',
    '  snip help         Show this help',
  ].join('\n');
}

function apiUrl(path) {
  const base = (process.env.SNIP_API || DEFAULT_API).replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error('SNIP_API must be a valid http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SNIP_API must be a valid http or https URL.');
  }
  return `${base}${path}`;
}

async function request(path, options = {}) {
  try {
    return await fetch(apiUrl(path), {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    throw new Error(`Could not reach the Snip API: ${error.message}`);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`The Snip API returned invalid JSON (HTTP ${response.status}).`);
  }
}

async function apiError(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const message = body && typeof body.error === 'string'
    ? body.error
    : `The Snip API returned HTTP ${response.status}.`;
  return new Error(message);
}

function validateHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Please provide a valid http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  return parsed.href;
}

async function addLink(value) {
  const url = validateHttpUrl(value);
  const response = await request('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (response.status !== 201) throw await apiError(response);
  const link = await readJson(response);
  if (!link || typeof link.shortUrl !== 'string') {
    throw new Error('The Snip API response did not include a shortUrl.');
  }
  process.stdout.write(`${link.shortUrl}\n`);
}

async function listLinks() {
  const response = await request('/api/links');
  if (response.status !== 200) throw await apiError(response);
  const links = await readJson(response);
  if (!Array.isArray(links)) throw new Error('The Snip API returned an invalid links list.');
  if (links.length === 0) {
    process.stdout.write('No links yet.\n');
    return;
  }

  const rows = links.map((link) => [
    String(link.code ?? ''),
    String(link.hits ?? ''),
    String(link.url ?? ''),
  ]);
  const labels = ['CODE', 'HITS', 'URL'];
  const widths = [0, 1, 2].map((column) =>
    Math.max(labels[column].length, ...rows.map((row) => row[column].length)),
  );
  const formatRow = (row) => `${row[0].padEnd(widths[0])}  ${row[1].padStart(widths[1])}  ${row[2]}`;
  process.stdout.write(`${formatRow(labels)}\n`);
  for (const row of rows) process.stdout.write(`${formatRow(row)}\n`);
}

function browserCommand(platform = process.platform) {
  if (platform === 'darwin') return { command: 'open', args: [] };
  if (platform === 'win32') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start ""'] };
  }
  return { command: 'xdg-open', args: [] };
}

function openInBrowser(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The API returned an invalid redirect URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The API returned a URL with an unsupported protocol.');
  }

  const { command, args } = browserCommand();
  const windowsArgs = process.platform === 'win32'
    ? [...args, `"${url.href}"`]
    : [...args, url.href];
  return new Promise((resolve, reject) => {
    const child = spawn(command, windowsArgs, {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      if (process.platform !== 'win32') child.unref();
      resolve();
    });
  });
}

async function openLink(code) {
  const response = await request(`/${encodeURIComponent(code)}`, { redirect: 'manual' });
  if (response.status === 404) throw new Error(`Unknown short code: ${code}`);
  if (response.status !== 302) throw await apiError(response);
  const location = response.headers.get('location');
  if (!location) throw new Error('The Snip API redirect did not include a Location header.');
  try {
    await openInBrowser(location);
  } catch (error) {
    throw new Error(`Could not launch the browser: ${error.message}`);
  }
}

async function main(args) {
  const [command, ...rest] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (command === 'add') {
    if (rest.length !== 1) throw new Error('Usage: snip add <url>');
    await addLink(rest[0]);
    return;
  }
  if (command === 'ls') {
    if (rest.length !== 0) throw new Error('Usage: snip ls');
    await listLinks();
    return;
  }
  if (command === 'open') {
    if (rest.length !== 1 || !rest[0]) throw new Error('Usage: snip open <code>');
    await openLink(rest[0]);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, usage, validateHttpUrl, browserCommand };
