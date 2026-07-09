## Map view for Obsidian Bases

Adds a map layout to [Obsidian Bases](https://help.obsidian.md/bases) so you can display notes as an interactive map view.

- Dynamically display markers that match your filters.
- Use marker icons and colors defined by properties.
- Load custom background tiles.
- Define default zoom options.

## Project overview

Obsidian community plugin: TypeScript in `src/`, bundled to `main.js` at the repo root. Release artifacts are `main.js`, `manifest.json`, and optional `styles.css`.

## Tooling

Use `package.json` for scripts and dependency versions. Config files at the repo root define build, lint, and format behavior — do not duplicate them here.

- Package manager: pnpm (see `packageManager` field)
- Bundler: rolldown (`rolldown.config.mjs`)
- Lint / format: oxlint, oxfmt
- Typecheck: TypeScript (`tsconfig.json`)

## Structure

- `src/main.ts` — plugin lifecycle only; delegate feature logic to other modules.
- `src/` — settings, map view, UI, utilities, types.
- Do not commit `node_modules/`, `main.js`, or other build output.

## Conventions

- TypeScript with strict mode; prefer `async/await`.
- Keep modules focused; split files that grow past ~300 lines.
- Bundle all runtime deps into `main.js`; externalize Obsidian/Electron APIs per bundler config.
- Use `this.register*` helpers for listeners and intervals so unload is clean.
- Stable command IDs once released; persist settings via `loadData` / `saveData`.
- Avoid Node/Electron-only APIs unless `isDesktopOnly` is true in `manifest.json`.

## Releases

- SemVer in `manifest.json`; map versions in `versions.json`.
- Never change plugin `id` after release.
- GitHub release tag must match `manifest.json` version exactly (no leading `v`).
- Attach `main.js`, `manifest.json`, and `styles.css` (if any) to releases.

## Security & privacy

Follow [Obsidian developer policies](https://docs.obsidian.md/Developer+policies) and [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). Default to local/offline operation. Disclose and require opt-in for any network use or third-party services. No telemetry, remote code execution, or vault access beyond what the feature needs.

## UX copy

Sentence case; short, action-oriented strings. Use **bold** for literal UI labels and arrow notation for navigation paths (e.g. **Settings → Community plugins**).

## Testing

Copy release artifacts into `<Vault>/.obsidian/plugins/<plugin-id>/`, reload Obsidian, enable under **Settings → Community plugins**.

## References

- [Obsidian API docs](https://docs.obsidian.md)
- [Sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Plugin validation rules](https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml)
- [Obsidian style guide](https://help.obsidian.md/style-guide)
