# Cardloom

Open-source AI builder for presentations, documents, websites, and social carousels. Write a prompt or paste notes, edit the outline, and get a card-based deck you can present, share, publish, or export.

Bring your own key for Claude, GPT, Gemini, or OpenRouter. Or run local models through Ollama and keep everything on your machine.

> Status: **M0**. The repo, CI, and deck schema are in place. The editor (M1) and AI generation (M2) come next. See the roadmap below.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Production build |

## Roadmap

**Core**
- [x] M0: repo, CI, license, deck and card schema (nested cards, layouts, speaker notes)
- [ ] M1: card editor (Tiptap), themes, present mode
- [ ] M2: generate from prompt, pasted text, or file; outline step; agent chat for edits; bring-your-own model; token, cost, and CO2 meter per generation
- [ ] M3: AI and stock images, smart layouts (timeline, steps, comparison, stats), charts, embeds
- [ ] M4: share links with password and expiry, view analytics, publish as website, PPTX/PDF/PNG/Markdown import and export
- [ ] M5: realtime co-editing, comments, workspaces, version history with branches
- [ ] M6: decks as Markdown with Git sync, live polls and Q&A while presenting, rehearsal coach, fact-check with cited sources, accessibility checker, one-click translation, REST API, MCP server, plugin blocks
- [ ] M7: Docker image, hosted demo, docs site, v1.0.0

## Stack

Next.js (App Router), TypeScript, Tailwind, Zod. Planned: Tiptap/ProseMirror, Postgres with Drizzle (SQLite for single-user), Yjs, Vercel AI SDK.

## Independence

Cardloom is an independent project. It is not affiliated with or endorsed by Gamma Tech, Inc. No code, assets, or themes from other products are used.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
