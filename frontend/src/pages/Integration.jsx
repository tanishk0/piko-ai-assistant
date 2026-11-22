import { ArrowLeft, Calendar, Mail, Workflow } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaInstagram } from "react-icons/fa";
import {
  connectGoogle,
  connectInstagram,
  disconnectGoogle,
  disconnectInstagram,
  getAllIntegrations,
} from "@/features/integration";
import { Separator } from "@base-ui/react/separator";

const integrationList = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Send and manage emails through your AI agent.",
    icon: Mail,
  },
  {
    id: "googleCalendar",
    name: "Calendar",
    description: "Manage calendar events through your AI agent.",
    icon: Calendar,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Publish images with AI generated captions and hashtags.",
    icon: FaInstagram,
  },
];

const Integration = () => {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const [integrations, setIntegrations] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch all integrations
  const fetchAllIntegrations = async () => {
    try {
      const data = await getAllIntegrations();
      setIntegrations(data?.integrations ?? {});
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to fetch integrations.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllIntegrations();
  }, []);

  // Connect integration
  const handleConnect = async (id) => {
    setConnecting(id);
    setError("");
    setSuccess("");

    try {
      let data;

      if (id === "gmail" || id === "googleCalendar") {
        data = await connectGoogle();
      } else if (id === "instagram") {
        data = await connectInstagram();
      } else {
        throw new Error("Unsupported integration.");
      }

      if (!data?.success || !data?.url) {
        throw new Error(
          data?.response?.data?.message ||
            data?.message ||
            "Unable to connect integration.",
        );
      }

      // Redirect to OAuth authorization page
      window.location.assign(data.url);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Something went wrong while connecting.",
      );
      setConnecting(null);
    }
  };

  // Disconnect integration
  const handleDisconnect = async (id) => {
    const confirmed = window.confirm(
      `Are you sure you want to disconnect ${id}?`,
    );

    if (!confirmed) return;

    setDisconnecting(id);
    setError("");
    setSuccess("");

    try {
      if (id === "gmail" || id === "googleCalendar") {
        await disconnectGoogle();
      } else if (id === "instagram") {
        await disconnectInstagram();
      } else {
        throw new Error("Unsupported integration.");
      }

      setSuccess(`${id} disconnected successfully.`);

      await fetchAllIntegrations();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to disconnect integration.",
      );
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="relative flex h-dvh w-full flex-col items-center overflow-y-auto bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#2b2f3a_0%,#191b21_55%,#121317_100%)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.35)_100%)]"
      />

      <div className="relative z-10 w-full">
        {/* Header */}
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

        {/* Main content */}
        <main className="relative z-10 mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-0">
          <div className="space-y-2">
            <h1 className="text-3xl font-medium tracking-tight">
              Integrations
            </h1>

            <p className="text-sm text-zinc-500">
              Connect your accounts and let Automate AI handle tasks.
            </p>
          </div>

          <Separator className="bg-white/10" />

          {/* Error message */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4">
              <p className="text-sm text-emerald-300">{success}</p>
            </div>
          )}

          {/* Integration list */}
          <div className="space-y-4">
            {loading ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                Loading integrations...
              </p>
            ) : (
              integrationList.map((item) => {
                const integration = integrations?.[item.id] ?? {};
                const connected = Boolean(integration.connected);
                const Icon = item.icon;

                const isConnecting = connecting === item.id;
                const isDisconnecting = disconnecting === item.id;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition hover:border-white/25 hover:bg-white/[0.06] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10">
                        <Icon size={21} />
                      </div>

                      <div>
                        <p className="font-medium">{item.name}</p>

                        <p className="text-sm text-zinc-500">
                          {item.description}
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`size-1.5 rounded-full ${
                              connected ? "bg-emerald-400" : "bg-zinc-500"
                            }`}
                          />

                          <span className="text-xs text-zinc-400">
                            {connected ? "Connected" : "Not connected"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={isConnecting || isDisconnecting}
                      onClick={() =>
                        connected
                          ? handleDisconnect(item.id)
                          : handleConnect(item.id)
                      }
                      className={`shrink-0 rounded-lg border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        connected
                          ? "border-red-500/20 text-red-300 hover:bg-red-500/10"
                          : "border-white/10 bg-white/10 text-white hover:bg-white/15"
                      }`}
                    >
                      {isConnecting
                        ? "Connecting..."
                        : isDisconnecting
                          ? "Disconnecting..."
                          : connected
                            ? "Disconnect"
                            : "Connect"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Integration;
