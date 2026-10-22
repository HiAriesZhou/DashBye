// CI-only check on a runner with Google Chrome in its standard location: DashBye
// finds official Chrome, opens it with the dedicated profile, and the loopback
// debugging endpoint answers. Run after `npm run build`. It never signs in or opens
// anything beyond the Dashboard URL Chrome starts with.
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromeExecutableCandidates, ensureChrome } from '../dist/src/chrome.js';

// The dedicated profile on a workstation holds the owner's Google session; never
// open it from a check. CI runners start with an empty state directory.
if (process.env.CI !== 'true') throw new Error('check-chrome-location runs only in CI (CI=true)');

const endpoint = 'http://127.0.0.1:9339';
const context = { platform: process.platform, home: homedir(), env: process.env };

let found = null;
for (const candidate of chromeExecutableCandidates(context)) {
  if (await access(candidate, constants.X_OK).then(() => true, () => false)) {
    found = candidate;
    break;
  }
}
if (!found) throw new Error(`no Chrome candidate exists on ${process.platform}`);
console.log(`Chrome found on ${process.platform}: ${found}`);

const result = await ensureChrome(endpoint, { launch: true });
if (!result.launched) throw new Error('expected DashBye to launch Chrome, but an endpoint was already answering');
console.log(`Chrome launched with the dedicated profile; ${endpoint} answers.`);
