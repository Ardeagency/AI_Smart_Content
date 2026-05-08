import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Carga .env.test si existe (sin dependencia de dotenv).
const envPath = resolve(process.cwd(), '.env.test');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
