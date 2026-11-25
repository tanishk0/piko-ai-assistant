export const TOOL_NAMES = ['web_search', 'calculator', 'gmail_read', 'gmail_get_email_details', 'gmail_send', 'calendar_list_events', 'calendar_create_event', 'calendar_delete_event', 'instagram_get_profile', 'instagram_get_recent_posts', 'instagram_publish_photo'];
export const WRITE_TOOLS = new Set(['gmail_send', 'calendar_create_event', 'calendar_delete_event', 'instagram_publish_photo']);
export const DEFAULT_TOOLS = ['web_search', 'calculator'];

export function allowedToolNames(agent, integrations) {
  return (agent.tools || []).filter(name => {
    if (!TOOL_NAMES.includes(name)) return false;
    if (DEFAULT_TOOLS.includes(name)) return true;
    const google = integrations.find(i => i.provider === 'google' && i.status === 'connected');
    const scopes = google?.scopes || [];
    const hasScope = names => names.some(s => scopes.includes(`https://www.googleapis.com/auth/${s}`));
    if (name.startsWith('gmail_')) return google?.services?.includes('gmail') && (scopes.includes('https://mail.google.com/') || hasScope(name === 'gmail_send' ? ['gmail.send', 'gmail.modify'] : name === 'gmail_read' ? ['gmail.readonly', 'gmail.modify', 'gmail.metadata'] : ['gmail.readonly', 'gmail.modify']));
    if (name.startsWith('calendar_')) return google?.services?.some(s => ['google_calendar', 'google_calender'].includes(s)) && hasScope(name === 'calendar_list_events' ? ['calendar', 'calendar.readonly', 'calendar.events', 'calendar.events.readonly', 'calendar.events.owned', 'calendar.events.owned.readonly'] : ['calendar', 'calendar.events', 'calendar.events.owned']);
    const instagram = integrations.find(i => i.provider === 'instagram' && i.status === 'connected');
    return name.startsWith('instagram_') && instagram?.services?.includes('instagram') && (!instagram.tokens?.expiresAt || new Date(instagram.tokens.expiresAt) > new Date()) && (name !== 'instagram_publish_photo' || instagram.scopes?.includes('instagram_content_publish'));
  });
}

export function toolError(error) {
  const status = Number(error.response?.status || error.code || error.status);
  return { ok: false, error: { code: status === 401 || status === 403 ? 'AUTH_REQUIRED' : error.name === 'ZodError' ? 'INVALID_ARGUMENTS' : 'TOOL_FAILED', message: error.response?.data?.error?.message || error.message || 'Tool failed', retryable: status === 429 || status >= 500 } };
}
