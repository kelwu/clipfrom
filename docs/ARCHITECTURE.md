# ClipFrom Architecture

## System Overview

ClipFrom is a workflow-driven system that converts articles into short-form vertical videos through a series of integrated services.

## Data Flow

1. **Input**: User provides article URL
2. **Extraction**: AI extracts key content and metadata from article
3. **Generation**:
   - DALL-E generates supporting images
   - ElevenLabs creates voiceover audio
4. **Rendering**: Kling AI 3.0 renders final video
5. **Output**: MP4 file in 9:16 vertical format

## Components

### Frontend (Lovable/React)
- Web interface for article URL input
- Progress tracking and video preview
- Download management

### Backend (n8n)
- Workflow orchestration
- API integration and coordination
- Data transformation between services

### Database (Supabase/PostgreSQL)
- Project metadata storage
- Video processing status
- Asset management

### External APIs
- **DALL-E**: Image generation
- **ElevenLabs**: Text-to-speech conversion
- **Kling AI**: Video rendering
- **OpenAI**: Content extraction and optimization

## Deployment

- Frontend: Deployed through Lovable
- n8n: Self-hosted or cloud instance
- Database: Supabase cloud
- API Keys: Environment variables

## Performance Considerations

- Processing time: 1-2 minutes per video
- Concurrent processing: Limited by API rate limits
- Cost optimization: Batch processing for multiple videos

## Security

- API keys stored in environment variables
- Database access restricted to authenticated users
- Workflow authorization via webhook tokens
