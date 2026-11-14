"use client";

import React, { useMemo, useState } from "react";
import { Search, Star, Flame, Globe } from "lucide-react";
import type { CountrySummary } from "@/components/WorldMapPanel";

interface CountryExplorerPanelProps {
  countries: CountrySummary[];
  selectedCode: string | null;
  pinnedCodes: string[];
  onSelectCountry: (code: string) => void;
  onTogglePin: (code: string) => void;
}

const REGIONS = [
  "ALL",
  "Avrasya & Orta Doğu",
  "Avrupa",
  "Amerika",
  "Asya-Pasifik",
  "Afrika",
];

export default function CountryExplorerPanel({
  countries,
  selectedCode,
  pinnedCodes,
  onSelectCountry,
  onTogglePin,
}: CountryExplorerPanelProps) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("ALL");
  const [onlyHot, setOnlyHot] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries.filter((c) => {
      if (region !== "ALL" && c.region !== region) return false;
      if (onlyHot && c.tempo !== "HOT") return false;
      if (!q) return true;
      return (
        c.nameTr.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.capital && c.capital.toLowerCase().includes(q)) ||
        (c.nameEn && c.nameEn.toLowerCase().includes(q))
      );
    });
  }, [countries, query, region, onlyHot]);

  return (
    <aside
      aria-label="Dünya Ülkeleri Gezgini"
      className="bg-white/90 backdrop-blur-xl rounded-3xl p-4 shadow-[0_8px_30px_rgba(15,23,42,0.05)] flex flex-col h-full max-h-[calc(100dvh-6.5rem)]"
    >
      <div className="flex items-center justify-between gap-2 px-1 mb-3">
        <div className="flex items-center gap-2 font-bold text-xs text-ink uppercase tracking-wider">
          <Globe className="w-4 h-4 text-authority" />
          <span>Ülkeler ({countries.length})</span>
        </div>

        <button
          type="button"
          onClick={() => setOnlyHot((v) => !v)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
            onlyHot
              ? "bg-rose-600 text-white shadow-xs"
              : "bg-gray-100 text-slate hover:text-ink"
          }`}
          title="Sıcak gündemli ülkeleri filtrele"
        >
          <Flame className="w-3 h-3" />
          <span>Sıcak Gündem</span>
        </button>
      </div>

      {/* Instant Search */}
      <div className="relative mb-2.5">
        <Search className="w-3.5 h-3.5 text-slate absolute left-3.5 top-2.5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ülke veya başkent ara..."
          className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-100/90 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-authority/20"
        />
      </div>

      {/* Region Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-2 no-scrollbar shrink-0">
        {REGIONS.map((reg) => (
          <button
            key={reg}
            type="button"
            onClick={() => setRegion(reg)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
              region === reg
                ? "bg-authority text-white shadow-2xs"
                : "bg-gray-100 text-slate hover:text-ink"
            }`}
          >
            {reg === "ALL" ? "Tümü" : reg}
          </button>
        ))}
      </div>

      {/* Scrollable Country List */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {filtered.map((c) => {
          const isSelected = c.code === selectedCode;
          const isPinned = pinnedCodes.includes(c.code);
          const topHeadline = c.agendas?.[0]?.title;

          return (
            <div
              key={c.code}
              className={`group rounded-2xl p-2.5 transition flex items-start justify-between gap-2 ${
                isSelected
                  ? "bg-authority text-white shadow-sm"
                  : "bg-gray-100/60 hover:bg-gray-100"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectCountry(c.code)}
                className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
              >
                <span className="text-lg shrink-0 mt-0.5">{c.flagEmoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold truncate ${
                        isSelected ? "text-white" : "text-ink"
                      }`}
                    >
                      {c.nameTr}
                    </span>
                    {c.tempo === "HOT" && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isSelected ? "bg-rose-300" : "bg-rose-500"
                        }`}
                      />
                    )}
                  </div>

                  <div
                    className={`text-[11px] truncate ${
                      isSelected ? "text-white/75" : "text-slate"
                    }`}
                  >
                    {c.capital ? `${c.capital} • ` : ""}
                    {c.region}
                  </div>

                  {topHeadline && (
                    <p
                      className={`text-[11px] mt-1 line-clamp-1 ${
                        isSelected ? "text-white/90" : "text-ink/80"
                      }`}
                    >
                      • {topHeadline}
                    </p>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onTogglePin(c.code)}
                title={
                  isPinned ? "Hızlı bardan kaldır" : "Hızlı bara sabitle"
                }
                className={`p-1.5 rounded-full shrink-0 transition ${
                  isPinned
                    ? isSelected
                      ? "text-amber-300"
                      : "text-amber-500"
                    : isSelected
                    ? "text-white/40 hover:text-white"
                    : "text-gray-300 hover:text-amber-500"
                }`}
              >
                <Star
                  className="w-3.5 h-3.5"
                  fill={isPinned ? "currentColor" : "none"}
                />
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-6 text-center text-xs text-slate">
            Aramanızla eşleşen ülke bulunamadı.
          </div>
        )}
      </div>
    </aside>
  );
}
