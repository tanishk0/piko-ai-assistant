import express from 'express';
import protect from '../middleware/protect.js';
import { billingHandlers as handlers } from '../controllers/billing.controller.js';

export const billingWebhook = handlers.webhook;
const router = express.Router();
router.use(protect);
router.get('/', handlers.getBilling);
router.post('/subscriptions', handlers.subscribe);
router.post('/verify', handlers.verify);
router.post('/refresh', handlers.refresh);
router.post('/cancel', handlers.cancel);
export default router;
