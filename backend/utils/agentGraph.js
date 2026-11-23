import { ChatGroq } from '@langchain/groq';
import {
  StateGraph,
  MessagesAnnotation,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { SystemMessage } from '@langchain/core/messages';
import { getMcpTools } from '../mcp/lg-mcp.js';
import z from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import Integration from '../models/integration.model.js';
import { decrypt } from '../config/crypt.js';
import { google } from 'googleapis';
import axios from 'axios';
import jwt from 'jsonwebtoken'
dotenv.config();

const llm = new ChatGroq({
  model: 'openai/gpt-oss-120b',
  temperature: 0.2,
  maxRetries: 2,
});

const client = new MongoClient(process.env.MONGODB_URI);
const checkpointer = new MongoDBSaver({ client, dbName: 'langgraph' });

const findTool = (tools, names) => {
  return tools.find((tool) => names.includes(tool.name));
};

const makeAuthToken=(userId)=>{
  return jwt.sign({}, process.env.MCP_AUTH_SECRET,{
    algorithm:"HS256",
    subject:String(userId),
    expiresIn: "2m",
    issuer: "automate-backend",
    audience: "automate-mcp",
  })
}


const limitMessageContext = (message, maxChars = 2000) => {
  if (typeof message.content !== 'string') {
    return message;
  }
  if (message.content.length <= maxChars) {
    return message;
  }

  return {
    ...message,
    content: message.content.slice(0, maxChars) + '\n[content truncated]',
  };
};

export const createAgentGraph = async (agent, userId) => {
  const agentToolsRequested = Array.isArray(agent.tools) ? agent.tools : [];
  const finalTools = [];

  // 1. Web Search Tool (via MCP)
  const wantsWebSearch =
    agentToolsRequested.length === 0 ||
    agentToolsRequested.includes('web.search') ||
    agentToolsRequested.includes('web_search');

  if (wantsWebSearch) {
    try {
      const mcpTools = await getMcpTools();
      const webSearchMcpTool = findTool(mcpTools, [
        'automate_web_search_tool',
        'web_search_tool',
        'web_search',
        'automate_web_search',
      ]);

      if (webSearchMcpTool) {
        finalTools.push(
          new DynamicStructuredTool({
            name: 'web_search',
            description:
              'Search the web for up-to-date information, news, documentation, and factual queries.',
            schema: z.object({
              query: z.string().describe('The search query keyword or phrase'),
            }),
            func: async ({ query }) => {
              try {
                const result = await webSearchMcpTool.invoke({ query });
                return typeof result === 'string'
                  ? result
                  : JSON.stringify(result);
              } catch (error) {
                return `Web search error: ${error.message || error}`;
              }
            },
          })
        );
      }
    } catch (err) {
      console.error('Failed to load MCP web search tool:', err);
    }
  }

  // 2. Calculator Tool
  const wantsCalculator =
    agentToolsRequested.length === 0 ||
    agentToolsRequested.includes('calculator');

  if (wantsCalculator) {
    finalTools.push(
      new DynamicStructuredTool({
        name: 'calculator',
        description: 'Perform arithmetic computations and mathematical evaluations.',
        schema: z.object({
          expression: z.string().describe('Math expression to evaluate, e.g. "125 * 45" or "(1200 / 4) + 50"'),
        }),
        func: async ({ expression }) => {
          try {
            // Clean expression to allow only numbers, basic math operators, parentheses, and Math functions
            const sanitized = expression.replace(/[^0-9+\-*/().%^ \t]/g, '');
            // Evaluate safely using Function with limited scope
            const result = Function(`"use strict"; return (${sanitized})`)();
            return `Result: ${result}`;
          } catch (error) {
            return `Calculation error: ${error.message || error}`;
          }
        },
      })
    );
  }

  // 3. Gmail Integration Tools
  const wantsGmailRead =
    agentToolsRequested.length === 0 || agentToolsRequested.includes('gmail.read');
  const wantsGmailSend =
    agentToolsRequested.length === 0 || agentToolsRequested.includes('gmail.send');

  if (wantsGmailRead || wantsGmailSend) {
    let gmailClient = null;
    try {
      const googleConn = await Integration.findOne({
        userId,
        provider: 'google',
        status: 'connected',
      }).select('+tokens.accessToken +tokens.refreshToken');

      if (googleConn?.tokens?.accessToken) {
        const accessToken = decrypt(googleConn.tokens.accessToken);
        const refreshToken = googleConn.tokens?.refreshToken
          ? decrypt(googleConn.tokens.refreshToken)
          : undefined;

        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        gmailClient = google.gmail({ version: 'v1', auth: oauth2Client });
      }
    } catch (err) {
      console.error('Failed to initialize Gmail client for agent:', err);
    }

    if (wantsGmailRead) {
      finalTools.push(
        new DynamicStructuredTool({
          name: 'gmail_read',
          description:
            'Read recent emails or search messages from the user\'s connected Gmail account.',
          schema: z.object({
            maxResults: z.number().optional().default(5).describe('Maximum number of emails to retrieve (1-10)'),
            query: z.string().optional().describe('Optional Gmail search query e.g. "from:example@gmail.com" or "is:unread"'),
          }),
          func: async ({ maxResults = 5, query = '' }) => {
            if (!gmailClient) {
              return 'Gmail is not connected. Please ask the user to connect their Gmail account in the Integrations page.';
            }
            try {
              const listRes = await gmailClient.users.messages.list({
                userId: 'me',
                maxResults: Math.min(maxResults, 10),
                q: query,
              });

              const messages = listRes.data.messages || [];
              if (messages.length === 0) {
                return 'No messages found in Gmail.';
              }



  const llmWithTools = llm.bindTools(finalTools, {
    tool_choice: 'auto',
  });

  const currentDateTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date());

  const systemPrompt = `You are ${agent.name}, an autonomous task-execution agent. Never refer to yourself as ChatGPT or an assistant trained by OpenAI.

Directives:
${agent.instructions}

Rules:
1. Tool Execution: Use available tools to fetch data and perform tasks. Never fabricate tool outputs, URLs, or completed actions.
2. Autonomy & Boundaries: Execute reversible tasks and research independently. Require explicit user confirmation before irreversible actions (sending emails, making payments, publishing, or deleting data).
3. Output Style: Be concise, factual, and direct. Skip pleasantries, filler, and repetitive acknowledgments.`;

  const approvalTools = new Set([
    'send_email',
    'create_calender_event',
    'publish_instagram_post',
  ]);
  const chatNode = async state => {
    const recentMessages = state.messages.slice(-4).map((message)=>limitMessageContext(message))
    
    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...recentMessages,
    ]);

    return {
      messages: [response],
    };
  };

  const toolNode = new ToolNode(finalTools);

  const actionApprovalNode = () => { };

  const routeAfterChat = state => {
    const messages = state.messages || [];
    console.log('state msgs: ', messages);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return '__end__';
    }
    const requiresApproval = lastMessage?.tool_calls?.some((call) => (
      approvalTools.has(call.name)
    ))
    return requiresApproval ? "actionApprovalNode" : "tools"
  };

  const routeAfterApproval = () => { };
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('chatNode', chatNode)
    .addNode('tools', toolNode)
    .addNode('actionApprovalNode', actionApprovalNode)
    .addEdge('__start__', 'chatNode')
    .addConditionalEdges('chatNode', routeAfterChat)
    .addEdge('tools', 'chatNode')
    .addConditionalEdges('actionApprovalNode', routeAfterApproval)

  const chatAgentGraph = workflow.compile({ checkpointer });
  return chatAgentGraph;
};
