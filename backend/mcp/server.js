import { McpServer } from '@modelcontextprotocol/server';
import {
  serveStdio,
  StdioServerTransport,
} from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from "node:url"
import path from "node:path"
import jwt from "jsonwebtoken"
const _fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(_fileName)
dotenv.config({
  path: path.resolve(dirName, "../.env")
});
import { TavilySearch } from '@langchain/tavily';
import connectDb from '../config/db.js';
import Integration from '../models/integration.model.js';
import { decrypt } from '../config/crypt.js';
import { googleOAuthclient } from '../config/googleOAuth.js';
const server = new McpServer({
  name: 'agent-builder',
  version: '1.0.0',
});

const verifyAuthToken=(token)=>{
  const payload=jwt.verify(token,process.env.MCP_AUTH_SECRET, {
    algorithms: ["HS256"],
    issuer:"automate-backend",
    audience: "automate-mcp"
  })

  return payload.sub
}

const getGoogleOauthClient = async(userId, requiredService) => {
  await connectDb()
  const integration = await Integration.findOne({
    userId,
    provider:"google",
    services: requiredService,
    status:"connected"
  }).select("+tokens.refreshToken")
  if(!integration || !integration.tokens?.refreshToken){
    throw new Error(`Google ${requiredService} is not connected or its refresh token is unavailable.`)
  }

  const refresh_token = decrypt(integration?.tokens?.refreshToken)
  const oauthClient = googleOAuthclient.setCredentials(refresh_token)
  return oauthClient
}


if(!process.env.TAVILY_API_KEY){
  throw new Error(
    "TAVILY_API_KEY missing."
  )
}

const tavilySearch = new TavilySearch({
  tavilyApiKey: process.env.TAVILY_API_KEY,
  maxResults: 4,
  topic: 'general',
});

server.registerTool(
  'web_search_tool',
  {
    description: 'Search the web for current information',
    inputSchema: z.object({
      query: z.string(),
    }),
  },
  async ({ query }) => {
    try {
      const result = await tavilySearch.invoke({ query });

      // If no results or an error occurred
      if (!result?.results || result.results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No relevant search results found.' }],
        };
      }
      // Take only the top 2 results and keep the text concise
      const cleanOutput = result.results
        .slice(0, 2)
        .map((item, idx) => (
          `[Source ${idx + 1}]: ${item.title}\nURL: ${item.url}\nContent: ${item.content.slice(0, 350)}`
        ))
        .join('\n\n');
      return {
        content: [
          {
            type: 'text',
            text: cleanOutput, // ✅ Clean plain text (~250-300 tokens total)
          },
        ],
      };
    } catch (error) {
      console.log(error);
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

server.registerTool(
  'send_email',
  {
    description: "send an email through the authenticated user's connected gmail account. Only execute after user approval",
    inputSchema: z.object({
      authToken: z.string().min(1),
      to: z.string().email(),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(2000),

    }),
  },
  async ({authToken, to, subject, body }) => {
    try {
      const userId = verifyAuthToken(authToken)
      const oauthClient= await getGoogleOauthClient(userId, "gmail")
      const gmail = google.gmail({
        version:"v1",
        auth: oauthClient,
      })

    } catch (error) {
      console.log(error);
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('mcp is connected');
};

main().catch(error => {
  console.log('mcp server error', error);
  process.exit(1);
});
