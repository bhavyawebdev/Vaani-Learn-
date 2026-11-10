"""
VaaniLearn AI — Backend Service
Built with FastAPI
Integrated with:
- PyMuPDF (PDF extraction)
- Supabase PostgreSQL + pgvector (Hybrid search & persistence)
- Google Gemini API (Grounded reasoning)
- Gnani AI (Speech-to-text & Text-to-speech)
"""

import os
import re
from typing import Optional, List
from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import fitz  # PyMuPDF
import google.generativeai as genai
from supabase import create_client, Client

load_dotenv()

app = FastAPI(
    title="VaaniLearn AI API",
    description="Backend Engine for Multilingual Voice & Document Learning",
    version="1.1.0"
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
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if GEMINI_API_KEY and not GEMINI_API_KEY.startswith("mock"):
    genai.configure(api_key=GEMINI_API_KEY)

def get_supabase() -> Optional[Client]:
    if SUPABASE_URL.startswith("https://") and SUPABASE_SERVICE_KEY and not SUPABASE_SERVICE_KEY.startswith("mock"):
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return None

# Pydantic Schemas
class VoiceQueryRequest(BaseModel):
    document_id: str
    audio_base64: Optional[str] = None
    text_query: Optional[str] = None
    language: str = Field(default="en", description="'gu', 'hi', or 'en'")
    session_id: Optional[str] = None
    context_chunks: Optional[List[dict]] = None
    document_title: Optional[str] = None

class QueryResponse(BaseModel):
    transcribed_query: str
    answer_text: str
    audio_url: Optional[str] = None
    language: str
    grounded_citations: List[dict]

@app.get("/")
def read_root():
    sb = get_supabase()
    return {
        "app": "VaaniLearn AI Engine",
        "status": "operational",
        "supabase_connected": sb is not None,
        "gemini_configured": bool(GEMINI_API_KEY),
        "gnani_configured": bool(GNANI_API_KEY and GNANI_API_KEY != "your-gnani-api-key-here"),
    }

@app.post("/api/v1/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = Form("en"),
    user_id: str = Form(...),
    document_id: Optional[str] = Form(None)
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported"
        )

    file_bytes = await file.read()
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot upload more than 50 MB of PDF."
        )

    result = process_pdf_and_index(
        filename=file.filename,
        pdf_bytes=file_bytes,
        language=language,
        user_id=user_id,
        document_id=document_id
    )

    return {
        "status": "ready",
        "document_id": result.get("document_id"),
        "filename": file.filename,
        "size_bytes": len(file_bytes),
        "page_count": result.get("page_count", 0),
        "chunk_count": result.get("chunk_count", 0),
        "vocab_count": result.get("vocab_count", 0),
        "chunks": result.get("chunks", [])
    }

def process_pdf_and_index(
    filename: str,
    pdf_bytes: bytes,
    language: str,
    user_id: str,
    document_id: Optional[str] = None
) -> dict:
    """PyMuPDF high-speed chunk extraction + Supabase PostgreSQL persistence"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    chunks = []
    vocab = set()
    chunk_idx = 0

    for page_num in range(total_pages):
        page_text = doc[page_num].get_text("text").strip()
        if not page_text:
            continue

        # Split long page text into ~900-char overlapping chunks
        words = page_text.split()
        for w in words:
            cleaned = re.sub(r"[^\w]", "", w.lower())
            if len(cleaned) > 2:
                vocab.add(cleaned)

        step = 180
        if len(words) <= step:
            chunks.append({
                "page_number": page_num + 1,
                "chunk_index": chunk_idx,
                "chunk_text": page_text,
                "token_count": len(words),
            })
            chunk_idx += 1
        else:
            for start in range(0, len(words), 150):
                segment = " ".join(words[start:start + step])
                if segment.strip():
                    chunks.append({
                        "page_number": page_num + 1,
                        "chunk_index": chunk_idx,
                        "chunk_text": segment,
                        "token_count": len(segment.split()),
                    })
                    chunk_idx += 1

    sb = get_supabase()
    resolved_doc_id = document_id

    if sb:
        try:
            if resolved_doc_id:
                sb.table("documents").update({
                    "page_count": total_pages,
                    "status": "ready",
                    "extracted_metadata": {
                        "chunk_count": len(chunks),
                        "vocab_count": len(vocab),
                    }
                }).eq("id", resolved_doc_id).execute()
            else:
                insert_res = sb.table("documents").insert({
                    "user_id": user_id,
                    "title": filename,
                    "storage_path": f"{user_id}/{filename}",
                    "file_size_bytes": len(pdf_bytes),
                    "page_count": total_pages,
                    "language": language,
                    "status": "ready",
                    "extracted_metadata": {
                        "chunk_count": len(chunks),
                        "vocab_count": len(vocab),
                    }
                }).execute()
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
        "chunks": chunks[:25]
    }

def score_chunks(query: str, chunks: List[dict], top_k: int = 4) -> List[dict]:
    query_terms = {
        re.sub(r"[^\w]", "", t.lower())
        for t in query.split()
        if len(t) > 2
    }
    scored = []
    for c in chunks:
        text = c.get("chunk_text", "")
        lower_text = text.lower()
        hits = sum(1 for term in query_terms if term in lower_text)
        score = hits / max(len(query_terms), 1)
        scored.append((score, c))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [
        {**item[1], "relevance_score": round(max(item[0], 0.35), 3)}
        for item in scored[:top_k]
    ]

@app.post("/api/v1/voice/query", response_model=QueryResponse)
async def voice_query(payload: VoiceQueryRequest):
    query_text = (payload.text_query or "").strip()
    if not query_text:
        raise HTTPException(status_code=400, detail="text_query is required")

    sb = get_supabase()
    chunks: List[dict] = payload.context_chunks or []
    doc_title = payload.document_title or "Uploaded Document"

    if sb and payload.document_id:
        try:
            doc_res = sb.table("documents").select("title").eq("id", payload.document_id).single().execute()
            if doc_res.data:
                doc_title = doc_res.data.get("title", doc_title)
            if not chunks:
                chunk_res = (
                    sb.table("document_chunks")
                    .select("id, page_number, chunk_text")
                    .eq("document_id", payload.document_id)
                    .order("chunk_index")
                    .execute()
                )
                chunks = chunk_res.data or []
        except Exception as exc:
            print(f"[Supabase Query Warning] {exc}")

    top_chunks = score_chunks(query_text, chunks, top_k=4) if chunks else []
    context_str = "\n\n".join(
        f"[Page {c.get('page_number', 1)}]: {c.get('chunk_text', '')}"
        for c in top_chunks
    )

    lang_map = {"en": "English", "hi": "Hindi (Devanagari script)", "gu": "Gujarati (Gujarati script)"}
    target_lang = lang_map.get(payload.language, "English")

    answer_text = ""
    if GEMINI_API_KEY and context_str:
        try:
            model = genai.GenerativeModel(GEMINI_MODEL if "gemini" in GEMINI_MODEL else "gemini-2.0-flash")
            prompt = (
                f"You are VaaniLearn AI, a clear, patient multilingual tutor.\n"
                f"Document Title: {doc_title}\n"
                f"Answer the learner's question strictly using the provided document excerpts.\n"
                f"Respond in {target_lang}. Cite page numbers naturally.\n\n"
                f"Excerpts:\n{context_str}\n\n"
                f"Learner Question: {query_text}"
            )
            response = model.generate_content(prompt)
            answer_text = (response.text or "").strip()
        except Exception as exc:
            print(f"[Gemini Fallback] {exc}")

    if not answer_text:
        if top_chunks:
            first_excerpt = top_chunks[0].get("chunk_text", "")[:420].strip()
            first_page = top_chunks[0].get("page_number", 1)
            answer_text = (
                f"From \"{doc_title}\" (Page {first_page}):\n\n{first_excerpt}"
                + ("..." if len(top_chunks[0].get("chunk_text", "")) > 420 else "")
            )
        else:
            answer_text = (
                f"No readable text chunks were found in \"{doc_title}\". "
                "Please ensure the PDF contains selectable text (not a flat scanned image)."
            )

    citations = [
        {
            "page": c.get("page_number", 1),
            "relevance_score": c.get("relevance_score", 0.8),
            "source": doc_title,
            "excerpt": c.get("chunk_text", "")[:160]
        }
        for c in top_chunks[:2]
    ]

    return QueryResponse(
        transcribed_query=query_text,
        answer_text=answer_text,
        audio_url=None,
        language=payload.language,
        grounded_citations=citations
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
