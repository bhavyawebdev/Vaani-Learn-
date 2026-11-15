"""
VaaniLearn AI — Backend Service
Built with FastAPI
Integrated with:
- PyMuPDF (PDF extraction)
- Supabase PostgreSQL + Auth + RLS ownership verification
- Google Gemini API (Strict PDF-only grounded tutor reasoning)
- Gnani AI (Complete-question Speech-to-Text & Answer Text-to-Speech)
"""

import base64
import math
import os
import re
from typing import Optional, List
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    BackgroundTasks,
    UploadFile,
    File,
    Form,
    Header,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import fitz  # PyMuPDF
import google.generativeai as genai
import httpx
from supabase import create_client, Client

load_dotenv()

app = FastAPI(
    title="VaaniLearn AI API",
    description="Backend Engine for Multilingual Voice & PDF-Grounded Learning",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Configurations from Environment
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "").strip()
GNANI_STT_URL = os.getenv("GNANI_STT_URL", "https://asr.gnani.ai/api/v1/asr").strip()
GNANI_TTS_URL = os.getenv("GNANI_TTS_URL", "https://tts.gnani.ai/api/v1/tts").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("mock"):
    genai.configure(api_key=GEMINI_API_KEY)

PDF_ONLY_TUTOR_SYSTEM_PROMPT = """You are VaaniLearn AI, a personal tutor.

Answer the student's questions using only the content of the currently selected PDF.

Never invent facts or introduce unsupported information from your general knowledge.

If the requested information is not present in the selected PDF, clearly tell the student that the PDF does not contain enough information to answer.

Explain concepts in simple, student-friendly language.

When asked to list chapters, identify chapter headings from the PDF and present them in their original order.

When asked to explain a chapter, explain the relevant content from the PDF in a structured and understandable way."""


def is_gnani_configured() -> bool:
    return bool(
        GNANI_API_KEY
        and GNANI_API_KEY != "your-gnani-api-key-here"
        and not GNANI_API_KEY.startswith("mock")
    )


def get_supabase() -> Optional[Client]:
    if (
        SUPABASE_URL.startswith("https://")
        and SUPABASE_SERVICE_KEY
        and not SUPABASE_SERVICE_KEY.startswith("mock")
    ):
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return None


def verify_authenticated_user(
    sb: Optional[Client],
    authorization: Optional[str],
    claimed_user_id: Optional[str],
) -> Optional[str]:
    if not sb or not authorization:
        return claimed_user_id

    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            try:
                user_resp = sb.auth.get_user(token)
                if user_resp and user_resp.user:
                    return user_resp.user.id
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid authentication session: {exc}",
                )
    return claimed_user_id


# Pydantic Schemas
class ConversationTurn(BaseModel):
    sender: str
    text: str


class VoiceQueryRequest(BaseModel):
    document_id: str
    user_id: Optional[str] = None
    audio_base64: Optional[str] = None
    text_query: Optional[str] = None
    language: str = Field(default="en", description="'gu', 'hi', or 'en'")
    session_id: Optional[str] = None
    conversation_history: Optional[List[ConversationTurn]] = None
    context_chunks: Optional[List[dict]] = None
    document_title: Optional[str] = None


class QueryResponse(BaseModel):
    transcribed_query: str
    answer_text: str
    audio_url: Optional[str] = None
    tts_fallback: bool = False
    language: str
    grounded_citations: List[dict]


class SynthesizeRequest(BaseModel):
    text: str
    language: str = Field(default="en", description="'gu', 'hi', or 'en'")


@app.get("/")
def read_root():
    sb = get_supabase()
    return {
        "app": "VaaniLearn AI Engine",
        "status": "operational",
        "supabase_connected": sb is not None,
        "gemini_configured": bool(GEMINI_API_KEY),
        "gnani_configured": is_gnani_configured(),
    }


@app.post("/api/v1/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = Form("en"),
    user_id: str = Form(...),
    document_id: Optional[str] = Form(None),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot upload more than 50 MB of PDF.",
        )

    result = process_pdf_and_index(
        filename=file.filename,
        pdf_bytes=file_bytes,
        language=language,
        user_id=user_id,
        document_id=document_id,
    )

    return {
        "status": "ready",
        "document_id": result.get("document_id"),
        "filename": file.filename,
        "size_bytes": len(file_bytes),
        "page_count": result.get("page_count", 0),
        "chunk_count": result.get("chunk_count", 0),
        "vocab_count": result.get("vocab_count", 0),
        "table_of_contents": result.get("table_of_contents", []),
        "chunks": result.get("chunks", []),
    }


def process_pdf_and_index(
    filename: str,
    pdf_bytes: bytes,
    language: str,
    user_id: str,
    document_id: Optional[str] = None,
) -> dict:
    """PyMuPDF high-speed chunk + TOC extraction with Supabase PostgreSQL persistence"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    chunks = []
    vocab = set()
    chunk_idx = 0

    # Extract native PDF bookmarks / outline if embedded in the file
    toc_entries: List[dict] = []
    try:
        raw_toc = doc.get_toc() or []
        seen_toc = set()
        for item in raw_toc:
            if len(item) >= 3:
                title = re.sub(r"\s+", " ", str(item[1] or "")).strip()
                page = max(1, int(item[2] or 1))
                key = f"{title.lower()}::{page}"
                if title and key not in seen_toc:
                    seen_toc.add(key)
                    toc_entries.append({"title": title, "page": page})
    except Exception:
        toc_entries = []

    for page_num in range(total_pages):
        raw_page_text = doc[page_num].get_text("text")
        lines = [line.strip() for line in raw_page_text.splitlines() if line.strip()]
        page_text = "\n".join(lines).strip()
        if not page_text:
            continue

        words = page_text.split()
        for w in words:
            cleaned = re.sub(r"[^\w]", "", w.lower())
            if len(cleaned) > 2:
                vocab.add(cleaned)

        step = 200
        if len(words) <= step:
            chunks.append(
                {
                    "page_number": page_num + 1,
                    "chunk_index": chunk_idx,
                    "chunk_text": page_text,
                    "token_count": len(words),
                }
            )
            chunk_idx += 1
        else:
            # Split along preserved lines so headings remain at start of lines
            current_lines: List[str] = []
            current_words = 0
            for line in lines:
                lw = len(line.split())
                if current_words + lw > step and current_lines:
                    segment = "\n".join(current_lines).strip()
                    if segment:
                        chunks.append(
                            {
                                "page_number": page_num + 1,
                                "chunk_index": chunk_idx,
                                "chunk_text": segment,
                                "token_count": len(segment.split()),
                            }
                        )
                        chunk_idx += 1
                    current_lines = current_lines[-2:] if len(current_lines) >= 2 else []
                    current_words = sum(len(l.split()) for l in current_lines)
                current_lines.append(line)
                current_words += lw
            if current_lines:
                segment = "\n".join(current_lines).strip()
                if segment:
                    chunks.append(
                        {
                            "page_number": page_num + 1,
                            "chunk_index": chunk_idx,
                            "chunk_text": segment,
                            "token_count": len(segment.split()),
                        }
                    )
                    chunk_idx += 1

    # Fallback: scan line headings across chunks if no native PDF outline existed
    if not toc_entries and chunks:
        toc_entries = extract_chapters_from_pdf(chunks)

    toc_entries = toc_entries[:120]

    sb = get_supabase()
    resolved_doc_id = document_id

    if sb:
        try:
            meta_payload = {
                "chunk_count": len(chunks),
                "vocab_count": len(vocab),
                "table_of_contents": toc_entries,
            }
            if resolved_doc_id:
                sb.table("documents").update(
                    {
                        "page_count": total_pages,
                        "status": "ready",
                        "extracted_metadata": meta_payload,
                    }
                ).eq("id", resolved_doc_id).execute()
            else:
                insert_res = (
                    sb.table("documents")
                    .insert(
                        {
                            "user_id": user_id,
                            "title": filename,
                            "storage_path": f"{user_id}/{filename}",
                            "file_size_bytes": len(pdf_bytes),
                            "page_count": total_pages,
                            "language": language,
                            "status": "ready",
                            "extracted_metadata": meta_payload,
                        }
                    )
                    .execute()
                )
                if insert_res.data:
                    resolved_doc_id = insert_res.data[0]["id"]

            if resolved_doc_id and chunks:
                chunk_rows = [
                    {
                        "document_id": resolved_doc_id,
                        "page_number": c["page_number"],
                        "chunk_index": c["chunk_index"],
                        "chunk_text": c["chunk_text"],
                        "token_count": c["token_count"],
                    }
                    for c in chunks
                ]
                sb.table("document_chunks").insert(chunk_rows).execute()
        except Exception as exc:
            print(f"[Supabase Sync Warning] {exc}")

    return {
        "document_id": resolved_doc_id,
        "page_count": total_pages,
        "chunk_count": len(chunks),
        "vocab_count": len(vocab),
        "table_of_contents": toc_entries,
        "chunks": chunks[:25],
    }


@app.post("/api/v1/voice/transcribe")
async def transcribe_complete_audio(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    fallback_transcript: str = Form(""),
):
    """Receives ONE complete recorded question audio clip after user clicks Stop."""
    audio_bytes = await audio.read()
    lang_map = {"en": "en-IN", "hi": "hi-IN", "gu": "gu-IN"}
    gnani_lang = lang_map.get(language, "en-IN")

    if is_gnani_configured() and audio_bytes:
        try:
            timeout = httpx.Timeout(5.0, connect=2.5)
            async with httpx.AsyncClient(timeout=timeout) as client:
                files = {
                    "audio_file": (
                        audio.filename or "question.webm",
                        audio_bytes,
                        audio.content_type or "audio/webm",
                    )
                }
                data = {"language": gnani_lang, "encoding": "webm"}
                headers = {"Authorization": f"Bearer {GNANI_API_KEY}", "x-api-key": GNANI_API_KEY}
                resp = await client.post(GNANI_STT_URL, files=files, data=data, headers=headers)
                if resp.status_code == 200:
                    payload = resp.json()
                    text = (
                        payload.get("transcript")
                        or payload.get("text")
                        or payload.get("data", {}).get("transcript")
                        or ""
                    ).strip()
                    if text:
                        return {"transcript": text, "provider": "gnani_stt"}
                else:
                    print(f"[Gnani STT HTTP {resp.status_code}] {resp.text[:200]}")
        except Exception as exc:
            print(f"[Gnani STT Warning] {exc}")

    cleaned_fallback = fallback_transcript.strip()
    if cleaned_fallback:
        return {"transcript": cleaned_fallback, "provider": "speech_buffer"}

    if not is_gnani_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gnani STT API key is not configured and no browser transcript was captured. Please type your question or configure GNANI_API_KEY.",
        )

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="No clear speech was detected in the recording. Please try again.",
    )


def clean_text_for_speech(text: str) -> str:
    """Strips page numbers, citations, bullet symbols, markdown, and raw filename headers for lifelike speech synthesis."""
    if not text:
        return ""
    cleaned = text
    # 1. Remove markdown bold/italic/code/headers
    cleaned = re.sub(r"^#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)

    # 2. Remove parenthesized or bracketed page citations: (Page 236), (Pages 1–18), [Page 5], (पृष्ठ 12), (પાનું 4)
    cleaned = re.sub(
        r"\s*[\(\[](?:pages?|पृष्ठ|પાનું|p\.)\s*\d+(?:\s*(?:[\-\–—]|to)\s*\d+)?[\)\]]",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # 3. Remove phrases like "starting on Page 5", "Based on Page 12:", "on Page 236"
    cleaned = re.sub(
        r"\s*\b(?:starting\s+on\s+|based\s+on\s+|on\s+)(?:pages?|पृष्ठ|પાનું)\s*\d+(?:\s*(?:[\-\–—]|to)\s*\d+)?(?::|\b)",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(?:pages?|पृष्ठ|પાનું)\s+\d+:?\b", "", cleaned, flags=re.IGNORECASE)

    # 4. Remove leading raw filename callouts: e.g. From "Project Mary Hail.pdf":
    cleaned = re.sub(r"^\s*From\s+[\"'][^\"']+\.pdf[\"']\s*:?\s*", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)

    # 5. Clean up bullet points & leaders so speech doesn't say "bullet"
    cleaned = re.sub(r"^[•\-\*]\s*:?\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\.{2,}\s*\d+", "", cleaned)

    # 6. Clean up empty parentheses, orphan colons, and multi-spaces
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"^\s*:\s*", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()

    return cleaned


async def generate_gnani_tts(text: str, language: str) -> Optional[str]:
    clean_text = clean_text_for_speech(text)
    if not is_gnani_configured() or not clean_text:
        return None

    lang_map = {"en": "en-IN", "hi": "hi-IN", "gu": "gu-IN"}
    try:
        timeout = httpx.Timeout(3.5, connect=2.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            headers = {
                "Authorization": f"Bearer {GNANI_API_KEY}",
                "x-api-key": GNANI_API_KEY,
                "Content-Type": "application/json",
            }
            payload = {"text": clean_text[:2000], "language": lang_map.get(language, "en-IN")}
            resp = await client.post(GNANI_TTS_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                content_type = resp.headers.get("content-type", "")
                if "audio" in content_type:
                    b64 = base64.b64encode(resp.content).decode("ascii")
                    return f"data:{content_type};base64,{b64}"
                data = resp.json()
                audio_b64 = data.get("audio") or data.get("audio_base64")
                if audio_b64:
                    return f"data:audio/mp3;base64,{audio_b64}"
                if data.get("audio_url"):
                    return data["audio_url"]
    except Exception as exc:
        print(f"[Gnani TTS Warning] {exc}")
    return None


@app.post("/api/v1/voice/synthesize")
async def synthesize_voice(payload: SynthesizeRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    audio_url = await generate_gnani_tts(payload.text, payload.language)
    return {
        "audio_url": audio_url,
        "fallback": None if audio_url else "browser_tts",
    }


STOP_WORDS = {
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "to", "in",
    "at", "of", "on", "for", "with", "by", "as", "it", "its", "this", "that",
    "these", "those", "i", "you", "he", "she", "we", "they", "my", "your",
    "his", "her", "our", "their", "me", "him", "them", "us", "from", "up",
    "down", "into", "over", "after", "can", "could", "should", "would", "will",
    "shall", "may", "might", "must", "just", "so", "than", "then", "too", "very",
    "please", "hey", "hello",
}


def extract_chapters_from_pdf(
    chunks: List[dict],
    stored_toc: Optional[List[dict]] = None,
) -> List[dict]:
    """Combines stored PDF outline bookmarks and full-PDF heading scans into an ordered, deduplicated chapter list."""
    if stored_toc:
        normalized = []
        seen = set()
        seen_canon = set()
        for entry in stored_toc:
            title = re.sub(r"\s+", " ", str(entry.get("title") or "")).strip()
            page = max(1, int(entry.get("page") or 1))
            key = title.lower()
            if not title or re.match(r"^(contents|table of contents|index|title|cover|page)$", key, re.I):
                continue
            canon_m = re.match(
                r"^(?:chapter|unit|module|part|lesson)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
                key,
                re.I,
            )
            canon_k = canon_m.group(0).lower() if canon_m else key
            if canon_k not in seen_canon and key not in seen:
                seen.add(key)
                seen_canon.add(canon_k)
                normalized.append({"title": title, "page": page})
        if len(normalized) >= 1:
            return sorted(normalized, key=lambda x: x["page"])

    heading_regex = re.compile(
        r"^(?:chapter|unit|module|part|lesson)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b(?:\s*[:.\-\u2013\u2014]?\s*[^\n]{0,80})?$",
        re.IGNORECASE,
    )
    toc_line_regex = re.compile(
        r"^((?:chapter|unit|module|part)\s+[\divxlcdm]+(?:\s*[:.\-]?\s*[^.]{2,65})?)\s*\.{2,}\s*(\d{1,4})$",
        re.IGNORECASE,
    )

    ordered = sorted(chunks, key=lambda c: (c.get("page_number", 1), c.get("chunk_index", 0)))
    found: List[dict] = []
    seen_titles = set()
    seen_canonicals = set()

    # Pass 1: Early pages (<= 20) Table of Contents
    for chunk in ordered:
        if int(chunk.get("page_number", 1)) > 20:
            break
        txt = chunk.get("chunk_text") or ""
        if not re.search(r"\b(contents|table of contents|index)\b", txt, re.I):
            continue
        for line in txt.splitlines():
            line_s = line.strip()
            toc_match = toc_line_regex.match(line_s)
            if toc_match:
                title = re.sub(r"\s+", " ", toc_match.group(1)).strip()
                page_num = int(toc_match.group(2))
                key = title.lower()
                canon_m = re.match(r"^(?:chapter|unit|module|part|lesson)\s+[\divxlcdm]+", key, re.I)
                canon_k = canon_m.group(0).lower() if canon_m else key
                if canon_k not in seen_canonicals and key not in seen_titles:
                    seen_titles.add(key)
                    seen_canonicals.add(canon_k)
                    found.append({"title": title, "page": page_num})

    if len(found) >= 2:
        return sorted(found, key=lambda x: x["page"])

    # Pass 2: Standalone heading lines
    for chunk in ordered:
        lines = [line.strip() for line in (chunk.get("chunk_text") or "").splitlines() if line.strip()]
        for idx, line in enumerate(lines):
            if len(line) <= 90 and heading_regex.match(line):
                full_title = line
                next_line = lines[idx + 1] if idx + 1 < len(lines) else ""
                if (
                    len(full_title) < 22
                    and next_line
                    and 3 <= len(next_line) <= 60
                    and not heading_regex.match(next_line)
                    and not re.search(r"[.!?]$", next_line)
                ):
                    full_title = f"{full_title}: {next_line}"

                key = re.sub(r"\s+", " ", full_title).strip().lower()
                canon_m = re.match(
                    r"^(?:chapter|unit|module|part|lesson)\s+(?:\d{1,3}|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b",
                    key,
                    re.I,
                )
                canon_k = canon_m.group(0).lower() if canon_m else key

                # Deduplicate repeated running headers across multiple pages
                if canon_k not in seen_canonicals and key not in seen_titles:
                    seen_titles.add(key)
                    seen_canonicals.add(canon_k)
                    found.append(
                        {
                            "title": re.sub(r"\s+", " ", full_title).strip(),
                            "page": int(chunk.get("page_number", 1)),
                        }
                    )

    return sorted(found, key=lambda x: x["page"])


def parse_specific_chapter_target(query: str) -> Optional[int]:
    """Extracts requested chapter number (e.g. 'Chapter 1', 'first chapter', 'chapter one') from query."""
    word_to_num = {
        "first": 1, "one": 1, "1": 1,
        "second": 2, "two": 2, "2": 2,
        "third": 3, "three": 3, "3": 3,
        "fourth": 4, "four": 4, "4": 4,
        "fifth": 5, "five": 5, "5": 5,
        "sixth": 6, "six": 6, "6": 6,
        "seventh": 7, "seven": 7, "7": 7,
        "eighth": 8, "eight": 8, "8": 8,
        "ninth": 9, "nine": 9, "9": 9,
        "tenth": 10, "ten": 10, "10": 10,
        "eleven": 11, "11": 11,
        "twelve": 12, "12": 12,
        "thirteen": 13, "13": 13,
        "fourteen": 14, "14": 14,
        "fifteen": 15, "15": 15,
        "sixteen": 16, "16": 16,
        "seventeen": 17, "17": 17,
        "eighteen": 18, "18": 18,
        "nineteen": 19, "19": 19,
        "twenty": 20, "20": 20,
    }
    m = re.search(
        r"\b(?:chapter|unit|module|part|lesson)\s*(\d{1,3}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:chapter|unit|module|part|lesson)\b",
        query,
        re.IGNORECASE,
    )
    if not m:
        return None
    token = (m.group(1) or m.group(2) or "").lower()
    if token.isdigit():
        return int(token)
    return word_to_num.get(token)


def is_chapter_listing_query(query: str) -> bool:
    """Returns True ONLY when asking for the list/count/overview of all chapters, NOT a specific chapter."""
    if parse_specific_chapter_target(query) is not None:
        return False

    has_structure = bool(
        re.search(
            r"\b(chapters|table of contents|contents|outline|syllabus|modules|units)\b",
            query,
            re.IGNORECASE,
        )
    )
    has_list_or_count = bool(
        re.search(
            r"\b(how many|count|total|number of|list all|list the|list of|what are all the|what are the|which chapters|show chapters|overview of chapters|table of contents|show contents|list contents)\b",
            query,
            re.IGNORECASE,
        )
    )
    return has_structure and has_list_or_count


def is_chapter_or_overview_query(query: str) -> bool:
    return bool(
        re.search(
            r"\b(chapter|chapters|table of contents|contents|outline|syllabus|topics|units|modules|all|first|overview|summarize|summary)\b",
            query,
            re.IGNORECASE,
        )
    )


def extract_query_terms(query: str) -> List[str]:
    seen = set()
    terms = []
    for raw in query.lower().split():
        cleaned = re.sub(r"[^\w]", "", raw)
        if (len(cleaned) > 1 or cleaned.isdigit()) and cleaned not in STOP_WORDS and cleaned not in seen:
            seen.add(cleaned)
            terms.append(cleaned)
    return terms


def score_chunks(query: str, chunks: List[dict]) -> List[dict]:
    query_terms = extract_query_terms(query)
    if not chunks:
        return []

    if not query_terms:
        return [{**c, "relevance_score": 0.45, "term_hits": 0} for c in chunks]

    total_docs = max(len(chunks), 1)
    avg_dl = sum(max(len((c.get("chunk_text") or "").split()), 1) for c in chunks) / total_docs
    lowered_chunks = [(c.get("chunk_text") or "").lower() for c in chunks]

    df = {}
    compiled_terms = []
    for term in query_terms:
        pattern = re.compile(rf"\b{re.escape(term)}\b")
        compiled_terms.append((term, pattern))
        df[term] = sum(1 for txt in lowered_chunks if pattern.search(txt))

    k1 = 1.4
    b = 0.6
    scored = []
    for i, c in enumerate(chunks):
        lower_text = lowered_chunks[i]
        dl = max(len(lower_text.split()), 1)
        bm25 = 0.0
        hits = 0
        for term, pattern in compiled_terms:
            tf = len(pattern.findall(lower_text))
            if tf > 0:
                hits += 1
                idf = math.log(1 + (total_docs - df[term] + 0.5) / (df[term] + 0.5))
                bm25 += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avg_dl))))

        phrase_boost = 0.0
        if len(query_terms) >= 2 and " ".join(query_terms) in lower_text:
            phrase_boost = 1.5

        combined = bm25 + phrase_boost
        normalized = (
            min(0.99, round(hits / len(query_terms), 3))
            if hits > 0
            else 0.0
        )
        scored.append((combined, normalized, hits, c))

    scored.sort(key=lambda item: (item[0], item[2], -item[3].get("chunk_index", 0)), reverse=True)
    return [
        {**item[3], "relevance_score": item[1], "term_hits": item[2]}
        for item in scored
    ]


def select_pdf_context_chunks(
    query: str,
    all_chunks: List[dict],
    stored_toc: Optional[List[dict]] = None,
) -> List[dict]:
    """Selects relevant chunks ONLY from the active PDF using TOC + BM25 across all pages."""
    if not all_chunks:
        return []

    ordered = sorted(all_chunks, key=lambda c: (c.get("page_number", 1), c.get("chunk_index", 0)))

    # If PDF is moderate size (<= 16 chunks), pass all chunks in original order for total accuracy
    if len(ordered) <= 16:
        return [{**c, "relevance_score": 0.9, "term_hits": 1} for c in ordered]

    # Check if user asked for a specific chapter (e.g., "what is chapter 1 about", "explain chapter 3")
    target_num = parse_specific_chapter_target(query)
    if target_num is not None:
        chapters = extract_chapters_from_pdf(ordered, stored_toc)
        start_page = None
        end_page = None

        if 1 <= target_num <= len(chapters):
            start_page = chapters[target_num - 1]["page"]
            end_page = (
                chapters[target_num]["page"] - 1
                if target_num < len(chapters)
                else start_page + 20
            )
        else:
            # Fallback: search for chapter heading in chunk texts
            chap_pattern = re.compile(
                rf"\b(?:chapter|unit|module|part|lesson)\s+{target_num}\b", re.IGNORECASE
            )
            for c in ordered:
                if chap_pattern.search(c.get("chunk_text") or ""):
                    start_page = int(c.get("page_number", 1))
                    end_page = start_page + 18
                    break

        if start_page is not None:
            scoped = [
                {**c, "relevance_score": 0.95, "term_hits": 1}
                for c in ordered
                if start_page <= int(c.get("page_number", 1)) <= max(start_page, end_page or (start_page + 18))
            ]
            if scoped:
                return scoped[:12]

    if is_chapter_or_overview_query(query):
        chapters = extract_chapters_from_pdf(ordered, stored_toc)
        chapter_pages = {ch["page"] for ch in chapters}
        heading_pattern = re.compile(r"(chapter|unit|module|section|part)\s+[\divx]+", re.IGNORECASE)
        selected_indices = set()
        selected = []

        for c in ordered[:6]:
            idx = c.get("chunk_index", 0)
            selected_indices.add(idx)
            selected.append({**c, "relevance_score": 0.9, "term_hits": 1})

        for c in ordered:
            idx = c.get("chunk_index", 0)
            if idx not in selected_indices and (
                int(c.get("page_number", 1)) in chapter_pages
                or heading_pattern.search(c.get("chunk_text", ""))
            ):
                selected_indices.add(idx)
                selected.append({**c, "relevance_score": 0.85, "term_hits": 1})
            if len(selected) >= 16:
                break

        selected.sort(key=lambda c: (c.get("page_number", 1), c.get("chunk_index", 0)))
        return selected

    ranked = score_chunks(query, ordered)
    return ranked[:8]


@app.post("/api/v1/voice/query", response_model=QueryResponse)
async def voice_query(
    payload: VoiceQueryRequest,
    authorization: Optional[str] = Header(default=None),
):
    query_text = (payload.text_query or "").strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="text_query is required")

    sb = get_supabase()
    verified_user_id = verify_authenticated_user(sb, authorization, payload.user_id)

    chunks: List[dict] = payload.context_chunks or []
    doc_title = payload.document_title or "Selected PDF"
    custom_notes = ""
    stored_toc: Optional[List[dict]] = None

    if sb and payload.document_id and not payload.document_id.startswith("local-"):
        try:
            doc_res = (
                sb.table("documents")
                .select("id, user_id, title, extracted_metadata")
                .eq("id", payload.document_id)
                .single()
                .execute()
            )
            if not doc_res.data:
                raise HTTPException(status_code=404, detail="Selected PDF was not found.")

            doc_owner = doc_res.data.get("user_id")
            if verified_user_id and doc_owner != verified_user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to access this document.",
                )

            doc_title = doc_res.data.get("title", doc_title)
            meta = doc_res.data.get("extracted_metadata") or {}
            custom_notes = (meta.get("custom_notes") or "").strip()
            stored_toc = meta.get("table_of_contents") or None

            # Only re-fetch all document chunks from Supabase if frontend didn't pass pre-ranked chunks
            if not chunks:
                chunk_res = (
                    sb.table("document_chunks")
                    .select("id, page_number, chunk_index, chunk_text")
                    .eq("document_id", payload.document_id)
                    .order("chunk_index")
                    .limit(1500)
                    .execute()
                )
                if chunk_res.data:
                    chunks = chunk_res.data
        except HTTPException:
            raise
        except Exception as exc:
            print(f"[Supabase Query Warning] {exc}")

    if custom_notes:
        chunks = [
            {
                "page_number": 1,
                "chunk_index": -1,
                "chunk_text": f"[Student Study Notes]: {custom_notes}",
            },
            *chunks,
        ]

    detected_chapters = extract_chapters_from_pdf(chunks, stored_toc)

    if is_chapter_listing_query(query_text) and detected_chapters:
        chapter_lines = "\n".join(
            f"{idx + 1}. {ch['title']} (Page {ch['page']})"
            for idx, ch in enumerate(detected_chapters)
        )
        answer_text = (
            f'Based on the complete indexing of "{doc_title}", there are {len(detected_chapters)} detected chapters/sections:\n\n'
            f"{chapter_lines}"
        )
        audio_url = await generate_gnani_tts(answer_text, payload.language)
        citations = [
            {
                "page": ch["page"],
                "relevance_score": 0.96,
                "source": doc_title,
                "excerpt": f"{ch['title']} (Page {ch['page']})",
            }
            for ch in detected_chapters[:3]
        ]
        return QueryResponse(
            transcribed_query=query_text,
            answer_text=answer_text,
            audio_url=audio_url,
            tts_fallback=audio_url is None,
            language=payload.language,
            grounded_citations=citations,
        )

    selected_chunks = select_pdf_context_chunks(query_text, chunks, stored_toc)

    if not selected_chunks:
        answer_text = (
            f'The selected PDF ("{doc_title}") does not contain readable text to answer that question.'
        )
        return QueryResponse(
            transcribed_query=query_text,
            answer_text=answer_text,
            audio_url=None,
            tts_fallback=True,
            language=payload.language,
            grounded_citations=[],
        )

    context_str = "\n\n".join(
        f"[Page {c.get('page_number', 1)}]: {c.get('chunk_text', '')}"
        for c in selected_chunks
    )

    history_str = ""
    if payload.conversation_history:
        recent_turns = payload.conversation_history[-6:]
        history_str = "\n".join(
            f"{'Student' if t.sender == 'user' else 'Tutor'}: {t.text}"
            for t in recent_turns
        )

    lang_map = {
        "en": "English",
        "hi": "Hindi (Devanagari script)",
        "gu": "Gujarati (Gujarati script)",
    }
    target_lang = lang_map.get(payload.language, "English")

    answer_text = ""
    if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("mock"):
        candidate_models = []
        for m in [GEMINI_MODEL, "gemini-2.0-flash", "gemini-1.5-flash"]:
            if m and m not in candidate_models:
                candidate_models.append(m)

        specific_chap = parse_specific_chapter_target(query_text)
        chap_instruction = ""
        if specific_chap is not None:
            chap_instruction = (
                f"The student is specifically asking about Chapter {specific_chap}. "
                f"Based ONLY on the provided excerpts from Chapter {specific_chap}, explain clearly and conversationally what Chapter {specific_chap} is about, its key concepts, events, and main ideas. "
                f"Do NOT list all chapters or discuss unrelated parts of the book.\n\n"
            )

        prompt = (
            f"{PDF_ONLY_TUTOR_SYSTEM_PROMPT}\n\n"
            f"Active PDF Title: {doc_title}\n"
            f"Response Language: {target_lang}\n\n"
            f"{chap_instruction}"
            + (f"Recent Conversation Context:\n{history_str}\n\n" if history_str else "")
            + f"Selected PDF Content:\n{context_str}\n\n"
            + f"Student Question: {query_text}"
        )

        for model_name in candidate_models:
            try:
                model = genai.GenerativeModel(model_name)
                response = model.generate_content(prompt)
                candidate_text = (response.text or "").strip()
                if candidate_text:
                    answer_text = candidate_text
                    break
            except Exception as exc:
                print(f"[Gemini Warning ({model_name})] {exc}")

    # Grounded non-hallucinating fallback when Gemini key/quota is unavailable
    if not answer_text:
        specific_chap = parse_specific_chapter_target(query_text)
        if specific_chap is not None and selected_chunks:
            start_p = selected_chunks[0].get("page_number", 1)
            end_p = selected_chunks[-1].get("page_number", start_p)
            first_sent = (selected_chunks[0].get("chunk_text") or "").split(".")[0].strip()
            pts = "\n\n".join(
                f"• (Page {c.get('page_number', 1)}): {c.get('chunk_text', '')[:220].strip()}..."
                for c in selected_chunks[:3]
            )
            answer_text = (
                f'Based on Chapter {specific_chap} (Pages {start_p}–{end_p}) of "{doc_title}":\n\n'
                + (f"Summary: {first_sent}.\n\n" if first_sent else "")
                + f"Key points from this chapter:\n{pts}"
            )
        else:
            ranked_for_fallback = score_chunks(query_text, selected_chunks)
            best = ranked_for_fallback[0]
            is_overview = is_chapter_or_overview_query(query_text)

            if not is_overview and best.get("term_hits", 0) == 0 and not history_str:
                answer_text = (
                    f'The selected PDF ("{doc_title}") does not contain enough information to answer this question.'
                )
            else:
                excerpt = best.get("chunk_text", "")[:460].strip()
                answer_text = (
                    f'Based on "{doc_title}" (Page {best.get("page_number", 1)}):\n\n{excerpt}'
                    + ("..." if len(best.get("chunk_text", "")) > 460 else "")
                )

    audio_url = await generate_gnani_tts(answer_text, payload.language)

    citations = [
        {
            "page": c.get("page_number", 1),
            "relevance_score": max(c.get("relevance_score", 0.5), 0.35),
            "source": doc_title,
            "excerpt": c.get("chunk_text", "")[:160],
        }
        for c in selected_chunks[:2]
    ]

    return QueryResponse(
        transcribed_query=query_text,
        answer_text=answer_text,
        audio_url=audio_url,
        tts_fallback=audio_url is None,
        language=payload.language,
        grounded_citations=citations,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
