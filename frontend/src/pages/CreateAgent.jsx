import {
  ArrowLeft,
  Bot,
  Calendar,
  Check,
  Globe,
  Mail,
  Calculator as CalcIcon,
  Workflow,
} from "lucide-react";
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaInstagram } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createAgent } from "@/features/agent.js";

const darkPanel =
  "border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35), inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl";

const fieldCls =
  "rounded-xl border-white/10 bg-white/[0.04] text-sm text-white backdrop-blur-xl placeholder:text-zinc-500 focus-visible:border-white/25 focus-visible:ring-0";

const availableTools = [
  {
    id: "web.search",
    name: "Web Search",
    category: "General",
    description: "Search the web for up-to-date information, news, and research",
    icon: Globe,
  },
  {
    id: "calculator",
    name: "Calculator",
    category: "General",
    description: "Perform arithmetic computations and mathematical evaluations",
    icon: CalcIcon,
  },
  {
    id: "gmail.read",
    name: "Read Emails",
    category: "Gmail",
    description: "Search and read messages from your connected Gmail inbox",
    icon: Mail,
  },
  {
    id: "gmail.send",
    name: "Send Emails",
    category: "Gmail",
    description: "Draft and send emails directly through your connected Gmail",
    icon: Mail,
  },
  {
    id: "calendar.read",
    name: "View Calendar",
    category: "Google Calendar",
    description: "Check upcoming events, meetings, and schedules",
    icon: Calendar,
  },
  {
    id: "calendar.create",
    name: "Schedule Events",
    category: "Google Calendar",
    description: "Create, schedule, or delete Google Calendar meetings",
    icon: Calendar,
  },
  {
    id: "instagram.read",
    name: "Instagram Stats & Posts",
    category: "Instagram",
    description: "Check connected Instagram profile statistics and recent media",
    icon: FaInstagram,
  },
  {
    id: "instagram.post",
    name: "Publish Instagram Post",
    category: "Instagram",
    description: "Publish photo posts with AI-generated captions & hashtags",
    icon: FaInstagram,
  },
];

const CreateAgent = () => {
  const [name, setName] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [instructions, setInstructions] = useState("");
  const [tools, setTools] = useState([
    "web.search",
    "calculator",
    "gmail.read",
    "gmail.send",
    "calendar.read",
    "calendar.create",
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleTool = (tool) => {
    setTools((prevTools) =>
      prevTools.includes(tool)
        ? prevTools.filter((t) => t !== tool)
        : [...prevTools, tool],
    );
  };

  const handleSelectAll = (e) => {
    e.preventDefault();
    if (tools.length === availableTools.length) {
      setTools([]);
    } else {
      setTools(availableTools.map((t) => t.id));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await createAgent({
        name,
        instructions,
        knowledgeBase,
        tools,
      });
      navigate("/agents");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unexpected error creating agent",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-dvh flex-col w-full items-center bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] overflow-y-auto text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center, transparent_40%, rgba(0,0,0,0.35)_100%)]"
      />
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

        <main className="mx-auto w-full max-w-2xl px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
          <div className="mb-9">
            <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-white text-zinc-900 shadow-[0_10px_40px_rgba(255,255,255,0.12)]">
              <Bot size={24} />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Create an agent
            </h1>

            <p className="mt-2 text-sm text-zinc-500">
              Configure your AI agent and define what capabilities it can use.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className={`space-y-7 rounded-3xl p-5 sm:p-7 ${darkPanel}`}
          >
            <section className="space-y-5">
              <div>
                <label
                  htmlFor="agent-name"
                  className="mb-2 block text-xs font-medium text-zinc-300"
                >
                  Agent Name
                </label>
                <Input
                  id="agent-name"
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                  placeholder="eg. Personal Assistant or Email & Calendar Bot"
                  maxLength={100}
                  required
                  className={`h-11 ${fieldCls}`}
                />
              </div>
              <div>
                <label
                  htmlFor="instructions"
                  className="mb-2 block text-xs font-medium text-zinc-300"
                >
                  Instructions
                </label>
                <Input
                  id="instructions"
                  onChange={(e) => setInstructions(e.target.value)}
                  value={instructions}
                  placeholder="eg. Check my emails, manage meetings, and help automate tasks."
                  maxLength={1000}
                  required
                  className={`h-11 ${fieldCls}`}
                />
              </div>
              <div>
                <label
                  htmlFor="knowledgeBase"
                  className="mb-2 block text-xs font-medium text-zinc-300"
                >
                  Knowledge Base (Optional)
                </label>
                <Textarea
                  id="knowledgeBase"
                  onChange={(e) => setKnowledgeBase(e.target.value)}
                  value={knowledgeBase}
                  placeholder="Add background context, preferences, or rules you want your agent to know."
                  maxLength={1000}
                  className={`h-36 resize-none ${fieldCls}`}
                />
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-medium text-zinc-300">
                    Integration Tools
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Select the capabilities available to your agent.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs text-violet-400 hover:text-violet-300 transition"
                >
                  {tools.length === availableTools.length
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                {availableTools.map((t, i) => {
                  const selected = tools?.includes(t.id);
                  const Icon = t.icon;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={(e) => {
                        e.preventDefault();
                        toggleTool(t.id);
                      }}
                      className={`flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition ${
                        i !== 0 ? "border-t border-white/[0.08]" : " "
                      } ${
                        selected
                          ? "bg-white/[0.09]"
                          : "bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid size-8 shrink-0 place-items-center rounded-lg border ${
                            selected
                              ? "border-violet-400/40 bg-violet-500/20 text-violet-300"
                              : "border-white/10 bg-white/5 text-zinc-400"
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-zinc-100">
                              {t.name}
                            </p>
                            <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">
                              {t.category}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            {t.description}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`grid size-5 shrink-0 place-items-center rounded-md border transition ${
                          selected
                            ? "border-violet-500 bg-violet-500 text-white"
                            : "border-white/20 bg-transparent text-transparent"
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-5">
              <Button
                type="button"
                variant="ghost"
                className={`rounded-xl text-xs text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer`}
                onClick={() => navigate("/agents")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className={
                  "h-8 rounded-md bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-200 cursor-pointer disabled:opacity-50"
                }
              >
                {loading ? "Creating..." : "Create Agent"}
              </Button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default CreateAgent;
