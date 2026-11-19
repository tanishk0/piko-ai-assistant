import express from 'express';
import dotenv from 'dotenv';
import connectDb from './config/db.js';
dotenv.config ();
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import agentRouter from './routes/agent.routes.js';
import chatRouter from './routes/chat.route.js';
import {getMcpTools} from './mcp/lg-mcp.js';
const app = express ();

const port = process.env.PORT || 5000;

app.use (express.json ());
app.use (
  cors ({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

app.use (cookieParser ());

app.use ('/api/auth', authRouter);
app.use ('/api/agent', agentRouter);
app.use ('/api/chat', chatRouter);
getMcpTools ();
app.listen (port, () => {
  connectDb (), console.log ('Server started at', port);
});
