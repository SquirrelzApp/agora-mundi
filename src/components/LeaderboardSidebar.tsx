"use client";

import React, { useState } from "react";
import { Trophy, Users, Globe2, ShieldAlert, Flame } from "lucide-react";

export interface LeaderboardUser {
  id: string;
  username: string;
  displayName: string;
  title: string;
  countryCode: string;
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

export interface LeaderboardData {
  weeklyLeaders: LeaderboardUser[];
  mostFollowed: LeaderboardUser[];
  globalStrategists: LeaderboardUser[];
  topTheses: TopThesisItem[];
  moderationStats: {
    totalApprovedComments: number;
    totalRejectedComments: number;
    recentRejections: Array<{
      id: string;
      username: string;
      countryCode: string;
      violationCategory: string;
      reason: string;
    }>;
  };
}

interface LeaderboardSidebarProps {
  data: LeaderboardData | null;
  onOpenUserCv: (username: string) => void;
  onSelectCountryAndSlot: (countryCode: string, slot: string) => void;
}

export default function LeaderboardSidebar({
  data,
  onOpenUserCv,
  onSelectCountryAndSlot,
}: LeaderboardSidebarProps) {
  const [tab, setTab] = useState<"weekly" | "followers" | "global">("weekly");

  if (!data) {
    return (
      <aside className="space-y-4">
        <div className="bg-gray-100/70 p-4 rounded-2xl text-xs text-slate">
          Sıralama verileri yükleniyor...
        </div>
      </aside>
    );
  }

  const activeList =
    tab === "weekly"
      ? data.weeklyLeaders
      : tab === "followers"
      ? data.mostFollowed
      : data.globalStrategists;

  return (
    <aside className="space-y-5" aria-label="Küresel Rekabet ve Liderlik Tablosu">
      {/* 1. Modern Borderless Leaderboard Card */}
      <section className="bg-gray-100/60 p-4 rounded-3xl space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 font-bold text-xs text-ink">
            <Trophy className="w-4 h-4 text-amber-600" />
            <span>ZİHİNSEL REKABET SIRALAMASI</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 font-semibold">
            CANLI
          </span>
        </div>

        {/* Segmented Modern Pill Switcher */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-200/70 rounded-2xl text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setTab("weekly")}
            className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
              tab === "weekly"
                ? "bg-white text-authority shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Haftalık</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("followers")}
            className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
              tab === "followers"
                ? "bg-white text-authority shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Takipçi</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("global")}
            className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 transition ${
              tab === "global"
                ? "bg-white text-authority shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>Küresel</span>
          </button>
        </div>

        {/* Responsive Table */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="leaderboard-caption"
          className="table-wrapper"
        >
          <table
            className="responsive-data-table text-xs"
            style={
              {
                "--label-2": '"Haftalık"',
                "--label-3": '"Takipçi"',
                "--label-4": '"Ülke"',
              } as React.CSSProperties
            }
          >
            <caption id="leaderboard-caption" className="sr-only">
              Kanaat Önderleri ve Analistler Rekabet Sıralaması
            </caption>
            <thead className="text-slate text-[10px] uppercase">
              <tr>
                <th className="py-1.5 px-2.5 text-left font-semibold">
                  Analist
                </th>
                <th className="py-1.5 px-2 text-right font-semibold">Hafta</th>
                <th className="py-1.5 px-2 text-right font-semibold">Kitle</th>
                <th className="py-1.5 px-2.5 text-right font-semibold">Etki</th>
              </tr>
            </thead>
            <tbody className="space-y-1.5">
              {activeList.map((user, idx) => (
                <tr
                  key={user.id}
                  onClick={() => onOpenUserCv(user.username)}
                  className="bg-white hover:bg-gray-50 cursor-pointer transition rounded-2xl shadow-[0_2px_8px_rgb(0,0,0,0.02)]"
                  title="Politik CV ve Referans Dosyasını Aç"
                >
                  <th className="py-2.5 px-3 text-left font-normal rounded-l-2xl">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-5 h-5 rounded-full font-mono text-[11px] font-bold flex items-center justify-center ${
                          idx === 0
                            ? "bg-amber-500 text-white"
                            : idx === 1
                            ? "bg-gray-500 text-white"
                            : idx === 2
                            ? "bg-amber-700 text-white"
                            : "bg-gray-100 text-slate"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-semibold text-ink">
                          @{user.username}
                        </div>
                        <div className="text-[11px] text-slate truncate max-w-[130px]">
                          {user.displayName}
                        </div>
                      </div>
                    </div>
                  </th>
                  <td className="py-2.5 px-2 text-right font-mono font-semibold text-amber-700">
                    +{user.weeklyLikes}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-ink">
                    {user.followerCount}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold rounded-r-2xl">
                    {user.globalReachCount} Ülke
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Top Voted Theses of the Week */}
      <section className="bg-gray-100/60 p-4 rounded-3xl space-y-3">
        <div className="px-1 font-bold text-xs text-ink">
          🔥 HAFTANIN EN ÇOK BEĞENİLEN TEZLERİ
        </div>

        <div className="space-y-2.5">
          {data.topTheses.map((thesis) => (
            <div
              key={thesis.id}
              className="p-3.5 bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:shadow-md transition space-y-2"
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
                  className="font-semibold text-authority hover:underline text-left"
                >
                  {thesis.agendaItem.country.flagEmoji}{" "}
                  {thesis.agendaItem.country.nameTr} • {thesis.agendaItem.slot}
                </button>
                <span className="px-2 py-0.5 bg-gray-100 rounded-full font-mono font-bold text-ink">
                  ▲ {thesis.likeCount}
                </span>
              </div>

              <p className="text-xs text-ink line-clamp-3 leading-relaxed">
                “{thesis.content}”
              </p>

              <div className="flex items-center justify-between text-[11px] text-slate">
                <button
                  type="button"
                  onClick={() => onOpenUserCv(thesis.author.username)}
                  className="font-medium text-ink hover:underline"
                >
                  @{thesis.author.username}
                </button>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 bg-gray-100 rounded-full">
                  {thesis.stanceTag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. AI Moderation Shield Live Report */}
      <section className="bg-gray-100/60 p-4 rounded-3xl space-y-3 text-xs">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 font-bold text-ink">
            <ShieldAlert className="w-4 h-4 text-emerald-700" />
            <span>AI MODERASYON KALKANI</span>
          </div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-emerald-500/10 text-emerald-800 rounded-full font-semibold">
            Aktif
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-center">
          <div className="p-3 bg-white rounded-2xl shadow-[0_2px_8px_rgb(0,0,0,0.02)]">
            <div className="font-mono font-bold text-base text-emerald-700">
              {data.moderationStats.totalApprovedComments}
            </div>
            <div className="text-[11px] text-slate">Onaylı Tez</div>
          </div>
          <div className="p-3 bg-white rounded-2xl shadow-[0_2px_8px_rgb(0,0,0,0.02)]">
            <div className="font-mono font-bold text-base text-rose-700">
              {data.moderationStats.totalRejectedComments}
            </div>
            <div className="text-[11px] text-slate">Engellenen</div>
          </div>
        </div>
      </section>
    </aside>
  );
}
