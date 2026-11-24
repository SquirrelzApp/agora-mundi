"use client";

import React, { useEffect, useRef } from "react";
import { ThumbsUp, Users, X, ExternalLink, MessageCircle, UserCog, Check } from "lucide-react";

export interface PoliticalCvData {
  user: {
    id: string;
    username: string;
    displayName: string;
    title: string;
    bio: string;
    countryCode: string;
    avatarColor?: string;
    totalLikes: number;
    weeklyLikes: number;
    followerCount: number;
    followingCount?: number;
    globalReachCount: number;
    createdAt?: string;
    comments: Array<{
      id: string;
      content: string;
      stanceTag: string;
      likeCount: number;
      aiQualityScore: number;
      sourceUrl?: string | null;
      createdAt: string;
      agendaItem: {
        id: string;
        slot: string;
        title: string;
        country: {
          code: string;
          name: string;
          flagEmoji: string;
        };
      };
    }>;
  };
  countryInfluence: Array<{
    code: string;
    name: string;
    flagEmoji: string;
    likes: number;
    commentCount: number;
  }>;
  viewerIsFollowing?: boolean;
  isSelf?: boolean;
}

interface PoliticalCvModalProps {
  cvData: PoliticalCvData | null;
  onClose: () => void;
  onFollow: (username: string) => void;
  onEditOwnProfile?: () => void;
  onJumpToCountry?: (countryCode: string, slot: string, agendaId?: string) => void;
}

export default function PoliticalCvModal({
  cvData,
  onClose,
  onFollow,
  onEditOwnProfile,
  onJumpToCountry,
}: PoliticalCvModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (cvData) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [cvData]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);

    const handleBackdropClick = (event: MouseEvent) => {
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
      aria-labelledby="political-cv-title"
      className="w-[94dvw] max-w-2xl bg-white text-ink rounded-3xl shadow-[0_25px_70px_rgba(15,23,42,0.18)] p-0 border-0 outline-none"
    >
      {cvData && (
        <div className="p-6 sm:p-7 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className="w-12 h-12 rounded-2xl text-white font-bold text-base flex items-center justify-center shrink-0 shadow-sm"
                style={{
                  backgroundColor: cvData.user.avatarColor || "#1D3557",
                }}
              >
                {cvData.user.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2
                  id="political-cv-title"
                  className="text-xl font-serif font-bold text-ink truncate"
                >
                  {cvData.user.displayName}
                </h2>
                <div className="text-xs text-slate font-mono truncate mt-0.5">
                  @{cvData.user.username}
                </div>
                {cvData.user.bio && (
                  <p className="text-sm text-slate mt-2 leading-relaxed">
                    {cvData.user.bio}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cvData.isSelf ? (
                onEditOwnProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditOwnProfile();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-ink text-xs font-semibold rounded-full transition"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => onFollow(cvData.user.username)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition shadow-sm ${
                    cvData.viewerIsFollowing
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-authority text-white hover:opacity-90"
                  }`}
                >
                  {cvData.viewerIsFollowing && <Check className="w-3.5 h-3.5" />}
                  <span>
                    {cvData.viewerIsFollowing
                      ? `Following (${cvData.user.followerCount})`
                      : `+ Follow (${cvData.user.followerCount})`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3.5 bg-gray-100/70 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <ThumbsUp className="w-3.5 h-3.5 text-authority" />
                <span>Likes</span>
              </div>
              <div className="text-lg font-bold font-mono text-ink mt-1">
                {cvData.user.totalLikes.toLocaleString("en-US")}
              </div>
            </div>

            <div className="p-3.5 bg-gray-100/70 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <Users className="w-3.5 h-3.5 text-authority" />
                <span>Followers</span>
              </div>
              <div className="text-lg font-bold font-mono text-ink mt-1">
                {cvData.user.followerCount.toLocaleString("en-US")}
              </div>
            </div>

            <div className="p-3.5 bg-gray-100/70 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs text-slate">
                <MessageCircle className="w-3.5 h-3.5 text-authority" />
                <span>Comments</span>
              </div>
              <div className="text-lg font-bold font-mono text-ink mt-1">
                {cvData.user.comments.length}
              </div>
            </div>
          </div>

          {/* User's Comments */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate mb-2.5">
              Comments ({cvData.user.comments.length})
            </h3>
            {cvData.user.comments.length === 0 ? (
              <div className="p-6 bg-gray-50 rounded-2xl text-center text-xs text-slate">
                No comments on any country agenda yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {cvData.user.comments.map((c) => (
                  <article
                    key={c.id}
                    className="p-4 bg-gray-100/60 rounded-2xl space-y-1.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-authority">
                          {c.agendaItem.country.flagEmoji}{" "}
                          {c.agendaItem.country.name}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-ink shrink-0">
                          <ThumbsUp className="w-3 h-3 text-authority" />
                          {c.likeCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onJumpToCountry) {
                            onJumpToCountry(
                              c.agendaItem.country.code,
                              c.agendaItem.slot,
                              c.agendaItem.id
                            );
                            onClose();
                          }
                        }}
                        dir="auto"
                        className="block w-full text-left text-xs font-medium text-slate hover:text-authority hover:underline leading-snug break-words transition"
                      >
                        {c.agendaItem.title}
                      </button>
                    </div>
                    <p className="text-sm text-ink leading-relaxed">
                      {c.content}
                    </p>
                    {c.sourceUrl && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-authority hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Source Link
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
