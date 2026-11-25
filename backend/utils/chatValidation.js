import z from 'zod';

const timeZone = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Invalid timezone');
export const chatInput = z.object({
  message: z.string().trim().min(1).max(12000),
  requestId: z.string().uuid(),
  conversationId: z.string().uuid(),
  timeZone: timeZone.default('UTC'),
  agentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
}).strict();
export const approvalInput = z.object({
  conversationId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
}).strict();
