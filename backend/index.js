import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/db.js';
dotenv.config();
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import agentRouter from './routes/agent.routes.js';
import chatRouter from './routes/chat.route.js';
import {getMcpTools} from './mcp/lg-mcp.js';
import integrationRouter from './routes/integration.router.js';

const app = express();

const port = process.env.PORT || 8000;

app.use(express.json());
app.use(
  cors({
    origin: (process.env.FRONTEND_URL || 'http://localhost:5173')
      .replace(/['"]+/g, '')
  cors ({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use (cookieParser ());

app.use ('/api/auth', authRouter);
app.use ('/api/agent', agentRouter);
app.use ('/api/chat', chatRouter);
app.use ('/api/integrations', integrationRouter);
getMcpTools ();
app.listen (port, () => {
  connectDb (), console.log ('Server started at', port);
});
