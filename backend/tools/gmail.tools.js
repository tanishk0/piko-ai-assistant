import { DynamicStructuredTool } from '@langchain/core/tools';
import { google } from 'googleapis';
import z from 'zod';
import { getGoogleAuthClient } from './googleAuth.helper.js';

export const createGmailTools = async (userId) => {
  const { client, error } = await getGoogleAuthClient(userId);

  const gmailReadTool = new DynamicStructuredTool({
    name: 'gmail_read',
    description:
      'Search and list emails from the user\'s connected Gmail account. Use query operators like "is:unread", "from:user@domain.com", or general search keywords.',
    schema: z.object({
      query: z
        .string()
        .optional()
        .default('')
        .describe('Gmail search filter e.g. "is:unread", "subject:meeting", or keywords'),
      maxResults: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of emails to retrieve (1 to 10)'),
    }),
    func: async ({ query = '', maxResults = 5 }) => {
      if (error || !client) {
        return error || 'Gmail is not connected. Please connect your Google account in the Integrations page.';
      }
      try {
        const gmail = google.gmail({ version: 'v1', auth: client });
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          maxResults: Math.min(Math.max(maxResults, 1), 10),
          q: query,
        });

        const messages = listRes.data.messages || [];
        if (messages.length === 0) {
          return query
            ? `No emails found matching query: "${query}".`
            : 'No recent emails found in your inbox.';
        }

        const summaries = [];
        for (const m of messages) {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: m.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date', 'To'],
            });
            const headers = detail.data.payload?.headers || [];
            const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
            const from = headers.find((h) => h.name === 'From')?.value || 'Unknown Sender';
            const date = headers.find((h) => h.name === 'Date')?.value || '';
            const snippet = detail.data.snippet || '';
            summaries.push(
              `• Message ID: ${m.id}\n  From: ${from}\n  Subject: ${subject}\n  Date: ${date}\n  Snippet: ${snippet}`
            );
          } catch (innerErr) {
            console.error(`Failed to read email ${m.id}:`, innerErr);
          }
        }

        return `Found ${summaries.length} email(s):\n\n${summaries.join('\n\n')}`;
      } catch (err) {
        return `Failed to read Gmail messages: ${err.message || err}`;
      }
    },
  });

  const gmailGetDetailsTool = new DynamicStructuredTool({
    name: 'gmail_get_email_details',
    description: 'Fetch the full content, subject, sender, and body of a specific email using its messageId.',
    schema: z.object({
      messageId: z.string().describe('The ID of the Gmail message to inspect'),
    }),
    func: async ({ messageId }) => {
      if (error || !client) {
        return error || 'Gmail is not connected.';
      }
      try {
        const gmail = google.gmail({ version: 'v1', auth: client });
