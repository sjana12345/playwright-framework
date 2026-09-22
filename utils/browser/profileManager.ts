import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

export interface BrowserProfile {
  id: string; // e.g. 'Default', 'Profile 1'
  name: string; // e.g. 'Sup', 'Supratik'
  userName: string; // e.g. 'supratikjana2026@gmail.com'
  gaiaName: string;
}

export interface ProfileInspection {
  channel: string;
  userDataDir: string;
  exists: boolean;
  isLocked: boolean;
  profiles: BrowserProfile[];
}

/**
 * Returns the default system User Data path for Chrome or Edge on Windows
 */
export function getSystemUserDataDir(channel: string = 'chrome'): string {
  const localAppData = process.env.LOCALAPPDATA || '';
  if (channel === 'msedge') {
    return path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
  }
  return path.join(localAppData, 'Google', 'Chrome', 'User Data');
}

/**
 * Checks if the browser's User Data directory is currently locked by a running browser instance.
 * On Windows, Chrome/Edge holds an exclusive lock on 'lockfile' while running.
 */
export function isProfileDirectoryLocked(userDataDir: string): boolean {
  const lockFilePath = path.join(userDataDir, 'lockfile');
  if (!fs.existsSync(lockFilePath)) {
    return false;
  }
  try {
    const fd = fs.openSync(lockFilePath, 'r+');
    fs.closeSync(fd);
    return false; // Successfully opened -> not locked
  } catch (err: any) {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      return true; // File is in use by another process
    }
    return false;
  }
}

/**
 * Discovers all profiles configured inside a given User Data directory
 */
export function inspectBrowserProfiles(channel: string = 'chrome'): ProfileInspection {
  const userDataDir = getSystemUserDataDir(channel);

  if (!fs.existsSync(userDataDir)) {
    return {
      channel,
      userDataDir,
      exists: false,
      isLocked: false,
      profiles: [],
    };
  }

  const isLocked = isProfileDirectoryLocked(userDataDir);
  const profiles: BrowserProfile[] = [];
  const localStatePath = path.join(userDataDir, 'Local State');
  let infoCache: Record<string, any> = {};

  if (fs.existsSync(localStatePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
      infoCache = parsed?.profile?.info_cache || {};
    } catch {
      // Ignored if unreadable
    }
  }

  try {
    const entries = fs.readdirSync(userDataDir);
    for (const entry of entries) {
      if (entry === 'Default' || entry.startsWith('Profile ')) {
        const cache = infoCache[entry] || {};
        profiles.push({
          id: entry,
          name: cache.name || entry,
          userName: cache.user_name || '',
          gaiaName: cache.gaia_name || '',
        });
      }
    }
  } catch {
    // Return empty if directory read fails
  }

  return {
    channel,
    userDataDir,
    exists: true,
    isLocked,
    profiles,
  };
}

/**
 * Checks if Chrome/Edge remote debugging is accessible on the given port (default: 9222)
 */
export async function isCdpPortAvailable(port: number = 9222): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/json/version`, { timeout: 800 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

