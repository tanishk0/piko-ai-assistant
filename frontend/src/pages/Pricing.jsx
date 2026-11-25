import {
  ArrowLeft,
  Check,
  Crown,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useDispatch, useSelector } from 'react-redux';
import { setCreditBalance } from '@/redux/userSlice.js';
import { getBilling, createSubscription, verifySubscription, refreshBilling, cancelSubscription, openSubscriptionCheckout } from '@/features/billing.js';

const cards = [
  { id: 'starter', name: 'Starter', description: 'Try the app with a free allowance', icon: Zap, accent: 'text-zinc-300', iconBg: 'bg-white/[0.06] border-white/10' },
  { id: 'pro', name: 'Pro', description: 'For everyday agents and automation', icon: Crown, popular: true, accent: 'text-violet-300', iconBg: 'bg-violet-500/15 border-violet-400/25', gradient: 'from-purple-500/15 via-violet-500/5 to-pink-500/15' },
  { id: 'team', name: 'Teams', description: 'More capacity for larger workflows', icon: Users, accent: 'text-blue-300', iconBg: 'bg-blue-500/15 border-blue-400/25', gradient: 'from-blue-500/15 via-indigo-500/5 to-violet-500/15' },
];
const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount / 100);
const formatDate = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value)) : 'Pending';

function Pricing() {
  const { userData } = useSelector(state => state.user);
  const dispatch = useDispatch();
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const gate = useRef(false);
  const requests = useRef({});
  const verificationKey = 'automate-billing-verification:' + userData._id;
  const applyBilling = useCallback(data => { setBilling(data); dispatch(setCreditBalance(data.user)); }, [dispatch]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const initial = await getBilling(controller.signal);
        if (controller.signal.aborted) return;
        applyBilling(initial);
        const pending = sessionStorage.getItem(verificationKey);
        if (pending && initial.configured) {
          const verified = await verifySubscription(JSON.parse(pending));
          if (controller.signal.aborted) return;
          applyBilling(verified); sessionStorage.removeItem(verificationKey);
          setNotice(verified.paymentConfirmed ? 'Payment confirmed. Your credit balance is updated.' : 'Subscription authorised. Credits will appear after the monthly charge is captured.');
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load billing. Use Refresh billing to check your payment status.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [applyBilling, verificationKey]);
  async function purchase(plan) {
    if (gate.current) return;
    gate.current = true; setBusy(plan.id); setError(''); setNotice('');
    try {
      const pending = sessionStorage.getItem(verificationKey);
      if (pending) {
        const verified = await verifySubscription(JSON.parse(pending));
        applyBilling(verified); sessionStorage.removeItem(verificationKey);
        setNotice(verified.paymentConfirmed ? 'Payment confirmed. Your credit balance is updated.' : 'Subscription authorised. Credits will appear after the monthly charge is captured.');
        return;
      }
      requests.current[plan.id] ||= crypto.randomUUID();
      const subscription = await createSubscription(plan.id, requests.current[plan.id]);
      const result = await openSubscriptionCheckout(subscription, userData);
      if (!result) { setNotice('Checkout closed. Resume the pending checkout or discard it below.'); applyBilling(await getBilling()); return; }
      const payload = { razorpay_subscription_id: result.razorpay_subscription_id, razorpay_payment_id: result.razorpay_payment_id, razorpay_signature: result.razorpay_signature };
      sessionStorage.setItem(verificationKey, JSON.stringify(payload));
      const verified = await verifySubscription(payload);
      applyBilling(verified); sessionStorage.removeItem(verificationKey); delete requests.current[plan.id];
      setNotice(verified.paymentConfirmed ? 'Payment confirmed. Your credit balance is updated.' : 'Subscription authorised. Credits will appear after the monthly charge is captured.');
    } catch (err) {
      if (err.response) delete requests.current[plan.id];
      if (err instanceof SyntaxError || [400, 404].includes(err.response?.status)) sessionStorage.removeItem(verificationKey);
      setError(err.response?.data?.message || err.message || 'Checkout could not complete. Refresh billing before trying again.');
    }
    finally { gate.current = false; setBusy(''); }
  }
  async function refresh() {
    if (gate.current) return;
    gate.current = true; setBusy('refresh'); setError('');
    try {
      const data = await refreshBilling(); applyBilling(data);
      if (data.subscription?.paidCount > 0) sessionStorage.removeItem(verificationKey);
      setNotice('Billing and credit balance refreshed.');
    } catch (err) { setError(err.response?.data?.message || 'Could not refresh billing.'); }
    finally { gate.current = false; setBusy(''); setLoading(false); }
  }
  async function cancel() {
    if (gate.current) return;
    gate.current = true; setBusy('cancel'); setError('');
    try {
      const data = await cancelSubscription(); applyBilling(data); setConfirmCancel(false); requests.current = {};
      setNotice(data.subscription?.cancelAtPeriodEnd ? 'Renewal cancelled. Your paid credits stay available.' : 'Subscription cancelled. Your paid credits stay available.');
    } catch (err) { setError(err.response?.data?.message || 'Could not cancel. Refresh billing to confirm its status.'); }
    finally { gate.current = false; setBusy(''); }
  }
  const subscription = billing?.subscription;
  const plans = cards.map(card => {
    const paid = billing?.plans.find(plan => plan.id === card.id);
    const unavailable = subscription?.open && !(subscription.canResumeCheckout && subscription.plan === card.id);
    return { ...card, price: card.id === 'starter' ? 'Free' : paid ? money(paid.amount) : '?', period: card.id === 'starter' ? 'once on signup' : '/ month',
      credits: card.id === 'starter' ? '100 signup credits' : paid ? paid.credits.toLocaleString() + ' credits / month' : 'Monthly credits',
      features: card.id === 'starter' ? ['100 credits on signup', 'AI chat and custom agents', 'Connect your integrations'] : [(paid?.credits.toLocaleString() || 'Monthly') + ' credits each paid month', 'AI chat and custom agents', 'Connected integration tools', 'Unused credits roll over', 'Cancel future renewals anytime'],
      disabled: card.id === 'starter' || loading || Boolean(busy) || !billing?.configured || unavailable,
      buttonText: card.id === 'starter' ? 'Included on signup' : busy === card.id ? 'Opening checkout?' : subscription?.open && subscription.plan === card.id ? subscription.canResumeCheckout ? 'Resume checkout' : 'Current subscription' : unavailable ? 'Manage current subscription first' : 'Subscribe to ' + card.name,
    };
  });

  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />
      <div className="pointer-events-none absolute left-1/2 top-24 h-72 w-[38rem] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[130px]" />

      <div className="relative z-10 w-full">
        <header className="flex h-16 w-full shrink-0 items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-zinc-900">
              <Workflow size={22} />
            </span>
            <span className="text-sm font-medium tracking-tight">
              Automate AI
            </span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={14} />
            <span>Back to chat</span>
          </Link>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-12 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              <span>Simple, transparent pricing</span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Unlock more with{" "}
              <span className="text-violet-300">Automate AI</span>
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Start free and upgrade when your workflows, agents, and team need
              more capacity.
            </p>
          </div>

          <div className="mb-6 flex justify-end">
            <button
              type="button"
              className="rounded-xl border border-white/20 bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:text-zinc-400"
              disabled={loading || Boolean(busy)}
              onClick={refresh}
            >
              {busy === 'refresh' ? 'Refreshing…' : 'Refresh billing'}
            </button>
          </div>
          {notice && <p role="status" className="mb-4 text-sm text-emerald-300">{notice}</p>}
          {error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
          <div className="grid items-stretch gap-6 pt-2 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = plan.icon;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border p-7 backdrop-blur-xl transition-all duration-200 ${
                    plan.popular
                      ? "border-violet-400/35 bg-white/[0.06] shadow-[0_24px_70px_rgba(124,58,237,0.18),inset_0_1px_0_rgba(255,255,255,0.1)] md:-translate-y-1.5"
                      : "border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/20"
                  }`}
                >
                  {plan.gradient && (
                    <div
                      aria-hidden
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${plan.gradient} opacity-50`}
                    />
                  )}

                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`grid size-11 place-items-center rounded-2xl border ${plan.iconBg} ${plan.accent}`}
                      >
                        <Icon size={20} />
                      </div>

                      {plan.popular && (
                        <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-3 py-1 text-[11px] font-medium tracking-wide text-violet-200">
                          Most Popular
                        </span>
                      )}
                    </div>

                    <div className="mt-5">
                      <h2 className="text-xl font-semibold tracking-tight text-white">
                        {plan.name}
                      </h2>
                      <p className="mt-1.5 text-sm text-zinc-400">
                        {plan.description}
                      </p>
                    </div>

                    <div className="mt-6 flex items-baseline gap-1.5 border-b border-white/10 pb-6">
                      <span className="text-4xl font-semibold tracking-tight text-white">
                        {plan.price}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {plan.period}
                      </span>
                    </div>

                    <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                      <Sparkles size={13} className={plan.accent} />
                      <span>{plan.credits}</span>
                    </div>

                    <ul className="mt-6 space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center gap-2.5 text-sm text-zinc-300"
                        >
                          <span
                            className={`grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.06] ${plan.accent}`}
                          >
                            <Check size={12} />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="relative z-10 mt-8">
                    <Button
                      type="button"
                      disabled={plan.disabled}
                      onClick={() => purchase(plan)}
                      className={`h-11 w-full rounded-xl text-sm font-medium transition ${
                        plan.disabled
                          ? "cursor-not-allowed border border-white/10 bg-white/[0.05] text-zinc-400 hover:bg-white/[0.05]"
                          : plan.popular
                            ? "border-0 bg-white text-zinc-900 hover:bg-zinc-200"
                            : "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                      }`}
                    >
                      {plan.buttonText}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-7 text-center text-xs leading-6 text-zinc-400">Paid plans renew monthly until cancelled. Credits are added only after a successful monthly charge and unused credits roll over. Both paid plans fund this account; shared workspaces and additional team seats are not included. To change plans, cancel the current subscription and wait for it to end.</p>
          {subscription && <section className="mt-8 text-sm text-zinc-300" aria-label="Subscription management">
            <p className="font-medium">{subscription.plan === 'pro' ? 'Pro' : 'Teams'} ? {subscription.status.replaceAll('_', ' ')}</p>
            {subscription.open && <p className="mt-2">{subscription.cancelAtPeriodEnd ? 'Renewal stops on ' + formatDate(subscription.currentEnd) : 'Next monthly charge: ' + formatDate(subscription.nextChargeAt)}.</p>}
            {subscription.open && !subscription.cancelAtPeriodEnd && !['creating', 'setup_unknown'].includes(subscription.status) && <Button className="mt-3" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)}>{subscription.canResumeCheckout ? 'Discard pending checkout' : 'Cancel renewal'}</Button>}
            {confirmCancel && <div className="mt-3 space-y-3">
              <p>Stop future monthly charges? You keep your paid credits. An unpaid checkout will be cancelled immediately.</p>
              <div className="flex gap-3"><Button disabled={Boolean(busy)} onClick={cancel}>{busy === 'cancel' ? 'Cancelling?' : 'Confirm cancellation'}</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => setConfirmCancel(false)}>Keep subscription</Button></div>
            </div>}
            {subscription.canResumeCheckout && <p className="mt-3 text-xs text-zinc-400">Finish or discard this checkout before choosing another plan.</p>}
            {['creating', 'setup_unknown'].includes(subscription.status) && <p className="mt-3 text-xs text-amber-300">Subscription setup needs confirmation. Refresh billing; if this persists, contact support before starting another subscription.</p>}
          </section>}
          {billing?.payments.length > 0 && <section className="mt-10 rounded-2xl border border-white/10 p-5" aria-label="Payment history">
            <h2 className="text-lg font-medium">Recent payments</h2>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="text-zinc-400"><tr><th className="p-2">Date</th><th className="p-2">Plan</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Receipt</th></tr></thead>
              <tbody>{billing.payments.map(payment => <tr key={payment.id} className="border-t border-white/10"><td className="p-2">{formatDate(payment.paidAt)}</td><td className="p-2">{payment.plan === 'pro' ? 'Pro' : 'Teams'}</td><td className="p-2">{money(payment.amount)}</td><td className="p-2">{payment.status}</td><td className="p-2">{/^https:\/\//.test(payment.receiptUrl || '') && <a className="text-violet-300 underline" href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">View receipt</a>}</td></tr>)}</tbody>
            </table></div>
          </section>}
        </main>
      </div>
    </div>
  );
}

export default Pricing;
