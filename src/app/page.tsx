"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import WorldMapPanel, { CountrySummary } from "@/components/WorldMapPanel";
import CountryHub, { CountryDetail } from "@/components/CountryHub";
import CountryExplorerPanel from "@/components/CountryExplorerPanel";
import LeaderboardSidebar, {
  LeaderboardData,
  GlobalFeedItem,
  GlobalCommentFeedItem,
} from "@/components/LeaderboardSidebar";
import AuthModal, {
  AuthenticatedUser,
  AuthModalMode,
} from "@/components/AuthModal";
import PoliticalCvModal, { PoliticalCvData } from "@/components/PoliticalCvModal";
import {
  Globe,
  MapPin,
  Zap,
  Trophy,
  LogIn,
  UserPlus,
  Sparkles,
} from "lucide-react";

const DEFAULT_PINNED_CODES = [
  "US",
  "GB",
  "DE",
  "FR",
  "TR",
  "UA",
  "RU",
  "IL",
  "CN",
  "JP",
  "IN",
  "BR",
];

type MobileTab = "globe" | "countries" | "pulse" | "ranking";

export default function AgoraMundiPage() {
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>("A");
  const [countryDetail, setCountryDetail] = useState<CountryDetail | null>(
    null
  );
  const [loadingCountry, setLoadingCountry] = useState<boolean>(false);

  const [pinnedCodes, setPinnedCodes] =
    useState<string[]>(DEFAULT_PINNED_CODES);
  const [mobileTab, setMobileTab] = useState<MobileTab>("globe");

  const [commentSort, setCommentSort] = useState<"likes" | "recent">("likes");
  const [preferredTranslateLang, setPreferredTranslateLang] =
    useState<string>("en");
  const countryCacheRef = useRef<Map<string, CountryDetail>>(new Map());

  // Auth & Modals
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null
  );
  const [googleEnabled, setGoogleEnabled] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);
  const [authContextHint, setAuthContextHint] = useState<string | null>(null);
  const [cvModalData, setCvModalData] = useState<PoliticalCvData | null>(null);

  // Global Feed & Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [globalAgendas, setGlobalAgendas] = useState<GlobalFeedItem[]>([]);
  const [recentComments, setRecentComments] = useState<GlobalCommentFeedItem[]>(
    []
  );

  // Restore saved pinned countries + optional URL ?country= param
  useEffect(() => {
    try {
      const saved = localStorage.getItem("agora_pinned_countries");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedCodes(parsed);
        }
      }
      const params = new URLSearchParams(window.location.search);
      const urlCountry = params.get("country");
      const urlSlot = params.get("slot");
      const authError = params.get("authError");
      if (urlCountry) {
        setSelectedCode(urlCountry.toUpperCase());
        if (urlSlot && ["A", "B", "C"].includes(urlSlot.toUpperCase())) {
          setSelectedSlot(urlSlot.toUpperCase());
        }
      }
      if (authError) {
        const errorMessages: Record<string, string> = {
          google_cancelled: "Google sign-in was cancelled. You can try again anytime.",
          google_state: "Security check expired during Google sign-in. Please try again.",
          google_unverified: "Your Google account email must be verified to sign in.",
          google_config: "Google sign-in is not configured on this server yet.",
        };
        setAuthContextHint(
          errorMessages[authError] || "Google sign-in failed. Please try again."
        );
        setAuthModalMode("login");
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("authError");
        window.history.replaceState({}, "", cleanUrl.toString());
      }
    } catch {
      // ignore
    }
  }, []);

  const togglePinnedCountry = (code: string) => {
    setPinnedCodes((prev) => {
      let next: string[];
      if (prev.includes(code)) {
        if (prev.length <= 1) return prev;
        next = prev.filter((c) => c !== code);
      } else {
        next = [code, ...prev];
      }
      try {
        localStorage.setItem("agora_pinned_countries", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user || null);
        setGoogleEnabled(Boolean(data.googleEnabled));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchGlobalState = useCallback(async () => {
    try {
      const [cRes, fRes, lRes] = await Promise.all([
        fetch("/api/countries"),
        fetch("/api/feed"),
        fetch("/api/leaderboard"),
      ]);

      if (cRes.ok) {
        const cData = await cRes.json();
        setCountries(cData.countries || []);
      }
      if (fRes.ok) {
        const fData = await fRes.json();
        setGlobalAgendas(fData.recentAgendas || []);
        setRecentComments(fData.recentComments || []);
      }
      if (lRes.ok) {
        const lData = await lRes.json();
        setLeaderboard(lData);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchCountryDetail = useCallback(
    async (code: string, sort: "likes" | "recent", bypassCache = false) => {
      const cacheKey = `${code}:${sort}`;
      const cached = !bypassCache
        ? countryCacheRef.current.get(cacheKey)
        : undefined;
      if (cached) {
        setCountryDetail(cached);
        setLoadingCountry(false);
      } else {
        setLoadingCountry(true);
      }

      try {
        const res = await fetch(`/api/countries/${code}?sort=${sort}`);
        if (res.ok) {
          const data = await res.json();
          if (data.country) {
            countryCacheRef.current.set(cacheKey, data.country);
            setCountryDetail(data.country);
          }
        }
      } finally {
        setLoadingCountry(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchSession();
    void fetchGlobalState();

    // Silently pull fresh DB state every 5 minutes when tab is visible
    const refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        countryCacheRef.current.clear();
        void fetchGlobalState();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(refreshTimer);
  }, [fetchSession, fetchGlobalState]);

  useEffect(() => {
    if (!selectedCode) {
      setCountryDetail(null);
      return;
    }
    const cached = countryCacheRef.current.get(`${selectedCode}:${commentSort}`);
    if (cached) {
      setCountryDetail(cached);
    } else {
      setCountryDetail((prev) => (prev?.code === selectedCode ? prev : null));
    }
    void fetchCountryDetail(selectedCode, commentSort);
  }, [selectedCode, commentSort, fetchCountryDetail]);

  // Sync URL query params cleanly without page reload
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selectedCode) {
        url.searchParams.set("country", selectedCode);
        url.searchParams.set("slot", selectedSlot);
      } else {
        url.searchParams.delete("country");
        url.searchParams.delete("slot");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }, [selectedCode, selectedSlot]);

  const handleSelectCountry = (code: string | null, slot = "A") => {
    if (code && window.scrollY > 120) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    setSelectedCode(code);
    setSelectedSlot(slot);
    setMobileTab("globe");
  };

  const handleOpenAuth = (hint?: string) => {
    setAuthContextHint(hint || null);
    setAuthModalMode("login");
  };

  const handleOpenUserCv = async (username: string) => {
    const res = await fetch(`/api/users/${username}`);
    if (res.ok) {
      const data = await res.json();
      setCvModalData(data);
    }
  };

  const handleFollowUser = async (username: string) => {
    if (!currentUser) {
      handleOpenAuth("Sign in to follow users.");
      return;
    }

    const res = await fetch(`/api/users/${username}/follow`, {
      method: "POST",
    });
    if (res.status === 401) {
      handleOpenAuth("Sign in to follow users.");
      return;
    }
    if (res.ok) {
      await Promise.all([
        selectedCode
          ? fetchCountryDetail(selectedCode, commentSort, true)
          : Promise.resolve(),
        fetchGlobalState(),
        fetchSession(),
      ]);
      if (cvModalData && cvModalData.user.username === username) {
        void handleOpenUserCv(username);
      }
    }
  };

  const handleVoteComment = async (commentId: string) => {
    if (!currentUser) {
      handleOpenAuth("Sign in or create an account to like comments.");
      return;
    }

    const res = await fetch(`/api/comments/${commentId}/vote`, {
      method: "POST",
    });
    if (res.status === 401) {
      handleOpenAuth("Sign in to like comments.");
      return;
    }
    if (res.ok && selectedCode) {
      await Promise.all([
        fetchCountryDetail(selectedCode, commentSort, true),
        fetchGlobalState(),
      ]);
    }
  };

  return (
    <div className="min-h-dvh w-full max-w-full flex flex-col text-ink relative overflow-x-clip pb-20 lg:pb-6">
      {/* ====================================================================
          STICKY GLASS TOP NAVIGATION BAR
         ==================================================================== */}
      <header className="w-full bg-white/80 backdrop-blur-xl sticky top-0 z-30 shadow-[0_1px_14px_rgb(0,0,0,0.04)]">
        <div className="max-w-[1720px] mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left Brand + Home Globe Reset */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => handleSelectCountry(null)}
              className="flex items-center gap-2 font-serif font-bold tracking-wider text-ink hover:text-authority transition truncate"
            >
              <span className="w-8 h-8 rounded-2xl bg-authority text-white flex items-center justify-center shadow-xs shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-[18px] h-[18px]"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
                  <ellipse cx="12" cy="12" rx="3.6" ry="8" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4.2 12H19.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="17.5" cy="6.5" r="2" fill="#38BDF8" stroke="#1D3557" strokeWidth="0.9" />
                </svg>
              </span>
              <span className="fluid-brand-title tracking-tight">globeTake</span>
            </button>

            <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 text-[11px] font-semibold">
              <Sparkles className="w-3 h-3" />
              <span>174 Countries • 3 Live Agendas</span>
            </span>
          </div>

          {/* Right Auth / User Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenUserCv(currentUser.username)}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200/80 text-xs font-semibold text-ink transition"
                >
                  <span
                    className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: currentUser.avatarColor }}
                  >
                    {currentUser.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="max-w-[120px] truncate">
                    @{currentUser.username}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthContextHint(null);
                    setAuthModalMode("profile");
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-authority text-white text-xs font-semibold shadow-xs hover:opacity-95 transition"
                >
                  My Account
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthContextHint(null);
                    setAuthModalMode("login");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200/75 hover:bg-gray-200 text-xs font-semibold text-ink transition"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthContextHint(null);
                    setAuthModalMode("register");
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-authority text-white text-xs font-semibold shadow-sm hover:opacity-95 transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Sign Up</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ====================================================================
          MAIN STAGE:
          - Desktop (lg+): 3-Column Wide Command Center (Explorer | Globe+Hub | Live Pulse & Ranking)
          - Mobile (<lg): Smooth Tabbed Workspace with Bottom Collapsible Tab Bar
         ==================================================================== */}
      <main className="max-w-[1720px] w-full mx-auto px-3 sm:px-5 pt-4 sm:pt-5 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[335px_minmax(0,1fr)_355px] gap-5 items-start">
          {/* 1. LEFT PANEL: 174 Country Explorer (Always visible on Desktop, Tab on Mobile) */}
          <div
            className={`${
              mobileTab === "countries" ? "block" : "hidden"
            } lg:block lg:sticky lg:top-18`}
          >
            <CountryExplorerPanel
              countries={countries}
              selectedCode={selectedCode}
              pinnedCodes={pinnedCodes}
              onSelectCountry={(code) => handleSelectCountry(code, "A")}
              onTogglePin={togglePinnedCountry}
            />
          </div>

          {/* 2. CENTER STAGE: Interactive 3D Globe (Hero -> Compact Dock) + Selected Country Hub */}
          <div
            className={`${
              mobileTab === "globe" ? "flex" : "hidden"
            } lg:flex flex-col items-center space-y-4 min-w-0`}
          >
            <WorldMapPanel
              countries={countries}
              selectedCode={selectedCode}
              pinnedCodes={pinnedCodes}
              onSelectCountry={(code) => handleSelectCountry(code, "A")}
              onOpenExplorer={() => setMobileTab("countries")}
            />

            {/* Immediately beneath the shrunken globe when a country is selected! */}
            {selectedCode && (
              <CountryHub
                country={countryDetail}
                loading={loadingCountry}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
                commentSort={commentSort}
                onChangeSort={setCommentSort}
                currentUser={currentUser}
                preferredTranslateLang={preferredTranslateLang}
                onChangeTranslateLang={setPreferredTranslateLang}
                onCloseCountry={() => handleSelectCountry(null)}
                onOpenAuth={handleOpenAuth}
                onOpenUserCv={handleOpenUserCv}
                onFollowUser={handleFollowUser}
                onVoteComment={handleVoteComment}
                onCommentCreated={async () => {
                  if (selectedCode) {
                    await Promise.all([
                      fetchCountryDetail(selectedCode, commentSort, true),
                      fetchGlobalState(),
                      fetchSession(),
                    ]);
                  }
                }}
              />
            )}
          </div>

          {/* 3. RIGHT PANEL: Global Live Pulse & Leaderboard (Always visible on Desktop, Tabs on Mobile) */}
          <div
            className={`${
              mobileTab === "pulse" || mobileTab === "ranking"
                ? "block"
                : "hidden"
            } lg:block lg:sticky lg:top-18`}
          >
            <LeaderboardSidebar
              key={mobileTab === "ranking" ? "ranking" : "pulse"}
              data={leaderboard}
              globalAgendas={globalAgendas}
              recentComments={recentComments}
              defaultView={mobileTab === "ranking" ? "ranking" : "pulse"}
              onOpenUserCv={handleOpenUserCv}
              onSelectCountryAndSlot={(code, slot) =>
                handleSelectCountry(code, slot)
              }
            />
          </div>
        </div>
      </main>

      {/* ====================================================================
          MOBILE COLLAPSIBLE BOTTOM TAB BAR (< lg)
         ==================================================================== */}
      <nav
        aria-label="Mobile Navigation Tabs"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-gray-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 py-1.5"
      >
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setMobileTab("globe")}
            className={`py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
              mobileTab === "globe"
                ? "bg-authority text-white shadow-xs"
                : "text-slate hover:text-ink"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{selectedCode ? `${selectedCode} Agenda` : "Globe"}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("countries")}
            className={`py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
              mobileTab === "countries"
                ? "bg-authority text-white shadow-xs"
                : "text-slate hover:text-ink"
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>Countries</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("pulse")}
            className={`py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
              mobileTab === "pulse"
                ? "bg-authority text-white shadow-xs"
                : "text-slate hover:text-ink"
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Live Pulse</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab("ranking")}
            className={`py-1.5 px-2 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
              mobileTab === "ranking"
                ? "bg-authority text-white shadow-xs"
                : "text-slate hover:text-ink"
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Rankings</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <AuthModal
        mode={authModalMode}
        currentUser={currentUser}
        googleEnabled={googleEnabled}
        countries={countries}
        contextHint={authContextHint}
        onClose={() => setAuthModalMode(null)}
        onSuccess={(user) => {
          setCurrentUser(user);
          countryCacheRef.current.clear();
          if (selectedCode) {
            void fetchCountryDetail(selectedCode, commentSort, true);
          }
          void fetchGlobalState();
        }}
      />

      <PoliticalCvModal
        cvData={cvModalData}
        onClose={() => setCvModalData(null)}
        onFollow={handleFollowUser}
        onEditOwnProfile={() => {
          setAuthContextHint(null);
          setAuthModalMode("profile");
        }}
        onJumpToCountry={(code, slot) => handleSelectCountry(code, slot)}
      />
    </div>
  );
}
