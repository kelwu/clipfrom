# ClipFrom Setup Guide

## Prerequisites

- Node.js 16+ and npm
- Git installed
- GitHub account
- API keys for: OpenAI, ElevenLabs, Kling AI
- Supabase account
- n8n instance (self-hosted or cloud)

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/clipfrom.git
cd clipfrom
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Update `.env.local` with your API keys:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key
OPENAI_API_KEY=sk-xxxx
ELEVENLABS_API_KEY=xxxx
KLING_API_KEY=xxxx
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/xxxx
```

## Step 4: Set Up Supabase Database

1. Create a new Supabase project
2. Create the required tables:
   - `projects` - Project metadata
   - `videos` - Video processing records
   - `assets` - Generated images and audio

3. Set up Row-Level Security (RLS) policies
4. Update SUPABASE_URL and SUPABASE_ANON_KEY in `.env.local`

## Step 5: Configure n8n Workflow

1. Export workflow from `n8n-workflows/` directory
2. Import into your n8n instance
3. Configure webhook URL in n8n
4. Set environment variables in n8n
5. Enable workflow and set polling schedule

## Step 6: Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Step 7: Test the Pipeline

1. Open the web interface
2. Enter an article URL
3. Monitor progress in n8n workflow
4. Verify video output in downloads folder

## API Key Setup Details

### OpenAI
1. Go to https://platform.openai.com/account/api-keys
2. Create new API key
3. Copy to OPENAI_API_KEY in `.env.local`

### ElevenLabs
1. Sign up at https://www.elevenlabs.io
2. Go to API settings
3. Copy API key to ELEVENLABS_API_KEY

### Kling AI
1. Register at https://klingai.com
2. Navigate to API keys section
3. Copy to KLING_API_KEY

### Supabase
1. Create project at https://supabase.com
2. Copy Project URL to SUPABASE_URL
3. Copy Anon Key to SUPABASE_ANON_KEY

## Troubleshooting

### Common Setup Issues

**Port Already in Use**
```bash
# Use custom port
npm run dev -- --port 3001
```

**Dependencies Installation Fails**
```bash
# Clear npm cache
npm cache clean --force
npm install
```

**Database Connection Error**
- Verify SUPABASE_URL is correct
- Check SUPABASE_ANON_KEY matches your project
- Ensure your IP is not blocked by Supabase firewall

**n8n Webhook Not Working**
- Verify N8N_WEBHOOK_URL is accessible
- Check n8n instance is running
- Review n8n logs for webhook errors

## Next Steps

1. Customize frontend design in `frontend/`
2. Add batch processing support
3. Implement YouTube auto-upload
4. Set up monitoring and analytics
5. Deploy to production

## Support

For issues and questions, refer to:
- [Debugging Guide](./DEBUGGING.md)
- [Architecture Overview](./ARCHITECTURE.md)
- GitHub Issues in the repository
