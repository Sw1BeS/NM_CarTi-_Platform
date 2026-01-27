import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type BuildInfo = {
  buildSha: string;
  buildTime: string;
};

let cached: BuildInfo | null = null;

const readFileSafe = (filePath: string): string | null => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value = fs.readFileSync(filePath, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
};

export const getBuildInfo = (): BuildInfo => {
  if (cached) return cached;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // dist/config/buildInfo.js -> /app/server/BUILD_SHA
  const buildShaPath = path.join(__dirname, '../../BUILD_SHA');
  const buildTimePath = path.join(__dirname, '../../BUILD_TIME');

  const buildSha =
    process.env.BUILD_SHA ||
    readFileSafe(buildShaPath) ||
    'unknown';

  const buildTime =
    process.env.BUILD_TIME ||
    readFileSafe(buildTimePath) ||
    'unknown';

  cached = { buildSha, buildTime };
  return cached;
};

