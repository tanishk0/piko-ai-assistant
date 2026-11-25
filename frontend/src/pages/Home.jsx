import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  LogOut,
  PlusIcon,
  Settings2,
  UserRound,
  Workflow,
  WorkflowIcon,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDispatch, useSelector } from "react-redux";

import { logout } from "@/features/auth";
import { setUserData } from "@/redux/userSlice";
import { Textarea } from "@/components/ui/textarea";
import { setSelectedAgent } from "@/redux/agentSlice";
import { useConversation } from "@/features/useConversation.js";

const darkPanel =
  "border border-white/10 bg-white/[0.04] shadow-[0_20px_60px_rgba(0,0,0,0.35), inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl";

const HomeSession = () => {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const { userData } = useSelector((state) => state.user);
  const { agents, selectedAgent } = useSelector((state) => state.agent);
  const selectedName = agents.find(agent => agent._id === selectedAgent)?.name;
  const { messages, actions, sending, busy, historyUnavailable, error, submit, decide, newChat, retryRequest } = useConversation(userData?._id, selectedAgent);
  const dispatch = useDispatch();
  const [message, setMessage] = useState("");

  const handleLogout = async () => {
    setLogoutLoading(true);
    await logout();
    dispatch(setUserData(null));
    setLogoutLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || busy || historyUnavailable) return;
    setMessage("");
    await submit(trimmed);
  };

  const menuContent =
    "rounded-2xl border border-white/10 bg-[#1d2026]/95 p-1.5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl";

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] px-4 text-white">
      {/* Background overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />

      {/* Main container */}
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* Navbar */}
        <header className="flex h-16 w-full shrink-0 items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-zinc-900">
              <Workflow size={22} />
            </span>
            <span className="text-sm font-medium tracking-tight">
              Automate AI
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="border-white/20 bg-white text-zinc-900 hover:bg-zinc-200"
                  />
                }
              >
                <WorkflowIcon size={16} />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className={`w-56`}>
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Link to={"/agents"} className="flex items-center gap-2.5">
                      <Bot /> My Agents
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem>
                    <Link
                      to={"/agents/new"}
                      className="flex items-center gap-2.5"
                    >
                      <PlusIcon /> Create New Agent
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link
                      to={"/integrations"}
                      className="flex items-center gap-2.5"
                    >
                      <Settings2 /> Integrations
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Link to="/pricing" className="flex items-center gap-2.5">
                      <Workflow size={16} /> Pricing & billing
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="border-white/20 bg-white text-zinc-900 hover:bg-zinc-200"
                  />
                }
              >
                <button
                  type="button"
                  aria-label="Open Profile"
                  className="flex size-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]"
                >
                  {userData?.profilePicture ? (
                    <img
                      src={userData?.profilePicture}
                      referrerPolicy="no-referrer"
                      alt="Profile"
                      className="size-full object-cover"
                    />
                  ) : (
                    <UserRound />
                  )}
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className={`w-64`}>
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="">
                    <p className="truncate text-xs font-medium">
                      {userData?.name || "User"}
                    </p>
                    <p className="truncate text-xs">
                      {userData?.email || "email"}
                    </p>
                    <Link to="/pricing" className="mt-2 block text-xs text-violet-300">{(userData?.credits ?? 0).toLocaleString()} credits · Manage billing</Link>
                  </div>
                </div>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      handleLogout();
                    }}
                    className="cursor-pointer gap-2.5 rounded-xl py-2.5 text-red-400 focus:bg-red-500/10 focus:text-red-400"
                  >
                    {logoutLoading ? (
                      "Logging out..."
                    ) : (
                      <>
                        <LogOut /> Logout
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="mx-auto flex w-full max-w-3xl justify-end px-4">
              <Button variant="ghost" disabled={sending} onClick={newChat}>New chat</Button>
            </div>
            <div className={`min-h-0 flex-1 overflow-y-auto`}>
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
                {messages.length === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
                    <div className="mb-7 grid size-14 place-items-center rounded-2xl bg-white text-zinc-900">
                      <WorkflowIcon size={26} />
                    </div>
                    <p className="text-base text-violet-300/80">
                      Hi, {userData?.name || "User"}
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                      How can I help you?
                    </h1>
                    <p className="mt-4 max-w-sm text-xs leading-5 text-zinc-500">
                      Ask questions, automate tasks, or connect integrations
                      to read emails, draft replies, and more.
                    </p>
                  </div>
                )}

                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="mr-3 mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-900">
                        <WorkflowIcon size={15} />
                      </div>
                    )}
                    <div
                      className={`max-w-[90%] break-words px-4 py-3 text-sm leading-7 sm:max-w-[80%] ${
                        msg.role === "user"
                          ? `rounded-2xl rounded-br-md text-white ${darkPanel}`
                          : "text-zinc-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {actions.map(action => (
                  <div key={action.id} className="rounded-xl border border-white/15 p-4 text-sm text-zinc-200">
                    <p className="font-medium">{action.tool.replaceAll('_', ' ')} ? {action.status}</p>
                    <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(action.args, null, 2)}</pre>
                    {action.result && <pre className="mb-3 whitespace-pre-wrap break-words text-xs">{JSON.stringify(action.result, null, 2)}</pre>}
                    {action.status === 'pending' && new Date(action.expiresAt) > new Date() && (
                      <div className="flex gap-3">
                        <Button disabled={sending || busy} onClick={() => decide(action, 'approve')}>Approve action</Button>
                        <Button variant="outline" disabled={sending || busy} onClick={() => decide(action, 'reject')}>Reject</Button>
                      </div>
                    )}
                    {action.status === 'pending' && new Date(action.expiresAt) <= new Date() && <p>Approval expired. Request a new proposal.</p>}
                    {['executing', 'unknown'].includes(action.status) && <p>Check the connected service before requesting this action again.</p>}
                  </div>
                ))}
                {busy && <p className="text-sm text-amber-300">A request is active. Refresh to check its result.</p>}
                {error && <div role="alert" className="text-sm text-red-300">{error} {retryRequest && <Button disabled={sending} onClick={retryRequest}>Retry request</Button>}</div>}
                {sending && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Loader2 size={16} className="animate-spin text-zinc-300" />
                    <span>Thinking...</span>
                  </div>
                )}
              </div>
            </div>
            <div className="z-20 w-full shrink-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-4">
              <form
                onSubmit={handleSubmit}
                className={`mx-auto w-full max-w-2xl rounded-2xl p-3 transition-colors focus-within:border-white/25 ${darkPanel}`}
              >
                <Textarea
                  maxLength={12000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder={
                    selectedAgent
                      ? `Message ${selectedName || "agent"}...`
                      : "Ask me anything..."
                  }
                  className={`min-h-20 resize-none border-0 !bg-transparent px-2 py-1.5 text-sm text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-0`}
                />
                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Attach image"
                      title="Attach image"
                      className={`size-8 rounded-lg text-zinc-800 hover:bg-white/10 hover:text-white`}
                    >
                      <ImagePlus size={17} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className={`h-8 max-w-48 gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white`}
                        >
                          <Bot size={14} />
                          <span className="truncate">
                            {selectedName || "No agent"}
                          </span>
                          <ChevronDown size={14} />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent
                        align="start"
                        side="top"
                        className={`mb-2 w-60 ${menuContent}`}
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.preventDefault();
                            dispatch(setSelectedAgent(""));
                          }}
                          className="cursor-pointer gap-2"
                        >
                          <WorkflowIcon size={14} className="shrink-0" />
                          <span>Default Chat (No agent)</span>
                          {!selectedAgent && <Check size={14} />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        {agents?.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-zinc-400">
                            No custom agents yet
                          </div>
                        )}

                        {agents?.map((agent, index) => (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              dispatch(setSelectedAgent(agent._id));
                            }}
                            key={index}
                            className={`cursor-pointer gap-2`}
                          >
                            <Bot
                              size={15}
                              className="shrink-0 text-violet-400"
                            />
                            <span className="truncate">{agent?.name}</span>
                            {selectedAgent === agent?._id && (
                              <Check size={14} />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild className={menuContent}>
                          <Link
                            to={"/agents/new"}
                            className="flex items-center gap-2"
                          >
                            <PlusIcon size={15} /> Create new agent
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      disabled={!message.trim() || sending || busy || historyUnavailable}
                      type="submit"
                      size="icon"
                      aria-label="Send message"
                      className={`size-8 shrink-0 bg-white text-black hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <ArrowUp size={16} />
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default function Home() {
  const { userData } = useSelector(state => state.user);
  const { selectedAgent } = useSelector(state => state.agent);
  return <HomeSession key={`${userData?._id}:${selectedAgent}`} />;
}
