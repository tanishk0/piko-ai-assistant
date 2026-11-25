import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { TavilySearch } from '@langchain/tavily';

// stdout is reserved exclusively for MCP protocol frames.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const server = new McpServer({ name: 'agent-builder', version: '1.0.0' });
const search = new TavilySearch({ tavilyApiKey: process.env.TAVILY_API_KEY, maxResults: 4, topic: 'general' });
server.registerTool('web_search_tool', {
  description: 'Search current information and return source URLs.',
  inputSchema: z.object({ query: z.string().trim().min(1).max(1000) }),
}, async ({ query }) => {
  try {
    const result = await search.invoke({ query }, { signal: AbortSignal.timeout(20000) });
    if (result.error) throw new Error(result.error);
    return { content: [{ type: 'text', text: JSON.stringify({ results: (result.results || []).map(item => ({ title: item.title, url: item.url, content: item.content?.slice(0, 700) })) }) }] };
  } catch (error) {
    console.error('Web search failed:', error.message);
    return { isError: true, content: [{ type: 'text', text: 'Web search failed. Try again later.' }] };
  }
});
server.connect(new StdioServerTransport()).catch(error => { console.error('MCP startup failed:', error.message); process.exitCode = 1; });
