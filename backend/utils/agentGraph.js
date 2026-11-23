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

              const summaries = [];
              for (const m of messages.slice(0, 5)) {
                const detail = await gmailClient.users.messages.get({
                  userId: 'me',
                  id: m.id,
                  format: 'metadata',
                  metadataHeaders: ['From', 'Subject', 'Date'],
                });
                const headers = detail.data.payload?.headers || [];
                const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
                const date = headers.find((h) => h.name === 'Date')?.value || '';
                const snippet = detail.data.snippet || '';
                summaries.push(`- From: ${from}\n  Subject: ${subject}\n  Date: ${date}\n  Snippet: ${snippet}`);
              }

              return `Recent emails:\n${summaries.join('\n\n')}`;
            } catch (error) {
              return `Error reading Gmail: ${error.message || error}`;
            }
          },
        })
      );
    }

    if (wantsGmailSend) {
      finalTools.push(
        new DynamicStructuredTool({
          name: 'gmail_send',
          description: 'Send an email from the user\'s connected Gmail account.',
          schema: z.object({
            to: z.string().describe('Recipient email address'),
            subject: z.string().describe('Email subject line'),
            body: z.string().describe('Body text content of the email'),
          }),
          func: async ({ to, subject, body }) => {
            if (!gmailClient) {
              return 'Gmail is not connected. Please ask the user to connect their Gmail account in the Integrations page.';
            }
            try {
              const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
              const messageParts = [
                `To: ${to}`,
                'Content-Type: text/plain; charset=utf-8',
                'MIME-Version: 1.0',
                `Subject: ${utf8Subject}`,
                '',
                body,
              ];
              const rawMessage = messageParts.join('\r\n');
              const encodedMessage = Buffer.from(rawMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

              await gmailClient.users.messages.send({
                userId: 'me',
                requestBody: { raw: encodedMessage },
              });

              return `Email successfully sent to ${to} with subject "${subject}".`;
            } catch (error) {
              return `Error sending email: ${error.message || error}`;
            }
          },
        })
      );
    }
  }

  // 4. Instagram Tools (if connected)
  try {
    const instaConn = await Integration.findOne({
      userId,
      provider: 'instagram',
      status: 'connected',
    }).select('+tokens.accessToken');

    if (instaConn?.tokens?.accessToken) {
      const instaToken = decrypt(instaConn.tokens.accessToken);
      const instagramAccountId = instaConn.providerAccountId;

      finalTools.push(
        new DynamicStructuredTool({
          name: 'instagram_publish_photo',
          description:
            'Publish a photo to the user\'s connected Instagram account with a caption.',
          schema: z.object({
            imageUrl: z.string().url().describe('Publicly accessible URL of the image to publish'),
            caption: z.string().describe('Caption text and hashtags for the Instagram post'),
          }),
          func: async ({ imageUrl, caption }) => {
            try {
              const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v23.0';
              // Step 1: Create media container
              const createRes = await axios.post(
                `https://graph.facebook.com/${graphVersion}/${instagramAccountId}/media`,
                null,
                {
                  params: {
                    image_url: imageUrl,
                    caption,
                    access_token: instaToken,
                  },
                }
              );

              const creationId = createRes.data?.id;
              if (!creationId) {
                return 'Failed to create Instagram media container.';
              }

              // Step 2: Publish container
              const publishRes = await axios.post(
                `https://graph.facebook.com/${graphVersion}/${instagramAccountId}/media_publish`,
                null,
                {
                  params: {
                    creation_id: creationId,
                    access_token: instaToken,
                  },
                }
              );

              return `Post successfully published to Instagram! Post ID: ${publishRes.data?.id}`;
            } catch (err) {
              return `Instagram post error: ${err.response?.data?.error?.message || err.message || err}`;
            }
          },
        })
      );
    }
  } catch (err) {
    console.error('Failed to initialize Instagram tools for agent:', err);
  }

  const llmWithTools = finalTools.length > 0
    ? llm.bindTools(finalTools, { tool_choice: 'auto' })
    : llm;

  const systemPrompt = `You are ${agent.name}, an autonomous task-execution agent.
Never refer to yourself as ChatGPT or an AI trained by OpenAI.

Directives:
${agent.instructions}

${agent.knowledgeBase ? `Knowledge Base:\n${agent.knowledgeBase}\n` : ''}

Rules:
1. Tool Execution: Use available tools to fetch data and perform tasks. Never fabricate tool outputs, URLs, or completed actions.
2. Directness: Be concise, helpful, and direct in your responses.`;

  const chatNode = async (state) => {
    const recentMessages = (state.messages || [])
      .slice(-6)
      .map((message) => limitMessageContext(message));

    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...recentMessages,
    ]);

    return {
      messages: [response],
    };
  };

  const routeAfterChat = (state) => {
    const messages = state.messages || [];
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
      return '__end__';
    }
    return 'tools';
  };

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('chatNode', chatNode)
    .addEdge('__start__', 'chatNode');

  if (finalTools.length > 0) {
    const toolNode = new ToolNode(finalTools);
    workflow
      .addNode('tools', toolNode)
      .addConditionalEdges('chatNode', routeAfterChat)
      .addEdge('tools', 'chatNode');
  } else {
    workflow.addEdge('chatNode', '__end__');
  }

  const chatAgentGraph = workflow.compile({ checkpointer });
  return chatAgentGraph;
};
