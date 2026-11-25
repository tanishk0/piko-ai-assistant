import { ArrowLeft, Bot, Workflow } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createAgent } from "@/features/agent.js";
import ToolPermissions from '@/components/ToolPermissions.jsx';

const darkPanel =
  "border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35), inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl";

const fieldCls =
  "rounded-xl border-white/10 bg-white/[0.04] text-sm text-white backdrop-blur-xl placeholder:text-zinc-500 focus-visible:border-white/25 focus-visible:ring-0";

const CreateAgent = () => {
  const [tools, setTools] = useState(['web_search', 'calculator']);
  const [name, setName] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
              Give your agent a name, instructions, and optional context. It
              can use the tools you enable below when their integrations are connected.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className={`space-y-7 rounded-3xl p-5 sm:p-7 ${darkPanel}`}
          >
            <ToolPermissions value={tools} onChange={setTools} disabled={loading} />
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
