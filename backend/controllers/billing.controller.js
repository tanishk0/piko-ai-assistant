import { createBillingService } from '../services/billing.service.js';

export function createBillingHandlers(service = createBillingService()) {
  const handler = operation => async (req, res) => {
    try { return res.json(await operation(req)); }
    catch (error) {
      const status = error.name === 'ZodError' ? 400 : error.status || 502;
      // Never serialize axios errors: they contain Basic Auth credentials.
      console.error('Billing operation failed:', error.status || error.response?.status || error.code || error.name);
      return res.status(status).json({ message: error.name === 'ZodError' ? 'Invalid billing request.' : error.status ? error.message : 'The billing provider could not complete this request. Refresh billing before retrying.' });
    }
  };
  return {
    getBilling: handler(req => service.snapshot(req.user._id)),
    subscribe: handler(req => service.subscribe(req.user._id, req.body)),
    verify: handler(req => service.verify(req.user._id, req.body)),
    refresh: handler(req => service.refresh(req.user._id)),
    cancel: handler(req => service.cancel(req.user._id)),
    webhook: handler(req => service.webhook(req.body, req.get('x-razorpay-signature'))),
  };
}
export const billingHandlers = createBillingHandlers();
