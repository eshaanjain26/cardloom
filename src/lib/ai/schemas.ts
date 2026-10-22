import { z } from "zod/v4";
import { DECK_FORMATS } from "../deck/schema";

// Schemas the model fills in. Kept free of length/regex constraints because
// structured-output JSON schemas reject many of them; limits are enforced after
// parsing instead.

export const GEN_LAYOUTS = ["blank", "title", "bullets", "two-column", "quote"] as const;

export const GenBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string() }),
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("bullets"), items: z.array(z.string()) }),
  z.object({ type: z.literal("numbered"), items: z.array(z.string()) }),
  z.object({ type: z.literal("quote"), text: z.string() }),
]);
export type GenBlock = z.infer<typeof GenBlockSchema>;

export const GenCardSchema = z.object({
  layout: z.enum(GEN_LAYOUTS),
  blocks: z.array(GenBlockSchema),
  notes: z.string(),
});
export type GenCard = z.infer<typeof GenCardSchema>;

export const OutlineSchema = z.object({
  title: z.string(),
  cards: z.array(z.object({ title: z.string(), points: z.array(z.string()) })),
});
export type Outline = z.infer<typeof OutlineSchema>;

export const CardsBatchSchema = z.object({ cards: z.array(GenCardSchema) });

export const AgentOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_card"), cardId: z.string(), card: GenCardSchema }),
  z.object({ op: z.literal("insert_after"), afterCardId: z.string(), card: GenCardSchema }),
  z.object({ op: z.literal("remove_card"), cardId: z.string() }),
  z.object({ op: z.literal("move_card"), cardId: z.string(), direction: z.enum(["up", "down"]) }),
  z.object({ op: z.literal("set_theme"), themeId: z.string() }),
  z.object({ op: z.literal("set_title"), title: z.string() }),
]);
export type AgentOp = z.infer<typeof AgentOpSchema>;

export const AgentResultSchema = z.object({ reply: z.string(), operations: z.array(AgentOpSchema) });
export type AgentResult = z.infer<typeof AgentResultSchema>;

// Request bodies validated by the API routes.
export const MAX_INPUT_CHARS = 50_000;
export const MAX_CARDS = 30;

export const OutlineRequestSchema = z.object({
  mode: z.enum(["prompt", "text"]),
  input: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  format: z.enum(DECK_FORMATS).default("presentation"),
  cardCount: z.number().int().min(1).max(MAX_CARDS).default(8),
  textHandling: z.enum(["condense", "preserve", "expand"]).default("condense"),
  tone: z.string().max(200).default(""),
  audience: z.string().max(200).default(""),
  language: z.string().max(60).default("English"),
});
export type OutlineRequest = z.infer<typeof OutlineRequestSchema>;
