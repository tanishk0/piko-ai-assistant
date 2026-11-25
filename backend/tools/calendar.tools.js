import { DynamicStructuredTool } from '@langchain/core/tools';
import { google } from 'googleapis';
import z from 'zod';
import { getGoogleAuthClient } from './googleAuth.helper.js';
import { createEventSchema, timestamp } from './schemas.js';

export async function createCalendarTools(userId) {
  const { client, error } = await getGoogleAuthClient(userId);
  if (error || !client) return [];
  const calendar = google.calendar({ version: 'v3', auth: client });
  const options = config => ({ timeout: 15000, retry: false, signal: config?.signal });
  return [
    new DynamicStructuredTool({
      name: 'calendar_list_events', description: 'List calendar events. Defaults to the next seven days. Follow nextPageToken for additional results.',
      schema: z.object({ timeMin: timestamp.optional(), timeMax: timestamp.optional(), query: z.string().max(1000).optional(), maxResults: z.number().int().min(1).max(20).default(10), pageToken: z.string().max(1000).optional() })
        .refine(args => !args.timeMin || !args.timeMax || Date.parse(args.timeMax) > Date.parse(args.timeMin), 'End must be after start'),
      func: async ({ timeMin, timeMax, query, maxResults, pageToken }, config) => {
        const start = timeMin || new Date().toISOString();
        const end = timeMax || new Date(Date.parse(start) + 7 * 86400000).toISOString();
        if (Date.parse(end) <= Date.parse(start)) throw new Error('End must be after start.');
        const response = await calendar.events.list({ calendarId: 'primary', timeMin: start, timeMax: end, q: query, maxResults, pageToken, singleEvents: true, orderBy: 'startTime' }, options(config));
        return { events: (response.data.items || []).map(event => ({ id: event.id, summary: event.summary || '(Untitled Event)', start: event.start, end: event.end, location: event.location, meetLink: event.hangoutLink })), nextPageToken: response.data.nextPageToken || null };
      },
    }),
    new DynamicStructuredTool({
      name: 'calendar_create_event', description: 'Propose an event with explicit UTC offsets. Invites attendees after UI approval.', schema: createEventSchema,
      func: async ({ summary, startTime, endTime, description, location, attendees }, config) => {
        const response = await calendar.events.insert({ calendarId: 'primary', sendUpdates: attendees?.length ? 'all' : 'none', requestBody: { summary, description, location, start: { dateTime: startTime }, end: { dateTime: endTime }, attendees: attendees?.map(email => ({ email })) } }, options(config));
        return { eventId: response.data.id, summary: response.data.summary, start: response.data.start, end: response.data.end, url: response.data.htmlLink };
      },
    }),
    new DynamicStructuredTool({
      name: 'calendar_delete_event', description: 'Propose deleting the exact eventId. Requires UI approval.', schema: z.object({ eventId: z.string().min(1).max(1024), eventTitle: z.string().min(1).max(200).describe('Title from a calendar lookup, shown to the user for approval') }),
      func: async ({ eventId, eventTitle }, config) => {
        const current = await calendar.events.get({ calendarId: 'primary', eventId }, options(config));
        if ((current.data.summary || '(Untitled Event)') !== eventTitle) throw Object.assign(new Error('Event title changed or does not match the approved proposal. Request a new proposal.'), { beforeExecution: true });
        await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' }, options(config));
        return { deleted: true, eventId };
      },
    }),
  ];
}
