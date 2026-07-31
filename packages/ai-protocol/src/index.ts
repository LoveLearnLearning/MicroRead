import { z } from "zod";

export const aiModeSchema = z.enum([
  "SELECTION_EXPLAIN",
  "DOCUMENT_QA",
  "SECTION_OVERVIEW",
  "TERM_EXPLAIN",
]);

export const passageSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceTitle: z.string().min(1),
  content: z.string().min(1).max(4_000),
  pageIndex: z.number().int().nonnegative().optional(),
  blockIndex: z.number().int().nonnegative().optional(),
  heading: z.string().optional(),
});

export const aiRequestSchema = z.object({
  sourceId: z.string().min(1),
  mode: aiModeSchema,
  query: z.string().trim().min(1).max(2_000),
  locale: z.string().default("zh-CN"),
  passages: z.array(passageSchema).min(1).max(12),
});

export type AiRequest = z.infer<typeof aiRequestSchema>;

export const translationRequestSchema = z.object({
  sourceId: z.string().min(1),
  targetLocale: z.string().min(2).max(20).default("zh-CN"),
  chunks: z.array(z.object({
    id: z.string().min(1),
    text: z.string().trim().min(1).max(2_500),
  })).min(1).max(4),
}).superRefine((value, context) => {
  const ids = new Set(value.chunks.map((chunk) => chunk.id));
  if (ids.size !== value.chunks.length) {
    context.addIssue({ code: "custom", message: "translation chunk ids must be unique" });
  }
  if (value.chunks.reduce((total, chunk) => total + chunk.text.length, 0) > 8_000) {
    context.addIssue({ code: "custom", message: "translation batch is too large" });
  }
});

export const translationModelResponseSchema = z.object({
  translations: z.array(z.object({
    id: z.string().min(1),
    text: z.string().trim().min(1),
  })).min(1).max(4),
});

export type TranslationRequest = z.infer<typeof translationRequestSchema>;

export const claimSchema = z.object({
  text: z.string(),
  type: z.enum([
    "SOURCE_FACT",
    "SOURCE_SUMMARY",
    "MODEL_INFERENCE",
    "EXTERNAL_KNOWLEDGE",
    "UNCERTAIN",
  ]),
  passageIds: z.array(z.string()).default([]),
});

export const modelAnswerSchema = z.object({
  answerMarkdown: z.string(),
  claims: z.array(claimSchema).default([]),
  limitations: z.array(z.string()).default([]),
});

export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export type AiStreamEvent =
  | { event: "response.started"; data: { responseId: string } }
  | { event: "answer.delta"; data: { text: string } }
  | { event: "citation.created"; data: { citation: unknown } }
  | { event: "claim.created"; data: { claim: unknown } }
  | { event: "warning.created"; data: { message: string } }
  | { event: "usage.updated"; data: Record<string, unknown> }
  | { event: "response.completed"; data: { responseId: string } };
