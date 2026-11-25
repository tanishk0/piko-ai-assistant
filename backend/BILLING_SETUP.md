# Razorpay monthly subscriptions

## Connect your account

1. Add the three variables in `.env.razorpay.example` to `backend/.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a separate `RAZORPAY_WEBHOOK_SECRET`. No frontend keys or manual Razorpay Plan IDs are needed. Plans are created through the API on the first checkout and cached in MongoDB.
2. In the Razorpay Dashboard, enable Subscriptions for your account and create a webhook pointing to `https://YOUR_BACKEND/api/billing/webhook`. For local testing, expose port 8000 through a public HTTPS tunnel and use its URL. Use the same webhook secret as the backend.
3. Subscribe to `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.paused`, `subscription.resumed`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`, `payment.captured`, `payment.refunded`, and `refund.processed`. Add subscription lifecycle events available in your dashboard. The endpoint ignores unrelated product events.
4. Restart the backend. Its startup creates the subscription and receipt indexes before accepting requests. Open **Pricing & billing**, subscribe in Test Mode, and use **Refresh billing** to confirm the balance and receipt. Test renewals and cancellation in Razorpay Test Mode as well.
5. For real payments, complete Razorpay account activation, ensure Subscriptions is enabled, switch to the live key pair and a separately configured live webhook, then restart. Use a separate database for Test Mode; test payments must not fund production accounts. No real charges were made while implementing this integration.

Billing remains unavailable until all three variables are configured. Secret keys are only used on the backend. The browser receives the public key ID and subscription ID.

## Product behavior

- Pro: INR 799/month adds 3,000 credits after each captured monthly invoice. Teams: INR 999/month adds 5,000. Prices include the entire amount the app sends to Razorpay; no additional taxes, discounts or seat multipliers are configured.
- Teams is a larger allowance for the signed-in account. This codebase has no shared workspace or additional seat entitlement, and pricing no longer advertises those features or unimplemented premium models.
- Credits roll over. Normal chat costs 1 credit per request; agent chat costs 3. Cancelling stops future renewal and retains paid credits. There are at most 1,200 monthly billing cycles per mandate.
- One open subscription per user and Razorpay key is enforced in MongoDB. Pending unpaid checkouts can be resumed or discarded. Paid subscriptions cancel at the end of their current cycle. To change plans, cancel the current subscription and wait until it ends before subscribing again; there is no proration or concurrent upgrade charge.
- The initial authorisation/mandate transaction alone grants no allowance. The server verifies the Checkout signature and fetches the actual payment, subscription and invoice. Only a captured, matching paid plan invoice funds credits.
- Signed webhooks handle renewals without the browser. Refresh billing reconciles missed paid invoices, including when the browser closed before verification. It also fetches current subscription state so delayed lifecycle events do not overwrite it from an old payload.
- A successful credit update and its invoice marker are atomic in the user document. Verification, repeated webhook events and reconciliation therefore cannot grant the same invoice twice. No MongoDB replica set or cross-document transaction is required. MongoDB 5.0+ is required for the aggregation operators used by credit adjustments.
- Refund webhooks revoke credits proportionately, rounded up, once per cumulative refunded amount. Already-used refunded credits become `billingDebt`; future paid credits settle this debt before adding available credits. Usage is blocked while debt remains. Refund-before-payment delivery cannot create free credits. Refund initiation and dispute/chargeback decisions remain operations in the Razorpay Dashboard; there is no refund button in the app.

## Operations

If a subscription creation request times out after reaching Razorpay, its local status becomes `setup_unknown`. The app does not blindly create a second subscription. Look up `app_subscription_id` in the subscription notes in the Dashboard, reconcile the provider ID/status to the matching local `Subscription` document, and refresh. This protects against duplicate mandates after an ambiguous API/database failure.

`Subscription` stores ownership and the immutable purchased price/credit snapshot, `BillingPlan` maps the public catalog to Razorpay plan templates, and `Payment` stores one receipt per invoice. `User.billingCreditsApplied` and `User.billingRefunds` are internal deduplication ledgers and are excluded from normal account responses. Keep these markers when archiving receipts. Renewals for an older cancelled subscription still credit valid historical invoices to the original owner.

Changing the API key ID changes billing scope. Use a separate database between modes; when rotating keys within the same merchant account, migrate the stored key IDs and invoice ledger prefixes before accepting new subscriptions. Do not simply switch IDs and allow the same accounts to create additional active mandates.

If processing fails, the webhook returns a non-success response so Razorpay can retry. Monitor billing error logs and webhook deliveries. Checkout errors returned to the browser never include provider credentials or raw Axios objects.

## API

All routes except the signed webhook require the existing login cookie.

- `GET /api/billing`: plans, configuration readiness, current subscription, balance and the latest 20 receipts.
- `POST /api/billing/subscriptions`: `{ "plan": "pro" | "team", "requestId": "UUID" }`.
- `POST /api/billing/verify`: the three subscription Checkout response fields.
- `POST /api/billing/refresh`: fetch subscription state and reconcile paid invoices.
- `POST /api/billing/cancel`: schedule cancellation, or immediately cancel an unpaid checkout.
- `POST /api/billing/webhook`: signed raw Razorpay JSON. This route must stay before `express.json()`.

## References

- [Razorpay Subscriptions integration](https://razorpay.com/docs/payments/subscriptions/integration-guide/)
- [Subscriptions API and signature verification](https://razorpay.com/docs/api/payments/subscriptions/)
- [Subscriptions webhook events](https://razorpay.com/docs/webhooks/subscriptions)
- [Webhook validation and idempotency](https://razorpay.com/docs/webhooks/validate-test/)
