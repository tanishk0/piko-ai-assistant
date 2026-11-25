import api from '@/api';

export const getBilling = async signal => (await api.get('/api/billing', { signal })).data;
export const createSubscription = async (plan, requestId) => (await api.post('/api/billing/subscriptions', { plan, requestId })).data;
export const verifySubscription = async result => (await api.post('/api/billing/verify', result)).data;
export const refreshBilling = async () => (await api.post('/api/billing/refresh')).data;
export const cancelSubscription = async () => (await api.post('/api/billing/cancel')).data;

export { openSubscriptionCheckout } from '@/lib/razorpayCheckout.js';
