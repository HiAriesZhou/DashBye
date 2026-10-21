import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Optional placement of DashBye's own Chrome window on a named display, such as a
// second monitor or a virtual display, so its work stays off the screen in use.
// Only DashBye's window moves; other Chrome windows are untouched.
export type ScreenFrame = { name: string; x: number; y: number; width: number; height: number };
export type Display = { name: string; left: number; top: number; width: number; height: number };

const MARGIN = 40;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1000;

// NSScreen frames start at the bottom-left of the main display; Chrome windows use
// top-left coordinates with y growing downwards.
export function toTopLeft(screens: ScreenFrame[]): Display[] {
  const mainHeight = screens[0]?.height ?? 0;
  return screens.map(({ name, x, y, width, height }) => ({ name, left: x, top: mainHeight - (y + height), width, height }));
}

export function pickDisplay(displays: Display[], wanted: string): Display | null {
  const target = wanted.trim().toLowerCase();
  const exact = displays.filter(display => display.name.toLowerCase() === target);
  if (exact.length === 1) return exact[0]!;
  const partial = displays.filter(display => display.name.toLowerCase().includes(target));
  return partial.length === 1 ? partial[0]! : null;
}

export function windowBoundsOn(display: Display) {
  return {
    left: display.left + MARGIN,
    top: display.top + MARGIN,
    width: Math.min(MAX_WIDTH, display.width - 2 * MARGIN),
    height: Math.min(MAX_HEIGHT, display.height - 2 * MARGIN),
  };
}

const SCREENS_SCRIPT = 'ObjC.import("AppKit"); const s = $.NSScreen.screens; const out = []; for (let i = 0; i < s.count; i++) { const screen = s.objectAtIndex(i); const f = screen.frame; out.push({ name: ObjC.unwrap(screen.localizedName), x: f.origin.x, y: f.origin.y, width: f.size.width, height: f.size.height }); } JSON.stringify(out);';

// macOS only; other platforms report no displays and the window stays where it is.
export async function listDisplays(platform: NodeJS.Platform = process.platform): Promise<Display[]> {
  if (platform !== 'darwin') return [];
  const { stdout } = await promisify(execFile)('osascript', ['-l', 'JavaScript', '-e', SCREENS_SCRIPT], { timeout: 5_000 });
  return toTopLeft(JSON.parse(stdout) as ScreenFrame[]);
}

type CdpSession = { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> };
type WindowInfo = { windowId: number; bounds: { left: number; top: number; width: number; height: number } };

const centreInside = (bounds: WindowInfo['bounds'], display: Display) => {
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  return x >= display.left && x < display.left + display.width && y >= display.top && y < display.top + display.height;
};

// Moves the window of DashBye's work tab to `name`, unless it is already there. A
// missing display is reported and the window stays where it is.
export async function placeOnDisplay(session: CdpSession, name: string, options: { displays?: Display[]; notify: (message: string) => void }): Promise<'moved' | 'already' | 'not_found'> {
  const display = pickDisplay(options.displays ?? await listDisplays(), name);
  if (!display) {
    options.notify(`display "${name}" was not found (or the name matches several displays); the DashBye window stays where it is`);
    return 'not_found';
  }
  const { windowId, bounds } = await session.send('Browser.getWindowForTarget') as WindowInfo;
  if (centreInside(bounds, display)) return 'already';
  await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await session.send('Browser.setWindowBounds', { windowId, bounds: windowBoundsOn(display) });
  return 'moved';
}
