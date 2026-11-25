import { DynamicStructuredTool } from '@langchain/core/tools';
import z from 'zod';
import Integration from '../models/integration.model.js';
import { getMcpTools } from '../mcp/lg-mcp.js';
import { createGmailTools } from './gmail.tools.js';
import { createCalendarTools } from './calendar.tools.js';
import { createInstagramTools } from './instagram.tools.js';
import { allowedToolNames } from '../utils/toolPolicy.js';
import { calculate } from '../utils/calculator.js';

export async function createTools(agent, userId, options = {}) {
  const integrations = await Integration.find({ userId, status: 'connected' }).select('provider services scopes status tokens.expiresAt');
  const allowed = new Set(allowedToolNames(agent, integrations));
  const tools = [];
  if (allowed.has('calculator')) tools.push(new DynamicStructuredTool({ name: 'calculator', description: 'Evaluate arithmetic including scientific notation, parentheses and exponents (^ or **).', schema: z.object({ expression: z.string().min(1).max(512) }), func: async ({ expression }) => String(calculate(expression)) }));
  if (allowed.has('web_search')) {
    try {
      const search = (await getMcpTools()).find(t => ['automate_web_search_tool', 'web_search_tool', 'web_search', 'automate_web_search'].includes(t.name));
      if (search) tools.push(new DynamicStructuredTool({ name: 'web_search', description: 'Search current information. Results include source URLs.', schema: z.object({ query: z.string().trim().min(1).max(1000) }), func: async ({ query }, config) => {
        const result = await search.invoke({ query }, config);
        if (result?.isError) throw new Error('Web search failed.');
        return typeof result === 'string' ? result : JSON.stringify(result);
      } }));
    } catch (error) { console.error('Web search unavailable:', error.message); }
  }
  if ([...allowed].some(n => n.startsWith('gmail_'))) tools.push(...await createGmailTools(userId));
  if ([...allowed].some(n => n.startsWith('calendar_'))) tools.push(...await createCalendarTools(userId));
  if ([...allowed].some(n => n.startsWith('instagram_'))) tools.push(...await createInstagramTools(userId, options));
  return tools.filter(t => allowed.has(t.name));
}
