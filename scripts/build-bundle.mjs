import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const bundle = path.join(root, 'bundle');
const push = process.argv.includes('--push');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
  }
}

function commitIfChanged(cwd, message) {
  run('git', ['add', '-A'], cwd);
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (staged.error) {
    throw staged.error;
  }
  if (staged.status === 1) {
    run('git', [
      'commit',
      '-m',
      message,
      '-m',
      'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
    ], cwd);
    return true;
  }
  if (staged.status !== 0) {
    throw new Error(`git diff --cached --quiet failed with status ${staged.status}`);
  }
  return false;
}

try {
  run('git', ['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
  run('npm', ['install'], frontend);
  run('npx', ['ng', 'build'], frontend);

  const publicSource = path.join(frontend, 'dist', 'snip-frontend', 'browser');
  const indexHtml = path.join(publicSource, 'index.html');
  if (!existsSync(indexHtml)) {
    throw new Error(`Angular build output is missing: ${indexHtml}`);
  }

  const publicDir = path.join(bundle, 'public');
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(bundle, { recursive: true });
  cpSync(path.join(root, 'backend', 'server.js'), path.join(bundle, 'server.js'));
  cpSync(path.join(root, 'cli', 'cli.js'), path.join(bundle, 'cli.js'));
  cpSync(publicSource, publicDir, { recursive: true });
  writeFileSync(path.join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
  writeFileSync(
    path.join(bundle, 'package.json'),
    `${JSON.stringify({ name: 'snip-bundle', private: true, scripts: { start: 'bun server.js' } }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(bundle, 'Dockerfile'),
    'FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n',
  );
  writeFileSync(
    path.join(bundle, '.dockerignore'),
    '.git\nnode_modules\nnpm-debug.log\n.DS_Store\n',
  );
  writeFileSync(
    path.join(bundle, 'railway.json'),
    `${JSON.stringify({
      '$schema': 'https://railway.app/railway.schema.json',
      build: { builder: 'DOCKERFILE' },
    }, null, 2)}\n`,
  );

  const bundleChanged = commitIfChanged(bundle, 'Build generated Snip release bundle');
  if (push && bundleChanged) {
    run('git', ['push', 'origin', 'HEAD:bundle'], bundle);
  }

  const mainChanged = commitIfChanged(root, 'Bump bundle submodule');
  if (push && mainChanged) {
    run('git', ['push', 'origin', 'main'], root);
  }

  if (!bundleChanged && !mainChanged) {
    console.log('unchanged');
  } else {
    console.log('Bundle build complete.');
  }
} catch (error) {
  console.error(`Bundle build failed: ${error.message}`);
  process.exitCode = 1;
}
