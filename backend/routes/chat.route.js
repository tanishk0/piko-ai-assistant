import express from 'express';
import protect from '../middleware/protect.js';
import {agentChat, chat, getHistory, decideAction} from '../controllers/chat.controller.js';

const chatRouter = express.Router ();

chatRouter.post ('/', protect, chat);
chatRouter.post ('/agent', protect, agentChat);
chatRouter.get('/conversations/:id', protect, getHistory);
chatRouter.post('/actions/:id', protect, decideAction);

export default chatRouter;
