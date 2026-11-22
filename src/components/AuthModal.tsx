"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, LogIn, UserPlus, UserCog, LogOut, AlertCircle } from "lucide-react";
import type { CountrySummary } from "@/components/WorldMapPanel";

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  title: string;
  bio: string;
  countryCode: string;
  avatarColor: string;
  totalLikes: number;
  weeklyLikes: number;
  followerCount: number;
  followingCount: number;
  globalReachCount: number;
}

export type AuthModalMode = "login" | "register" | "profile" | null;

interface AuthModalProps {
  mode: AuthModalMode;
  currentUser: AuthenticatedUser | null;
  googleEnabled: boolean;
  countries: CountrySummary[];
  contextHint?: string | null;
  onClose: () => void;
  onSuccess: (user: AuthenticatedUser | null) => void;
}

export default function AuthModal({
  mode,
  currentUser,
  googleEnabled,
  countries,
  contextHint,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [activeTab, setActiveTab] = useState<"login" | "register" | "profile">(
    "login"
  );

  // Form states
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode) {
      setActiveTab(mode);
      setError(null);
      if (mode === "profile" && currentUser) {
        setDisplayName(currentUser.displayName);
        setTitle(currentUser.title);
        setBio(currentUser.bio);
        setCountryCode(currentUser.countryCode);
      }
    }
  }, [mode, currentUser]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (mode) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [mode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);

    const handleBackdropClick = (e: MouseEvent) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= e.clientY &&
        e.clientY <= rect.bottom &&
        rect.left <= e.clientX &&
        e.clientX <= rect.right;
      if (!inside) dialog.close();
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [onClose]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
        return;
      }
      onSuccess(data.user);
      onClose();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          displayName: displayName || username,
          password,
          countryCode,
          title: title || "Global Affairs Commentator",
          bio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed.");
        return;
      }
      onSuccess(data.user);
      onClose();
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, title, bio, countryCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update profile.");
        return;
      }
      onSuccess(data.user);
      onClose();
    } catch {
      setError("An error occurred while updating your profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onSuccess(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-modal-title"
      className="w-[94dvw] max-w-md bg-white text-ink rounded-3xl shadow-[0_25px_70px_rgba(15,23,42,0.22)] p-0 border-0 outline-none"
    >
      {mode && (
        <div className="p-6 space-y-5">
          {/* Top Header */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2
                id="auth-modal-title"
                className="font-serif font-bold text-lg text-ink"
              >
                {activeTab === "profile"
                  ? "Profile Settings"
                  : activeTab === "register"
                  ? "Join globeTake"
                  : "Sign In"}
              </h2>
              <p className="text-xs text-slate mt-0.5">
                {contextHint ||
                  (activeTab === "profile"
                    ? "Customize your public identity and profile details."
                    : "Discuss live agendas across 174 countries and share your perspective.")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Login / Register Switcher */}
          {activeTab !== "profile" && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("login");
                  setError(null);
                }}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  activeTab === "login"
                    ? "bg-white text-authority shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("register");
                  setError(null);
                }}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  activeTab === "register"
                    ? "bg-white text-authority shadow-sm"
                    : "text-slate hover:text-ink"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Sign Up</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 text-rose-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Google OAuth Button if configured */}
          {activeTab !== "profile" && googleEnabled && (
            <div className="space-y-3">
              <a
                href="/api/auth/google"
                className="w-full py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200/80 text-xs font-semibold text-ink flex items-center justify-center gap-2 transition"
              >
                <span>🌐 Continue with Google</span>
              </a>
              <div className="text-center text-[11px] text-slate">
                or continue with email
              </div>
            </div>
          )}

          {/* LOGIN FORM */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Email or Username
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or username"
                  className="w-full px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-4 py-2.5 text-sm bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-authority text-white text-xs font-semibold shadow-md hover:opacity-95 disabled:opacity-50 transition"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {activeTab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alex_morgan"
                    className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Password (Min. 6 chars) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Country
                  </label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flagEmoji} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-authority text-white text-xs font-semibold shadow-md hover:opacity-95 disabled:opacity-50 transition"
              >
                {loading ? "Creating account..." : "Create Account & Join"}
              </button>
            </form>
          )}

          {/* PROFILE SETTINGS FORM */}
          {activeTab === "profile" && currentUser && (
            <form onSubmit={handleUpdateProfile} className="space-y-3.5">
              <div className="flex items-center gap-3 p-3 bg-gray-100/80 rounded-2xl">
                <div
                  className="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0"
                  style={{ backgroundColor: currentUser.avatarColor }}
                >
                  {currentUser.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">
                    @{currentUser.username}
                  </div>
                  <div className="text-[11px] text-slate truncate">
                    {currentUser.email}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Short Bio
                </label>
                <textarea
                  rows={2}
                  maxLength={280}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell others about yourself and the regions you follow..."
                  className="w-full px-3.5 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Country
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flagEmoji} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-authority text-white text-xs font-semibold shadow-sm hover:opacity-95 transition"
                >
                  <UserCog className="w-3.5 h-3.5" />
                  <span>{loading ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}
