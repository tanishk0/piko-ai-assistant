import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmac(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function razorpayConfig() {
  return { keyId: process.env.RAZORPAY_KEY_ID?.trim(), keySecret: process.env.RAZORPAY_KEY_SECRET?.trim(), webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() };
}

export function createRazorpayClient(config = razorpayConfig()) {
  if (!config.keyId || !config.keySecret) throw Object.assign(new Error('Billing is not configured yet.'), { status: 503 });
  const client = axios.create({ baseURL: 'https://api.razorpay.com/v1', auth: { username: config.keyId, password: config.keySecret }, timeout: 20000 });
  const id = value => {
    if (!/^(plan|sub|pay|inv|order|rfnd)_[A-Za-z0-9]+$/.test(value)) throw new Error('Invalid Razorpay identifier.');
    return encodeURIComponent(value);
  };
  return {
    createPlan: async data => (await client.post('/plans', data)).data,
    getPlan: async value => (await client.get(`/plans/${id(value)}`)).data,
    createSubscription: async data => (await client.post('/subscriptions', data)).data,
    getSubscription: async value => (await client.get(`/subscriptions/${id(value)}`)).data,
    cancelSubscription: async (value, atEnd) => (await client.post(`/subscriptions/${id(value)}/cancel`, { cancel_at_cycle_end: atEnd })).data,
    getPayment: async value => (await client.get(`/payments/${id(value)}`)).data,
    getInvoice: async value => (await client.get(`/invoices/${id(value)}`)).data,
    listInvoices: async (subscriptionId, skip = 0) => (await client.get('/invoices', { params: { subscription_id: subscriptionId, count: 100, skip } })).data,
  };
}
