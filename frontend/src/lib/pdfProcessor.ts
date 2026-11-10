import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentChunk } from '../types/workspace';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPdfResult {
  pageCount: number;
  chunks: Omit<DocumentChunk, 'document_id'>[];
  vocabCount: number;
  charCount: number;
  previewSnippet: string;
}

/**
 * Extracts real text, page counts, and overlapping study chunks from a user's PDF file.
 */
export async function extractPdfContent(file: File): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;
  const chunks: Omit<DocumentChunk, 'document_id'>[] = [];
  const vocab = new Set<string>();
  let charCount = 0;
  let chunkIndex = 0;
  let previewSnippet = '';

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rawPageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!rawPageText) continue;

    if (!previewSnippet) {
      previewSnippet = rawPageText.slice(0, 220);
    }

    charCount += rawPageText.length;
    const words = rawPageText.split(/\s+/).filter(Boolean);

    for (const w of words) {
      const cleaned = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (cleaned.length > 2) vocab.add(cleaned);
    }

    // Create ~180-word overlapping chunks for precise retrieval
    const windowSize = 180;
    const stride = 150;

    if (words.length <= windowSize) {
      chunks.push({
        page_number: pageNum,
        chunk_index: chunkIndex++,
        chunk_text: rawPageText,
        token_count: words.length,
      });
    } else {
      for (let start = 0; start < words.length; start += stride) {
        const segment = words.slice(start, start + windowSize).join(' ');
        if (segment) {
          chunks.push({
            page_number: pageNum,
            chunk_index: chunkIndex++,
            chunk_text: segment,
            token_count: segment.split(/\s+/).length,
          });
        }
      }
    }
  }

  return {
    pageCount,
    chunks,
    vocabCount: vocab.size,
    charCount,
    previewSnippet,
  };
}

/**
 * Ranks extracted document chunks against a learner's question using real lexical relevance.
 */
export function findRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  limit = 4
): Array<DocumentChunk & { relevanceScore: number }> {
  if (!chunks.length) return [];

  const stopWords = new Set([
    'what', 'when', 'where', 'which', 'who', 'why', 'how', 'the', 'and', 'for',
    'that', 'this', 'with', 'from', 'about', 'into', 'your', 'explain', 'quiz',
    'summarize', 'core', 'concepts', 'chapter', 'document', 'please', 'tell',
  ]);

  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 2 && !stopWords.has(t));

  const scored = chunks.map((chunk) => {
    const lower = chunk.chunk_text.toLowerCase();
    let matchCount = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) matchCount++;
    }
    const baseScore =
      queryTerms.length > 0 ? matchCount / queryTerms.length : 0.5;
    // Slight preference for earlier overview chunks when query is broad (e.g. "summarize")
    const positionBonus = queryTerms.length === 0 ? Math.max(0, 0.25 - chunk.chunk_index * 0.03) : 0;
    const relevanceScore = Math.min(0.99, Math.max(0.25, baseScore + positionBonus));

    return { ...chunk, relevanceScore };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  return scored.slice(0, limit);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDocTitle(filename: string, maxLength = 28): string {
  const cleaned = filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

