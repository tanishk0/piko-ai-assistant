import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/db.js';
dotenv.config();
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import agentRouter from './routes/agent.routes.js';
import chatRouter from './routes/chat.route.js';
import {getMcpTools, closeMcp} from './mcp/lg-mcp.js';
import {closeCheckpointer} from './utils/checkpointer.js';
import mongoose from 'mongoose';
import PendingAction from './models/pendingAction.model.js';
import integrationRouter from './routes/integration.router.js';
import billingRouter, { billingWebhook } from './routes/billing.routes.js';
import Subscription from './models/subscription.model.js';
import Payment from './models/payment.model.js';

const app = express();

const port = process.env.PORT || 8000;

// This route must precede JSON parsing: Razorpay signs the exact request bytes.
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }), billingWebhook);
app.use(express.json());
app.use(
  cors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:5173')
      .replace(/['"]+/g, '')
      .replace(/\/$/, ''),
    credentials: true,
  })
);

app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/agent', agentRouter);
app.use('/api/chat', chatRouter);
app.use('/api/billing', billingRouter);
app.use('/api/integrations', integrationRouter);
// Alias so both /api/integrations and /api/integration routes (e.g. OAuth callbacks) work
app.use('/api/integration', integrationRouter);

await connectDb();
await PendingAction.init();
await Promise.all([Subscription.init(), Payment.init()]);
getMcpTools().catch(error => console.error('Web search startup unavailable:', error.message));
const server = app.listen(port, () => console.log('Server started at', port));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => { await Promise.allSettled([closeCheckpointer(), closeMcp(), mongoose.disconnect()]); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
