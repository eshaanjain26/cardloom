export type PresentAction = { type: "go"; index: number } | { type: "exit" } | { type: "toggle-notes" } | null;

export function presentKey(key: string, index: number, count: number): PresentAction {
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case " ":
    case "Enter":
      return { type: "go", index: clamp(index + 1) };
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
    case "Backspace":
      return { type: "go", index: clamp(index - 1) };
    case "Home":
      return { type: "go", index: 0 };
    case "End":
      return { type: "go", index: count - 1 };
    case "Escape":
      return { type: "exit" };
    case "n":
    case "N":
      return { type: "toggle-notes" };
    default:
      return null;
  }
}
