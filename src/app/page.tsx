import Link from "next/link";

const formats = [
  { name: "Presentations", body: "Card-based decks with present mode and speaker notes." },
  { name: "Documents", body: "One-pagers to long reports, structured and on-brand." },
  { name: "Websites", body: "Publish any deck or doc as a live page." },
  { name: "Social", body: "Carousels sized for each platform." },
];

const milestones = [
  { id: "M0", label: "Repo, CI, deck schema", done: true },
  { id: "M1", label: "Card editor, themes, present mode", done: true },
  { id: "M2", label: "AI generation, agent chat, bring-your-own model, token and CO2 meter", done: false },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-4 py-16 font-sans sm:px-8">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-sm text-neutral-500">cardloom</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Turn an idea into a deck, doc, or site.
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-400">
          Open source. Use your own API key for Claude, GPT, Gemini, or OpenRouter, or run local models through
          Ollama with nothing leaving your machine.
        </p>
        <Link
          href="/decks"
          className="w-fit rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Open the editor
        </Link>
      </header>

      <section aria-labelledby="formats" className="grid gap-4 sm:grid-cols-2">
        <h2 id="formats" className="sr-only">
          Formats
        </h2>
        {formats.map((f) => (
          <div key={f.name} className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
            <h3 className="font-medium">{f.name}</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{f.body}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="status" className="flex flex-col gap-3">
        <h2 id="status" className="text-xl font-semibold">
          Build status
        </h2>
        <ul className="flex flex-col gap-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-baseline gap-3 text-sm">
              <span className="font-mono text-neutral-500">{m.id}</span>
              <span className={m.done ? "" : "text-neutral-500"}>
                {m.label}
                {m.done ? "" : " (planned)"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
