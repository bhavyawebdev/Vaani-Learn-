import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentChunk } from '../types/workspace';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface TocEntry {
  title: string;
  page: number;
}

export interface ExtractedPdfResult {
  pageCount: number;
  chunks: Omit<DocumentChunk, 'document_id'>[];
  vocabCount: number;
  charCount: number;
  previewSnippet: string;
  tableOfContents: TocEntry[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'to', 'in',
  'at', 'of', 'on', 'for', 'with', 'by', 'as', 'it', 'its', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your',
  'his', 'her', 'our', 'their', 'me', 'him', 'them', 'us', 'from', 'up',
  'down', 'into', 'over', 'after', 'can', 'could', 'should', 'would', 'will',
  'shall', 'may', 'might', 'must', 'just', 'so', 'than', 'then', 'too', 'very',
  's', 't', 're', 've', 'd', 'll', 'm', 'please', 'hey', 'hello',
]);

function extractLinesFromTextItems(items: any[]): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of items) {
    if (!('str' in item)) continue;
    const str = item.str as string;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) : null;

    if (lastY !== null && y !== null && Math.abs(y - lastY) > 3.5) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = str;
    } else {
      currentLine += (currentLine && str && !currentLine.endsWith(' ') && !str.startsWith(' ') ? ' ' : '') + str;
    }

    if (item.hasEOL) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
      lastY = null;
    } else if (y !== null) {
      lastY = y;
    }
  }

  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}

const CHAPTER_LINE_REGEX =
  /^(?:chapter|ch\.?|unit|module|part|lesson|topic)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty[- ]\w+|thirty)\b(?:\s*[:.\-–—]?\s*.*)?$/i;

const CHAPTER_CANONICAL_KEY_REGEX =
  /^(?:chapter|ch\.?|unit|module|part|lesson|topic)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty[- ]\w+|thirty)\b/i;

const NUMBERED_HEADING_REGEX = /^(\d{1,2})\.\s+([A-Z][A-Za-z0-9\s,'\-:&()]{3,75})$/;
const TOC_ENTRY_LINE_REGEX =
  /^((?:\d{1,2}[.)]\s+)?[A-Za-z][A-Za-z0-9\s,'\-:&()]{2,65}?)\s*(?:\.{2,}|\s{2,})\s*(\d{1,4})$/;

function isLikelyHeadingLine(line: string): boolean {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (CHAPTER_LINE_REGEX.test(trimmed)) return true;
  if (NUMBERED_HEADING_REGEX.test(trimmed) && !/[.!?]$/.test(trimmed)) return true;
  return false;
}

/**
 * Resolves native PDF outline bookmarks into { title, page } entries.
 */
async function extractNativeOutline(pdf: any): Promise<TocEntry[]> {
  try {
    const outline = await pdf.getOutline();
    if (!Array.isArray(outline) || outline.length === 0) return [];

    const results: TocEntry[] = [];

    const walk = async (nodes: any[]) => {
      for (const node of nodes) {
        const title = (node.title || '').replace(/\s+/g, ' ').trim();
        let pageNum = 1;
        try {
          let dest = node.dest;
          if (typeof dest === 'string') {
            dest = await pdf.getDestination(dest);
          }
          if (Array.isArray(dest) && dest[0]) {
            const pageIndex = await pdf.getPageIndex(dest[0]);
            pageNum = pageIndex + 1;
          }
        } catch {
          // Keep pageNum = 1 if destination ref cannot be resolved
        }

        if (title) {
          results.push({ title, page: pageNum });
        }
        if (Array.isArray(node.items) && node.items.length > 0 && results.length < 80) {
          await walk(node.items);
        }
      }
    };

    await walk(outline);
    return results;
  } catch {
    return [];
  }
}

/**
 * Extracts real text, line-preserved pages, native PDF outline / chapters, and overlapping RAG chunks.
 */
export async function extractPdfContent(file: File): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;
  const nativeToc = await extractNativeOutline(pdf);
  const scannedHeadings: TocEntry[] = [];
  const seenHeadings = new Set<string>();

  const chunks: Omit<DocumentChunk, 'document_id'>[] = [];
  const vocab = new Set<string>();
  let charCount = 0;
  let chunkIndex = 0;
  let previewSnippet = '';

  // Extract pages in parallel batches of 16 for 5x-8x faster processing on 500+ page PDFs
  const batchSize = 16;
  const pageLinesByNum: string[][] = new Array(pageCount + 1);

  for (let startPage = 1; startPage <= pageCount; startPage += batchSize) {
    const endPage = Math.min(pageCount, startPage + batchSize - 1);
    const pageNums = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
    const batchResults = await Promise.all(
      pageNums.map(async (pageNum) => {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        return { pageNum, lines: extractLinesFromTextItems(textContent.items as any[]) };
      })
    );
    for (const res of batchResults) {
      pageLinesByNum[res.pageNum] = res.lines;
    }
  }

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const lines = pageLinesByNum[pageNum] || [];
    const rawPageText = lines.join('\n').trim();

    if (!rawPageText) continue;

    const isEarlyTocPage =
      pageNum <= 15 && /\b(table of contents|contents|index)\b/i.test(rawPageText);

    if (nativeToc.length === 0) {
      for (const line of lines) {
        if (isEarlyTocPage) {
          const tocMatch = line.match(TOC_ENTRY_LINE_REGEX);
          if (tocMatch) {
            const title = tocMatch[1].replace(/\s+/g, ' ').trim();
            const targetPage = Math.max(1, Number(tocMatch[2]) || pageNum);
            const norm = title.toLowerCase();
            if (!seenHeadings.has(norm) && !/^(contents|table of contents|page)$/i.test(norm)) {
              seenHeadings.add(norm);
              scannedHeadings.push({ title, page: targetPage });
              continue;
            }
          }
        }
        if (isLikelyHeadingLine(line)) {
          const norm = line.toLowerCase();
          if (!seenHeadings.has(norm)) {
            seenHeadings.add(norm);
            scannedHeadings.push({ title: line, page: pageNum });
          }
        }
      }
    }

    if (!previewSnippet) {
      previewSnippet = rawPageText.replace(/\s+/g, ' ').slice(0, 220);
    }

    charCount += rawPageText.length;
    const words = rawPageText.split(/\s+/).filter(Boolean);

    for (const w of words) {
      const cleaned = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (cleaned.length > 2) vocab.add(cleaned);
    }

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

  const tableOfContents = nativeToc.length > 0 ? nativeToc : scannedHeadings.slice(0, 80);

  return {
    pageCount,
    chunks,
    vocabCount: vocab.size,
    charCount,
    previewSnippet,
    tableOfContents,
  };
}

/**
 * Fallback chapter/heading scanner across persisted chunks when native outline wasn't stored yet.
 * Strictly extracts clean, non-duplicate chapter headings in page order.
 */
export function detectChaptersInChunks(
  chunks: DocumentChunk[],
  storedToc?: TocEntry[]
): TocEntry[] {
  // If pre-stored TOC exists, sanitize and deduplicate it
  if (storedToc && storedToc.length > 0) {
    const validStored: TocEntry[] = [];
    const seen = new Set<string>();
    const seenPages = new Set<number>();

    for (const item of storedToc) {
      const cleanTitle = item.title.replace(/\s+/g, ' ').trim();
      const lower = cleanTitle.toLowerCase();
      if (!cleanTitle || /^(contents|table of contents|index|title|cover|page|preface|foreword)$/i.test(lower)) {
        continue;
      }
      const page = Math.max(1, item.page || 1);
      const canonicalMatch = cleanTitle.match(CHAPTER_CANONICAL_KEY_REGEX);
      const key = canonicalMatch ? canonicalMatch[0].toLowerCase() : lower;

      if (!seen.has(key)) {
        seen.add(key);
        seenPages.add(page);
        validStored.push({ title: cleanTitle, page });
      }
    }

    if (validStored.length > 0) {
      return validStored.sort((a, b) => a.page - b.page);
    }
  }

  const sortedChunks = [...chunks].sort((a, b) => a.page_number - b.page_number || a.chunk_index - b.chunk_index);
  const found: TocEntry[] = [];
  const seenCanonical = new Set<string>();
  const seenTitles = new Set<string>();

  // Pass 1: Check early pages (pages <= 20) for table of contents entries
  for (const chunk of sortedChunks) {
    if (chunk.page_number > 20) break;
    const isEarlyTocChunk = /\b(table of contents|contents|index)\b/i.test(chunk.chunk_text);
    if (!isEarlyTocChunk) continue;

    const lines = chunk.chunk_text.split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/\s+/g, ' ').trim();
      const tocMatch = cleaned.match(TOC_ENTRY_LINE_REGEX);
      if (tocMatch) {
        const title = tocMatch[1].replace(/\s+/g, ' ').trim();
        const targetPage = Math.max(1, Number(tocMatch[2]) || chunk.page_number);
        const lower = title.toLowerCase();
        if (/^(contents|table of contents|page|index)$/i.test(lower)) continue;

        const canonicalMatch = title.match(CHAPTER_CANONICAL_KEY_REGEX);
        const key = canonicalMatch ? canonicalMatch[0].toLowerCase() : lower;
        if (!seenCanonical.has(key)) {
          seenCanonical.add(key);
          seenTitles.add(lower);
          found.push({ title, page: targetPage });
        }
      }
    }
  }

  // If early TOC gave us structured chapters, sort and return
  if (found.length >= 2) {
    return found.sort((a, b) => a.page - b.page);
  }

  // Pass 2: Scan standalone heading lines across chunks (ignores inline body text)
  for (const chunk of sortedChunks) {
    const lines = chunk.chunk_text.split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/\s+/g, ' ').trim();
      if (!isLikelyHeadingLine(cleaned)) continue;

      const lower = cleaned.toLowerCase();
      if (/^(contents|table of contents|index|title|cover|page)$/i.test(lower)) continue;

      const canonicalMatch = cleaned.match(CHAPTER_CANONICAL_KEY_REGEX);
      // Canonical key (e.g. "chapter 1") prevents running headers on multiple pages from duplicating
      const key = canonicalMatch ? canonicalMatch[0].toLowerCase() : lower;

      if (!seenCanonical.has(key) && !seenTitles.has(lower)) {
        seenCanonical.add(key);
        seenTitles.add(lower);
        found.push({ title: cleaned, page: chunk.page_number });
      }
    }
  }

  return found.sort((a, b) => a.page - b.page);
}

export function extractQueryTerms(query: string): string[] {
  const rawTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  const filtered = rawTokens.filter((t) => {
    // Keep numbers like "1", "2", "3" which often denote chapters, pages, sections
    if (/^\d+$/.test(t)) return true;
    return t.length > 1 && !STOP_WORDS.has(t);
  });

  if (filtered.length === 0) {
    return rawTokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  }
  return filtered;
}

/**
 * Ranks chunks of a PDF using hybrid BM25 + subword stem matching + phrase proximity.
 * Ensures the most semantically relevant sections for the specific question are surfaced.
 */
export function findRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  limit = 6,
  excludedChunkIndices?: Set<number>
): Array<DocumentChunk & { relevanceScore: number; termHits: number }> {
  if (!chunks.length) return [];

  const queryTerms = Array.from(new Set(extractQueryTerms(query)));
  const totalDocs = chunks.length;

  if (queryTerms.length === 0) {
    // Return early overview chunks (skipping excluded)
    const valid = chunks.filter((c) => !excludedChunkIndices?.has(c.chunk_index));
    return (valid.length ? valid : chunks).slice(0, limit).map((c) => ({
      ...c,
      relevanceScore: 0.5,
      termHits: 0,
    }));
  }

  // Generate stems for flexible matching (e.g., "characters" -> "character", "explains" -> "explain")
  const stems = queryTerms.map((t) => {
    if (t.length > 4 && t.endsWith('s')) return t.slice(0, -1);
    if (t.length > 5 && (t.endsWith('ed') || t.endsWith('es'))) return t.slice(0, -2);
    if (t.length > 6 && t.endsWith('ing')) return t.slice(0, -3);
    return t;
  });

  const queryLower = query.toLowerCase();

  // Document frequencies
  const docFreq: Record<string, number> = {};
  const chunkData = chunks.map((chunk) => {
    const textLower = chunk.chunk_text.toLowerCase();
    const words = textLower.split(/\W+/).filter(Boolean);
    const wordSet = new Set(words);

    for (let i = 0; i < queryTerms.length; i++) {
      const term = queryTerms[i];
      const stem = stems[i];
      if (wordSet.has(term) || wordSet.has(stem) || textLower.includes(term)) {
        docFreq[term] = (docFreq[term] || 0) + 1;
      }
    }
    return { chunk, textLower, words, wordSet, length: words.length || 1 };
  });

  const avgDocLen =
    chunkData.reduce((sum, item) => sum + item.length, 0) / Math.max(totalDocs, 1);

  const k1 = 1.4;
  const b = 0.6;

  const scored = chunkData.map(({ chunk, textLower, wordSet, length }) => {
    let bm25Score = 0;
    let termHits = 0;

    for (let i = 0; i < queryTerms.length; i++) {
      const term = queryTerms[i];
      const stem = stems[i];

      let matchWeight = 0;
      if (wordSet.has(term)) {
        matchWeight = 1.0;
      } else if (wordSet.has(stem)) {
        matchWeight = 0.85;
      } else if (textLower.includes(term)) {
        matchWeight = 0.7;
      }

      if (matchWeight > 0) {
        termHits += 1;
        const df = docFreq[term] || 1;
        const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
        const tf = matchWeight;
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (length / avgDocLen));
        bm25Score += idf * (numerator / denominator);
      }
    }

    // Exact multi-term phrase boost
    if (queryTerms.length >= 2 && textLower.includes(queryTerms.slice(0, 3).join(' '))) {
      bm25Score += 2.5;
    }

    // Slightly penalize chunks that were already cited in immediate prior turns if other good hits exist
    if (excludedChunkIndices?.has(chunk.chunk_index)) {
      bm25Score *= 0.7;
    }

    const normalized = Math.min(0.99, bm25Score / Math.max(queryTerms.length * 1.8, 1));
    return {
      ...chunk,
      relevanceScore: termHits === 0 ? 0 : Math.max(0.15, Number(normalized.toFixed(3))),
      termHits,
    };
  });

  scored.sort((a, bItem) => {
    if (bItem.termHits !== a.termHits) return bItem.termHits - a.termHits;
    if (bItem.relevanceScore !== a.relevanceScore) return bItem.relevanceScore - a.relevanceScore;
    return a.chunk_index - bItem.chunk_index;
  });

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
