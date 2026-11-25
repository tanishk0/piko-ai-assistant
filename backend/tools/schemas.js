import z from 'zod';

export const emailAddress = z.string().email().max(254).regex(/^[^\r\n]*$/, 'Headers cannot contain newlines');
export const sendEmailSchema = z.object({
  to: emailAddress,
  cc: z.array(emailAddress).max(20).optional(),
  subject: z.string().regex(/^[^\r\n]*$/, 'Headers cannot contain newlines').trim().min(1).max(200),
  body: z.string().min(1).max(10000),
}).strict();
export const timestamp = z.iso.datetime({ offset: true });
export const createEventSchema = z.object({
  summary: z.string().trim().min(1).max(200),
  startTime: timestamp,
  endTime: timestamp,
  description: z.string().max(4000).optional(),
  location: z.string().max(500).optional(),
  attendees: z.array(emailAddress).max(50).optional(),
}).strict().refine(args => Date.parse(args.endTime) > Date.parse(args.startTime), 'End must be after start');
