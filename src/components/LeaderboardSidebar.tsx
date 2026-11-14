"use client";

import React, { useState } from "react";
import {
  Trophy,
  Users,
  Globe2,
  ShieldCheck,
  Flame,
  Zap,
  MessageSquare,
} from "lucide-react";

export interface LeaderboardUser {
  id: string;
  username: string;
  displayName: string;
  title: string;
  countryCode: string;
  avatarColor?: string;
  totalLikes: number;
  weeklyLikes: number;
  followerCount: number;
  globalReachCount: number;
}

export interface TopThesisItem {
  id: string;
  content: string;
  stanceTag: string;
  likeCount: number;
  author: LeaderboardUser;
  agendaItem: {
    slot: string;
    title: string;
    countryCode: string;
    country: {
      code: string;
      nameTr: string;
      flagEmoji: string;
    };
  };
}

export interface GlobalFeedItem {
  id: string;
  slot: string;
  title: string;
  category: string;
  commentCount: number;
  publishedAt: string;
  country: {
    code: string;
    nameTr: string;
    flagEmoji: string;
    region: string;
    tempo: string;
  };
}

export interface GlobalCommentFeedItem {
  id: string;
  content: string;
  stanceTag: string;
  likeCount: number;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor?: string;
  };
  agendaItem: {
    slot: string;
    title: string;
    country: {
      code: string;
      nameTr: string;
      flagEmoji: string;
    };
  };
}

export interface LeaderboardData {
  weeklyLeaders: LeaderboardUser[];
  mostFollowed: LeaderboardUser[];
  globalStrategists: LeaderboardUser[];
  topTheses: TopThesisItem[];
  moderationStats: {
    totalApprovedComments: number;
    totalRejectedComments: number;
  };
}

interface LeaderboardSidebarProps {
  data: LeaderboardData | null;
  globalAgendas: GlobalFeedItem[];
  recentComments: GlobalCommentFeedItem[];
  defaultView?: "pulse" | "ranking";
  onOpenUserCv: (username: string) => void;
  onSelectCountryAndSlot: (countryCode: string, slot: string) => void;
}

export default function LeaderboardSidebar({
  data,
  globalAgendas,
  recentComments,
  defaultView = "pulse",
  onOpenUserCv,
  onSelectCountryAndSlot,
}: LeaderboardSidebarProps) {
  const [panelTab, setPanelTab] = useState<"pulse" | "ranking">(defaultView);
  const [rankTab, setRankTab] = useState<"weekly" | "followers" | "global">(
    "weekly"
  );

  const activeList =
    rankTab === "weekly"
      ? data?.weeklyLeaders || []
      : rankTab === "followers"
      ? data?.mostFollowed || []
      : data?.globalStrategists || [];

  return (
    <aside
      className="bg-white/90 backdrop-blur-xl rounded-3xl p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] flex flex-col gap-4 max-h-[calc(100dvh-6.5rem)] overflow-y-auto"
      aria-label="Canlı Küresel Akış ve Sıralama"
    >
      {/* Top Mode Switcher: Canlı Akış vs Topluluk Sıralaması */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setPanelTab("pulse")}
          className={`py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
            panelTab === "pulse"
              ? "bg-white text-authority shadow-xs"
              : "text-slate hover:text-ink"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Canlı Gündem</span>
        </button>

        <button
          type="button"
          onClick={() => setPanelTab("ranking")}
          className={`py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
            panelTab === "ranking"
              ? "bg-white text-authority shadow-xs"
              : "text-slate hover:text-ink"
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>Sıralama</span>
        </button>
      </div>

      {/* ====================================================================
          VIEW 1: LIVE GLOBAL AGENDA & RECENT COMMENTS PULSE
         ==================================================================== */}
      {panelTab === "pulse" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                🌍 Dünyada Konuşulanlar
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 font-semibold">
                CANLI
              </span>
            </div>

            {globalAgendas.length === 0 ? (
              <div className="p-4 bg-gray-50 rounded-2xl text-xs text-slate text-center">
                Canlı ülke gündemleri yükleniyor...
              </div>
            ) : (
              <div className="space-y-2">
                {globalAgendas.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onSelectCountryAndSlot(item.country.code, item.slot)
                    }
                    className="w-full text-left p-3 rounded-2xl bg-gray-100/70 hover:bg-gray-100 transition space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-authority truncate">
                        {item.country.flagEmoji} {item.country.nameTr} •{" "}
                        {item.slot}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white text-slate shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-xs text-ink font-medium line-clamp-2 leading-snug">
                      {item.title}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Latest Community Comments */}
          {recentComments.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wider text-ink">
                <MessageSquare className="w-3.5 h-3.5 text-authority" />
                <span>Son Kullanıcı Yorumları</span>
              </div>

              <div className="space-y-2">
                {recentComments.slice(0, 5).map((rc) => (
                  <div
                    key={rc.id}
                    className="p-3 rounded-2xl bg-gray-50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCountryAndSlot(
                            rc.agendaItem.country.code,
                            rc.agendaItem.slot
                          )
                        }
                        className="font-semibold text-authority hover:underline truncate"
                      >
                        {rc.agendaItem.country.flagEmoji}{" "}
                        {rc.agendaItem.country.nameTr} [{rc.agendaItem.slot}]
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenUserCv(rc.author.username)}
                        className="font-mono text-slate hover:text-ink truncate"
                      >
                        @{rc.author.username}
                      </button>
                    </div>
                    <p className="text-xs text-ink line-clamp-2 leading-relaxed">
                      {rc.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          VIEW 2: REAL USER LEADERBOARD & AI MODERATION SHIELD
         ==================================================================== */}
      {panelTab === "ranking" && (
        <div className="space-y-4">
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-2xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setRankTab("weekly")}
                className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
                  rankTab === "weekly"
                    ? "bg-white text-authority shadow-2xs"
                    : "text-slate hover:text-ink"
                }`}
              >
                <Flame className="w-3 h-3" />
                <span>Haftalık</span>
              </button>
              <button
                type="button"
                onClick={() => setRankTab("followers")}
                className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
                  rankTab === "followers"
                    ? "bg-white text-authority shadow-2xs"
                    : "text-slate hover:text-ink"
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Takipçi</span>
              </button>
              <button
                type="button"
                onClick={() => setRankTab("global")}
                className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
                  rankTab === "global"
                    ? "bg-white text-authority shadow-2xs"
                    : "text-slate hover:text-ink"
                }`}
              >
                <Globe2 className="w-3 h-3" />
                <span>Etki</span>
              </button>
            </div>

            {activeList.length === 0 ? (
              <div className="p-5 bg-gray-50 rounded-2xl text-center space-y-1">
                <div className="text-xs font-bold text-ink">
                  Liderlik Tablosu Gerçek Üyeleri Bekliyor
                </div>
                <p className="text-[11px] text-slate leading-relaxed">
                  Tüm sahte profiller temizlendi. Ülke gündemlerine yorum
                  yaparak zirveye yerleşen ilk gerçek üye olun!
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeList.map((user, idx) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => onOpenUserCv(user.username)}
                    className="w-full p-2.5 px-3 bg-gray-100/70 hover:bg-gray-100 rounded-2xl flex items-center justify-between gap-2 transition text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full font-mono text-[11px] font-bold flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? "bg-amber-500 text-white"
                            : idx === 1
                            ? "bg-gray-500 text-white"
                            : idx === 2
                            ? "bg-amber-700 text-white"
                            : "bg-white text-slate"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-ink truncate">
                          {user.displayName}
                        </div>
                        <div className="text-[11px] font-mono text-slate truncate">
                          @{user.username}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-authority">
                        ▲ {user.weeklyLikes}
                      </div>
                      <div className="text-[10px] text-slate">
                        {user.globalReachCount} ülke
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Top Liked Comments */}
          {data && data.topTheses.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <div className="px-1 text-xs font-bold uppercase tracking-wider text-ink">
                🔥 En Çok Beğenilen Yorumlar
              </div>
              {data.topTheses.map((thesis) => (
                <div
                  key={thesis.id}
                  className="p-3 bg-gray-50 rounded-2xl space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectCountryAndSlot(
                          thesis.agendaItem.country.code,
                          thesis.agendaItem.slot
                        )
                      }
                      className="font-semibold text-authority hover:underline truncate"
                    >
                      {thesis.agendaItem.country.flagEmoji}{" "}
                      {thesis.agendaItem.country.nameTr} •{" "}
                      {thesis.agendaItem.slot}
                    </button>
                    <span className="font-mono font-bold text-ink">
                      ▲ {thesis.likeCount}
                    </span>
                  </div>
                  <p className="text-xs text-ink line-clamp-2 leading-relaxed">
                    “{thesis.content}”
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Gemini 3.5 Moderation Shield */}
          {data && (
            <div className="p-3.5 bg-gray-100/75 rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-ink">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Gemini 3.5 Moderasyon</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-800 rounded-full font-semibold">
                  AKTİF
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 bg-white rounded-xl">
                  <div className="font-mono font-bold text-sm text-emerald-700">
                    {data.moderationStats.totalApprovedComments}
                  </div>
                  <div className="text-[10px] text-slate">Yayınlanan Yorum</div>
                </div>
                <div className="p-2.5 bg-white rounded-xl">
                  <div className="font-mono font-bold text-sm text-rose-700">
                    {data.moderationStats.totalRejectedComments}
                  </div>
                  <div className="text-[10px] text-slate">Engellenen</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
