import { existsSync } from 'node:fs';

/** Loads .env.local / .env for CLI scripts (Next.js does this automatically for the app). */
export function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (existsSync(f)) {
      try {
        process.loadEnvFile(f);
      } catch {
        /* ignore */
      }
    }
  }
}
