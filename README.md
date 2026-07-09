# obsidian-mapx

Map view for [Obsidian Bases](https://help.obsidian.md/bases). Display notes as an interactive map with markers driven by your base filters and note properties.

Requires [Obsidian 1.10+](https://obsidian.md/changelog/2025-11-11-desktop-v1.10.3/).

This repo is an independent fork of Obsidian's Maps plugin. It shares the same starting point but is maintained separately and will diverge over time.

## Features

- Display markers that match your base filters
- Customize marker icons and colors from note properties
- Load custom background tile sets
- Configure default zoom, center, and map height

See the [Obsidian Help documentation](https://help.obsidian.md/bases/views/map) for usage details. Example notes and a sample base are in [`examples/`](examples/).

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) (recommended) or Node.js 24+ and pnpm 11+

Tool versions are pinned in [`mise.toml`](mise.toml). With mise installed:

```bash
mise install
pnpm install
```

### Scripts

| Command          | Description                   |
| ---------------- | ----------------------------- |
| `pnpm run dev`   | Build with watch mode         |
| `pnpm run build` | Production build              |
| `pnpm run lint`  | Lint with oxlint              |
| `pnpm run fmt`   | Format with oxfmt             |
| `pnpm run check` | Lint, format check, and build |

### Manual testing

Copy `main.js`, `manifest.json`, and `styles.css` into your vault:

```
<Vault>/.obsidian/plugins/maps/
```

Reload Obsidian and enable the plugin under **Settings → Community plugins**.

## License

MIT — see [LICENSE](LICENSE).
