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
    description:
      'Schedule and create a new event on the user\'s Google Calendar. Provide start and end time in ISO format or valid date string.',
    schema: z.object({
      summary: z.string().describe('Title of the event (e.g. "Sync with Design Team")'),
      startTime: z
        .string()
        .describe('Event start time in ISO 8601 format e.g. "2026-11-24T14:00:00+05:30" or "2026-11-24T09:00:00Z"'),
      endTime: z
        .string()
        .describe('Event end time in ISO 8601 format e.g. "2026-11-24T15:00:00+05:30" or "2026-11-24T10:00:00Z"'),
      description: z.string().optional().describe('Details or agenda of the meeting'),
      location: z.string().optional().describe('Physical address or conference room'),
      attendees: z
        .array(z.string().email())
        .optional()
        .describe('List of attendee email addresses to invite'),
    }),
    func: async ({ summary, startTime, endTime, description, location, attendees }) => {
      if (error || !client) {
        return error || 'Google Calendar is not connected. Please connect your Google account in the Integrations page.';
      }
      try {
        const calendar = google.calendar({ version: 'v3', auth: client });

        const requestBody = {
          summary,
          description: description || undefined,
          location: location || undefined,
          start: {
            dateTime: new Date(startTime).toISOString(),
          },
          end: {
            dateTime: new Date(endTime).toISOString(),
          },
          attendees: attendees && attendees.length > 0
            ? attendees.map((email) => ({ email }))
            : undefined,
        };

        const res = await calendar.events.insert({
          calendarId: 'primary',
          requestBody,
        });

        return `Calendar event scheduled successfully!\n• Title: ${res.data.summary}\n• Start: ${res.data.start?.dateTime || res.data.start?.date}\n• End: ${res.data.end?.dateTime || res.data.end?.date}\n• Event Link: ${res.data.htmlLink}\n• Event ID: ${res.data.id}`;
      } catch (err) {
        return `Failed to create calendar event: ${err.message || err}`;
      }
    },
  });

  const calendarDeleteEventTool = new DynamicStructuredTool({
    name: 'calendar_delete_event',
    description: 'Delete an event from the user\'s Google Calendar by its eventId.',
    schema: z.object({
      eventId: z.string().describe('The ID of the calendar event to delete'),
    }),
    func: async ({ eventId }) => {
      if (error || !client) {
        return error || 'Google Calendar is not connected.';
      }
      try {
        const calendar = google.calendar({ version: 'v3', auth: client });
        await calendar.events.delete({
          calendarId: 'primary',
          eventId,
        });

        return `Event with ID "${eventId}" has been successfully deleted from your calendar.`;
      } catch (err) {
        return `Failed to delete calendar event: ${err.message || err}`;
      }
    },
  });

  return [calendarListEventsTool, calendarCreateEventTool, calendarDeleteEventTool];
};
