"use client";

import React, { useEffect, useState, useCallback } from "react";
import WorldMapPanel, { CountrySummary } from "@/components/WorldMapPanel";
import PoliticalCvModal, { PoliticalCvData } from "@/components/PoliticalCvModal";
import {
  Search,
  ThumbsUp,
  Languages,
  ExternalLink,
  Send,
  AlertTriangle,
  CheckCircle2,
  Globe,
  X,
  PenLine,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";

interface CommentItem {
  id: string;
  content: string;
  sourceUrl?: string | null;
  stanceTag: string;
  languageCode: string;
  likeCount: number;
  aiQualityScore: number;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    title: string;
    countryCode: string;
    followerCount: number;
    weeklyLikes: number;
  };
}

interface AgendaDetail {
  id: string;
  slot: string;
  title: string;
  commentCount: number;
  comments: CommentItem[];
}

interface CountryDetail {
  code: string;
  nameTr: string;
  region: string;
  flagEmoji: string;
  tempo: string;
  updateIntervalHours: number;
  lastUpdatedAt: string;
  agendas: AgendaDetail[];
}

type LeftDrawerTab = "countries" | null;

export default function AgoraMundiPage() {
  const [countries, setCountries] = useState<CountrySummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>("TR");
  const [selectedSlot, setSelectedSlot] = useState<string>("B");
  const [countryDetail, setCountryDetail] = useState<CountryDetail | null>(null);

  const [leftTab, setLeftTab] = useState<LeftDrawerTab>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [showComposer, setShowComposer] = useState<boolean>(false);
  const [commentSort, setCommentSort] = useState<"likes" | "recent">("likes");

  const [activeUsername, setActiveUsername] = useState<string>(
    "karslioglu_strateji"
  );

  const [commentText, setCommentText] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [stanceTag, setStanceTag] = useState<string>("TEZ");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const [translations, setTranslations] = useState<
    Record<string, { text: string; loading: boolean; targetLang: string }>
  >({});
  const [preferredTranslateLang, setPreferredTranslateLang] =
    useState<string>("tr");

  const [cvModalData, setCvModalData] = useState<PoliticalCvData | null>(null);
  const [syncingAgendas, setSyncingAgendas] = useState<boolean>(false);

  const fetchInitialData = useCallback(async () => {
    const countriesRes = await fetch("/api/countries");
    if (countriesRes.ok) {
      const cData = await countriesRes.json();
      setCountries(cData.countries || []);
    }
  }, []);

  const fetchCountryDetail = useCallback(
    async (code: string, sort: "likes" | "recent") => {
      const res = await fetch(`/api/countries/${code}?sort=${sort}`);
      if (res.ok) {
        const data = await res.json();
        setCountryDetail(data.country);
      }
    },
    []
  );

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    fetchCountryDetail(selectedCode, commentSort);
  }, [selectedCode, commentSort, fetchCountryDetail]);

  useEffect(() => {
    const syncAria = (el: EventTarget | null) => {
      if (
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement
      ) {
        try {
          el.setAttribute(
            "aria-invalid",
            el.matches(":user-invalid") ? "true" : "false"
          );
        } catch {
          // ignore
        }
      }
    };

    const onBlur = (e: Event) => syncAria(e.target);
    const onInput = (e: Event) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.hasAttribute("aria-invalid")
      ) {
        syncAria(e.target);
      }
    };

    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput);
    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput);
    };
  }, []);

  const handleSelectCountry = (code: string) => {
    setSelectedCode(code);
    setSelectedSlot("A");
    setSubmitFeedback(null);
    setLeftTab(null);
  };

  const handleAutonomousSync = async (code: string) => {
    setSyncingAgendas(true);
    try {
      const res = await fetch("/api/agendas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: code }),
      });
      if (res.ok) {
        await Promise.all([
          fetchInitialData(),
          fetchCountryDetail(code, commentSort),
        ]);
      }
    } finally {
      setSyncingAgendas(false);
    }
  };

  const handleOpenUserCv = async (username: string) => {
    const res = await fetch(`/api/users/${username}`);
    if (res.ok) {
      const data = await res.json();
      setCvModalData(data);
    }
  };

  const handleFollowUser = async (username: string) => {
    const res = await fetch(`/api/users/${username}/follow`, {
      method: "POST",
    });
    if (res.ok) {
      await Promise.all([
        fetchInitialData(),
        fetchCountryDetail(selectedCode, commentSort),
      ]);
      if (cvModalData && cvModalData.user.username === username) {
        handleOpenUserCv(username);
      }
    }
  };

  const handleVoteComment = async (commentId: string) => {
    const res = await fetch(`/api/comments/${commentId}/vote`, {
      method: "POST",
    });
    if (res.ok) {
      await Promise.all([
        fetchCountryDetail(selectedCode, commentSort),
        fetchInitialData(),
      ]);
    }
  };

  const handleGoogleTranslate = async (commentId: string, text: string) => {
    setTranslations((prev) => ({
      ...prev,
      [commentId]: {
        text: prev[commentId]?.text || "",
        loading: true,
        targetLang: preferredTranslateLang,
      },
    }));

    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLang: preferredTranslateLang }),
    });

    if (res.ok) {
      const data = await res.json();
      setTranslations((prev) => ({
        ...prev,
        [commentId]: {
          text: data.translatedText,
          loading: false,
          targetLang: preferredTranslateLang,
        },
      }));
    }
  };

  const activeAgenda =
    countryDetail?.agendas.find((a) => a.slot === selectedSlot) ||
    countryDetail?.agendas[0];

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAgenda) return;

    setSubmitting(true);
    setSubmitFeedback(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendaItemId: activeAgenda.id,
          authorUsername: activeUsername,
          content: commentText,
          stanceTag,
          sourceUrl: sourceUrl.trim() || undefined,
          languageCode: "tr",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.approved) {
        setSubmitFeedback({
          type: "error",
          title: `Reddedildi (${data.violationCategory || "KURAL İHLALİ"})`,
          message:
            data.reason ||
            data.error ||
            "Platform kurallarına aykırı içerik tespit edildi.",
        });
        await fetchInitialData();
      } else {
        setSubmitFeedback({
          type: "success",
          title: `Yayına Alındı (Kalite Skoru: ${data.moderation.qualityScore}/100)`,
          message: "Fikriniz ülke gündeminde oylamaya açıldı.",
        });
        setCommentText("");
        setSourceUrl("");
        setShowComposer(false);
        await Promise.all([
          fetchCountryDetail(selectedCode, commentSort),
          fetchInitialData(),
        ]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleLeftTab = (tab: Exclude<LeftDrawerTab, null>) => {
    setLeftTab((prev) => (prev === tab ? null : tab));
  };

  const filteredCountries = countries.filter(
    (c) =>
      c.nameTr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-dvh w-full max-w-full flex flex-col text-ink relative overflow-x-clip">
      {/* Borderless Glass Top Navigation */}
      <header className="w-full bg-white/75 backdrop-blur-xl sticky top-0 z-30 shadow-[0_1px_12px_rgb(0,0,0,0.03)]">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
          {/* TOP-LEFT PILL TABS */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleLeftTab("countries")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                leftTab === "countries"
                  ? "bg-authority text-white shadow-sm"
                  : "bg-gray-200/65 text-ink hover:bg-gray-200"
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>Ülkeler</span>
            </button>
          </div>

          {/* Center Brand */}
          <div className="font-serif font-bold tracking-wider text-ink truncate fluid-brand-title">
            AGORA MUNDI
          </div>

          {/* Right Pill Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs shrink-0">
            <select
              aria-label="Google Çeviri Dili"
              value={preferredTranslateLang}
              onChange={(e) => setPreferredTranslateLang(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-200/65 rounded-full text-xs font-semibold text-ink focus:outline-none cursor-pointer"
              title="Yorum çeviri dili (Google Translate)"
            >
              <option value="tr">TR</option>
              <option value="en">EN</option>
              <option value="de">DE</option>
            </select>

            <select
              aria-label="Aktif Kullanıcı Seçimi"
              value={activeUsername}
              onChange={(e) => setActiveUsername(e.target.value)}
              className="hidden lg:block px-3 py-1.5 bg-gray-200/65 rounded-full font-mono text-xs text-authority font-semibold focus:outline-none cursor-pointer"
            >
              <option value="karslioglu_strateji">@karslioglu_strateji</option>
              <option value="ankara_perspektif">@ankara_perspektif</option>
              <option value="nordic_realist">@nordic_realist</option>
              <option value="levant_observer">@levant_observer</option>
            </select>

            <button
              type="button"
              onClick={() => handleOpenUserCv(activeUsername)}
              className="px-3.5 py-1.5 bg-authority text-white font-semibold rounded-full hover:opacity-90 transition shadow-sm whitespace-nowrap"
            >
              Profilim
            </button>
          </div>
        </div>
      </header>

      {/* MODERN LEFT SLIDE-OUT DRAWER (Borderless) */}
      {leftTab && (
        <div className="fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-900/25 backdrop-blur-xs"
            onClick={() => setLeftTab(null)}
          />

          <aside className="relative z-50 w-[min(100dvw,26rem)] bg-white/95 backdrop-blur-xl h-dvh flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.1)]">
            <div className="p-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-full overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setLeftTab("countries")}
                  className="px-3.5 py-1 rounded-full text-xs font-semibold bg-authority text-white shadow-xs whitespace-nowrap"
                >
                  🌍 Ülkeler ({countries.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setLeftTab(null)}
                className="p-1.5 rounded-full bg-gray-100 text-slate hover:text-ink shrink-0 transition"
                aria-label="Sekmeyi Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {leftTab === "countries" && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate absolute left-3.5 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="174 ülke içinde ara..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-authority/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    {filteredCountries.map((c) => {
                      const isSelected = c.code === selectedCode;
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => handleSelectCountry(c.code)}
                          className={`w-full text-left px-4 py-3 rounded-2xl flex items-center justify-between transition ${
                            isSelected
                              ? "bg-authority text-white font-semibold shadow-sm"
                              : "bg-gray-100/60 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-lg shrink-0">{c.flagEmoji}</span>
                            <div className="min-w-0">
                              <div
                                className={`text-xs font-bold truncate ${
                                  isSelected ? "text-white" : "text-ink"
                                }`}
                              >
                                {c.nameTr}
                              </div>
                              <div
                                className={`text-[11px] truncate ${
                                  isSelected ? "text-white/75" : "text-slate"
                                }`}
                              >
                                {c.region}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-mono shrink-0 ml-2 ${
                              isSelected ? "text-white/80" : "text-slate"
                            }`}
                          >
                            {c.updateIntervalHours}s
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* CLEAN CENTER STAGE */}
      <main className="max-w-4xl w-full mx-auto px-3 sm:px-5 py-5 sm:py-7 flex-1 flex flex-col items-center space-y-7 overflow-x-hidden">
        {/* 1. Centered Interactive 3D World Globe */}
        <div className="w-full flex flex-col items-center">
          <WorldMapPanel
            countries={countries}
            selectedCode={selectedCode}
            onSelectCountry={handleSelectCountry}
            onSyncCountry={handleAutonomousSync}
            syncing={syncingAgendas}
          />
        </div>

        {/* 2. Modern Borderless Country A - B - C Agenda Cards */}
        {countryDetail && (
          <section
            aria-label={`${countryDetail.nameTr} Gündem Başlıkları`}
            className="w-full max-w-3xl space-y-3"
          >
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl shrink-0">
                  {countryDetail.flagEmoji}
                </span>
                <h2 className="font-serif font-bold text-lg sm:text-xl text-ink truncate">
                  {countryDetail.nameTr} Gündemi
                </h2>
              </div>

              <button
                type="button"
                onClick={() => handleAutonomousSync(countryDetail.code)}
                disabled={syncingAgendas}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 hover:bg-white text-xs font-medium text-slate hover:text-ink shadow-[0_2px_8px_rgb(0,0,0,0.04)] transition disabled:opacity-50"
                title="Ülkenin 3 başlığını otonom olarak güncelle"
              >
                <RefreshCw
                  className={`w-3 h-3 ${syncingAgendas ? "animate-spin" : ""}`}
                />
                <span>{syncingAgendas ? "Yenileniyor..." : "Gündemi Yenile"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {countryDetail.agendas.map((agenda) => {
                const isSelected = agenda.slot === activeAgenda?.slot;
                return (
                  <button
                    key={agenda.id}
                    type="button"
                    onClick={() => {
                      setSelectedSlot(agenda.slot);
                      setSubmitFeedback(null);
                    }}
                    className={`w-full text-left p-4 sm:p-5 rounded-3xl transition-all flex items-start sm:items-center justify-between gap-4 ${
                      isSelected
                        ? "bg-white shadow-[0_12px_35px_rgba(29,53,87,0.10)] ring-1 ring-authority/20"
                        : "bg-white/65 hover:bg-white shadow-[0_2px_12px_rgb(0,0,0,0.03)]"
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <span
                        className={`w-8 h-8 rounded-2xl font-mono font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 transition ${
                          isSelected
                            ? "bg-authority text-white shadow-sm"
                            : "bg-gray-200/75 text-ink"
                        }`}
                      >
                        {agenda.slot}
                      </span>
                      <span className="font-serif text-sm sm:text-base font-medium text-ink break-words leading-snug">
                        {agenda.title}
                      </span>
                    </div>

                    <span
                      className={`shrink-0 px-3 py-1 rounded-full font-mono text-[11px] font-medium ${
                        isSelected
                          ? "bg-authority/10 text-authority"
                          : "bg-gray-100 text-slate"
                      }`}
                    >
                      {agenda.comments.length} tez
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Borderless Discussion & Argument Arena */}
        {activeAgenda && countryDetail && (
          <section
            aria-label="Seçili Gündem Yorumları"
            className="w-full max-w-3xl space-y-4"
          >
            {/* Floating Action Header */}
            <div className="px-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="px-2.5 py-0.5 bg-authority text-white font-mono text-xs font-bold rounded-full shrink-0">
                  {activeAgenda.slot}
                </span>
                <span className="text-xs font-semibold text-slate truncate">
                  {activeAgenda.title}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center p-0.5 rounded-full text-xs bg-gray-200/70">
                  <button
                    type="button"
                    onClick={() => setCommentSort("likes")}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      commentSort === "likes"
                        ? "bg-white text-ink font-semibold shadow-xs"
                        : "text-slate"
                    }`}
                  >
                    Popüler
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentSort("recent")}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      commentSort === "recent"
                        ? "bg-white text-ink font-semibold shadow-xs"
                        : "text-slate"
                    }`}
                  >
                    Yeni
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowComposer((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-authority text-white text-xs font-semibold rounded-full shadow-[0_4px_14px_rgba(29,53,87,0.25)] hover:opacity-95 transition"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>Fikrini Yaz</span>
                  {showComposer ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {submitFeedback && (
              <div
                role="alert"
                className={`p-4 rounded-2xl text-xs flex items-start justify-between gap-2 shadow-sm ${
                  submitFeedback.type === "error"
                    ? "bg-rose-50 text-rose-950"
                    : "bg-emerald-50 text-emerald-950"
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {submitFeedback.type === "error" ? (
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  )}
                  <div className="break-words">
                    <strong>{submitFeedback.title}:</strong>{" "}
                    {submitFeedback.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubmitFeedback(null)}
                  className="text-slate hover:text-ink shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Modern Floating Composer Card */}
            {showComposer && (
              <form
                onSubmit={handleSubmitComment}
                className="p-5 bg-white rounded-3xl shadow-[0_12px_40px_rgb(0,0,0,0.06)] space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink">
                    @{activeUsername}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {["TEZ", "ANALIZ", "COZUM", "ELESTIRI"].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStanceTag(st)}
                        className={`px-3 py-1 rounded-full font-mono text-[10px] font-semibold transition ${
                          stanceTag === st
                            ? "bg-authority text-white shadow-xs"
                            : "bg-gray-100 text-slate hover:text-ink"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <ul
                    id="comment-rules"
                    className="rules-list text-[11px] flex flex-wrap gap-x-4 mb-2"
                  >
                    <li>• 25–1.000 karakter</li>
                    <li>• Görsel yasak, kaynak linki serbest</li>
                  </ul>

                  <textarea
                    id="argument-textarea"
                    name="argument"
                    required
                    minLength={25}
                    maxLength={1000}
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    aria-describedby="comment-rules"
                    aria-errormessage="comment-error"
                    placeholder="Bu başlık altındaki fikrinizi veya analizinizi yazın..."
                    className="w-full p-4 text-sm bg-gray-100/75 rounded-2xl focus:outline-none focus:bg-gray-100 focus:ring-2 focus:ring-authority/20 leading-relaxed"
                  />
                  <div id="comment-error" className="error-msg">
                    En az 25, en fazla 1.000 karakterlik bir argüman girin.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="Opsiyonel kaynak linki (https://...)"
                    className="flex-1 min-w-0 px-4 py-2 text-xs bg-gray-100/75 rounded-full focus:outline-none focus:ring-2 focus:ring-authority/20"
                  />

                  <div className="flex items-center justify-end gap-3">
                    <span className="text-[11px] font-mono text-slate">
                      {commentText.length}/1000
                    </span>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 px-5 py-2 bg-authority text-white text-xs font-semibold rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submitting ? "Denetleniyor..." : "Yayınla"}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Borderless Comment Cards */}
            <div className="space-y-3">
              {activeAgenda.comments.length === 0 ? (
                <div className="p-8 bg-white/70 rounded-3xl text-center text-xs text-slate">
                  Bu gündem başlığı altında henüz argüman paylaşılmamış. İlk
                  tezi siz sunun.
                </div>
              ) : (
                activeAgenda.comments.map((comment) => {
                  const translation = translations[comment.id];

                  return (
                    <article
                      key={comment.id}
                      className="p-5 sm:p-6 bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] space-y-3 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenUserCv(comment.author.username)
                            }
                            className="font-bold text-ink hover:underline truncate"
                          >
                            {comment.author.displayName}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenUserCv(comment.author.username)
                            }
                            className="font-mono text-authority hover:underline truncate"
                          >
                            @{comment.author.username}
                          </button>
                        </div>

                        <span className="font-mono text-[10px] font-semibold px-2.5 py-0.5 bg-gray-100 rounded-full text-slate shrink-0">
                          {comment.stanceTag}
                        </span>
                      </div>

                      <p className="text-sm text-ink leading-relaxed break-words">
                        {comment.content}
                      </p>

                      {translation && (
                        <div className="p-3.5 bg-gray-100/80 rounded-2xl text-xs text-ink break-words">
                          <span className="font-mono text-[10px] text-authority font-semibold uppercase block mb-1">
                            Google Çeviri (
                            {translation.targetLang.toUpperCase()})
                          </span>
                          {translation.loading
                            ? "Çevriliyor..."
                            : translation.text}
                        </div>
                      )}

                      {comment.sourceUrl && (
                        <div className="truncate">
                          <a
                            href={comment.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100/80 rounded-full text-xs text-authority hover:bg-gray-200/70 transition"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">Kaynak Bağlantısı</span>
                          </a>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleVoteComment(comment.id)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200/80 font-mono font-semibold text-ink transition"
                          >
                            <ThumbsUp className="w-3.5 h-3.5 text-authority" />
                            <span>{comment.likeCount}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleFollowUser(comment.author.username)
                            }
                            className="px-3 py-1.5 rounded-full bg-gray-100/70 hover:bg-gray-200/70 hover:text-ink transition"
                          >
                            + Takip ({comment.author.followerCount})
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            handleGoogleTranslate(comment.id, comment.content)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100/70 hover:bg-gray-200/70 hover:text-ink transition"
                        >
                          <Languages className="w-3.5 h-3.5 text-authority" />
                          <span>Çevir</span>
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        )}
      </main>

      <PoliticalCvModal
        cvData={cvModalData}
        onClose={() => setCvModalData(null)}
        onFollow={handleFollowUser}
      />
    </div>
  );
}
