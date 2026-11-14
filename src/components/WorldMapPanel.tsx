"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { geoOrthographic, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import worldAtlasData from "world-atlas/countries-110m.json";
import { NUMERIC_TO_ALPHA2 } from "@/lib/world-countries";
import {
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  Search,
  Check,
  RotateCcw,
  X,
} from "lucide-react";

export interface AgendaSummary {
  id: string;
  slot: string;
  title: string;
  _count?: { comments: number };
}

export interface CountrySummary {
  code: string;
  nameTr: string;
  region: string;
  flagEmoji: string;
  tempo: "HOT" | "MODERATE" | "STABLE" | string;
  updateIntervalHours: number;
  mapX: number;
  mapY: number;
  lastUpdatedAt: string;
  agendas: AgendaSummary[];
}

interface WorldMapPanelProps {
  countries: CountrySummary[];
  selectedCode: string;
  onSelectCountry: (code: string) => void;
  onSyncCountry: (code: string) => void;
  syncing: boolean;
}

const DEFAULT_PINNED_CODES = [
  "TR",
  "AZ",
  "IL",
  "US",
  "DE",
  "RU",
  "GB",
  "FI",
  "IS",
  "JP",
  "BR",
];

const BASE_SCALE = 225;
const MIN_SCALE = 140;
const MAX_SCALE = 1100;

export default function WorldMapPanel({
  countries,
  selectedCode,
  onSelectCountry,
}: WorldMapPanelProps) {
  const [rotation, setRotation] = useState<[number, number]>([-34, -38]);
  const [scale, setScale] = useState<number>(BASE_SCALE);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const [pinnedCodes, setPinnedCodes] = useState<string[]>(DEFAULT_PINNED_CODES);
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [filterRegion, setFilterRegion] = useState<string>("ALL");

  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("agora_pinned_countries");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedCodes(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const savePinnedCodes = (next: string[]) => {
    setPinnedCodes(next);
    try {
      localStorage.setItem("agora_pinned_countries", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const togglePinnedCountry = (code: string) => {
    if (pinnedCodes.includes(code)) {
      if (pinnedCodes.length <= 1) return;
      savePinnedCodes(pinnedCodes.filter((c) => c !== code));
    } else {
      savePinnedCodes([...pinnedCodes, code]);
    }
  };

  const handleSelectFromGlobe = (code: string) => {
    if (!pinnedCodes.includes(code)) {
      savePinnedCodes([...pinnedCodes, code]);
    }
    onSelectCountry(code);
  };

  const countryByCode = useMemo(() => {
    const map: Record<string, CountrySummary> = {};
    for (const c of countries) {
      map[c.code] = c;
    }
    return map;
  }, [countries]);

  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map()
  );
  const dragDistance = useRef(0);
  const dragStart = useRef<{ x: number; y: number; rot: [number, number] }>({
    x: 0,
    y: 0,
    rot: [-34, -38],
  });
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
      setScale((prev) =>
        Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(prev * zoomFactor)))
      );
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const worldFeatures = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topo = worldAtlasData as any;
    const geo = feature(topo, topo.objects.countries) as unknown as {
      features: Array<{
        id?: string | number;
        properties?: { name?: string };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        geometry: any;
      }>;
    };
    return geo.features;
  }, []);

  const graticule = useMemo(() => geoGraticule10(), []);

  const projection = useMemo(() => {
    return geoOrthographic()
      .scale(scale)
      .translate([250, 250])
      .rotate([rotation[0], rotation[1], 0])
      .clipAngle(90);
  }, [scale, rotation]);

  const pathGenerator = useMemo(() => geoPath(projection), [projection]);

  const resolveFeatureIsoCode = (feat: {
    id?: string | number;
    properties?: { name?: string };
  }): string | undefined => {
    const rawId = feat.id !== undefined ? String(feat.id).padStart(3, "0") : "";
    if (NUMERIC_TO_ALPHA2[rawId]) return NUMERIC_TO_ALPHA2[rawId];
    if (feat.properties?.name === "N. Cyprus") return "XK_NCY";
    if (feat.properties?.name === "Kosovo") return "XK";
    return undefined;
  };

  const getTwoPointerDistance = () => {
    const pts = Array.from(activePointers.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointers.current.size === 1) {
      dragDistance.current = 0;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        rot: [...rotation] as [number, number],
      };
      pinchStart.current = null;
    } else if (activePointers.current.size === 2) {
      const dist = getTwoPointerDistance();
      if (dist > 5) {
        pinchStart.current = { dist, scale };
      }
      dragDistance.current = 999;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size >= 2 && pinchStart.current) {
      const currentDist = getTwoPointerDistance();
      if (currentDist > 5 && pinchStart.current.dist > 5) {
        const ratio = currentDist / pinchStart.current.dist;
        const nextScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, Math.round(pinchStart.current.scale * ratio))
        );
        setScale(nextScale);
      }
      return;
    }

    if (activePointers.current.size === 1) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      dragDistance.current = Math.hypot(dx, dy);

      const sensitivity = 0.42 * (BASE_SCALE / Math.max(BASE_SCALE, scale));
      const nextLambda = dragStart.current.rot[0] + dx * sensitivity;
      const nextPhi = Math.max(
        -80,
        Math.min(80, dragStart.current.rot[1] - dy * sensitivity)
      );
      setRotation([nextLambda, nextPhi]);
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasSinglePointer = activePointers.current.size === 1;
    activePointers.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointers.current.size === 1) {
      const remaining = Array.from(activePointers.current.values())[0];
      dragStart.current = {
        x: remaining.x,
        y: remaining.y,
        rot: [...rotation] as [number, number],
      };
      pinchStart.current = null;
      return;
    }

    if (activePointers.current.size === 0) {
      pinchStart.current = null;
      if (wasSinglePointer && dragDistance.current <= 6) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const code = target?.getAttribute("data-country-code");
        if (code && countryByCode[code]) {
          handleSelectFromGlobe(code);
        }
      }
    }
  };

  const handleZoomIn = () => {
    setScale((s) => Math.min(MAX_SCALE, Math.round(s * 1.3)));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(MIN_SCALE, Math.round(s / 1.3)));
  };

  const handleResetView = () => {
    setScale(BASE_SCALE);
    setRotation([-34, -38]);
  };

  const getPinColor = (tempo: string) => {
    if (tempo === "HOT") return "#E11D48";
    if (tempo === "MODERATE") return "#D97706";
    return "#0284C7";
  };

  const globePinCountries = useMemo(() => {
    const codes = new Set<string>(pinnedCodes);
    if (selectedCode) codes.add(selectedCode);
    if (hoveredCode) codes.add(hoveredCode);

    if (scale >= 340) {
      const centerLon = -rotation[0];
      const centerLat = -rotation[1];
      const rad = Math.PI / 180;
      const lat1 = centerLat * rad;
      const threshold = scale >= 520 ? 0.85 : 0.93;

      for (const c of countries) {
        const dLon = (c.mapX - centerLon) * rad;
        const lat2 = c.mapY * rad;
        const cosAngle =
          Math.sin(lat1) * Math.sin(lat2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
        if (cosAngle > threshold) {
          codes.add(c.code);
        }
      }
    }

    return Array.from(codes)
      .map((code) => countryByCode[code])
      .filter(Boolean);
  }, [
    pinnedCodes,
    selectedCode,
    hoveredCode,
    scale,
    rotation,
    countries,
    countryByCode,
  ]);

  const visibleBarCountries = useMemo(() => {
    const list = pinnedCodes
      .map((code) => countryByCode[code])
      .filter(Boolean);
    if (
      selectedCode &&
      countryByCode[selectedCode] &&
      !pinnedCodes.includes(selectedCode)
    ) {
      list.unshift(countryByCode[selectedCode]);
    }
    return list;
  }, [pinnedCodes, selectedCode, countryByCode]);

  const filteredModalCountries = useMemo(() => {
    return countries.filter((c) => {
      const matchRegion = filterRegion === "ALL" || c.region === filterRegion;
      const matchQuery =
        c.nameTr.toLowerCase().includes(filterSearch.toLowerCase()) ||
        c.code.toLowerCase().includes(filterSearch.toLowerCase());
      return matchRegion && matchQuery;
    });
  }, [countries, filterRegion, filterSearch]);

  return (
    <div className="w-full max-w-full flex flex-col items-center justify-center overflow-hidden">
      {/* Interactive 3D Orthographic Globe Area */}
      <div className="relative w-full max-w-2xl flex items-center justify-center">
        {/* Globe SVG */}
        <div className="w-full max-w-[335px] sm:max-w-[490px] aspect-square flex items-center justify-center overflow-hidden mx-auto">
          <svg
            ref={svgRef}
            viewBox="0 0 500 500"
            className="w-full h-full cursor-grab active:cursor-grabbing select-none touch-none block"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            role="img"
            aria-label="İnteraktif 3B Dünya Küresi"
          >
            <defs>
              <radialGradient id="globe-ocean" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="65%" stopColor="#E2ECF5" />
                <stop offset="100%" stopColor="#CBDCEB" />
              </radialGradient>
              <filter
                id="globe-shadow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feDropShadow
                  dx="0"
                  dy="14"
                  stdDeviation="18"
                  floodColor="#0F172A"
                  floodOpacity="0.08"
                />
              </filter>
            </defs>

            {/* Globe Ocean Sphere (Borderless soft rim) */}
            <path
              d={pathGenerator({ type: "Sphere" }) || ""}
              fill="url(#globe-ocean)"
              filter="url(#globe-shadow)"
            />

            {/* Soft Graticule Lines */}
            <path
              d={pathGenerator(graticule) || ""}
              fill="none"
              stroke="#D5E2EE"
              strokeWidth="0.5"
              pointerEvents="none"
            />

            {/* Real World Country Polygons */}
            <g>
              {worldFeatures.map((feat, idx) => {
                const isoCode = resolveFeatureIsoCode(feat);
                const isSelected = Boolean(isoCode && isoCode === selectedCode);
                const isHovered = Boolean(isoCode && isoCode === hoveredCode);
                const isPinned = Boolean(
                  isoCode && pinnedCodes.includes(isoCode)
                );

                const d = pathGenerator(feat as never);
                if (!d) return null;

                let fill = "#E2E6EC";
                let stroke = "#CBD2DC";

                if (isSelected) {
                  fill = "#1E3A5F";
                  stroke = "#1E3A5F";
                } else if (isHovered) {
                  fill = "#3B6291";
                  stroke = "#2B4C75";
                } else if (isPinned) {
                  fill = "#D5DCE6";
                  stroke = "#B8C2D0";
                }

                return (
                  <path
                    key={feat.id ?? idx}
                    d={d}
                    data-country-code={isoCode || ""}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 1 : 0.5}
                    className={isoCode ? "cursor-pointer transition-colors" : ""}
                    onMouseEnter={() => {
                      if (isoCode) setHoveredCode(isoCode);
                    }}
                    onMouseLeave={() => {
                      if (isoCode) setHoveredCode(null);
                    }}
                  />
                );
              })}
            </g>

            {/* Country Markers on Visible Hemisphere */}
            <g>
              {globePinCountries.map((country) => {
                const lon = country.mapX;
                const lat = country.mapY;

                const centerLon = -rotation[0];
                const centerLat = -rotation[1];
                const rad = Math.PI / 180;
                const dLon = (lon - centerLon) * rad;
                const lat1 = centerLat * rad;
                const lat2 = lat * rad;
                const cosAngle =
                  Math.sin(lat1) * Math.sin(lat2) +
                  Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);

                if (cosAngle < 0.12) return null;

                const projected = projection([lon, lat]);
                if (!projected) return null;

                const [px, py] = projected;
                if (px < 5 || px > 495 || py < 5 || py > 495) return null;

                const isSelected = country.code === selectedCode;
                const pinColor = getPinColor(country.tempo);
                const badgeWidth = country.nameTr.length * 6.1 + 30;
                const labelOffsetX =
                  px + badgeWidth + 12 > 490 ? -(badgeWidth + 8) : 8;

                return (
                  <g
                    key={country.code}
                    transform={`translate(${px}, ${py})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredCode(country.code)}
                    onMouseLeave={() => setHoveredCode(null)}
                  >
                    <circle
                      r={isSelected ? 9 : 6}
                      data-country-code={country.code}
                      fill={
                        isSelected
                          ? "rgba(30,58,95,0.22)"
                          : "rgba(255,255,255,0.75)"
                      }
                    />
                    <circle
                      r={isSelected ? 4 : 3}
                      data-country-code={country.code}
                      fill={isSelected ? "#1E3A5F" : pinColor}
                    />

                    <g transform={`translate(${labelOffsetX}, -11)`}>
                      <rect
                        x="0"
                        y="0"
                        rx="10"
                        ry="10"
                        width={badgeWidth}
                        height="21"
                        data-country-code={country.code}
                        fill={
                          isSelected ? "#1E3A5F" : "rgba(255,255,255,0.92)"
                        }
                      />
                      <text
                        x="8"
                        y="14"
                        fontSize="10.5"
                        fontWeight="600"
                        data-country-code={country.code}
                        fill={isSelected ? "#FFFFFF" : "#141619"}
                        fontFamily="sans-serif"
                      >
                        {country.flagEmoji} {country.nameTr}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Borderless Glass Zoom Pill in Top-Right Corner (Outside the sphere) */}
        <div className="absolute top-1 right-1 sm:right-2 flex flex-col items-center gap-1 bg-white/80 backdrop-blur-md p-1 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.06)]">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-200/60 text-ink transition active:scale-95"
            title="Yakınlaştır"
            aria-label="Yakınlaştır"
          >
            <ZoomIn className="w-4 h-4 text-authority" />
          </button>

          <button
            type="button"
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-200/60 text-ink transition active:scale-95"
            title="Uzaklaştır"
            aria-label="Uzaklaştır"
          >
            <ZoomOut className="w-4 h-4 text-authority" />
          </button>

          {scale !== BASE_SCALE && (
            <button
              type="button"
              onClick={handleResetView}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-200/60 text-slate hover:text-ink transition"
              title="Görünümü Sıfırla"
              aria-label="Görünümü Sıfırla"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Selected / Pinned Country Pills + Borderless "Ülke Seç / Filtrele" Pill */}
      <div className="w-full max-w-3xl px-1 flex flex-wrap items-center justify-center gap-2 mt-2">
        {visibleBarCountries.map((c) => {
          const active = c.code === selectedCode;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onSelectCountry(c.code)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                active
                  ? "bg-authority text-white shadow-[0_4px_14px_rgba(29,53,87,0.28)] scale-[1.02]"
                  : "bg-white/85 text-ink hover:bg-white shadow-[0_2px_8px_rgb(0,0,0,0.04)]"
              }`}
            >
              {c.flagEmoji} {c.nameTr}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
            filterOpen
              ? "bg-ink text-white shadow-md"
              : "bg-gray-200/75 text-authority hover:bg-gray-200"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Ülke Seç ({countries.length})</span>
        </button>
      </div>

      {/* Modern Borderless Country Filter Card */}
      {filterOpen && (
        <div className="w-full max-w-3xl mt-4 bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_12px_40px_rgb(0,0,0,0.08)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                Dünya Ülkeleri ({countries.length})
              </h3>
              <p className="text-[11px] text-slate mt-0.5">
                Ülke seçerek gündemini açabilir veya sağdaki kutucukla hızlı
                erişim barına sabitleyebilirsiniz.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="p-1.5 rounded-full bg-gray-100 text-slate hover:text-ink transition"
              aria-label="Filtreyi Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Ülke ara (Azerbaycan, Fransa, Mısır, Çin...)"
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-100/80 rounded-full focus:outline-none focus:bg-gray-100 focus:ring-2 focus:ring-authority/20"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                "ALL",
                "Avrasya & Orta Doğu",
                "Avrupa",
                "Amerika",
                "Asya-Pasifik",
                "Afrika",
              ].map((reg) => (
                <button
                  key={reg}
                  type="button"
                  onClick={() => setFilterRegion(reg)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition ${
                    filterRegion === reg
                      ? "bg-authority text-white shadow-sm"
                      : "bg-gray-100 text-slate hover:text-ink"
                  }`}
                >
                  {reg === "ALL" ? "Tümü" : reg}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
            {filteredModalCountries.map((c) => {
              const isPinned = pinnedCodes.includes(c.code);
              const isCurrent = c.code === selectedCode;

              return (
                <div
                  key={c.code}
                  className={`flex items-center justify-between gap-1 px-3 py-2 rounded-2xl text-xs transition ${
                    isCurrent
                      ? "bg-authority/10 text-authority font-semibold"
                      : isPinned
                      ? "bg-gray-100/90"
                      : "bg-gray-50/70 hover:bg-gray-100/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPinned) {
                        savePinnedCodes([...pinnedCodes, c.code]);
                      }
                      onSelectCountry(c.code);
                    }}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left truncate"
                  >
                    <span className="shrink-0 text-sm">{c.flagEmoji}</span>
                    <span className="truncate text-ink">{c.nameTr}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePinnedCountry(c.code)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition ${
                      isPinned
                        ? "bg-authority text-white"
                        : "bg-gray-200/70 text-transparent hover:bg-gray-300"
                    }`}
                    title={
                      isPinned
                        ? "Hızlı seçim barından kaldır"
                        : "Hızlı seçim barına ekle"
                    }
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
