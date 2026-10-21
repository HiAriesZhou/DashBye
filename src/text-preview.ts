// Readable previews of listing text changes for the terminal. Plans and JSON output
// stay value-free; this is only printed for the person approving the plan.
export type TextChange = {
  store: string;
  field: string;
  local: string | null;
  // undefined when the store is read as hashes only (Chrome Web Store).
  remote: string | null | undefined;
};

const WIDTH = 100;
const MAX_LINES = 6;

const clip = (text: string, width = WIDTH) => text.length > width ? `${text.slice(0, width - 1)}…` : text;
const lines = (text: string | null) => (text ?? '').replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);

function changedLines(sign: '-' | '+', values: string[], word: string): string[] {
  const shown = values.slice(0, MAX_LINES).map(line => `    ${sign} ${clip(line)}`);
  return values.length > MAX_LINES ? [...shown, `    … and ${values.length - MAX_LINES} more ${word}`] : shown;
}

export function formatTextChanges(changes: TextChange[]): string {
  return changes.map(({ store, field, local, remote }) => {
    if (remote === undefined) {
      const text = local ?? '';
      return `  ${store} · ${field}: new text, ${text.length} characters\n    starts: "${clip(lines(text).join(' '), WIDTH - 12)}"`;
    }
    const before = lines(remote);
    const after = lines(local);
    const removed = before.filter(line => !after.includes(line));
    const added = after.filter(line => !before.includes(line));
    return [`  ${store} · ${field}:`, ...changedLines('-', removed, 'removed'), ...changedLines('+', added, 'added')].join('\n');
  }).join('\n');
}
