# Cardloom

Open-source AI builder for presentations, documents, websites, and social carousels. Write a prompt or paste notes, edit the outline, and get a card-based deck you can present, share, publish, or export.

Bring your own key for Claude, GPT, Gemini, or OpenRouter. Or run local models through Ollama and keep everything on your machine.

> Status: **M2**. Generate a deck from a prompt or your own text, edit the outline first, then refine it by chatting with the AI. Write and present in the card editor. Decks are saved in your browser. See the roadmap below.

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

### Usage meter

Every AI call records the tokens the provider reports. The editor header, the create page, and Settings show tokens, cost, and estimated energy and CO₂. Claude prices are built in; add your own prices for other providers in Settings. The energy and CO₂ numbers are estimates from public per-query figures, explained with sources in [docs/impact.md](docs/impact.md).

## Roadmap

**Core**
- [x] M0: repo, CI, license, deck and card schema (nested cards, layouts, speaker notes)
- [x] M1: card editor (Tiptap), nested cards, five layouts, six themes checked for WCAG AA contrast, present mode with speaker notes, browser storage
- [x] M2: generate from a prompt, pasted text, or a .md/.txt file; editable outline step; agent chat for edits with undo; bring-your-own model (Anthropic, OpenAI, Gemini, OpenRouter, Ollama); token, cost, and CO2 meter
- [ ] M3: AI and stock images, smart layouts (timeline, steps, comparison, stats), charts, embeds
- [ ] M4: share links with password and expiry, view analytics, publish as website, PPTX/PDF/PNG/Markdown import and export
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
