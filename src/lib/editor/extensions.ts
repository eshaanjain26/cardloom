import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";

// Shared by the live editor and by generateHTML so stored content renders the
// same way in both places.
export const cardExtensions = [
  StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
  Placeholder.configure({
    placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type something…"),
  }),
];
