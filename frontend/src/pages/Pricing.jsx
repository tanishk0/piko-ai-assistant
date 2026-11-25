import {
  ArrowLeft,
  Check,
  Crown,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const plans = [
  {
    id: "starter",
    name: "Starter",
    description: "Try and explore possibilities",
    price: "Free",
    period: "forever",
    credits: "100 free credits",
    features: [
      "100 free credits",
      "Basic AI chat",
      "Explore AI Agents",
      "Standard access",
    ],
    icon: Zap,
    buttonText: "Current plan",
    disabled: true,
    accent: "text-zinc-300",
    iconBg: "bg-white/[0.06] border-white/10",
  },
  {
    id: "pro",
    name: "Pro",
    description: "For heavy users and maximum flexibility",
    price: "₹799",
    period: "/ month",
    credits: "3,000 credits / month",
    popular: true,
    features: [
      "3,000 credits / month",
      "Best AI models",
      "Full agent access",
      "Priority support",
      "Custom integrations",
    ],
    icon: Crown,
    buttonText: "Choose Pro",
    disabled: false,
    accent: "text-violet-300",
    iconBg: "bg-violet-500/15 border-violet-400/25",
    gradient: "from-purple-500/15 via-violet-500/5 to-pink-500/15",
  },
  {
    id: "team",
    name: "Teams",
    description: "For growing teams and increased usage",
    price: "₹999",
    period: "/ seat / month",
    credits: "5,000 credits / month",
    features: [
      "5,000 credits / month",
      "Advanced AI chat models",
      "Access to premium agents",
      "Integration capabilities",
      "Usage analytics",
    ],
    icon: Users,
    buttonText: "Choose Teams",
    disabled: false,
    accent: "text-blue-300",
    iconBg: "bg-blue-500/15 border-blue-400/25",
    gradient: "from-blue-500/15 via-indigo-500/5 to-violet-500/15",
  },
];

function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);

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

          <div className="grid items-stretch gap-6 pt-2 md:grid-cols-3">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const isSelected = selectedPlan === plan.id;

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
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`h-11 w-full rounded-xl text-sm font-medium transition ${
                        plan.disabled
                          ? "cursor-not-allowed border border-white/10 bg-white/[0.05] text-zinc-400 hover:bg-white/[0.05]"
                          : plan.popular
                            ? "border-0 bg-white text-zinc-900 hover:bg-zinc-200"
                            : "border border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.14]"
                      }`}
                    >
                      {isSelected ? `${plan.name} selected` : plan.buttonText}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          
        </main>
      </div>
    </div>
  );
}

export default Pricing;
