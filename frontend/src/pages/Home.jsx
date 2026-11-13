import {
  Bot,
  LogOut,
  PlusIcon,
  Settings2,
  User,
  UserRound,
  Workflow,
  WorkflowIcon,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "@/features/auth";
import { setUserData } from "@/redux/userSlice";

const Home = () => {
  const [logoutLoading, setLogoutLoading] = useState(false);
  const { userData } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const handleLogout = async () => {
    (setLogoutLoading(true), await logout());
    dispatch(setUserData(null));
    setLogoutLoading(false);
  };
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
                  className="flex size-9 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-whiite/[0.05]"
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
      </div>
    </div>
  );
};

export default Home;
