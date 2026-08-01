export type SourceType = "PDF" | "WEB";
export type LibraryState = "INBOX" | "LIBRARY" | "ARCHIVED" | "TRASHED";
export type ProcessingState =
  | "READY"
  | "UPLOADED"
  | "EXTRACTING"
  | "INDEXING"
  | "FAILED";

export interface PdfRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfTextBlock {
  pageIndex: number;
  text: string;
  rect: PdfRect;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  createdAt: string;
}

export interface Source {
  id: string;
  workspaceId: string;
  type: SourceType;
  title: string;
  author?: string;
  canonicalUri?: string;
  contentHash: string;
  libraryState: LibraryState;
  processingState: ProcessingState;
  mimeType: string;
  byteSize: number;
  pageCount?: number;
  textContent?: string;
  pdfTextBlocks?: PdfTextBlock[];
  summary?: string;
  tags: string[];
  topicIds: string[];
  progress: number;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceFile {
  sourceId: string;
  blob: Blob;
}

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface Anchor {
  id: string;
  sourceId: string;
  sourceRevisionId: string;
  pageIndex?: number;
  blockIndex?: number;
  startOffset?: number;
  endOffset?: number;
  quote: TextQuote;
  pdfRects?: PdfRect[];
  createdAt: string;
}

export type AnnotationType = "HIGHLIGHT" | "UNDERLINE" | "NOTE" | "BOOKMARK";
export type AnnotationColor = "amber" | "mint" | "blue" | "rose" | "violet";

export interface Annotation {
  id: string;
  workspaceId: string;
  sourceId: string;
  anchorId: string;
  type: AnnotationType;
  color: AnnotationColor;
  bodyMarkdown: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type CardStatus = "ACTIVE" | "ARCHIVED";

export interface KnowledgeCard {
  id: string;
  workspaceId: string;
  sourceId: string;
  sourceTitle: string;
  sourceAnchorId: string;
  title: string;
  excerpt: string;
  userNoteMarkdown: string;
  aiExplanationMarkdown: string;
  tags: string[];
  status: CardStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: AnnotationColor;
  createdAt: string;
  updatedAt: string;
}

export interface Passage {
  id: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  pageIndex?: number;
  blockIndex?: number;
  heading?: string;
  url?: string;
  provider?: string;
}

export type ClaimType =
  | "SOURCE_FACT"
  | "SOURCE_SUMMARY"
  | "MODEL_INFERENCE"
  | "EXTERNAL_KNOWLEDGE"
  | "UNCERTAIN";

export interface Citation {
  id: string;
  passageId: string;
  sourceId: string;
  sourceTitle: string;
  quote: string;
  pageIndex?: number;
  blockIndex?: number;
  url?: string;
  provider?: string;
}

export type AiBranchType = "ROOT" | "DEEPER" | "DIVERGENT" | "RETRY";

export interface WebResearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  provider: "Wikipedia" | "Crossref";
}

export interface Claim {
  text: string;
  type: ClaimType;
  citationIds: string[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
}

export interface AiResponse {
  id: string;
  sourceId: string;
  query: string;
  mode: AiMode;
  answerMarkdown: string;
  claims: Claim[];
  citations: Citation[];
  limitations: string[];
  usage: Usage;
  createdAt: string;
  parentResponseId?: string;
  branchType?: AiBranchType;
  anchorId?: string;
  webSources?: WebResearchResult[];
}

export type AiMode = "SELECTION_EXPLAIN" | "DOCUMENT_QA" | "SECTION_OVERVIEW" | "TERM_EXPLAIN";

export interface TranslationChunk {
  id: string;
  index: number;
  sourceText: string;
  translatedText: string;
  pageIndex?: number;
  blockIndex?: number;
  pdfRect?: PdfRect;
}

export interface DocumentTranslation {
  id: string;
  sourceId: string;
  sourceContentHash: string;
  targetLocale: string;
  status: "IN_PROGRESS" | "READY" | "FAILED" | "PAUSED";
  chunks: TranslationChunk[];
  completedChunks: number;
  totalChunks: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  layoutVersion?: number;
}

export interface UsageEntry {
  id: string;
  workspaceId: string;
  category: "LLM_INPUT" | "LLM_OUTPUT" | "DOCUMENT_IMPORT";
  quantity: number;
  unit: "TOKEN" | "DOCUMENT";
  providerCostUsd: number;
  referenceId: string;
  occurredAt: string;
}

export interface SyncOperation {
  id: string;
  workspaceId: string;
  entityType: "source" | "annotation" | "knowledgeCard" | "topic";
  entityId: string;
  action: "UPSERT" | "DELETE";
  payload: Record<string, unknown>;
  clientTimestamp: string;
  status: "PENDING" | "LOCAL_ONLY";
}

export interface FeatureFlags {
  aiEnabled: boolean;
  webImportEnabled: boolean;
  pdfImportEnabled: boolean;
}

export const DEFAULT_WORKSPACE_ID = "019fb7ef-0000-7000-8000-000000000001";

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
