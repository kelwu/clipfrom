# ClipFrom Debugging Guide

## Common Issues & Solutions

### Metadata Propagation Issues

**Problem**: Metadata not passing through n8n workflow

**Solution**:
- Ensure the Merge node is set to "Merge" mode (not "Append")
- Set "Fields to Match" to `project_id`
- Verify input data contains the project_id field
- Check merge node configuration matches workflow documentation

### API Key Errors

**Problem**: 401 Unauthorized or invalid API key errors

**Solutions**:
1. Verify all API keys are correctly set in `.env.local`
2. Check key formats match service requirements
3. Ensure keys have not expired
4. Confirm rate limits have not been exceeded

### Video Rendering Failures

**Problem**: Kling AI video generation fails

**Solutions**:
- Check video specifications (resolution: 1080x1920, format: MP4)
- Verify input audio and image files exist
- Review Kling API documentation for supported formats
- Check API quota and rate limits

### Workflow Polling Issues

**Problem**: n8n workflow not triggering on schedule

**Solutions**:
- Verify polling interval set correctly (default: every 2 minutes)
- Check workflow is enabled and active
- Review n8n execution logs for errors
- Ensure webhook URLs are accessible

### Database Connection Issues

**Problem**: Cannot connect to Supabase database

**Solutions**:
- Verify SUPABASE_URL and SUPABASE_ANON_KEY in environment
- Check network connectivity to Supabase
- Review Supabase dashboard for service status
- Ensure database row-level security policies allow access

## Debugging Tools

### n8n Debugger
- Use workflow editor debug mode
- Enable step-by-step execution
- Review node execution logs
- Check data transformation between nodes

### Browser Console
- Check frontend errors in Chrome DevTools
- Monitor API requests in Network tab
- Review application logs

### Database Inspection
- Use Supabase SQL editor for direct queries
- Check table structure and permissions
- Monitor database activity logs

## Logs & Monitoring

- n8n logs: Check workflow execution history
- Application logs: Browser console and server logs
- API logs: Service-specific dashboards (OpenAI, ElevenLabs, Kling)

## Support Resources

- [n8n Documentation](https://docs.n8n.io)
- [Supabase Documentation](https://supabase.io/docs)
- [Lovable Documentation](https://lovable.dev)
