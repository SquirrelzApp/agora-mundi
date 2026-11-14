"use client";

import React, { useEffect, useRef } from "react";
import { ThumbsUp, Users, X, ExternalLink } from "lucide-react";

export interface PoliticalCvData {
  user: {
    id: string;
    username: string;
    displayName: string;
    title: string;
    bio: string;
    countryCode: string;
    totalLikes: number;
    weeklyLikes: number;
    followerCount: number;
    globalReachCount: number;
    comments: Array<{
      id: string;
      content: string;
      stanceTag: string;
      likeCount: number;
      aiQualityScore: number;
      sourceUrl?: string | null;
      createdAt: string;
      agendaItem: {
        slot: string;
        title: string;
        country: {
          code: string;
          nameTr: string;
          flagEmoji: string;
        };
      };
    }>;
  };
  countryInfluence: Array<{
    code: string;
    nameTr: string;
    flagEmoji: string;
    likes: number;
    commentCount: number;
  }>;
}

interface PoliticalCvModalProps {
  cvData: PoliticalCvData | null;
  onClose: () => void;
  onFollow: (username: string) => void;
}

export default function PoliticalCvModal({
  cvData,
  onClose,
  onFollow,
}: PoliticalCvModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (cvData) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [cvData]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
    };

    dialog.addEventListener("close", handleClose);

    const handleBackdropClick = (event: MouseEvent) => {
      if ("closedBy" in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isDialogContent) {
        dialog.close();
      }
    };

    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby="political-cv-title"
      className="w-[94dvw] max-w-2xl bg-white text-ink rounded-3xl shadow-[0_25px_70px_rgba(15,23,42,0.18)] p-0 border-0 outline-none"
    >
      {cvData && (
        <div className="p-6 sm:p-7 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase bg-authority/10 text-authority font-semibold rounded-full">
                  POLİTİK & ENTELEKTÜEL CV
                </span>
                <span className="text-xs text-slate font-mono">
                  @{cvData.user.username}
                </span>
              </div>
              <h2
                id="political-cv-title"
                className="text-xl font-serif font-bold text-ink mt-1.5"
              >
                {cvData.user.displayName}
              </h2>
              <p className="text-xs font-medium text-authority mt-0.5">
                {cvData.user.title}
              </p>
              <p className="text-sm text-slate mt-2 leading-relaxed">
                {cvData.user.bio}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onFollow(cvData.user.username)}
                className="px-3.5 py-1.5 bg-authority text-white text-xs font-semibold rounded-full hover:opacity-90 transition shadow-sm"
              >
                + Takip Et ({cvData.user.followerCount})
              </button>
              <form method="dialog">
                <button
                  type="submit"
                  aria-label="Dosyayı Kapat"
                  className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Prestige Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-gray-100/70 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <ThumbsUp className="w-3.5 h-3.5 text-authority" />
                <span>Toplam Onay</span>
              </div>
              <div className="text-lg font-bold font-mono text-ink mt-1">
                {cvData.user.totalLikes.toLocaleString("tr-TR")}
              </div>
            </div>

            <div className="p-3.5 bg-gray-100/70 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <Users className="w-3.5 h-3.5 text-authority" />
                <span>Kitle / Takipçi</span>
              </div>
              <div className="text-lg font-bold font-mono text-ink mt-1">
                {cvData.user.followerCount.toLocaleString("tr-TR")}
              </div>
            </div>
          </div>

          {/* Global Influence Breakdown by Country */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate mb-2.5">
              Bölgesel Etki & Beğeni Dağılımı
            </h3>
            <div className="flex flex-wrap gap-2">
              {cvData.countryInfluence.map((ci) => (
                <div
                  key={ci.code}
                  className="px-3.5 py-1.5 bg-gray-100 rounded-full text-xs flex items-center gap-2"
                >
                  <span>
                    {ci.flagEmoji} <strong>{ci.nameTr}</strong>
                  </span>
                  <span className="font-mono text-authority font-semibold">
                    ▲ {ci.likes}
                  </span>
                  <span className="text-slate">({ci.commentCount} tez)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Voted Theses */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate mb-2.5">
              En Çok Kitle Toplayan Tezleri
            </h3>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {cvData.user.comments.map((c) => (
                <article
                  key={c.id}
                  className="p-4 bg-gray-100/60 rounded-2xl space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-authority">
                      {c.agendaItem.country.flagEmoji}{" "}
                      {c.agendaItem.country.nameTr} [{c.agendaItem.slot}] —{" "}
                      <span className="font-normal text-slate">
                        {c.agendaItem.title}
                      </span>
                    </span>
                    <span className="font-mono font-bold text-ink shrink-0">
                      ▲ {c.likeCount}
                    </span>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{c.content}</p>
                  {c.sourceUrl && (
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-authority hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Referans Kaynak
                    </a>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
