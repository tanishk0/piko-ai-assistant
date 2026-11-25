import {
  ArrowLeft,
  Sparkles,
  Workflow,
  Zap,
  Crown,
  Users,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";

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
        </main>
      </div>
    </div>
  );
}

export default Pricing;
