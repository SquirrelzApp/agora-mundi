"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  RefreshCw,
  ThumbsUp,
  MessageCircle,
  MessageSquareReply,
  Languages,
  ExternalLink,
  Send,
  AlertTriangle,
  CheckCircle2,
  X,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Link2,
  Sparkles,
  Users,
  Landmark,
  Coins,
  Globe2,
  Check,
  Maximize2,
} from "lucide-react";
import type { AuthenticatedUser } from "@/components/AuthModal";
import { WORLD_LANGUAGES } from "@/lib/language-config";

export interface CommentReplyItem {
  id: string;
  content: string;
  sourceUrl?: string | null;
  stanceTag: string;
  languageCode: string;
  likeCount: number;
  viewerHasLiked?: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    title: string;
    countryCode: string;
    avatarColor?: string;
    followerCount: number;
    viewerIsFollowing?: boolean;
  };
}

export interface CommentItem extends CommentReplyItem {
  replyCount: number;
  aiQualityScore: number;
  replies: CommentReplyItem[];
}

export interface AgendaSourceLink {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
}

export interface AgendaDetail {
  id: string;
  slot: string;
  title: string;
  summary: string;
  category: string;
  sourceOrigin: string;
  publishedAt?: string | null;
  commentCount: number;
  sources: AgendaSourceLink[];
  comments: CommentItem[];
}

export interface CountryDetail {
  code: string;
  name: string;
  officialName?: string | null;
  capital?: string | null;
  region: string;
  subregion?: string | null;
  flagEmoji: string;
  population?: number | null;
  areaKm2?: number | null;
  currencyCode?: string | null;
  currencyName?: string | null;
  currencySymbol?: string | null;
  languages: string[];
  callingCode?: string | null;
  summary?: string | null;
  wikiUrl?: string | null;
  usdRate?: number | null;
  tempo: string;
  updateIntervalHours: number;
  lastSyncedAt?: string | null;
  lastUpdatedAt: string;
  agendas: AgendaDetail[];
}

interface CountryHubProps {
  country: CountryDetail | null;
  loading: boolean;
  selectedSlot: string;
  focusAgenda?: {
    countryCode: string;
    slot: string;
    agendaId?: string;
    nonce: number;
  } | null;
  onSelectSlot: (slot: string) => void;
  commentSort: "likes" | "recent";
  onChangeSort: (sort: "likes" | "recent") => void;
  currentUser: AuthenticatedUser | null;
  preferredTranslateLang: string;
  onChangeTranslateLang: (lang: string) => void;
  onCloseCountry: () => void;
  onOpenAuth: (hint?: string) => void;
  onOpenUserCv: (username: string) => void;
  onFollowUser: (username: string) => void;
  onVoteComment: (commentId: string) => void;
  onCommentCreated: () => Promise<void>;
}

function formatPopulation(pop?: number | null): string | null {
  if (!pop || pop <= 0) return null;
  if (pop >= 1_000_000_000) {
    return `${(pop / 1_000_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    })}B`;
  }
  if (pop >= 1_000_000) {
    return `${(pop / 1_000_000).toLocaleString("en-US", {
      maximumFractionDigits: 1,
    })}M`;
  }
  if (pop >= 1_000) {
    return `${Math.round(pop / 1_000).toLocaleString("en-US")}K`;
  }
  return pop.toLocaleString("en-US");
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "Fresh";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "Updated";
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 2) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString("en-US");
}

function getCategoryStyle(cat: string): string {
  switch (cat) {
    case "ECONOMY":
      return "bg-amber-500/10 text-amber-800";
    case "SECURITY":
      return "bg-rose-500/10 text-rose-800";
    case "DIPLOMACY":
      return "bg-indigo-500/10 text-indigo-800";
    case "TECHNOLOGY":
      return "bg-cyan-500/10 text-cyan-800";
    case "ENVIRONMENT":
      return "bg-emerald-500/10 text-emerald-800";
    case "SOCIETY":
      return "bg-violet-500/10 text-violet-800";
    case "POLITICS":
      return "bg-authority/10 text-authority";
    default:
      return "bg-gray-200/80 text-ink";
  }
}

export default function CountryHub({
  country,
  loading,
  selectedSlot,
  focusAgenda,
  onSelectSlot,
  commentSort,
  onChangeSort,
  currentUser,
  preferredTranslateLang,
  onChangeTranslateLang,
  onCloseCountry,
  onOpenAuth,
  onOpenUserCv,
  onFollowUser,
  onVoteComment,
  onCommentCreated,
}: CountryHubProps) {
  const [wikiExpanded, setWikiExpanded] = useState<boolean>(false);
  const [expandedAgendaId, setExpandedAgendaId] = useState<string | null>(null);
  const agendaRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledFocusNonceRef = useRef<number | null>(null);

  // Root comment composer state
  const [commentText, setCommentText] = useState<string>("");
  const [showSourceInput, setShowSourceInput] = useState<boolean>(false);
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  // Inline reply composer state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [submittingReply, setSubmittingReply] = useState<boolean>(false);

  // Per-comment translations
  const [translations, setTranslations] = useState<
    Record<string, { text: string; loading: boolean; targetLang: string }>
  >({});

  useEffect(() => {
    if (!focusAgenda || focusAgenda.countryCode !== country?.code) {
      setExpandedAgendaId(null);
    }
    setFeedback(null);
    setReplyingToId(null);
    setReplyText("");
  }, [country?.code, focusAgenda]);

  useEffect(() => {
    if (!focusAgenda || !country || country.code !== focusAgenda.countryCode) {
      return;
    }
    if (handledFocusNonceRef.current === focusAgenda.nonce) {
      return;
    }

    const match =
      (focusAgenda.agendaId
        ? country.agendas.find((ag) => ag.id === focusAgenda.agendaId)
        : undefined) ||
      country.agendas.find((ag) => ag.slot === focusAgenda.slot);

    if (!match) return;

    handledFocusNonceRef.current = focusAgenda.nonce;
    setExpandedAgendaId(match.id);
    onSelectSlot(match.slot);

    requestAnimationFrame(() => {
      const el = agendaRefs.current[match.id];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, [focusAgenda, country, onSelectSlot]);

  if (loading && !country) {
    return (
      <section className="w-full bg-white/90 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] space-y-5 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gray-200" />
          <div className="space-y-2 flex-1">
            <div className="h-5 w-48 bg-gray-200 rounded-lg" />
            <div className="h-3.5 w-72 bg-gray-100 rounded-lg" />
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-authority/5 text-xs text-authority font-medium flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>Loading country agendas and profile details...</span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 rounded-3xl bg-gray-100" />
          ))}
        </div>
      </section>
    );
  }

  if (!country) return null;

  const handleTranslate = async (id: string, text: string) => {
    setTranslations((prev) => ({
      ...prev,
      [id]: {
        text: prev[id]?.text || "",
        loading: true,
        targetLang: preferredTranslateLang,
      },
    }));

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang: preferredTranslateLang }),
      });
      if (res.ok) {
        const data = await res.json();
        setTranslations((prev) => ({
          ...prev,
          [id]: {
            text: data.translatedText,
            loading: false,
            targetLang: preferredTranslateLang,
          },
        }));
      }
    } catch {
      setTranslations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handlePostComment = async (e: React.FormEvent, agendaItemId: string) => {
    e.preventDefault();

    if (!currentUser) {
      onOpenAuth(
        "Your draft comment is saved! Sign in or create an account in seconds to publish."
      );
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendaItemId,
          content: commentText,
          stanceTag: "COMMENT",
          sourceUrl: sourceUrl.trim() || undefined,
          languageCode: "en",
        }),
      });
      const data = await res.json();

      if (res.status === 401 && data.requiresAuth) {
        onOpenAuth("Sign in to share a comment.");
        return;
      }

      if (!res.ok || !data.approved) {
        setFeedback({
          type: "error",
          title: "Unable to Publish Comment",
          message:
            data.reason ||
            data.error ||
            "Please make sure your comment follows community guidelines.",
        });
        return;
      }

      setCommentText("");
      setSourceUrl("");
      setShowSourceInput(false);
      setFeedback({
        type: "success",
        title: "Comment Published",
        message: "Your take has been added to the country discussion feed.",
      });
      await onCommentCreated();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostReply = async (
    e: React.FormEvent,
    agendaItemId: string,
    parentId: string
  ) => {
    e.preventDefault();

    if (!currentUser) {
      onOpenAuth("Sign in or quickly create an account to post a reply.");
      return;
    }

    setSubmittingReply(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agendaItemId,
          parentId,
          content: replyText,
          stanceTag: "COMMENT",
          languageCode: "en",
        }),
      });
      const data = await res.json();

      if (res.status === 401 && data.requiresAuth) {
        onOpenAuth("Sign in to post a reply.");
        return;
      }

      if (!res.ok || !data.approved) {
        setFeedback({
          type: "error",
          title: "Unable to Post Reply",
          message:
            data.reason ||
            data.error ||
            "Your reply must be at least 10 characters and follow community guidelines.",
        });
        return;
      }

      setReplyText("");
      setReplyingToId(null);
      await onCommentCreated();
    } finally {
      setSubmittingReply(false);
    }
  };

  const formattedPop = formatPopulation(country.population);

  return (
    <div className="w-full space-y-5">
      {/* ====================================================================
          1. COUNTRY INTELLIGENCE & MACRO PROFILE CARD
         ==================================================================== */}
      <section
        aria-label={`${country.name} Country Overview`}
        className="bg-white/95 backdrop-blur-xl rounded-3xl p-5 sm:p-6 shadow-[0_10px_35px_rgba(15,23,42,0.05)] space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl sm:text-4xl shrink-0">
              {country.flagEmoji}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif font-bold text-xl sm:text-2xl text-ink truncate">
                  {country.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-semibold text-slate">
                  {country.subregion || country.region}
                </span>
              </div>
              <p className="text-xs text-slate truncate mt-0.5">
                {country.officialName || country.name} • Last Updated:{" "}
                <strong className="text-ink">
                  {formatRelativeTime(
                    country.lastSyncedAt || country.lastUpdatedAt
                  )}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-800 text-[11px] font-semibold"
              title="News is automatically curated and updated on the server"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                Auto Feed • Every {country.updateIntervalHours}h
              </span>
            </span>

            <button
              type="button"
              onClick={onCloseCountry}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
              title="Close country view and expand the globe"
              aria-label="Expand Globe"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Macro Info Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {country.capital && (
            <div className="p-2.5 px-3 rounded-2xl bg-gray-100/75 flex items-center gap-2">
              <Landmark className="w-4 h-4 text-authority shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate uppercase font-semibold">
                  Capital
                </div>
                <div className="font-bold text-ink truncate">
                  {country.capital}
                </div>
              </div>
            </div>
          )}

          {formattedPop && (
            <div className="p-2.5 px-3 rounded-2xl bg-gray-100/75 flex items-center gap-2">
              <Users className="w-4 h-4 text-authority shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate uppercase font-semibold">
                  Population
                </div>
                <div className="font-bold text-ink truncate">{formattedPop}</div>
              </div>
            </div>
          )}

          {country.currencyCode && (
            <div className="p-2.5 px-3 rounded-2xl bg-gray-100/75 flex items-center gap-2">
              <Coins className="w-4 h-4 text-authority shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate uppercase font-semibold">
                  Currency
                </div>
                <div className="font-bold text-ink truncate">
                  {country.currencyCode} ({country.currencySymbol})
                  {country.usdRate && country.currencyCode !== "USD" && (
                    <span className="font-mono font-normal text-[11px] text-slate ml-1">
                      • $1={country.usdRate.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {(country.languages.length > 0 || country.areaKm2) && (
            <div className="p-2.5 px-3 rounded-2xl bg-gray-100/75 flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-authority shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate uppercase font-semibold">
                  Language & Area
                </div>
                <div className="font-bold text-ink truncate">
                  {country.languages[0] || "-"}
                  {country.areaKm2
                    ? ` • ${Math.round(country.areaKm2).toLocaleString(
                        "en-US"
                      )} km²`
                    : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Wikipedia Country Overview */}
        {country.summary && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setWikiExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-authority hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {wikiExpanded
                  ? "Hide Country Overview"
                  : `About ${country.name}`}
              </span>
              {wikiExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {wikiExpanded && (
              <div className="mt-2.5 p-4 rounded-2xl bg-gray-100/70 text-xs text-ink leading-relaxed space-y-2">
                <p>{country.summary}</p>
                {country.wikiUrl && (
                  <a
                    href={country.wikiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-authority hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Read on Wikipedia</span>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ====================================================================
          2. LIVE TOP 3 AGENDAS (A - B - C) WITH VERIFIED NEWS SOURCES
         ==================================================================== */}
      <section
        aria-label={`${country.name} Top 3 Live Agendas`}
        className="space-y-3"
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-authority" />
            <h2 className="font-serif font-bold text-base sm:text-lg text-ink">
              Top 3 Live Agendas
            </h2>
            {loading && (
              <RefreshCw
                className="w-3.5 h-3.5 text-authority animate-spin"
                aria-label="Updating language"
              />
            )}
          </div>
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 font-semibold">
            {country.agendas.some((a) => a.sourceOrigin === "GEMINI_GROUNDED")
              ? "Curated Press Feed"
              : "Live Press Feed"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {country.agendas.map((agenda) => {
            const isExpanded = expandedAgendaId === agenda.id;
            const toggleExpand = () => {
              if (isExpanded) {
                setExpandedAgendaId(null);
              } else {
                setExpandedAgendaId(agenda.id);
                onSelectSlot(agenda.slot);
              }
              setFeedback(null);
              setReplyingToId(null);
            };

            return (
              <div
                key={agenda.id}
                ref={(el) => {
                  agendaRefs.current[agenda.id] = el;
                }}
                className={`w-full text-left p-4 sm:p-5 rounded-3xl transition-all space-y-2.5 scroll-mt-20 ${
                  isExpanded
                    ? "bg-white shadow-[0_14px_38px_rgba(29,53,87,0.12)] ring-2 ring-authority/30"
                    : "bg-white/85 hover:bg-white shadow-[0_2px_12px_rgb(0,0,0,0.03)]"
                }`}
              >
                <div
                  onClick={toggleExpand}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpand();
                    }
                  }}
                  className="cursor-pointer space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span
                        className={`w-8 h-8 rounded-2xl font-mono font-bold text-xs sm:text-sm flex items-center justify-center shrink-0 transition ${
                          isExpanded
                            ? "bg-authority text-white shadow-sm"
                            : "bg-gray-200/80 text-ink"
                        }`}
                      >
                        {agenda.slot}
                      </span>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getCategoryStyle(
                              agenda.category
                            )}`}
                          >
                            {agenda.category}
                          </span>
                          {agenda.publishedAt && (
                            <span className="text-[11px] text-slate">
                              • {formatRelativeTime(agenda.publishedAt)}
                            </span>
                          )}
                        </div>

                        <h3
                          dir="auto"
                          className="font-serif text-sm sm:text-base font-bold text-ink leading-snug"
                        >
                          {agenda.title}
                        </h3>
                      </div>
                    </div>
                  </div>

                  {/* Context Summary & Real Source Pills */}
                  {agenda.summary && (
                    <div className="pl-11 space-y-2">
                      <p dir="auto" className="text-xs text-slate leading-relaxed">
                        {agenda.summary}
                      </p>

                      {agenda.sources.length > 0 && (
                        <div
                          className="flex flex-wrap items-center gap-1.5 pt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {agenda.sources.map((src, sIdx) => (
                            <a
                              key={`${agenda.id}_src_${sIdx}`}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={src.title}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200/80 text-[11px] font-medium text-authority transition"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[160px]">
                                {src.publisher}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Twitter-style Comment Bar underneath the news item */}
                <div className="pl-11 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={toggleExpand}
                    aria-expanded={isExpanded}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                      isExpanded
                        ? "bg-authority text-white shadow-xs"
                        : "bg-gray-100/90 hover:bg-gray-200/75 text-slate hover:text-ink"
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>
                      {agenda.commentCount > 0
                        ? `${agenda.commentCount} ${
                            agenda.commentCount === 1 ? "Comment" : "Comments"
                          }`
                        : "Add a comment"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Expandable Twitter-style Inline Comments & Composer */}
                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 pt-4 border-t border-gray-100 space-y-4"
                  >
                    {/* Controls: Translate & Sort */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink">
                        Comments ({agenda.comments.length})
                      </span>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          aria-label="Translation Language"
                          value={preferredTranslateLang}
                          onChange={(e) =>
                            onChangeTranslateLang(e.target.value)
                          }
                          className="px-2.5 py-1 bg-gray-100 rounded-full text-[11px] font-semibold text-ink focus:outline-none cursor-pointer max-w-[160px]"
                          title="Target language for comment translation"
                        >
                          {WORLD_LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>
                              Translate: {l.code.toUpperCase()} ({l.nativeName})
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center p-0.5 rounded-full text-xs bg-gray-100">
                          <button
                            type="button"
                            onClick={() => onChangeSort("likes")}
                            className={`px-3 py-1 rounded-full font-medium transition ${
                              commentSort === "likes"
                                ? "bg-white text-ink font-semibold shadow-xs"
                                : "text-slate"
                            }`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            onClick={() => onChangeSort("recent")}
                            className={`px-3 py-1 rounded-full font-medium transition ${
                              commentSort === "recent"
                                ? "bg-white text-ink font-semibold shadow-xs"
                                : "text-slate"
                            }`}
                          >
                            Newest
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inline Comment Composer */}
                    <form
                      onSubmit={(e) => handlePostComment(e, agenda.id)}
                      className="space-y-2.5"
                    >
                      <div className="text-xs">
                        {currentUser ? (
                          <span className="text-slate font-normal">
                            Commenting as{" "}
                            <span className="font-semibold text-ink">
                              @{currentUser.username}
                            </span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onOpenAuth()}
                            className="font-semibold text-authority hover:underline"
                          >
                            Sign in or create a free account to share a comment
                            →
                          </button>
                        )}
                      </div>

                      <textarea
                        rows={3}
                        required
                        minLength={10}
                        maxLength={1000}
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={`What is your take on this ${country.name} story? (Minimum 10 characters)`}
                        className="w-full p-3.5 text-sm bg-gray-100/80 rounded-2xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-authority/25 leading-relaxed transition"
                      />

                      {showSourceInput && (
                        <input
                          type="url"
                          value={sourceUrl}
                          onChange={(e) => setSourceUrl(e.target.value)}
                          placeholder="Optional source or news link (https://...)"
                          className="w-full px-3.5 py-2 text-xs bg-gray-100/80 rounded-full focus:outline-none focus:ring-2 focus:ring-authority/20"
                        />
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSourceInput((v) => !v)}
                          className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-authority font-medium transition"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            {showSourceInput
                              ? "Hide Source Link"
                              : "Add Source Link"}
                          </span>
                        </button>

                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-slate">
                            {commentText.length}/1000
                          </span>
                          <button
                            type="submit"
                            disabled={
                              submitting || commentText.trim().length < 10
                            }
                            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-authority text-white text-xs font-semibold shadow-sm hover:opacity-95 disabled:opacity-45 transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>
                              {submitting
                                ? "Reviewing..."
                                : currentUser
                                ? "Post Comment"
                                : "Sign In & Post"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {feedback && (
                      <div
                        role="alert"
                        className={`p-3.5 rounded-2xl text-xs flex items-start justify-between gap-2 ${
                          feedback.type === "error"
                            ? "bg-rose-50 text-rose-950"
                            : "bg-emerald-50 text-emerald-950"
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {feedback.type === "error" ? (
                            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <strong>{feedback.title}:</strong>{" "}
                            {feedback.message}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFeedback(null)}
                          className="text-slate hover:text-ink"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Comments & Replies Stream */}
                    <div className="space-y-3">
                      {agenda.comments.length === 0 ? (
                        <div className="p-6 bg-gray-50 rounded-2xl text-center space-y-1">
                          <div className="text-xs font-semibold text-ink">
                            Be the first to comment on this agenda
                          </div>
                          <p className="text-[11px] text-slate">
                            No takes have been shared on this {country.name}{" "}
                            story yet.
                          </p>
                        </div>
                      ) : (
                        agenda.comments.map((comment) => {
                          const trState = translations[comment.id];
                          const isOwnComment =
                            currentUser?.id === comment.author.id;
                          const isReplyingHere = replyingToId === comment.id;

                          return (
                            <article
                              key={comment.id}
                              className="p-4 bg-gray-50/85 rounded-2xl space-y-2.5"
                            >
                              {/* Comment Header */}
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenUserCv(comment.author.username)
                                    }
                                    className="w-8 h-8 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor:
                                        comment.author.avatarColor || "#1D3557",
                                    }}
                                  >
                                    {comment.author.displayName
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </button>
                                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenUserCv(comment.author.username)
                                      }
                                      className="font-bold text-ink hover:underline truncate"
                                    >
                                      {comment.author.displayName}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenUserCv(comment.author.username)
                                      }
                                      className="font-mono text-authority hover:underline text-[11px]"
                                    >
                                      @{comment.author.username}
                                    </button>
                                    <span className="text-[11px] text-slate">
                                      • {formatRelativeTime(comment.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Comment Text */}
                              <p className="text-sm text-ink leading-relaxed break-words">
                                {comment.content}
                              </p>

                              {trState && (
                                <div
                                  dir="auto"
                                  className="p-3 bg-white rounded-2xl text-xs text-ink break-words"
                                >
                                  <span className="font-mono text-[10px] text-authority font-semibold uppercase block mb-0.5">
                                    Translation (
                                    {trState.targetLang.toUpperCase()})
                                  </span>
                                  {trState.loading
                                    ? "Translating..."
                                    : trState.text}
                                </div>
                              )}

                              {comment.sourceUrl && (
                                <div>
                                  <a
                                    href={comment.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-full text-xs text-authority hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span>Source Link</span>
                                  </a>
                                </div>
                              )}

                              {/* Action Bar */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => onVoteComment(comment.id)}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono font-semibold transition ${
                                      comment.viewerHasLiked
                                        ? "bg-authority text-white shadow-xs"
                                        : "bg-white hover:bg-gray-200/70 text-ink"
                                    }`}
                                  >
                                    <ThumbsUp className="w-3.5 h-3.5" />
                                    <span>{comment.likeCount}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyingToId(
                                        isReplyingHere ? null : comment.id
                                      )
                                    }
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition ${
                                      isReplyingHere
                                        ? "bg-ink text-white"
                                        : "bg-white hover:bg-gray-200/70 text-ink"
                                    }`}
                                  >
                                    <MessageSquareReply className="w-3.5 h-3.5 text-authority" />
                                    <span>
                                      Reply ({comment.replies.length})
                                    </span>
                                  </button>

                                  {!isOwnComment && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onFollowUser(comment.author.username)
                                      }
                                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full transition ${
                                        comment.author.viewerIsFollowing
                                          ? "bg-emerald-600/10 text-emerald-800 font-semibold"
                                          : "bg-white hover:bg-gray-200/70 text-slate hover:text-ink"
                                      }`}
                                    >
                                      {comment.author.viewerIsFollowing && (
                                        <Check className="w-3 h-3" />
                                      )}
                                      <span>
                                        {comment.author.viewerIsFollowing
                                          ? "Following"
                                          : "+ Follow"}
                                      </span>
                                    </button>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleTranslate(comment.id, comment.content)
                                  }
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white hover:bg-gray-200/70 text-slate hover:text-ink transition"
                                >
                                  <Languages className="w-3.5 h-3.5 text-authority" />
                                  <span>Translate</span>
                                </button>
                              </div>

                              {/* Inline Reply Form */}
                              {isReplyingHere && (
                                <form
                                  onSubmit={(e) =>
                                    handlePostReply(e, agenda.id, comment.id)
                                  }
                                  className="mt-2 pl-4 border-l-2 border-authority/25 space-y-2"
                                >
                                  <textarea
                                    rows={2}
                                    required
                                    minLength={10}
                                    maxLength={1000}
                                    value={replyText}
                                    onChange={(e) =>
                                      setReplyText(e.target.value)
                                    }
                                    placeholder={`Reply to @${comment.author.username} (minimum 10 characters)...`}
                                    className="w-full p-3 text-xs bg-white rounded-2xl focus:outline-none focus:ring-2 focus:ring-authority/25"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReplyingToId(null);
                                        setReplyText("");
                                      }}
                                      className="px-3 py-1.5 rounded-full text-xs text-slate hover:text-ink"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={
                                        submittingReply ||
                                        replyText.trim().length < 10
                                      }
                                      className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-authority text-white text-xs font-semibold disabled:opacity-45"
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>
                                        {submittingReply
                                          ? "Posting..."
                                          : "Reply"}
                                      </span>
                                    </button>
                                  </div>
                                </form>
                              )}

                              {/* Nested Replies List */}
                              {comment.replies.length > 0 && (
                                <div className="mt-3 pl-4 sm:pl-6 border-l-2 border-gray-200 space-y-2.5">
                                  {comment.replies.map((reply) => {
                                    const replyTr = translations[reply.id];
                                    return (
                                      <div
                                        key={reply.id}
                                        className="p-3.5 bg-white rounded-2xl space-y-2 shadow-[0_1px_6px_rgba(0,0,0,0.02)]"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onOpenUserCv(
                                                  reply.author.username
                                                )
                                              }
                                              className="w-6 h-6 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0"
                                              style={{
                                                backgroundColor:
                                                  reply.author.avatarColor ||
                                                  "#1D3557",
                                              }}
                                            >
                                              {reply.author.displayName
                                                .slice(0, 2)
                                                .toUpperCase()}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onOpenUserCv(
                                                  reply.author.username
                                                )
                                              }
                                              className="font-bold text-ink hover:underline truncate"
                                            >
                                              {reply.author.displayName}
                                            </button>
                                            <span className="font-mono text-[11px] text-authority">
                                              @{reply.author.username}
                                            </span>
                                            <span className="text-[11px] text-slate">
                                              •{" "}
                                              {formatRelativeTime(
                                                reply.createdAt
                                              )}
                                            </span>
                                          </div>
                                        </div>

                                        <p className="text-xs sm:text-sm text-ink leading-relaxed break-words">
                                          {reply.content}
                                        </p>

                                        {replyTr && (
                                          <div className="p-2.5 bg-gray-100 rounded-xl text-xs text-ink">
                                            <span className="font-mono text-[10px] text-authority font-semibold uppercase block">
                                              Translation (
                                              {replyTr.targetLang.toUpperCase()}
                                              )
                                            </span>
                                            {replyTr.loading
                                              ? "Translating..."
                                              : replyTr.text}
                                          </div>
                                        )}

                                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onVoteComment(reply.id)
                                            }
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-semibold transition ${
                                              reply.viewerHasLiked
                                                ? "bg-authority text-white"
                                                : "bg-gray-100 hover:bg-gray-200 text-ink"
                                            }`}
                                          >
                                            <ThumbsUp className="w-3 h-3" />
                                            <span>{reply.likeCount}</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleTranslate(
                                                reply.id,
                                                reply.content
                                              )
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
                                          >
                                            <Languages className="w-3 h-3 text-authority" />
                                            <span>Translate</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
