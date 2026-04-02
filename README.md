# ClipFrom

AI-powered platform converting articles into short-form vertical videos.

## What It Does

Article URL → AI extracts text → AI generates image → AI renders video → Downloads MP4

**Input**: URL to any article
**Output**: 30-60 second vertical video (9:16)
**Time**: ~1-2 minutes
**Cost**: ~$0.20 per video

## Stack

- **Frontend**: Lovable (React)
- **Database**: Supabase (PostgreSQL)
- **Orchestration**: n8n (workflows)
- **Video**: Kling AI 3.0
- **Video Stitching**: Fal.ai
- **Audio**: ElevenLabs

## Quick Start

1. Clone: `git clone https://github.com/yourusername/clipfrom.git`
2. Install: `npm install`
3. Configure: Copy `.env.example` → `.env.local`, add your API keys
4. Start: `npm run dev`

## Project Structure

```
clipfrom/
├── frontend/          # Lovable React app
├── n8n-workflows/     # n8n workflow exports (JSON)
├── supabase/          # Database schema
├── docs/              # Documentation
└── .env.example       # Copy to .env.local
```

## Current Status

✅ Core pipeline working
✅ Metadata propagation fixed
✅ Kling AI 3.0 integration
✅ GitHub repository
🚧 Next: Batch processing, YouTube upload

## Known Issues

- Metadata: Merge node must be in "Merge" mode with "Fields to Match" = `project_id`
- Polling: Workflow runs every 2 minutes

## Docs

- [Architecture](./docs/ARCHITECTURE.md) - How it all fits together
- [Debugging](./docs/DEBUGGING.md) - Common issues & fixes
- [Setup](./docs/SETUP.md) - Detailed setup instructions
