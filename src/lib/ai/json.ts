// Pulls the first JSON object out of a model reply that may wrap it in prose or
// a ```json fence.
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in model reply");
  return JSON.parse(candidate.slice(start, end + 1));
}
