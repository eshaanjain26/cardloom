"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useState } from "react";
import type { Card } from "@/lib/deck/schema";
import type { Layout } from "@/lib/deck/ops";
import type { FigureAttrs } from "@/lib/editor/nodes";
import type { ChartData } from "@/lib/media/chart";
import { useDeckContext } from "./DeckContext";
import { ChartDialog } from "./media/ChartDialog";
import { EmbedDialog } from "./media/EmbedDialog";
import { ImageDialog } from "./media/ImageDialog";
import { editorExtensions } from "./media/NodeViews";

export const EDITOR_LAYOUTS: { id: Layout; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "title", label: "Title" },
  { id: "bullets", label: "Bullets" },
  { id: "two-column", label: "Two columns" },
  { id: "quote", label: "Quote" },
  { id: "image-left", label: "Image left" },
  { id: "image-right", label: "Image right" },
  { id: "timeline", label: "Timeline" },
  { id: "steps", label: "Steps" },
  { id: "comparison", label: "Comparison" },
  { id: "stats", label: "Stats" },
];

const LAYOUT_HINTS: Partial<Record<Layout, string>> = {
  "image-left": "Add an image; it sits beside the text.",
  "image-right": "Add an image; it sits beside the text.",
  timeline: "Use a list. Start each item with a bold date, e.g. **2026** Launch.",
  steps: "Use a list. Each item becomes a numbered step.",
  comparison: "Add two H3 subheadings, each followed by a list.",
  stats: "Use a list. Start each item with a bold number, e.g. **41** visits a night.",
};

type Props = {
  card: Card;
  depth: number;
  onChange: (patch: Partial<Pick<Card, "content" | "layout" | "notes">>) => void;
  onAddAfter: () => void;
  onAddChild: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onFocus?: () => void;
};

// Inserts after the current selection, so a selected image or chart is never
// replaced by the new block.
function insertBlock(editor: Editor | null, node: { type: string; attrs: Record<string, unknown> }) {
  if (!editor) return;
  editor.chain().focus().insertContentAt(editor.state.selection.to, node).run();
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
    }),
  });
  const buttons: { label: string; title: string; active: boolean; run: () => void }[] = [
    { label: "B", title: "Bold", active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "I", title: "Italic", active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "H1", title: "Heading 1", active: state.h1, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "H2", title: "Heading 2", active: state.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "•", title: "Bulleted list", active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "1.", title: "Numbered list", active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "“", title: "Quote", active: state.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: "</>", title: "Code block", active: state.code, run: () => editor.chain().focus().toggleCodeBlock().run() },
  ];
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
      {buttons.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          aria-label={b.title}
          aria-pressed={b.active}
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
          className={`h-7 min-w-7 rounded px-1.5 text-xs font-medium ${
            b.active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

export function CardEditor({ card, depth, onChange, onAddAfter, onAddChild, onMove, onRemove, onFocus }: Props) {
  const [showNotes, setShowNotes] = useState(card.notes.length > 0);
  const [dialog, setDialog] = useState<"image" | "chart" | "embed" | null>(null);
  const { deckId, themeStyle } = useDeckContext();
  const editor = useEditor({
    extensions: editorExtensions,
    content: card.content,
    immediatelyRender: false,
    editorProps: { attributes: { class: "cl-prose outline-none", "aria-label": "Card content" } },
    onUpdate: ({ editor: e }) => onChange({ content: e.getJSON() as Card["content"] }),
  });

  const control = "rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100";

  return (
    <section
      id={`card-${card.id}`}
      aria-label="Card"
      className="group scroll-mt-20"
      style={{ marginLeft: depth * 32 }}
      onFocus={onFocus}
    >
      {/* Editor chrome stays light on every theme so its controls keep contrast. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-white/95 px-2 py-1 shadow-sm">
        {editor && <Toolbar editor={editor} />}
        <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />
        <label className="flex items-center gap-1 text-xs text-neutral-600">
          Layout
          <select
            value={card.layout}
            onChange={(e) => onChange({ layout: e.target.value as Layout })}
            className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs"
          >
            {EDITOR_LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />
        <div className="flex gap-1" role="group" aria-label="Insert">
          <button type="button" className={control} onClick={() => setDialog("image")}>
            + Image
          </button>
          <button type="button" className={control} onClick={() => setDialog("chart")}>
            + Chart
          </button>
          <button type="button" className={control} onClick={() => setDialog("embed")}>
            + Embed
          </button>
        </div>
        <div className="ml-auto flex gap-1">
          <button type="button" className={control} onClick={() => onMove(-1)} aria-label="Move card up">
            ↑
          </button>
          <button type="button" className={control} onClick={() => onMove(1)} aria-label="Move card down">
            ↓
          </button>
          <button type="button" className={control} onClick={() => setShowNotes((s) => !s)}>
            Notes
          </button>
          <button type="button" className={control} onClick={onAddChild}>
            + Nested
          </button>
          <button type="button" className={`${control} hover:text-red-700`} onClick={onRemove}>
            Delete
          </button>
        </div>
      </div>

      <div className={`cl-card cl-layout-${card.layout} cl-card-editing group`}>
        <EditorContent editor={editor} />
      </div>
      {LAYOUT_HINTS[card.layout] && <p className="mt-1 rounded bg-white/90 px-2 py-0.5 text-xs text-neutral-600 w-fit">{LAYOUT_HINTS[card.layout]}</p>}

      <ImageDialog
        open={dialog === "image"}
        deckId={deckId}
        onClose={() => setDialog(null)}
        onPick={(attrs: FigureAttrs) => {
          insertBlock(editor, { type: "figure", attrs });
          setDialog(null);
        }}
      />
      <ChartDialog
        open={dialog === "chart"}
        themeStyle={themeStyle}
        onClose={() => setDialog(null)}
        onSave={(data: ChartData) => {
          insertBlock(editor, { type: "chart", attrs: { data } });
          setDialog(null);
        }}
      />
      <EmbedDialog
        open={dialog === "embed"}
        onClose={() => setDialog(null)}
        onSave={(url) => {
          insertBlock(editor, { type: "embed", attrs: { url } });
          setDialog(null);
        }}
      />

      {showNotes && (
        <label className="mt-2 block rounded-lg bg-white/95 p-2 text-xs text-neutral-600 shadow-sm">
          Speaker notes
          <textarea
            value={card.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-neutral-200 bg-white p-2 text-sm text-neutral-900"
          />
        </label>
      )}

      <div className="flex justify-center py-3">
        <button
          type="button"
          onClick={onAddAfter}
          className="rounded-full border border-dashed border-neutral-300 bg-white/95 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
        >
          + Add card
        </button>
      </div>
    </section>
  );
}
