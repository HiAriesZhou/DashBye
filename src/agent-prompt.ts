export type AgentPromptOptions = {
  project?: string;
  artifact?: string;
  resources?: string;
  itemId?: string;
  language?: string;
  endpoint?: string;
};

const value = (input: string | undefined, fallback: string) => input?.trim() || fallback;

export function renderAgentPrompt(options: AgentPromptOptions = {}): string {
  const project = value(options.project, '<extension repository path>');
  const artifact = value(options.artifact, '<discover or build the extension ZIP>');
  const resources = value(options.resources, 'store');
  const itemId = value(options.itemId, '<ask the owner for the Chrome Web Store item ID>');
  const language = value(options.language, '<read the Dashboard default language>');
  const endpoint = value(options.endpoint, 'http://127.0.0.1:9333');

  return `Prepare this extension repository to use DashBye. Work inside the extension repository; do not put product files in the DashBye repository.

Known inputs
- Project: ${project}
- Artifact: ${artifact}
- Release resource root: ${resources}
- Chrome Web Store item ID: ${itemId}
- Dashboard language: ${language}
- Dedicated Chrome CDP endpoint: ${endpoint}

Execution requirements
1. Read the repository's AGENTS.md and applicable maintenance documentation. Inspect git status first and preserve unrelated or uncommitted work.
2. Run "dashbye -h" and follow the current dashbye/config/v1 and dashbye/release/v1 contracts. Treat DashBye as the schema and synchronization tool; the extension repository owns all release resources.
3. Audit the actual build scripts, generated artifact, manifest, existing store copy, screenshots, promotional images, privacy text, and every reference to files you may move. Do not infer shipped behavior from plans or mockups.
4. If dashbye.config.yml is missing, run "dashbye init --agent --json" with the known inputs above. When it returns "needs_input", ask one concise chat question. Call it again with accumulated flags until it returns "ready", show the preview, then run its writeCommand. This is a text-based CLI protocol; do not depend on graphical controls. Do not add browser profiles, cookies, credentials, or tokens.
5. Organize the repository-owned release root with release.yml, listing/<locale>/description.txt, assets/icon, assets/screenshots, assets/promo, and releases/<version>.lock.json. Existing source artwork, generators, fixtures, and unrelated marketing assets may remain elsewhere; only files referenced by release.yml belong to the desired store state.
6. Express the complete desired state in release.yml, including every supported listing field, description, screenshot order, icon, promotional image, URL, mature-content setting, single purpose, permission and host justifications, remote-code declaration, collected-data categories, certifications, and privacy-policy URL. Use null or an empty list only when removal is intended.
7. Derive permissions, optional permissions, host scopes, content-script matches, name, summary, and version from the actual artifact manifest. Flag missing or stale privacy declarations. Never invent data collection, legal certifications, permission purposes, or product claims; ask the owner when repository evidence is insufficient.
8. Reorganize files only after auditing references. Prefer clear, stable names. Update affected references, preserve reproducible source material, and do not delete ambiguous files merely to make the tree look tidy.
9. Run dashbye validate, then connect only to an already running, manually authenticated dedicated Chrome and run dashbye inspect and dashbye plan. DashBye may navigate that dedicated session to the exact configured item. If authentication is required, stop for the owner to sign in manually; do not launch Chrome automatically or control the user's daily Chrome.
10. Report the exact target and every planned add, update, replacement, removal, or reorder. Stop for explicit owner confirmation before sync-draft performs any Dashboard write. Never submit for review or publish.
11. After an approved sync, require read-back with zero remaining operations and record the release lock. Report which checks succeeded, failed, or remain unverified, plus all files changed. Do not commit, push, tag, create a release, or submit the store item unless the owner separately requested it.

Deliver a repository-owned, reviewable release workspace and the validation/plan results. Do the work rather than returning only instructions.`;
}
