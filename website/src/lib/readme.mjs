// The agent prompt is maintained in the READMEs; the site copies it at build time
// so the two can never disagree.
export function extractAgentPrompt(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start === -1) throw new Error(`README heading not found: ${heading}`);
  const open = lines.findIndex((line, index) => index > start && line.trim() === '```text');
  const nextHeading = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  if (open === -1 || (nextHeading !== -1 && open > nextHeading)) throw new Error(`No text block under README heading: ${heading}`);
  const close = lines.findIndex((line, index) => index > open && line.trim() === '```');
  if (close === -1) throw new Error(`Unclosed text block under README heading: ${heading}`);
  return lines.slice(open + 1, close).join('\n');
}
