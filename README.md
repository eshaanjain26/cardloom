# Cardloom

Open-source AI builder for presentations, documents, websites, and social carousels. Write a prompt or paste notes, edit the outline, and get a card-based deck you can present, share, publish, or export.

Bring your own key for Claude, GPT, Gemini, or OpenRouter. Or run local models through Ollama and keep everything on your machine.

> Status: **M4**. Generate a deck from a prompt or your own text, edit the outline, then refine it by chatting with the AI. Cards can hold photos, AI images, charts, and embeds, with smart layouts. Share a link (with a password and expiry), publish a deck as a website, and see who viewed which cards. Import Markdown, PowerPoint, and PDF; export PowerPoint, PDF, PNG, and Markdown. Decks are saved in your browser. See the roadmap below.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and choose **Open the editor**.

In present mode: arrow keys, Space, or Page Up/Down to move; Home and End to jump; N for speaker notes; Esc to leave.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Production build |

## AI setup

Open **Settings** and pick a provider:

| Provider | What you need |
| --- | --- |
| Anthropic (default, `claude-opus-5-5`) | An API key |
| OpenAI, Google Gemini, OpenRouter | An API key and a model name |
| Ollama | Ollama running where the server can reach it (`OLLAMA_BASE_URL`, default `http://127.0.0.1:11434`). No key, nothing leaves the machine. |

Keys typed in Settings stay in your browser and go only to your Cardloom server, which forwards them to the provider. To use keys from the server environment instead, see [.env.example](.env.example).

Claude calls use structured outputs, and on models that support it, server-side refusal fallbacks (`fallbacks: "default"`), so a declined request is retried on Anthropic's recommended fallback model. Other providers get the JSON schema in the prompt and one repair retry.

### Images, charts, and embeds

- **Free photos** come from [Openverse](https://openverse.org), which needs no key. Each photo gets a credit line with its Creative Commons license; check the license before commercial use (some are NC or ND). Openverse's anonymous API is sometimes slow; a lookup that fails leaves a placeholder with **Choose image**.
- **AI images** use OpenAI's image API (`gpt-image-1` by default, set in Settings) with your OpenAI key.
- **Uploads** and AI images are stored in your browser (IndexedDB), resized to WebP at most 1600 px.
- **Charts**: bar, line, and pie from CSV, drawn as SVG in the theme's colors. Chart colors come from a palette checked for color-blind separation and contrast on every theme. When AI writes a deck from your text, it adds charts only from numbers in that text, and never in prompt mode.
- **Embeds**: YouTube (privacy-enhanced), Vimeo, Loom, Figma, Google Slides, CodePen, and Spotify play inline in a sandboxed frame. Other links show as links.

## Sharing and publishing

Open a deck and choose **Share**.

- **Share link** (`/s/<id>`): optional password and expiry. Viewers can read or present the deck. Links are not indexed by search engines.
- **Website** (`/p/<your-address>`): a public, search-indexable page with the deck title and opening lines as its description.
- Both are snapshots: choose **Update with latest changes** to republish. Speaker notes are never published.
- **Views**: views, unique visitors, and average time per card. Visitors are counted by a random browser id hashed on the server; no names or IP addresses are stored, and Do Not Track and Global Privacy Control are respected.
- Shares are stored on the server in `CARDLOOM_DATA_DIR` (default `./data`). Until accounts arrive, the browser that published a deck holds its owner token; clearing site data means you can no longer update or unpublish from that browser.

## Import and export

| Format | Import | Export |
| --- | --- | --- |
| Markdown | Yes, round-trips layouts, nesting, notes, and charts | Yes |
| PowerPoint (.pptx) | Titles, text, bullets, links, images, speaker notes, tables as text | Editable slides, native charts, speaker notes |
| PDF | Text per page (headings, paragraphs, bullets); pages without text come in as images | Print view with one page per card; choose **Save as PDF** |
| PNG | | 1920×1080 per card, zipped |

Not yet: charts and SmartArt inside imported PowerPoint files, and images inside PDFs that also have text.

### Usage meter

Every AI call records the tokens the provider reports. The editor header, the create page, and Settings show tokens, cost, and estimated energy and CO₂. Claude prices are built in; add your own prices for other providers in Settings. The energy and CO₂ numbers are estimates from public per-query figures, explained with sources in [docs/impact.md](docs/impact.md).

## Roadmap

**Core**
- [x] M0: repo, CI, license, deck and card schema (nested cards, layouts, speaker notes)
- [x] M1: card editor (Tiptap), nested cards, five layouts, six themes checked for WCAG AA contrast, present mode with speaker notes, browser storage
- [x] M2: generate from a prompt, pasted text, or a .md/.txt file; editable outline step; agent chat for edits with undo; bring-your-own model (Anthropic, OpenAI, Gemini, OpenRouter, Ollama); token, cost, and CO2 meter
- [x] M3: free photos (Openverse), AI images (OpenAI), uploads, smart layouts (image left/right, timeline, steps, comparison, stats), charts, embeds
- [x] M4: share links with password and expiry, view analytics, publish as website, PPTX/PDF/Markdown import, PPTX/PDF/PNG/Markdown export
- [ ] M5: realtime co-editing, comments, workspaces, version history with branches
- [ ] M6: decks as Markdown with Git sync, live polls and Q&A while presenting, rehearsal coach, fact-check with cited sources, accessibility checker, one-click translation, REST API, MCP server, plugin blocks
- [ ] M7: Docker image, hosted demo, docs site, v1.0.0

## Stack

Next.js (App Router), TypeScript, Tailwind, Zod, Tiptap/ProseMirror, Anthropic TypeScript SDK. Planned: Postgres with Drizzle (SQLite for single-user), Yjs.

## Independence

Cardloom is an independent project. It is not affiliated with or endorsed by Gamma Tech, Inc. No code, assets, or themes from other products are used.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
