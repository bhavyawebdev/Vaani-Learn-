# VaaniLearn AI — Multilingual Voice & Document Learning Platform

Official implementation of **VaaniLearn AI** built from the design mockups (`landingpage.png`, `Login.png`, `signup.png`, `Logo.png`) and technical specification in `Vaanitrd.md`.

---

## 🛠️ Complete Technical Stack

| Tier | Technology | Specification / Role |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite + TypeScript | High-performance SPA with client routing & audio scrubber |
| **Styling** | Tailwind CSS | Pixel-accurate reproduction of editorial monochrome UI |
| **Backend** | Python 3.14 + FastAPI | High-concurrency async REST API |
| **Background Processing** | FastAPI `BackgroundTasks` | Async PDF parsing & vectorization pipelines |
| **PDF Extraction** | PyMuPDF (`fitz`) | Ultra-fast document chunking & layout extraction |
| **Database** | Supabase PostgreSQL | Relational storage for profiles, documents, notes, quizzes |
| **Vector Search** | `pgvector` (HNSW) | 768-dim cosine similarity search for document grounding |
| **Authentication** | Supabase Auth | Email/password & Google OAuth with Row-Level Security (RLS) |
| **File Storage** | Supabase Storage | Encrypted PDF bucket (`study-materials`) |
| **AI Reasoning** | Google Gemini API (Free Tier) | `gemini-2.0-flash` for grounded conversational reasoning |
| **Speech-to-Text** | Gnani Prisma (Credits) | Real-time Indian & Indic multilingual speech recognition |
| **Text-to-Speech** | Gnani Timbre (Credits) | Natural neural voice synthesis (Gujarati, Hindi, English) |
| **API Testing** | Postman / Bruno | Collection included in `backend/bruno_collection.json` |
| **IDE / VCS** | VS Code & GitHub | Version controlled repository structure |

---

## 🚀 Quick Start Guide

### 1. Run the Frontend (React + Vite + TypeScript)

```bash
cd "D:\Vaanileaarn ai\frontend"
npm install
npm run dev
```

Open your browser at `http://localhost:5173`. You can explore:
- **Landing Page**: Turn your knowledge into a conversation (`landingpage.png`)
- **Login Page**: Welcome back (`Login.png`)
- **Sign Up Page**: Start learning differently (`signup.png`)
- **Interactive AI Classroom**: The live hero dashboard with Indian History PDF, voice waveform, Gujarati/Hindi/English query responses, and audio playback.
- **Database Schema Inspector**: View the live SQL schema and architecture mappings.

### 2. Run the Backend (Python + FastAPI + PyMuPDF)

```bash
cd "D:\Vaanileaarn ai\backend"
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Install dependencies:
pip install -r requirements.txt
# Run the FastAPI server:
uvicorn main:app --reload --port 8000
```

Interactive API docs will be live at `http://localhost:8000/docs`.

### 3. Deploy the Supabase Database Schema

1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Open and paste `backend/supabase_schema.sql`.
3. Click **Run**. This will:
   - Enable `pgvector`
   - Create tables: `profiles`, `documents`, `document_chunks`, `voice_sessions`, `chat_messages`, `smart_notes`, `quizzes`, `revision_cards`.
   - Setup HNSW cosine distance vector indexes.
   - Install the `match_document_chunks()` stored procedure.

---

## 📁 Repository Structure

```
D:\Vaanileaarn ai\
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.tsx           # Exact match of landingpage.png
│   │   │   ├── LoginPage.tsx             # Exact match of Login.png
│   │   │   ├── SignUpPage.tsx            # Exact match of signup.png
│   │   │   ├── Logo.tsx                  # Exact SVG emblem from Logo.png
│   │   │   ├── Navbar.tsx                # Sticky navbar with screen switcher
│   │   │   ├── InteractiveAppDashboard.tsx # Live AI Tutor & Voice Classroom
│   │   │   └── DatabaseArchitectureModal.tsx # Schema & Tech Stack Viewer
│   │   ├── App.tsx                       # Seamless navigation & screen tabs
│   │   ├── index.css                     # Tailwind design tokens & soundwave keyframes
│   │   └── main.tsx
│   ├── public/                           # PNG assets and logos
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/
│   ├── main.py                           # FastAPI application endpoints
│   ├── supabase_schema.sql               # PostgreSQL + pgvector schema
│   ├── requirements.txt                  # Python dependencies
│   └── bruno_collection.json             # API collection for Bruno & Postman
├── Vaanitrd.md                           # Tech stack specifications
├── landingpage.png                       # Reference mockup
├── Login.png                             # Reference mockup
├── signup.png                            # Reference mockup
└── Logo.png                              # Reference emblem
```

