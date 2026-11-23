import { DynamicStructuredTool } from '@langchain/core/tools';
import { google } from 'googleapis';
import z from 'zod';
import { getGoogleAuthClient } from './googleAuth.helper.js';

export const createCalendarTools = async (userId) => {
  const { client, error } = await getGoogleAuthClient(userId);

  const calendarListEventsTool = new DynamicStructuredTool({
    name: 'calendar_list_events',
    description:
      'List upcoming events from the user\'s Google Calendar. Can filter by time range or search query.',
    schema: z.object({
      timeMin: z
        .string()
        .optional()
        .describe('Start of time window in ISO format (e.g. "2026-11-23T00:00:00Z"). Defaults to now.'),
      timeMax: z
        .string()
        .optional()
        .describe('End of time window in ISO format (e.g. "2026-11-30T23:59:59Z"). Defaults to 7 days from now.'),
      query: z
        .string()
        .optional()
        .describe('Search query keyword to match in event titles or descriptions'),
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of events to return (1-20)'),
    }),
    func: async ({ timeMin, timeMax, query, maxResults = 10 }) => {
      if (error || !client) {
        return error || 'Google Calendar is not connected. Please connect your Google account in the Integrations page.';
      }
      try {
        const calendar = google.calendar({ version: 'v3', auth: client });
        const now = new Date();
        const defaultMin = now.toISOString();
        const defaultMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const res = await calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin || defaultMin,
          timeMax: timeMax || defaultMax,
          q: query || undefined,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: Math.min(Math.max(maxResults, 1), 20),
        });

        const events = res.data.items || [];
        if (events.length === 0) {
          return query
            ? `No calendar events found matching "${query}".`
            : 'No upcoming calendar events found for the specified period.';
        }

        const formatted = events.map((event) => {
          const start = event.start?.dateTime || event.start?.date || 'No start time';
          const end = event.end?.dateTime || event.end?.date || 'No end time';
          const summary = event.summary || '(Untitled Event)';
          const location = event.location ? `\n  Location: ${event.location}` : '';
          const meetLink = event.hangoutLink ? `\n  Meet Link: ${event.hangoutLink}` : '';
          const desc = event.description ? `\n  Description: ${event.description.slice(0, 150)}` : '';

          return `• ${summary}\n  Start: ${start}\n  End: ${end}\n  Event ID: ${event.id}${location}${meetLink}${desc}`;
        });

        return `Found ${events.length} event(s):\n\n${formatted.join('\n\n')}`;
      } catch (err) {
        return `Failed to list calendar events: ${err.message || err}`;
      }
    },
  });

  const calendarCreateEventTool = new DynamicStructuredTool({
    name: 'calendar_create_event',
