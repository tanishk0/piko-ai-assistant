import {McpServer} from '@modelcontextprotocol/server';
import {
  serveStdio,
  StdioServerTransport,
} from '@modelcontextprotocol/server/stdio';
import {z} from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from "node:url"
import path from "node:path"
const _fileName=fileURLToPath(import.meta.url);
const dirName=path.dirname(_fileName)
dotenv.config ({
  path: path.resolve(dirName, "../.env")
});
import {TavilySearch} from '@langchain/tavily';
const server = new McpServer ({
  name: 'agent-builder',
  version: '1.0.0',
});

const tavilySearch = new TavilySearch ({
  tavilyApiKey: process.env.TAVILY_API_KEY,
  maxResults: 2,
  topic: 'general',
});

server.registerTool (
  'web_search_tool',
  {
    description: 'Search the web for current information',
    inputSchema: z.object ({
      query: z.string (),
    }),
  },
  async ({query}) => {
    try {
      const result = await tavilySearch.invoke ({query});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      console.log (error);
      return {
        content: [
          {
            type: 'text',
            text: 'web search failed',
          },
        ],
      };
    }
  }
);

const main = async () => {
  const transport = new StdioServerTransport ();
  await server.connect (transport);
  console.log ('mcp is connected');
};

main ().catch (error => {
  console.log ('mcp server error', error);
  process.exit (1);
});
