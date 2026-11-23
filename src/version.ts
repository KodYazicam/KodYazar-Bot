import { readFileSync } from 'node:fs';

/** Fallback when the shipped manifest is missing or unreadable. */
export const UNKNOWN_VERSION = 'unknown';
/** Compiled to `dist/src/version.js`, so this resolves to the repository root. */
const PACKAGE_JSON = new URL('../../package.json', import.meta.url);

type Reader = (url: URL) => string;
const readFile: Reader = (url) => readFileSync(url, 'utf8');

/**
 * Reads `version` from the manifest the build ships next to `dist/`.
 *
 * Docker and the documented systemd unit start `node dist/src/index.js`
 * directly, so `npm_package_version` only exists under `npm start`; a
 * hard-coded fallback would go stale after the first version bump.
 */
export function readPackageVersion(read: Reader = readFile): string {
  try {
    const parsed = JSON.parse(read(PACKAGE_JSON)) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim() !== '') {
      return parsed.version.trim();
    }
  } catch {
    // A missing or damaged manifest must not stop the bot from booting.
  }
  return UNKNOWN_VERSION;
}
