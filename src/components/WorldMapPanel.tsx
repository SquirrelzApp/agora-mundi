"use client";

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoContains,
  geoBounds,
} from "d3-geo";
import { feature } from "topojson-client";
import worldAtlasData from "world-atlas/countries-110m.json";
import { NUMERIC_TO_ALPHA2 } from "@/lib/world-countries";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Play,
  Pause,
  Sparkles,
  Compass,
} from "lucide-react";

export interface AgendaSummary {
  id: string;
  slot: string;
  title: string;
  category?: string;
  commentCount?: number;
  _count?: { comments: number };
}

export interface CountrySummary {
  code: string;
  nameTr: string;
  nameEn?: string;
  capital?: string | null;
  region: string;
  subregion?: string | null;
  flagEmoji: string;
  tempo: "HOT" | "MODERATE" | "STABLE" | string;
  updateIntervalHours: number;
  mapX: number;
  mapY: number;
  lastSyncedAt?: string | null;
  lastUpdatedAt: string;
  agendas: AgendaSummary[];
}

interface WorldMapPanelProps {
  countries: CountrySummary[];
  selectedCode: string | null;
  pinnedCodes: string[];
  onSelectCountry: (code: string | null) => void;
  onOpenExplorer?: () => void;
}

// Logical coordinate space: 500x500 where the circular globe fills r=250 (100% round, zero square border)
const LOGICAL_SIZE = 500;
const CENTER = 250;
const LENS_RADIUS = 250;

const HERO_BASE_SCALE = 250;
const COMPACT_FOCUS_SCALE = 310;
const MIN_SCALE = 250;
const MAX_SCALE = 1200;
const CANVAS_BACKING_BASE = 620;

interface PrecomputedCountryFeature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feature: any;
  isoCode?: string;
  bounds: [[number, number], [number, number]];
}

function resolveFeatureIsoCodeStatic(feat: {
  id?: string | number;
  properties?: { name?: string };
}): string | undefined {
  const rawId = feat.id !== undefined ? String(feat.id).padStart(3, "0") : "";
  if (NUMERIC_TO_ALPHA2[rawId]) return NUMERIC_TO_ALPHA2[rawId];
  if (feat.properties?.name === "N. Cyprus") return "XK_NCY";
  if (feat.properties?.name === "Kosovo") return "XK";
  return undefined;
}

// Module-level precomputation: parsed once for the entire app session
const WORLD_FEATURES: PrecomputedCountryFeature[] = (() => {
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
  return geo.features.map((f) => ({
    feature: f,
    isoCode: resolveFeatureIsoCodeStatic(f),
    bounds: geoBounds(f as never),
  }));
})();

const GRATICULE_GEO = geoGraticule10();

function normalizeDeltaLon(target: number, current: number): number {
  let diff = ((target - current + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

function pointInGeoBounds(
  lon: number,
  lat: number,
  bounds: [[number, number], [number, number]]
): boolean {
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  if (lat < minLat - 0.5 || lat > maxLat + 0.5) return false;
  if (minLon <= maxLon) {
    return lon >= minLon - 0.5 && lon <= maxLon + 0.5;
  }
  // Antimeridian-crossing polygon (e.g., Russia, Fiji, US)
  return lon >= minLon - 0.5 || lon <= maxLon + 0.5;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

interface PillHitBox {
  code: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  px: number;
  py: number;
}

export default function WorldMapPanel({
  countries,
  selectedCode,
  pinnedCodes,
  onSelectCountry,
  onOpenExplorer,
}: WorldMapPanelProps) {
  const isCompact = Boolean(selectedCode);

  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [isZoomedCustom, setIsZoomedCustom] = useState<boolean>(false);

  const globeStageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestStageRectRef = useRef<DOMRect | null>(null);
  const flipAnimRef = useRef<Animation | null>(null);

  // Mutable high-frequency animation state (zero React re-renders per frame!)
  const rotationRef = useRef<[number, number]>([-32, -36]);
  const scaleRef = useRef<number>(HERO_BASE_SCALE);
  const velocityRef = useRef<[number, number]>([0, 0]);
  const isDraggingRef = useRef<boolean>(false);
  const hoveredCodeRef = useRef<string | null>(null);
  const selectedCodeRef = useRef<string | null>(selectedCode);
  const isCompactRef = useRef<boolean>(isCompact);
  const autoRotateRef = useRef<boolean>(autoRotate);

  const flyAnimRef = useRef<{
    startTime: number;
    duration: number;
    startRot: [number, number];
    dLambda: number;
    dPhi: number;
    startScale: number;
    targetScale: number;
  } | null>(null);

  const pillHitBoxesRef = useRef<PillHitBox[]>([]);
  const projectionRef = useRef(
    geoOrthographic()
      .scale(HERO_BASE_SCALE)
      .translate([CENTER, CENTER])
      .rotate([-32, -36, 0])
      .clipAngle(90)
  );
  const requestDrawRef = useRef<() => void>(() => {});

  const countryByCode = useMemo(() => {
    const map: Record<string, CountrySummary> = {};
    for (const c of countries) {
      map[c.code] = c;
    }
    return map;
  }, [countries]);

  const countryByCodeRef = useRef(countryByCode);
  countryByCodeRef.current = countryByCode;

  const countriesRef = useRef(countries);
  countriesRef.current = countries;

  const pinnedCodesRef = useRef(pinnedCodes);
  pinnedCodesRef.current = pinnedCodes;

  selectedCodeRef.current = selectedCode;
  isCompactRef.current = isCompact;
  autoRotateRef.current = autoRotate;

  // Keep latest bounding rect updated passively so FLIP grow/shrink is always pixel-exact
  const snapshotStageRect = useCallback(() => {
    if (globeStageRef.current) {
      latestStageRectRef.current = globeStageRef.current.getBoundingClientRect();
    }
  }, []);

  useEffect(() => {
    snapshotStageRect();
    window.addEventListener("resize", snapshotStageRect, { passive: true });
    window.addEventListener("scroll", snapshotStageRect, { passive: true });
    return () => {
      window.removeEventListener("resize", snapshotStageRect);
      window.removeEventListener("scroll", snapshotStageRect);
    };
  }, [snapshotStageRect]);

  // GPU-composited FLIP morph animation when growing (Compact -> Hero) or shrinking (Hero -> Compact)
  useLayoutEffect(() => {
    const el = globeStageRef.current;
    if (!el) return;

    const firstRect = latestStageRectRef.current;
    // Cancel any in-flight FLIP animation before measuring final layout rect
    if (flipAnimRef.current) {
      flipAnimRef.current.cancel();
      flipAnimRef.current = null;
    }

    const lastRect = el.getBoundingClientRect();
    latestStageRectRef.current = lastRect;

    if (
      firstRect &&
      firstRect.width > 0 &&
      lastRect.width > 0 &&
      (Math.abs(firstRect.width - lastRect.width) > 6 ||
        Math.abs(firstRect.top - lastRect.top) > 6 ||
        Math.abs(firstRect.left - lastRect.left) > 6)
    ) {
      const dx =
        firstRect.left +
        firstRect.width / 2 -
        (lastRect.left + lastRect.width / 2);
      const dy =
        firstRect.top +
        firstRect.height / 2 -
        (lastRect.top + lastRect.height / 2);
      const scaleRatio = firstRect.width / lastRect.width;

      if (typeof el.animate === "function") {
        flipAnimRef.current = el.animate(
          [
            {
              transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(
                1
              )}px, 0) scale(${scaleRatio.toFixed(4)})`,
            },
            {
              transform: "translate3d(0px, 0px, 0px) scale(1)",
            },
          ],
          {
            duration: 460,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        );
      }
    }
  }, [isCompact]);

  // Trigger smooth camera fly-to + zoom whenever selectedCode changes
  useEffect(() => {
    velocityRef.current = [0, 0];

    if (!selectedCode) {
      flyAnimRef.current = {
        startTime: performance.now(),
        duration: 460,
        startRot: [...rotationRef.current],
        dLambda: 0,
        dPhi: 0,
        startScale: scaleRef.current,
        targetScale: HERO_BASE_SCALE,
      };
      setIsZoomedCustom(false);
      requestDrawRef.current();
      return;
    }

    const target = countryByCodeRef.current[selectedCode];
    if (!target) return;

    const startRot: [number, number] = [...rotationRef.current];
    const targetLambda = -target.mapX;
    const targetPhi = Math.max(-72, Math.min(72, -target.mapY));

    flyAnimRef.current = {
      startTime: performance.now(),
      duration: 500,
      startRot,
      dLambda: normalizeDeltaLon(targetLambda, startRot[0]),
      dPhi: targetPhi - startRot[1],
      startScale: scaleRef.current,
      targetScale: COMPACT_FOCUS_SCALE,
    };
    setIsZoomedCustom(false);
    requestDrawRef.current();
  }, [selectedCode, countries.length]);

  // Retina Canvas 2D Engine: Fixed backing buffer (zero resize stalls) + batched geometry (<1ms/frame)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const backingPx = Math.round(CANVAS_BACKING_BASE * dpr);
    if (canvas.width !== backingPx || canvas.height !== backingPx) {
      canvas.width = backingPx;
      canvas.height = backingPx;
    }
    const unitScale = backingPx / LOGICAL_SIZE;

    let rafId: number | null = null;
    let lastFrameTs = performance.now();

    const drawFrame = (now: number) => {
      rafId = null;
      const dt = Math.min(48, Math.max(1, now - lastFrameTs));
      lastFrameTs = now;

      let needsNextFrame = false;

      // 1. Fly-to interpolation
      if (flyAnimRef.current) {
        const anim = flyAnimRef.current;
        const t = Math.min(1, (now - anim.startTime) / anim.duration);
        const ease = 1 - Math.pow(1 - t, 3);
        rotationRef.current = [
          anim.startRot[0] + anim.dLambda * ease,
          anim.startRot[1] + anim.dPhi * ease,
        ];
        scaleRef.current =
          anim.startScale + (anim.targetScale - anim.startScale) * ease;

        if (t >= 1) {
          flyAnimRef.current = null;
        } else {
          needsNextFrame = true;
        }
      } else if (!isDraggingRef.current) {
        // 2. Momentum inertia after drag release
        const [vx, vy] = velocityRef.current;
        if (Math.abs(vx) > 0.008 || Math.abs(vy) > 0.008) {
          const [lam, phi] = rotationRef.current;
          rotationRef.current = [
            ((lam + vx * dt + 540) % 360) - 180,
            Math.max(-78, Math.min(78, phi + vy * dt)),
          ];
          const decay = Math.pow(0.91, dt / 16.67);
          velocityRef.current = [vx * decay, vy * decay];
          needsNextFrame = true;
        } else if (
          autoRotateRef.current &&
          !isCompactRef.current &&
          !hoveredCodeRef.current
        ) {
          // 3. Gentle orbital spin in Hero Mode
          const [lam, phi] = rotationRef.current;
          rotationRef.current = [
            ((lam + dt * 0.0042 + 540) % 360) - 180,
            phi,
          ];
          needsNextFrame = true;
        }
      }

      const curScale = scaleRef.current;
      const [lam, phi] = rotationRef.current;

      const projection = projectionRef.current
        .scale(curScale)
        .translate([CENTER, CENTER])
        .rotate([lam, phi, 0]);

      const pathGen = geoPath(projection, ctx);

      ctx.setTransform(unitScale, 0, 0, unitScale, 0, 0);
      ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // Strict circular lens clip: NEVER allows rectangular/square edges at any zoom or compact state!
      ctx.save();
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, LENS_RADIUS, 0, Math.PI * 2);
      ctx.clip();

      // Ocean radial gradient
      const oceanGrad = ctx.createRadialGradient(
        CENTER * 0.72,
        CENTER * 0.62,
        curScale * 0.08,
        CENTER,
        CENTER,
        LENS_RADIUS
      );
      oceanGrad.addColorStop(0, "#FAFCFF");
      oceanGrad.addColorStop(0.58, "#DCEBFB");
      oceanGrad.addColorStop(1, "#B8D3EE");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // Graticule (single path stroke)
      ctx.beginPath();
      pathGen(GRATICULE_GEO);
      ctx.strokeStyle = "rgba(180, 206, 232, 0.55)";
      ctx.lineWidth = 0.55;
      ctx.stroke();

      // Batched Country Polygons (4 draw calls instead of 350+!)
      const activeSelected = selectedCodeRef.current;
      const activeHovered = hoveredCodeRef.current;
      const byCode = countryByCodeRef.current;

      let selectedFeat: PrecomputedCountryFeature | null = null;
      let hoveredFeat: PrecomputedCountryFeature | null = null;

      // Batch A: Countries with live agendas
      ctx.beginPath();
      for (let i = 0; i < WORLD_FEATURES.length; i++) {
        const item = WORLD_FEATURES[i];
        const iso = item.isoCode;
        if (iso && iso === activeSelected) {
          selectedFeat = item;
          continue;
        }
        if (iso && iso === activeHovered) {
          hoveredFeat = item;
          continue;
        }
        const cObj = iso ? byCode[iso] : undefined;
        if (cObj && cObj.agendas && cObj.agendas.length > 0) {
          pathGen(item.feature);
        }
      }
      ctx.fillStyle = "#DFE7F1";
      ctx.fill();
      ctx.strokeStyle = "#B4C3D6";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Batch B: Neutral territories
      ctx.beginPath();
      for (let i = 0; i < WORLD_FEATURES.length; i++) {
        const item = WORLD_FEATURES[i];
        const iso = item.isoCode;
        if (
          (iso && iso === activeSelected) ||
          (iso && iso === activeHovered)
        ) {
          continue;
        }
        const cObj = iso ? byCode[iso] : undefined;
        if (!cObj || !cObj.agendas || cObj.agendas.length === 0) {
          pathGen(item.feature);
        }
      }
      ctx.fillStyle = "#EAEEF4";
      ctx.fill();
      ctx.strokeStyle = "#C7D0DC";
      ctx.lineWidth = 0.55;
      ctx.stroke();

      // Hovered country highlight
      if (hoveredFeat) {
        ctx.beginPath();
        pathGen(hoveredFeat.feature);
        ctx.fillStyle = "#2B5486";
        ctx.fill();
        ctx.strokeStyle = "#1D3557";
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Selected country highlight
      if (selectedFeat) {
        ctx.beginPath();
        pathGen(selectedFeat.feature);
        ctx.fillStyle = "#1D3557";
        ctx.fill();
        ctx.strokeStyle = "#0F172A";
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // Subtle inner atmospheric shading near sphere edge
      const rimGrad = ctx.createRadialGradient(
        CENTER,
        CENTER,
        LENS_RADIUS * 0.76,
        CENTER,
        CENTER,
        LENS_RADIUS
      );
      rimGrad.addColorStop(0, "rgba(29, 53, 87, 0)");
      rimGrad.addColorStop(1, "rgba(15, 23, 42, 0.10)");
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // Country Pins & Non-Overlapping Labels
      const candidateCodes: string[] = [];
      const seenCodes = new Set<string>();
      const pushCode = (c?: string | null) => {
        if (c && !seenCodes.has(c) && byCode[c]) {
          seenCodes.add(c);
          candidateCodes.push(c);
        }
      };

      pushCode(activeSelected);
      pushCode(activeHovered);
      for (const c of pinnedCodesRef.current) pushCode(c);

      const allList = countriesRef.current;
      if (!isCompactRef.current) {
        for (let i = 0; i < allList.length; i++) {
          if (allList[i].tempo === "HOT") pushCode(allList[i].code);
        }
      }

      const centerLon = -lam;
      const centerLat = -phi;
      const rad = Math.PI / 180;
      const sinLat1 = Math.sin(centerLat * rad);
      const cosLat1 = Math.cos(centerLat * rad);

      if (curScale >= 330 || isCompactRef.current) {
        const cosThreshold =
          curScale >= 520 ? 0.84 : isCompactRef.current ? 0.93 : 0.91;
        for (let i = 0; i < allList.length; i++) {
          const c = allList[i];
          if (seenCodes.has(c.code)) continue;
          const dLon = (c.mapX - centerLon) * rad;
          const lat2 = c.mapY * rad;
          const cosAng =
            sinLat1 * Math.sin(lat2) + cosLat1 * Math.cos(lat2) * Math.cos(dLon);
          if (cosAng > cosThreshold) pushCode(c.code);
        }
      }

      const newHitBoxes: PillHitBox[] = [];
      const occupiedRects: Array<[number, number, number, number]> = [];
      ctx.font =
        '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = "middle";

      for (let i = 0; i < candidateCodes.length; i++) {
        const code = candidateCodes[i];
        const country = byCode[code];
        if (!country) continue;

        const dLon = (country.mapX - centerLon) * rad;
        const lat2 = country.mapY * rad;
        const cosAng =
          sinLat1 * Math.sin(lat2) + cosLat1 * Math.cos(lat2) * Math.cos(dLon);
        if (cosAng < 0.2) continue;

        const proj = projection([country.mapX, country.mapY]);
        if (!proj) continue;
        const [px, py] = proj;

        // Keep pins strictly inside the circular lens
        const distFromCenter = Math.hypot(px - CENTER, py - CENTER);
        if (distFromCenter > LENS_RADIUS - 10) continue;

        const isSel = code === activeSelected;
        const isHov = code === activeHovered;
        const dotColor =
          country.tempo === "HOT"
            ? "#E11D48"
            : country.tempo === "MODERATE"
            ? "#D97706"
            : "#0284C7";

        // Outer halo + inner dot
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          isSel ? 10.5 : country.tempo === "HOT" ? 7 : 5.5,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = isSel
          ? "rgba(29, 53, 87, 0.28)"
          : country.tempo === "HOT"
          ? "rgba(225, 29, 72, 0.20)"
          : "rgba(255, 255, 255, 0.82)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, isSel ? 4.4 : 3.2, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? "#1D3557" : dotColor;
        ctx.fill();

        const wantBadge =
          isSel ||
          isHov ||
          (!isCompactRef.current && cosAng > 0.35) ||
          (isCompactRef.current && cosAng > 0.965);

        let boxX1 = px - 8;
        let boxY1 = py - 8;
        let boxX2 = px + 8;
        let boxY2 = py + 8;

        if (wantBadge) {
          const labelText = `${country.flagEmoji} ${country.nameTr}`;
          const textW = ctx.measureText(labelText).width;
          const pillW = Math.ceil(textW + 16);
          const pillH = 21;

          // Choose right or left of pin so the pill stays inside the circular globe lens
          let rx = px + 8;
          const ry = py - pillH / 2;
          const rightEdgeDist = Math.hypot(
            rx + pillW - CENTER,
            py - CENTER
          );
          if (rightEdgeDist > LENS_RADIUS - 8) {
            rx = px - pillW - 8;
          }
          const leftEdgeDist = Math.hypot(rx - CENTER, py - CENTER);

          const fitsLens =
            Math.hypot(rx + pillW - CENTER, py - CENTER) <= LENS_RADIUS - 6 &&
            leftEdgeDist <= LENS_RADIUS - 6;

          let overlaps = false;
          if (!isSel && !isHov) {
            for (let rIdx = 0; rIdx < occupiedRects.length; rIdx++) {
              const [ox1, oy1, ox2, oy2] = occupiedRects[rIdx];
              if (
                rx < ox2 + 3 &&
                rx + pillW > ox1 - 3 &&
                ry < oy2 + 2 &&
                ry + pillH > oy1 - 2
              ) {
                overlaps = true;
                break;
              }
            }
          }

          if (fitsLens && !overlaps) {
            occupiedRects.push([rx, ry, rx + pillW, ry + pillH]);
            drawRoundedRectPath(ctx, rx, ry, pillW, pillH, 10.5);
            ctx.fillStyle = isSel
              ? "#1D3557"
              : isHov
              ? "#2B5486"
              : "rgba(255, 255, 255, 0.94)";
            ctx.fill();
            ctx.strokeStyle =
              isSel || isHov
                ? "rgba(15, 23, 42, 0.25)"
                : "rgba(15, 23, 42, 0.08)";
            ctx.lineWidth = 0.75;
            ctx.stroke();

            ctx.fillStyle = isSel || isHov ? "#FFFFFF" : "#0F172A";
            ctx.fillText(labelText, rx + 8, ry + pillH / 2 + 0.5);

            boxX1 = Math.min(boxX1, rx);
            boxY1 = Math.min(boxY1, ry);
            boxX2 = Math.max(boxX2, rx + pillW);
            boxY2 = Math.max(boxY2, ry + pillH);
          }
        }

        newHitBoxes.push({
          code,
          x1: boxX1,
          y1: boxY1,
          x2: boxX2,
          y2: boxY2,
          px,
          py,
        });
      }

      pillHitBoxesRef.current = newHitBoxes;
      ctx.restore();

      // Crisp circular perimeter ring
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, LENS_RADIUS - 0.75, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(29, 53, 87, 0.14)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (needsNextFrame) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    const scheduleDraw = () => {
      if (rafId === null) {
        lastFrameTs = performance.now();
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    requestDrawRef.current = scheduleDraw;
    scheduleDraw();

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Re-draw whenever countries list, pinnedCodes, autoRotate, or hoveredCode changes
  useEffect(() => {
    requestDrawRef.current();
  }, [countries, pinnedCodes, autoRotate, hoveredCode, isCompact]);

  // Wheel zoom listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      flyAnimRef.current = null;
      const factor = e.deltaY < 0 ? 1.13 : 0.89;
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, scaleRef.current * factor)
      );
      scaleRef.current = next;
      const base = isCompactRef.current ? COMPACT_FOCUS_SCALE : HERO_BASE_SCALE;
      setIsZoomedCustom(Math.abs(next - base) > 8);
      requestDrawRef.current();
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Fast 2D + Spherical Hit Testing (<0.15ms)
  const hitTestAtClientPoint = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const lx = ((clientX - rect.left) / rect.width) * LOGICAL_SIZE;
      const ly = ((clientY - rect.top) / rect.height) * LOGICAL_SIZE;

      if (Math.hypot(lx - CENTER, ly - CENTER) > LENS_RADIUS) {
        return null;
      }

      // 1. Check rendered pins & pills (top-most first)
      const boxes = pillHitBoxesRef.current;
      for (let i = boxes.length - 1; i >= 0; i--) {
        const b = boxes[i];
        if (lx >= b.x1 && lx <= b.x2 && ly >= b.y1 && ly <= b.y2) {
          return b.code;
        }
        if (Math.hypot(lx - b.px, ly - b.py) <= 9) {
          return b.code;
        }
      }

      // 2. Invert orthographic projection & test country polygons
      const inv = projectionRef.current.invert?.([lx, ly]);
      if (!inv) return null;
      const [lon, lat] = inv;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

      const byCode = countryByCodeRef.current;
      for (let i = 0; i < WORLD_FEATURES.length; i++) {
        const item = WORLD_FEATURES[i];
        if (!item.isoCode || !byCode[item.isoCode]) continue;
        if (!pointInGeoBounds(lon, lat, item.bounds)) continue;
        if (geoContains(item.feature as never, [lon, lat])) {
          return item.isoCode;
        }
      }

      return null;
    },
    []
  );

  // Pointer gestures (drag + inertia + pinch zoom + click)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map()
  );
  const dragDistanceRef = useRef(0);
  const dragOriginRef = useRef<{
    x: number;
    y: number;
    rot: [number, number];
    lastX: number;
    lastY: number;
    lastTs: number;
  }>({
    x: 0,
    y: 0,
    rot: [-32, -36],
    lastX: 0,
    lastY: 0,
    lastTs: 0,
  });
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);

  const getTwoPointerDistance = () => {
    const pts = Array.from(activePointers.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    snapshotStageRect();
    flyAnimRef.current = null;
    velocityRef.current = [0, 0];

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    isDraggingRef.current = true;
    e.currentTarget.style.cursor = "grabbing";

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointers.current.size === 1) {
      dragDistanceRef.current = 0;
      dragOriginRef.current = {
        x: e.clientX,
        y: e.clientY,
        rot: [...rotationRef.current],
        lastX: e.clientX,
        lastY: e.clientY,
        lastTs: performance.now(),
      };
      pinchStartRef.current = null;
    } else if (activePointers.current.size === 2) {
      const dist = getTwoPointerDistance();
      if (dist > 5) {
        pinchStartRef.current = { dist, scale: scaleRef.current };
      }
      dragDistanceRef.current = 999;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointers.current.has(e.pointerId)) {
      // Hover detection only (no drag)
      const hit = hitTestAtClientPoint(e.clientX, e.clientY);
      e.currentTarget.style.cursor = hit ? "pointer" : "grab";
      if (hoveredCodeRef.current !== hit) {
        hoveredCodeRef.current = hit;
        setHoveredCode(hit);
        requestDrawRef.current();
      }
      return;
    }

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size >= 2 && pinchStartRef.current) {
      const currentDist = getTwoPointerDistance();
      if (currentDist > 5 && pinchStartRef.current.dist > 5) {
        const ratio = currentDist / pinchStartRef.current.dist;
        scaleRef.current = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinchStartRef.current.scale * ratio)
        );
        requestDrawRef.current();
      }
      return;
    }

    if (activePointers.current.size === 1) {
      const now = performance.now();
      const orig = dragOriginRef.current;
      const dx = e.clientX - orig.x;
      const dy = e.clientY - orig.y;
      dragDistanceRef.current = Math.hypot(dx, dy);

      // Scale drag sensitivity smoothly by container pixel width & zoom level
      const rectW = e.currentTarget.getBoundingClientRect().width || 400;
      const sizeFactor = 460 / Math.max(150, rectW);
      const zoomFactor = HERO_BASE_SCALE / Math.max(HERO_BASE_SCALE, scaleRef.current);
      const sensitivity = 0.36 * sizeFactor * zoomFactor;

      const nextLam = ((orig.rot[0] + dx * sensitivity + 540) % 360) - 180;
      const nextPhi = Math.max(
        -78,
        Math.min(78, orig.rot[1] - dy * sensitivity)
      );

      const dt = Math.max(8, now - orig.lastTs);
      const stepDx = e.clientX - orig.lastX;
      const stepDy = e.clientY - orig.lastY;
      velocityRef.current = [
        (stepDx * sensitivity) / dt,
        (-stepDy * sensitivity) / dt,
      ];
      orig.lastX = e.clientX;
      orig.lastY = e.clientY;
      orig.lastTs = now;

      rotationRef.current = [nextLam, nextPhi];
      requestDrawRef.current();
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasSingle = activePointers.current.size === 1;
    activePointers.current.delete(e.pointerId);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointers.current.size === 1) {
      const rem = Array.from(activePointers.current.values())[0];
      dragOriginRef.current = {
        x: rem.x,
        y: rem.y,
        rot: [...rotationRef.current],
        lastX: rem.x,
        lastY: rem.y,
        lastTs: performance.now(),
      };
      pinchStartRef.current = null;
      return;
    }

    if (activePointers.current.size === 0) {
      isDraggingRef.current = false;
      pinchStartRef.current = null;

      if (wasSingle && dragDistanceRef.current <= 6) {
        velocityRef.current = [0, 0];
        const hit = hitTestAtClientPoint(e.clientX, e.clientY);
        e.currentTarget.style.cursor = hit ? "pointer" : "grab";
        if (hit && countryByCodeRef.current[hit]) {
          snapshotStageRect();
          onSelectCountry(hit);
          return;
        }
      } else {
        // Trigger momentum decay frames if user flicked the globe
        if (performance.now() - dragOriginRef.current.lastTs > 90) {
          velocityRef.current = [0, 0];
        }
        requestDrawRef.current();
      }
      e.currentTarget.style.cursor = "grab";
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current && hoveredCodeRef.current !== null) {
      hoveredCodeRef.current = null;
      setHoveredCode(null);
      requestDrawRef.current();
    }
  };

  const animateZoomTo = (nextTarget: number) => {
    flyAnimRef.current = {
      startTime: performance.now(),
      duration: 240,
      startRot: [...rotationRef.current],
      dLambda: 0,
      dPhi: 0,
      startScale: scaleRef.current,
      targetScale: nextTarget,
    };
    const base = isCompact ? COMPACT_FOCUS_SCALE : HERO_BASE_SCALE;
    setIsZoomedCustom(Math.abs(nextTarget - base) > 8);
    requestDrawRef.current();
  };

  const handleZoomIn = () => {
    animateZoomTo(Math.min(MAX_SCALE, Math.round(scaleRef.current * 1.28)));
  };

  const handleZoomOut = () => {
    animateZoomTo(Math.max(MIN_SCALE, Math.round(scaleRef.current / 1.28)));
  };

  const handleResetView = () => {
    const targetScale = isCompact ? COMPACT_FOCUS_SCALE : HERO_BASE_SCALE;
    const startRot: [number, number] = [...rotationRef.current];
    let targetLam = -32;
    let targetPhi = -36;
    if (selectedCode && countryByCode[selectedCode]) {
      targetLam = -countryByCode[selectedCode].mapX;
      targetPhi = Math.max(-72, Math.min(72, -countryByCode[selectedCode].mapY));
    }
    flyAnimRef.current = {
      startTime: performance.now(),
      duration: 360,
      startRot,
      dLambda: normalizeDeltaLon(targetLam, startRot[0]),
      dPhi: targetPhi - startRot[1],
      startScale: scaleRef.current,
      targetScale,
    };
    setIsZoomedCustom(false);
    requestDrawRef.current();
  };

  const triggerSelectCountry = (code: string | null) => {
    snapshotStageRect();
    onSelectCountry(code);
  };

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
    return list.slice(0, 14);
  }, [pinnedCodes, selectedCode, countryByCode]);

  const hoveredCountry = hoveredCode ? countryByCode[hoveredCode] : null;
  const activeCountry = selectedCode ? countryByCode[selectedCode] : null;

  // ============================================================================
  // SINGLE UNIFIED DOM TREE:
  // Preserves <div ref={globeStageRef}><canvas ref={canvasRef} /></div> across
  // Hero <-> Compact transitions so GPU FLIP morphs at 60-120fps without remount!
  // ============================================================================
  return (
    <div
      className={
        isCompact
          ? "w-full bg-white/90 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-3 sm:p-4"
          : "w-full flex flex-col items-center justify-center"
      }
    >
      <div
        className={
          isCompact
            ? "flex flex-col sm:flex-row items-center gap-3.5 sm:gap-5 w-full"
            : "relative w-full flex flex-col items-center justify-center"
        }
      >
        {/* PERSISTENT CIRCULAR GLOBE STAGE — 100% Round, Zero Square Edges */}
        <div
          ref={globeStageRef}
          style={{ willChange: "transform" }}
          className={
            isCompact
              ? "relative w-[148px] h-[148px] sm:w-[178px] sm:h-[178px] aspect-square rounded-full overflow-hidden shrink-0 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10 bg-transparent z-10"
              : "relative w-[min(90vw,400px)] sm:w-[min(80vw,530px)] lg:w-[min(66vh,610px)] xl:w-[min(71vh,660px)] aspect-square rounded-full overflow-hidden flex items-center justify-center mx-auto shadow-[0_24px_54px_-16px_rgba(15,23,42,0.20)] ring-1 ring-slate-900/10 bg-transparent z-10"
          }
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onPointerLeave={handlePointerLeave}
            role="img"
            aria-label="İnteraktif 3B Dünya Küresi"
            className="w-full h-full block rounded-full select-none touch-none cursor-grab"
          />
        </div>

        {/* COMPACT DOCK CONTROLS (Shown right next to shrunken circular globe) */}
        {isCompact ? (
          <div className="flex-1 min-w-0 w-full space-y-2.5 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs text-slate">
                <Compass className="w-3.5 h-3.5 text-authority shrink-0" />
                <span>
                  Küreyi çevirerek komşu ülkelere geçebilir veya tam haritaya
                  dönebilirsiniz
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-ink transition"
                  title="Yakınlaştır"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-ink transition"
                  title="Uzaklaştır"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                {isZoomedCustom && (
                  <button
                    type="button"
                    onClick={handleResetView}
                    className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-slate hover:text-ink transition"
                    title="Görünümü Sıfırla"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => triggerSelectCountry(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-authority text-white text-xs font-semibold shadow-xs hover:opacity-95 transition"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Küreyi Büyüt</span>
                </button>
              </div>
            </div>

            {/* Quick Country Switcher Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {visibleBarCountries.map((c) => {
                const active = c.code === selectedCode;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => triggerSelectCountry(c.code)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      active
                        ? "bg-authority text-white shadow-sm font-semibold"
                        : "bg-gray-100/85 text-ink hover:bg-gray-200/80"
                    }`}
                  >
                    {c.flagEmoji} {c.nameTr}
                  </button>
                );
              })}

              {onOpenExplorer && (
                <button
                  type="button"
                  onClick={onOpenExplorer}
                  className="lg:hidden shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-authority/10 text-authority hover:bg-authority/15 transition"
                >
                  Tüm Ülkeler ({countries.length})
                </button>
              )}
            </div>

            {hoveredCountry && hoveredCountry.code !== activeCountry?.code && (
              <div className="text-[11px] text-authority font-medium truncate">
                Seçmek için tıklayın: {hoveredCountry.flagEmoji}{" "}
                <strong>{hoveredCountry.nameTr}</strong> ({hoveredCountry.region})
              </div>
            )}
          </div>
        ) : (
          <>
            {/* HERO FLOATING GLASS CONTROLS (Top-Right) */}
            <div className="absolute top-2 right-2 sm:right-4 z-20 flex flex-col items-center gap-1.5 bg-white/85 backdrop-blur-md p-1.5 rounded-2xl shadow-[0_8px_28px_rgb(0,0,0,0.08)]">
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

              <button
                type="button"
                onClick={() => setAutoRotate((v) => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition ${
                  autoRotate
                    ? "bg-authority/10 text-authority"
                    : "hover:bg-gray-200/60 text-slate"
                }`}
                title={autoRotate ? "Otomatik Dönüşü Durdur" : "Otomatik Döndür"}
                aria-label="Otomatik Dönüş"
              >
                {autoRotate ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>

              {isZoomedCustom && (
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

            {/* HERO HOVER COUNTRY PREVIEW CARD */}
            {hoveredCountry && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(92vw,430px)] bg-white/95 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-[0_12px_36px_rgba(15,23,42,0.14)] border border-gray-200/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl shrink-0">
                      {hoveredCountry.flagEmoji}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink truncate">
                        {hoveredCountry.nameTr}
                      </div>
                      <div className="text-[11px] text-slate truncate">
                        {hoveredCountry.capital
                          ? `${hoveredCountry.capital} • `
                          : ""}
                        {hoveredCountry.region}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-authority text-white text-[10px] font-semibold">
                    Gündemi Aç →
                  </span>
                </div>
                {hoveredCountry.agendas?.[0]?.title && (
                  <p className="mt-1.5 text-xs text-ink/90 line-clamp-1 font-medium">
                    • {hoveredCountry.agendas[0].title}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* HERO BOTTOM GUIDANCE + QUICK PILLS */}
      {!isCompact && (
        <div className="w-full max-w-3xl mt-4 space-y-3 px-2">
          <div className="flex items-center justify-center gap-2 text-xs text-slate text-center">
            <Sparkles className="w-3.5 h-3.5 text-authority shrink-0" />
            <span>
              Küre üzerinde herhangi bir ülkeye tıklayın; küre küçülecek ve o
              ülkenin <strong>canlı 3 gündemi</strong> ile tartışma alanı hemen
              altında anında açılacaktır.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {visibleBarCountries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => triggerSelectCountry(c.code)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/90 text-ink hover:bg-authority hover:text-white shadow-[0_2px_10px_rgb(0,0,0,0.04)] transition-all"
              >
                {c.flagEmoji} {c.nameTr}
              </button>
            ))}

            {onOpenExplorer && (
              <button
                type="button"
                onClick={onOpenExplorer}
                className="lg:hidden px-3.5 py-1.5 rounded-full text-xs font-semibold bg-authority text-white shadow-sm"
              >
                Tüm Ülkeler ({countries.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
