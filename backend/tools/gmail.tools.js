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
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });

        const headers = res.data.payload?.headers || [];
        const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find((h) => h.name === 'From')?.value || 'Unknown Sender';
        const to = headers.find((h) => h.name === 'To')?.value || 'Unknown Recipient';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        // Extract body text
        let body = '';
        const payload = res.data.payload;
        if (payload?.body?.data) {
          body = Buffer.from(payload.body.data, 'base64').toString('utf8');
        } else if (payload?.parts) {
          const textPart = payload.parts.find((p) => p.mimeType === 'text/plain') || payload.parts[0];
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
          }
        }

        if (!body) {
          body = res.data.snippet || 'No readable text body found.';
        }

        return `Email Details:\nFrom: ${from}\nTo: ${to}\nDate: ${date}\nSubject: ${subject}\n\nBody:\n${body.slice(0, 3000)}`;
      } catch (err) {
        return `Failed to fetch email details for ID ${messageId}: ${err.message || err}`;
      }
    },
  });

  const gmailSendTool = new DynamicStructuredTool({
    name: 'gmail_send',
    description: 'Send an email to a recipient from the user\'s connected Gmail account.',
    schema: z.object({
      to: z.string().email().describe('Recipient email address'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Email text body'),
      cc: z.string().optional().describe('Optional CC email address'),
    }),
    func: async ({ to, subject, body, cc }) => {
      if (error || !client) {
        return error || 'Gmail is not connected. Please connect your Google account in the Integrations page.';
      }
      try {
        const gmail = google.gmail({ version: 'v1', auth: client });
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

        const messageLines = [
          `To: ${to}`,
          ...(cc ? [`Cc: ${cc}`] : []),
          'Content-Type: text/plain; charset=utf-8',
          'MIME-Version: 1.0',
          `Subject: ${utf8Subject}`,
          '',
          body,
        ];

        const rawMessage = messageLines.join('\r\n');
        const encodedMessage = Buffer.from(rawMessage)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const sendRes = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encodedMessage },
        });

        return `Email successfully sent!\nTo: ${to}\nSubject: ${subject}\nMessage ID: ${sendRes.data.id}`;
      } catch (err) {
        return `Failed to send email: ${err.message || err}`;
      }
    },
  });

  return [gmailReadTool, gmailGetDetailsTool, gmailSendTool];
};
