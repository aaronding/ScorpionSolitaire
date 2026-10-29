import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// The version shown in About: the latest git tag, like the desktop build.
function version(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf8' }).trim().replace(/^v/, '');
  } catch {
    return 'dev';
  }
}

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Builds the service worker, src/sw.ts, into sw.js next to index.html (it
 * only looks after pages in its own folder and below), and tells it every
 * file the game is built into, so it can keep them all for offline play.
 */
function offline(): Plugin {
  let publicDir = '';
  return {
    name: 'scorpion:offline',
    apply: 'build',
    // After the other plugins have added their files: index.html, the CSS.
    enforce: 'post',
    config: () => ({
      build: {
        rolldownOptions: {
          input: { index: here('index.html'), sw: here('src/sw.ts') },
          output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
        },
      },
    }),
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const files = new Map<string, string | Uint8Array>();
      for (const [name, file] of Object.entries(bundle))
        if (name !== 'sw.js') files.set(name, file.type === 'chunk' ? file.code : file.source);
      for (const entry of readdirSync(publicDir, { recursive: true, withFileTypes: true })) {
        const path = join(entry.parentPath, entry.name);
        if (entry.isFile()) files.set(relative(publicDir, path).split(sep).join('/'), readFileSync(path));
      }
      const names = [...files.keys()].sort();
      const hash = createHash('sha256');
      for (const name of names) hash.update(name).update('\0').update(files.get(name)!);
      const sw = bundle['sw.js'];
      if (sw?.type !== 'chunk') throw new Error('sw.js was not built');
      sw.code = sw.code
        .replaceAll('__OFFLINE_FILES__', JSON.stringify(names))
        .replaceAll('__OFFLINE_VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)));
    },
  };
}

export default defineConfig({
  // Served from a sub-path on GitHub Pages; relative URLs work anywhere.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version()),
  },
  plugins: [offline()],
  server: {
    // The card art lives in the Java source tree, one level up.
    fs: { allow: ['..'] },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
