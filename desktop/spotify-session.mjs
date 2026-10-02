import {mkdir, readFile, writeFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';

// Windows protects the refresh token for the current OS user. Never put it in the renderer or .env.
export function createSpotifySessionStore(directory, storage) {
  const file = path.join(directory, 'spotify-session.bin');
  return {
    async load() {
      if (!storage.isEncryptionAvailable()) return null;
      try {
        const value = JSON.parse(storage.decryptString(await readFile(file)));
        return typeof value.clientId === 'string' && typeof value.refreshToken === 'string' ? value : null;
      } catch { return null; }
    },
    async save(value) {
      if (!storage.isEncryptionAvailable()) return false;
      if (!value.refreshToken) { await this.clear(); return false; }
      await mkdir(directory, {recursive: true});
      const bytes = storage.encryptString(JSON.stringify(value));
      await writeFile(file + '.tmp', bytes, {mode: 0o600});
      await rename(file + '.tmp', file);
      return true;
    },
    async clear() { await rm(file, {force: true}); }
  };
}
