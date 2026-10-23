import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Chart, Embed, Figure } from "./nodes";

// Shared by the live editor and by generateHTML so stored content renders the
// same way in both places. The editor adds node views on top of these.
export const cardExtensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  Placeholder.configure({
    placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type something…"),
  }),
  Figure,
  Chart,
  Embed,
];
