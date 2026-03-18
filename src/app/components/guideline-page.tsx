import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, ChevronDown, Check, Loader2 } from "lucide-react";
import type { BrandData } from "../types/brand";
import { GuidelineAll } from "./guideline-all";
import type { GuidelineVersion } from "./guideline-all";
import { useGoogleFont } from "../utils/useGoogleFont";
import { generateGuideline } from "../utils/generate-brand";
import type { GuidelineData, GuidelineColorName } from "../utils/generate-brand";

// ── Figma asset imports ─────────────────────────────────────────────────────────
import imgFashionModelWearingBeigeCoatInMinimalistSetting from "figma:asset/d2490c1757f849733228dd5d88dba5d2cf71b8da.png";
import { generateBrandContextMockup } from "../utils/generate-image";

// ── Types ───────────────────────────────────────────────────────────────────────
interface GuidelinePageProps {
  brandData: BrandData;
  onBack: () => void;
  /** When provided, versions are controlled by parent (e.g. App) so they persist for "all versions" view. */
  versions?: GuidelineVersion[];
  onVersionsChange?: React.Dispatch<React.SetStateAction<GuidelineVersion[]>>;
  /** When navigating from "all versions" with a version selected, open with this version active. */
  initialActiveVersionId?: string;
}

// ── Default Brand in Context applications ──────────────────────────────────────
const DEFAULT_CONTEXT_APPLICATIONS = [
  "e-commerce product detail page",
  "packaging and label",
  "social media post",
  "website hero section",
] as const;

const DEFAULT_CONTEXT_DESCRIPTION =
  "Real-world application of the identity system across digital and physical touchpoints.";

// ── Helper: basic color utilities ──────────────────────────────────────────────
function getRgbFromHex(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return { r, g, b };
}

function getBrightness(hex: string): number {
  const { r, g, b } = getRgbFromHex(hex);
  // Perceived brightness formula (0–255)
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// Light backgrounds should use dark text
function isColorLight(hex: string): boolean {
  return getBrightness(hex) > 150;
}

// Pick the darkest color from the palette
function getDarkestColor(colors: string[]): string | null {
  if (!colors || colors.length === 0) return null;
  let darkest = colors[0];
  let darkestBrightness = getBrightness(colors[0]);
  for (let i = 1; i < colors.length; i++) {
    const b = getBrightness(colors[i]);
    if (b < darkestBrightness) {
      darkestBrightness = b;
      darkest = colors[i];
    }
  }
  return darkest.toLowerCase?.() ?? darkest;
}

// Pick a medium-bright color for accents (avoid very dark or very light)
function getMediumBrightColor(colors: string[]): string | null {
  if (!colors || colors.length === 0) return null;
  const targetBrightness = 140;
  let best = colors[0];
  let bestDiff = Math.abs(getBrightness(colors[0]) - targetBrightness);
  for (let i = 1; i < colors.length; i++) {
    const b = getBrightness(colors[i]);
    const diff = Math.abs(b - targetBrightness);
    if (b >= 80 && b <= 200 && diff < bestDiff) {
      bestDiff = diff;
      best = colors[i];
    }
  }
  return best.toLowerCase?.() ?? best;
}

// ── Build a CSS gradient from the palette ──────────────────────────────────────
function buildGradientBg(colors: string[]): string {
  if (!colors || colors.length === 0) return "linear-gradient(135deg, #6366f1, #06b6d4)";
  if (colors.length === 1) return colors[0];
  const stops = colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`).join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  if (c.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createGuidelineVersionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `gv-${crypto.randomUUID()}`;
  }
  return `gv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────────────────────────
export function GuidelinePage({
  brandData,
  onBack,
  versions: versionsProp,
  onVersionsChange,
  initialActiveVersionId,
}: GuidelinePageProps) {
  const defaultVersionLabel = brandData.visualConcept?.conceptName?.trim() || "Generated guideline";

  // ── Version management (use parent state when provided so versions persist for "all" view) ──
  const [internalVersions, setInternalVersions] = useState<GuidelineVersion[]>(() => [
    { id: createGuidelineVersionId(), label: defaultVersionLabel, createdAt: new Date() },
  ]);
  const versions = versionsProp ?? internalVersions;
  const setVersionsRef = useRef<React.Dispatch<React.SetStateAction<GuidelineVersion[]>>>(setInternalVersions);
  useEffect(() => {
    setVersionsRef.current = onVersionsChange ?? setInternalVersions;
  }, [onVersionsChange]);
  const setVersions = useCallback<React.Dispatch<React.SetStateAction<GuidelineVersion[]>>>((updater) => {
    setVersionsRef.current(updater);
  }, []);
  const [activeVersionId, setActiveVersionId] = useState(initialActiveVersionId ?? versions[0]?.id ?? "gv-default");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── View All overlay ────────────────────────────────────────────────────────
  const [showAllView, setShowAllView] = useState(false);

  const handleDeleteVersion = useCallback((versionToDelete: GuidelineVersion) => {
    if (versions.length <= 1) return;
    if (!window.confirm(`Delete "${versionToDelete.label}"? This cannot be undone.`)) return;

    const remaining = versions.filter((v) => v.id !== versionToDelete.id);
    setVersions(remaining);

    if (activeVersionIdRef.current === versionToDelete.id) {
      const nextActiveId = remaining[0]?.id;
      if (nextActiveId) setActiveVersionId(nextActiveId);
    }
  }, [versions, setVersions]);

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const activeVersionIdRef = useRef(activeVersionId);
  useEffect(() => {
    activeVersionIdRef.current = activeVersionId;
  }, [activeVersionId]);

  // Prefer snapshot-bound BVI when available, otherwise fall back to live brandData.
  const snapshotBvi = activeVersion?.snapshotBvi;
  const isSnapshotBoundVersion = !!activeVersion?.snapshotId || !!snapshotBvi;
  const brief = snapshotBvi?.brandBrief ?? brandData.brandBrief;
  // For snapshot-bound guidelines, only use the concept frozen into that snapshot.
  // If missing, allow guideline generation to synthesize from the visual snapshot.
  const concept = snapshotBvi
    ? snapshotBvi.visualConcept
    : brandData.visualConcept;
  const synthesizedConcept = activeVersion?.guidelineCache?.synthesizedVisualConcept;
  const displayConcept = concept ?? synthesizedConcept;
  const font = snapshotBvi?.font ?? brandData.font;
  const artStyle = isSnapshotBoundVersion
    ? snapshotBvi?.artStyle
    : brandData.artStyle;
  const keywords = snapshotBvi?.keywords ?? brandData.keywords ?? [];
  const colorPalette = snapshotBvi?.colorPalette ?? brandData.colorPalette ?? [];

  // ── Logo / imagery from snapshot when version is bound, otherwise live brand data ──
  const logoImageUrl = isSnapshotBoundVersion
    ? snapshotBvi?.logoInspiration?.imageUrl
    : brandData.logoInspiration?.imageUrl;
  const artStyleImageUrl = isSnapshotBoundVersion
    ? (artStyle?.imageUrl ?? snapshotBvi?.styleReferences?.[0]?.imageUrl)
    : (artStyle?.imageUrl ?? brandData.styleReferences?.[0]?.imageUrl);
  const visualSnapshotUrl = isSnapshotBoundVersion
    ? snapshotBvi?.styleReferences?.[0]?.imageUrl
    : brandData.styleReferences?.[0]?.imageUrl;

  // ── Load actual Google Fonts from the typography card ───────────────────────
  const titleFontName = font?.titleFont ?? "Inter";
  const bodyFontName  = font?.bodyFont  ?? "Inter";
  const headingFamily = useGoogleFont(titleFontName) ?? `'${titleFontName}', serif`;
  const bodyFamily    = useGoogleFont(bodyFontName)  ?? `'${bodyFontName}', sans-serif`;

  // Global brand text color: use the darkest swatch from the palette when available.
  const darkestColorHex = getDarkestColor(colorPalette) ?? "#0f172a";
  const brandTextColor = darkestColorHex;
  const brandSubtextColor = isColorLight(darkestColorHex) ? "#64748b" : "#94a3b8";

  // ── AI-generated guideline content ──────────────────────────────────────────
  const [guidelineLoading, setGuidelineLoading] = useState(true);
  const [guidelineError, setGuidelineError] = useState<string | null>(null);
  const [colorNames, setColorNames] = useState<GuidelineColorName[]>([]);
  const [exporting, setExporting] = useState(false);
  const [contextDescription, setContextDescription] = useState(DEFAULT_CONTEXT_DESCRIPTION);
  const [contextImages, setContextImages] = useState<string[]>([]);

  // ── Generated rationale fields (read-only for users) ───────────────────────
  const [rationales, setRationales] = useState<Record<string, string>>({
    logo: "",
    color: "",
    typography: "",
    artStyle: "",
  });

  const handleRationaleChange = (key: string, value: string) => {
    setRationales((prev) => ({ ...prev, [key]: value }));
  };

  // ── Fetch AI-generated guideline content (extracted for reuse) ─────────────
  const fetchGuidelineAndContext = useCallback(
    async (versionId: string) => {
      setGuidelineLoading(true);
      setGuidelineError(null);
      try {
        const data = await generateGuideline({
          brandBrief: brief,
          keywords,
          colorPalette,
          visualConcept: concept,
          artStyle,
          font,
          logoImageUrl,
          artStyleImageUrl,
        });

        const newRationales = {
          logo: data.rationales?.logo ?? "",
          color: data.rationales?.color ?? "",
          typography: data.rationales?.typography ?? "",
          artStyle: data.rationales?.artStyle ?? "",
        };
        const newColorNames = data.colorNames ?? [];
        const newContextDesc = data.brandInContextDescription ?? DEFAULT_CONTEXT_DESCRIPTION;
        const newSynthesizedConcept = data.synthesizedVisualConcept;

        if (activeVersionIdRef.current === versionId) {
          setRationales(newRationales);
          if (newColorNames.length) setColorNames(newColorNames);
          setContextDescription(newContextDesc);
        }

        const applications =
          snapshotBvi?.guidelineApplications && snapshotBvi.guidelineApplications.length > 0
            ? snapshotBvi.guidelineApplications
            : DEFAULT_CONTEXT_APPLICATIONS;

        const results: string[] = [];
        for (const app of applications) {
          try {
            const img = await generateBrandContextMockup({
              application: app,
              brandName: brief?.name,
              visualSnapshotUrl,
            });
            if (img.imageUrl) {
              results.push(img.imageUrl);
            }
          } catch (e) {
            console.error("Brand in Context generation failed for application:", app, e);
          }
        }
        const finalImages = results.slice(0, 4);
        if (activeVersionIdRef.current === versionId) {
          setContextImages(finalImages);
        }

        // Sync AI-generated cache back to the parent version state for persistence
        const newLabel =
          !concept && newSynthesizedConcept?.conceptName
            ? newSynthesizedConcept.conceptName.trim()
            : undefined;
        setVersions((prev) =>
          prev.map((v) =>
            v.id === versionId
              ? {
                  ...v,
                  label: newLabel ?? v.label,
                  guidelineCache: {
                    rationales: newRationales,
                    colorNames: newColorNames,
                    brandInContextDescription: newContextDesc,
                    contextImageUrls: finalImages,
                    synthesizedVisualConcept: newSynthesizedConcept,
                  },
                }
              : v,
          ),
        );
      } catch (err) {
        console.error("Guideline generation failed:", err);
        if (activeVersionIdRef.current === versionId) {
          setGuidelineError(String(err));
        }
      } finally {
        if (activeVersionIdRef.current === versionId) {
          setGuidelineLoading(false);
        }
      }
    },
    [brief, keywords, colorPalette, concept, artStyle, font, snapshotBvi, visualSnapshotUrl, setVersions],
  );

  // ── Hydrate / fetch when activeVersionId changes ──────────────────────────
  const hydratedVersionRef = useRef<string | null>(null);
  const suppressRationalePersistRef = useRef(false);
  const hydrationTokenRef = useRef(0);

  useEffect(() => {
    if (hydratedVersionRef.current === activeVersionId) return;
    hydratedVersionRef.current = activeVersionId;
    suppressRationalePersistRef.current = true;
    const token = ++hydrationTokenRef.current;

    const version = versions.find((v) => v.id === activeVersionId);

    if (version?.guidelineCache) {
      const cache = version.guidelineCache;
      setRationales({
        logo: cache.rationales.logo ?? "",
        color: cache.rationales.color ?? "",
        typography: cache.rationales.typography ?? "",
        artStyle: cache.rationales.artStyle ?? "",
      });
      if (cache.colorNames?.length) setColorNames(cache.colorNames);
      setContextDescription(cache.brandInContextDescription ?? DEFAULT_CONTEXT_DESCRIPTION);
      setContextImages(cache.contextImageUrls ?? []);
      setGuidelineLoading(false);
      if (token === hydrationTokenRef.current) {
        suppressRationalePersistRef.current = false;
      }
      return;
    }

    fetchGuidelineAndContext(activeVersionId).finally(() => {
      if (token === hydrationTokenRef.current) {
        suppressRationalePersistRef.current = false;
      }
    });
  }, [activeVersionId, versions, fetchGuidelineAndContext]);

  // ── Persist rationale edits to current version's guidelineCache ─────────────────
  useEffect(() => {
    if (suppressRationalePersistRef.current) return;
    if (!versions.some((v) => v.id === activeVersionId)) return;
    setVersions((prev) =>
      prev.map((v) =>
        v.id === activeVersionId
          ? {
              ...v,
              guidelineCache: {
                ...v.guidelineCache,
                rationales: {
                  logo: rationales.logo ?? "",
                  color: rationales.color ?? "",
                  typography: rationales.typography ?? "",
                  artStyle: rationales.artStyle ?? "",
                },
                colorNames: v.guidelineCache?.colorNames ?? [],
                brandInContextDescription: v.guidelineCache?.brandInContextDescription ?? "",
                contextImageUrls: v.guidelineCache?.contextImageUrls ?? [],
                synthesizedVisualConcept: v.guidelineCache?.synthesizedVisualConcept,
              },
            }
          : v,
      ),
    );
  }, [activeVersionId, rationales.logo, rationales.color, rationales.typography, rationales.artStyle, setVersions]);

  // ── Export static HTML ──────────────────────────────────────────────────────
  const handleExport = async () => {
    if (exporting) return;

    const escapeHtml = (value?: string) =>
      (value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const imageCache = new Map<string, string>();
    const toDataUrl = async (url?: string): Promise<string> => {
      if (!url) return "";
      if (url.startsWith("data:")) return url;
      const cached = imageCache.get(url);
      if (cached) return cached;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Failed converting image to data URL"));
          reader.readAsDataURL(blob);
        });
        imageCache.set(url, dataUrl);
        return dataUrl;
      } catch (error) {
        console.warn("Failed to inline image for export. Falling back to URL.", url, error);
        imageCache.set(url, url);
        return url;
      }
    };

    const exportAccent = getMediumBrightColor(colorPalette) ?? "#6366f1";
    const exportGradient = buildGradientBg(colorPalette);
    const overlayRgba = hexToRgba(brandTextColor, 0.75);

    const buildPaletteSwatchesHtml = () =>
      displayPalette
        .map(
          (swatch) => `
          <div class="exp-palette-swatch" style="background-color:${escapeHtml(swatch.hex)};">
            <div class="exp-palette-swatch-inner">
              <span class="${swatch.textDark ? "exp-tx-dark" : "exp-tx-light"}">${escapeHtml(swatch.name)}</span>
              <span class="exp-palette-hex ${swatch.textDark ? "exp-tx-dark2" : "exp-tx-light"}">${escapeHtml(swatch.hex)}</span>
            </div>
          </div>`,
        )
        .join("");

    const fontNames = [...new Set([titleFontName, bodyFontName].filter(Boolean))];
    const fontLinkTags = fontNames
      .map((name) => {
        const encoded = encodeURIComponent(name);
        return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,700;1,400&display=swap" />`;
      })
      .join("\n  ");

    const visualRow = (
      title: string,
      cardInner: string,
      rationale: string,
    ) => `
    <div class="exp-ve-row">
      <div class="exp-ve-card"><div class="exp-ve-card-fill">${cardInner}</div></div>
      <div class="exp-ve-rationale">
        <div class="exp-ve-rationale-head">
          <span class="exp-ve-title"><span class="exp-accent-dot" style="background:${escapeHtml(exportAccent)}"></span>${escapeHtml(title)}</span>
        </div>
        <p class="exp-rationale-text">${escapeHtml(rationale)}</p>
      </div>
    </div>`;

    setExporting(true);
    try {
      const [exportLogo, exportArtStyle, exportSnapshot, ...exportContextImages] = await Promise.all([
        toDataUrl(logoImageUrl ?? imgFashionModelWearingBeigeCoatInMinimalistSetting),
        toDataUrl(artStyleImageUrl),
        toDataUrl(visualSnapshotUrl),
        ...contextImages.map((url) => toDataUrl(url)),
      ]);

      const cssUrl = (u: string) => u.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const conceptBannerBg = exportSnapshot
        ? `background-image:linear-gradient(${overlayRgba},${overlayRgba}),url("${cssUrl(exportSnapshot)}");background-size:cover;background-position:center;`
        : `background:${escapeHtml(exportGradient)};`;

      const conceptHtml = displayConcept
        ? `
    <section class="exp-concept" style="${conceptBannerBg}">
      <div class="exp-concept-inner">
        <p class="exp-concept-label">Visual Concept</p>
        <p class="exp-concept-name">${escapeHtml(displayConcept.conceptName)}</p>
        <div class="exp-concept-points">
          ${displayConcept.points.map((point) => `<p>${escapeHtml(point)}</p>`).join("")}
        </div>
      </div>
    </section>`
        : "";

      const contextRows: string[] = [];
      if (exportContextImages.length > 0) {
        for (let i = 0; i < exportContextImages.length; i += 2) {
          const pair = exportContextImages.slice(i, i + 2);
          contextRows.push(
            `<div class="exp-context-row">${pair
              .map(
                (img) =>
                  `<div class="exp-context-cell"><div class="exp-context-aspect"><img src="${escapeHtml(img)}" alt="Brand in context mockup" /></div></div>`,
              )
              .join("")}</div>`,
          );
        }
      }
      const contextHtml = exportContextImages.length
        ? contextRows.join("")
        : `<p class="exp-context-empty">Contextual mockups were not available at export time.</p>`;

      const logoCard = exportLogo
        ? `<img class="exp-img-contain" src="${escapeHtml(exportLogo)}" alt="Logo" />`
        : `<p class="exp-muted">No logo image available.</p>`;

      const paletteCard = `<div class="exp-palette-stack">${buildPaletteSwatchesHtml()}</div>`;

      const typoCard = `
        <div class="exp-typo">
          <div class="exp-typo-block">
            <span class="exp-typo-label">Title</span>
            <span class="exp-typo-sample-title" style="font-family:'${escapeHtml(titleFontName)}',serif">${escapeHtml(titleFontName)}</span>
            <span class="exp-typo-desc">Used for headlines and brand mark.</span>
          </div>
          <div class="exp-typo-block">
            <span class="exp-typo-label">Body</span>
            <span class="exp-typo-sample-body" style="font-family:'${escapeHtml(bodyFontName)}',sans-serif">${escapeHtml(bodyFontName)}</span>
            <span class="exp-typo-desc">Used for body copy and UI elements.</span>
          </div>
        </div>`;

      let artSnapshotRow = "";
      if (artStyle) {
        const inner = exportArtStyle
          ? `<img class="exp-img-contain" src="${escapeHtml(exportArtStyle)}" alt="Art Style" />`
          : `<p class="exp-muted">No art style image available.</p>`;
        artSnapshotRow = visualRow("Art Style", inner, rationales.artStyle);
      } else if (visualSnapshotUrl && exportSnapshot) {
        artSnapshotRow = visualRow(
          "Visual Snapshot",
          `<img class="exp-img-contain" src="${escapeHtml(exportSnapshot)}" alt="Visual Snapshot" />`,
          rationales.artStyle,
        );
      }

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(brief?.name ?? "Brand")} - Brand Guideline</title>
  ${fontLinkTags}
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" />
  <style>
    :root { --text: ${escapeHtml(brandTextColor)}; --subtext: ${escapeHtml(brandSubtextColor)}; --bg: #f7f7f7; --border: #e2e8f0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${bodyFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); line-height: 1.55; }
    .exp-hero { background: #fff; width: 100%; }
    .exp-hero-inner { max-width: 896px; margin: 0 auto; padding: 64px 24px; display: flex; flex-direction: column; align-items: center; gap: 32px; text-align: center; }
    .exp-hero h1 { margin: 0; font-family: ${headingFamily}, Georgia, serif; font-size: clamp(64px, 12vw, 160px); font-weight: 700; line-height: 1; color: var(--text); }
    .exp-hero .tagline { margin: 0; font-family: ${headingFamily}, Georgia, serif; font-size: clamp(20px, 3vw, 32px); font-weight: 700; line-height: 1.2; color: var(--text); }
    .exp-keywords { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; padding-top: 16px; }
    .exp-keyword { padding: 8px 16px; border: 1px solid var(--border); border-radius: 999px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; font-weight: 500; font-family: ${bodyFamily}, sans-serif; }
    .exp-concept { width: 100%; padding: 80px clamp(40px, 8vw, 160px) 128px; }
    .exp-concept-inner { max-width: 1200px; margin: 0 auto; position: relative; }
    .exp-concept-label { margin: 0 0 16px; font-size: 16px; line-height: 24px; color: rgba(255,255,255,0.95); font-family: ${bodyFamily}, sans-serif; font-weight: 400; }
    .exp-concept-name { margin: 0 0 16px; font-family: ${headingFamily}, Georgia, serif; font-size: 36px; font-weight: 400; line-height: 1.4; color: rgba(255,255,255,0.9); }
    .exp-concept-points { font-size: 18px; line-height: 1.5; color: rgba(255,255,255,0.9); font-family: ${bodyFamily}, sans-serif; font-weight: 400; }
    .exp-concept-points p { margin: 0 0 0.5em; }
    .exp-concept-points p:last-child { margin-bottom: 0; }
    .exp-ve-section { background: #f7f7f7; width: 100%; padding: 96px clamp(40px, 8vw, 80px); }
    .exp-ve-inner { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 32px; }
    .exp-ve-header { text-align: center; padding-bottom: 32px; }
    .exp-ve-header h2 { margin: 0 0 8px; font-family: ${headingFamily}, Georgia, serif; font-size: 36px; font-weight: 400; line-height: 40px; color: #000; }
    .exp-ve-header .sub { margin: 0; font-size: 16px; line-height: 24px; color: #64748b; font-family: ${bodyFamily}, sans-serif; }
    .exp-ve-row { display: flex; gap: 32px; align-items: stretch; }
    .exp-ve-card { flex: 1; min-width: 0; background: #fff; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); height: 320px; padding: 16px; display: flex; flex-direction: column; }
    .exp-ve-card-fill { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-radius: 4px; }
    .exp-img-contain { width: 100%; height: 100%; object-fit: contain; display: block; }
    .exp-muted { color: var(--subtext); margin: 0; font-size: 14px; }
    .exp-palette-stack { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
    .exp-palette-swatch { flex: 1; min-height: 0; border-radius: 4px; position: relative; overflow: hidden; }
    .exp-palette-swatch-inner { display: flex; align-items: center; justify-content: space-between; padding: 8px; height: 100%; gap: 8px; }
    .exp-palette-hex { font-family: "Roboto Mono", monospace; font-size: 12px; font-weight: 700; line-height: 16px; }
    .exp-palette-swatch-inner > span:first-child { font-family: "Roboto Mono", monospace; font-size: 12px; font-weight: 400; line-height: 16px; }
    .exp-tx-dark { color: #000; } .exp-tx-dark2 { color: #0f172a; } .exp-tx-light { color: #fff; }
    .exp-typo { display: flex; flex-direction: column; gap: 24px; justify-content: center; flex: 1; min-height: 0; overflow-y: auto; }
    .exp-typo-block { display: flex; flex-direction: column; gap: 8px; }
    .exp-typo-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600; font-family: ${bodyFamily}, sans-serif; }
    .exp-typo-sample-title { font-size: 32px; font-weight: 400; line-height: 1.2; color: #0f172a; }
    .exp-typo-sample-body { font-size: 32px; font-weight: 700; line-height: 1.2; color: #0f172a; }
    .exp-typo-desc { font-size: 14px; color: #64748b; line-height: 1.6; font-family: ${bodyFamily}, sans-serif; }
    .exp-ve-rationale { flex: 1; min-width: 0; height: 320px; display: flex; flex-direction: column; }
    .exp-ve-rationale-head { padding-bottom: 16px; flex-shrink: 0; }
    .exp-ve-title { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 700; line-height: 28px; color: #0f172a; font-family: ${headingFamily}, Georgia, serif; }
    .exp-accent-dot { width: 12px; height: 12px; border-radius: 999px; flex-shrink: 0; }
    .exp-rationale-text { margin: 0; flex: 1; overflow-y: auto; font-size: 16px; line-height: 1.6; color: #374151; font-family: ${bodyFamily}, sans-serif; white-space: pre-wrap; }
    .exp-context-section { background: #fff; width: 100%; padding: 96px clamp(40px, 8vw, 80px); }
    .exp-context-inner { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 48px; }
    .exp-context-header { text-align: center; padding-bottom: 32px; }
    .exp-context-header h2 { margin: 0 0 8px; font-family: ${headingFamily}, Georgia, serif; font-size: 36px; font-weight: 400; line-height: 40px; color: #000; }
    .exp-context-header p { margin: 0; font-size: 16px; line-height: 24px; color: #64748b; font-family: ${bodyFamily}, sans-serif; max-width: 720px; margin-left: auto; margin-right: auto; }
    .exp-context-row { display: flex; gap: 32px; }
    .exp-context-cell { flex: 1; min-width: 0; }
    .exp-context-aspect { position: relative; width: 100%; padding-bottom: 56.25%; border-radius: 8px; overflow: hidden; }
    .exp-context-aspect img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .exp-context-empty { text-align: center; font-size: 14px; color: #94a3b8; font-family: ${bodyFamily}, sans-serif; margin: 0; }
    .exp-summary { background: #f7f7f7; width: 100%; padding: 64px clamp(40px, 8vw, 80px); }
    .exp-summary-inner { max-width: 800px; margin: 0 auto; text-align: center; display: flex; flex-direction: column; gap: 24px; align-items: center; }
    .exp-summary-inner h2 { margin: 0; font-family: ${headingFamily}, Georgia, serif; font-size: 28px; font-weight: 700; line-height: 1.3; color: var(--text); }
    .exp-summary-inner p { margin: 0; font-size: 16px; line-height: 1.6; color: var(--subtext); font-family: ${bodyFamily}, sans-serif; }
    .exp-footer { background: #f7f7f7; border-top: 1px solid #e2e8f0; padding: 64px 24px; text-align: center; }
    .exp-footer-brand { font-size: 14px; color: #0f172a; font-family: Inter, sans-serif; }
    .exp-footer-brand .w400 { font-weight: 400; } .exp-footer-brand .w900 { font-weight: 900; }
    .exp-meta { margin-top: 12px; font-size: 12px; color: var(--subtext); font-family: ${bodyFamily}, sans-serif; }
    @media (max-width: 900px) {
      .exp-ve-row { flex-direction: column; }
      .exp-ve-rationale { height: auto; min-height: 200px; }
      .exp-context-row { flex-direction: column; }
    }
  </style>
</head>
<body>
  <main>
    <section class="exp-hero">
      <div class="exp-hero-inner">
        <h1>${escapeHtml(brief?.name ?? "Brand")}</h1>
        <p class="tagline">${escapeHtml(brief?.tagline ?? "")}</p>
        ${
          keywords.length > 0
            ? `<div class="exp-keywords">${keywords.map((kw) => `<span class="exp-keyword">${escapeHtml(kw)}</span>`).join("")}</div>`
            : ""
        }
      </div>
    </section>
    ${conceptHtml}
    <section class="exp-ve-section">
      <div class="exp-ve-inner">
        <div class="exp-ve-header">
          <h2>Visual Elements</h2>
          <p class="sub">Core identity components</p>
        </div>
        ${visualRow("Logo", logoCard, rationales.logo)}
        ${visualRow("Color Palette", paletteCard, rationales.color)}
        ${visualRow("Typography", typoCard, rationales.typography)}
        ${artSnapshotRow}
      </div>
    </section>
    <section class="exp-context-section">
      <div class="exp-context-inner">
        <div class="exp-context-header">
          <h2>Brand in Context</h2>
          <p>${escapeHtml(contextDescription)}</p>
        </div>
        ${contextHtml}
      </div>
    </section>
    ${
      brief?.description
        ? `<section class="exp-summary"><div class="exp-summary-inner"><h2>${escapeHtml(brief.name ?? "")}</h2><p>${escapeHtml(brief.description)}</p></div></section>`
        : ""
    }
    <footer class="exp-footer">
      <p class="exp-footer-brand"><span class="w400">Created with </span><span class="w900">Brand Brew</span><span class="w900"> ☕️</span></p>
      <p class="exp-meta">Exported ${escapeHtml(new Date().toLocaleString())}</p>
    </footer>
  </main>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = (brief?.name ?? "brand-guideline")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      a.href = objectUrl;
      a.download = `${slug || "brand-guideline"}-guideline.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ── Build dynamic color palette for display (solid swatches only) ──────────
  const accentColor = getMediumBrightColor(colorPalette) ?? undefined;

  const displayPalette = colorPalette.map((hex, i) => {
    const colorName = colorNames[i]?.name ?? `Color ${i + 1}`;
    return {
      name: colorName,
      hex: hex.toLowerCase(),
      textDark: isColorLight(hex),
      isGradient: false,
    };
  });

  const gradientCss = buildGradientBg(colorPalette);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f7f7f7] overflow-hidden">
      {/* View All overlay */}
      {showAllView && (
        <div className="absolute inset-0 z-[100]">
          <GuidelineAll
            onBack={() => setShowAllView(false)}
            versions={versions}
            visualSnapshotUrl={visualSnapshotUrl}
            onSelectVersion={(v) => {
              setActiveVersionId(v.id);
              setShowAllView(false);
            }}
            onDeleteVersion={handleDeleteVersion}
          />
        </div>
      )}

      {/* ═══════════════════ Top Navbar ═══════════════════ */}
      <nav className="shrink-0 h-14 bg-white border-b border-[#e5e5e5] flex items-center justify-between px-6 z-50">
        {/* Left: Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 hover:text-[#374151] transition-colors cursor-pointer"
          style={{ color: brandTextColor }}
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>

        {/* Right: Controls */}
        <div className="flex items-center gap-3">
          <span className="text-[12px]" style={{ color: brandSubtextColor }}>
            Saved Guidelines
          </span>

          {/* Version dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 h-8 px-4 bg-white border border-[#d4d4d4] rounded text-[14px] text-[#374151] shadow-[0px_2px_4px_0px_rgba(0,0,0,0.02)] cursor-pointer"
              style={{ fontWeight: 700 }}
            >
              {activeVersion?.label ?? "Generated guideline"}
              <ChevronDown size={14} className="text-[#64748b]" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#e5e5e5] rounded-lg shadow-lg py-1 z-50">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setActiveVersionId(v.id);
                      setDropdownOpen(false);
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 text-left text-[13px] text-[#374151] hover:bg-[#f7f7f7] transition-colors cursor-pointer"
                  >
                    <span className="flex-1 text-left pr-2" style={{ fontWeight: v.id === activeVersionId ? 700 : 400 }}>
                      {v.label}
                    </span>
                    {v.id === activeVersionId && <Check size={14} className="text-[#374151] shrink-0" />}
                  </button>
                ))}
                {/* Divider + View All */}
                <div className="border-t border-[#e5e5e5] mt-1 pt-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowAllView(true);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 justify-start text-left text-[13px] text-[#64748b] hover:bg-[#f7f7f7] hover:text-[#374151] transition-colors cursor-pointer"
                  >
                    View All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            className="h-8 px-4 bg-[#374151] rounded-full text-[14px] text-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.02)] cursor-pointer hover:bg-[#1f2937] transition-colors"
            style={{ fontWeight: 700 }}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </nav>

      {/* ═══════════════════ Scrollable Content ═══════════════════ */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Hero Section ─────────────────────────────────────────────────── */}
        <section className="bg-white w-full">
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="flex flex-col items-center gap-8 max-w-[896px]">
              <div className="pb-4">
                <h1
                  className="text-center"
                  style={{
                    fontFamily: headingFamily,
                    fontSize: "clamp(64px, 12vw, 160px)",
                    fontWeight: 700,
                    lineHeight: 1,
                    color: brandTextColor,
                  }}
                >
                  {brief?.name ?? "Brand"}
                </h1>
              </div>

              <p
                className="text-center"
                style={{
                  fontFamily: headingFamily,
                  fontSize: "clamp(20px, 3vw, 32px)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: brandTextColor,
                }}
              >
                {brief?.tagline ?? ""}
              </p>

              {keywords.length > 0 && (
                <div className="pt-8 flex gap-4 flex-wrap justify-center">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="px-4 py-2 border border-[#e2e8f0] rounded-full text-[12px] text-[#64748b] uppercase tracking-[0.3px]"
                      style={{ fontFamily: bodyFamily, fontWeight: 500 }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Visual Concept Banner ────────────────────────────────────────── */}
        {displayConcept && (
          <section className="w-full">
            <div
              className="relative px-10 md:px-20 lg:px-40 py-20 lg:py-32"
              style={
                visualSnapshotUrl
                  ? {
                      backgroundImage: `url(${visualSnapshotUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : { background: gradientCss }
              }
            >
              {visualSnapshotUrl && (
                <div className="absolute inset-0 backdrop-blur-sm pointer-events-none" style={{ backgroundColor: `color-mix(in srgb, ${brandTextColor} 75%, transparent)` }} />
              )}
              <div className="relative flex flex-col gap-4 max-w-[1200px]">
                <div>
                  <p
                    className="text-white text-[16px]"
                    style={{ fontFamily: bodyFamily, fontWeight: 400, lineHeight: "24px" }}
                  >
                    Visual Concept
                  </p>
                  <p
                    className="text-white/90"
                    style={{
                      fontFamily: headingFamily,
                      fontSize: "36px",
                      fontWeight: 400,
                      lineHeight: "60px",
                    }}
                  >
                    {displayConcept.conceptName}
                  </p>
                </div>
                <div
                  className="text-white/90 text-[18px]"
                  style={{ fontFamily: bodyFamily, fontWeight: 400, lineHeight: 1.5 }}
                >
                  {displayConcept.points.map((point, i) => (
                    <p key={i} className={i < displayConcept.points.length - 1 ? "mb-0" : ""}>
                      {point}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Visual Elements Section ──────────────────────────────────────── */}
        <section className="bg-[#f7f7f7] w-full px-10 md:px-20 py-24">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-8">
            {/* Section header */}
            <div className="pb-8">
              <div className="flex flex-col items-center gap-2">
                <h2
                  className="text-black"
                  style={{
                    fontFamily: headingFamily,
                    fontSize: "36px",
                    fontWeight: 400,
                    lineHeight: "40px",
                  }}
                >
                  Visual Elements
                </h2>
                <p
                  className="text-[#64748b] text-[16px]"
                  style={{ fontFamily: bodyFamily, fontWeight: 400, lineHeight: "24px" }}
                >
                  Core identity components
                </p>
              </div>
            </div>

            {/* Logo */}
            <VisualElementRow
              title="Logo"
              accentColor={accentColor}
              rationale={rationales.logo}
              onRationaleChange={(v) => handleRationaleChange("logo", v)}
              readOnly
              loading={guidelineLoading}
              headingFamily={headingFamily}
              bodyFamily={bodyFamily}
            >
              <div className="flex-1 flex flex-col items-center justify-center overflow-hidden rounded">
                {logoImageUrl ? (
                  <img
                    alt="Logo"
                    className="object-contain w-full h-full"
                    src={logoImageUrl}
                  />
                ) : (
                  <img
                    alt="Logo"
                    className="object-contain w-full h-full"
                    src={imgFashionModelWearingBeigeCoatInMinimalistSetting}
                  />
                )}
              </div>
            </VisualElementRow>

            {/* Color Palette */}
            <VisualElementRow
              title="Color Palette"
              accentColor={accentColor}
              rationale={rationales.color}
              onRationaleChange={(v) => handleRationaleChange("color", v)}
              readOnly
              loading={guidelineLoading}
              headingFamily={headingFamily}
              bodyFamily={bodyFamily}
            >
              <ColorPaletteDisplay
                palette={displayPalette}
                gradientCss={gradientCss}
              />
            </VisualElementRow>

            {/* Typography */}
            <VisualElementRow
              title="Typography"
              accentColor={accentColor}
              rationale={rationales.typography}
              onRationaleChange={(v) => handleRationaleChange("typography", v)}
              readOnly
              loading={guidelineLoading}
              headingFamily={headingFamily}
              bodyFamily={bodyFamily}
            >
              <TypographyDisplay titleFont={titleFontName} bodyFont={bodyFontName} bodyFamily={bodyFamily} />
            </VisualElementRow>

            {/* Art Style — only when user selected an art style card */}
            {artStyle && (
              <VisualElementRow
                title="Art Style"
                accentColor={accentColor}
                rationale={rationales.artStyle}
                onRationaleChange={(v) => handleRationaleChange("artStyle", v)}
                readOnly
                loading={guidelineLoading}
                headingFamily={headingFamily}
                bodyFamily={bodyFamily}
              >
                <div className="flex-1 flex flex-col items-center justify-center overflow-hidden rounded">
                  <img
                    alt="Art Style"
                    className="object-contain w-full h-full"
                    src={artStyleImageUrl ?? ""}
                  />
                </div>
              </VisualElementRow>
            )}

            {/* Visual Snapshot — when no art style selected but snapshot composite exists */}
            {!artStyle && visualSnapshotUrl && (
              <VisualElementRow
                title="Visual Snapshot"
                accentColor={accentColor}
                rationale={rationales.artStyle}
                onRationaleChange={(v) => handleRationaleChange("artStyle", v)}
                readOnly
                loading={guidelineLoading}
                headingFamily={headingFamily}
                bodyFamily={bodyFamily}
              >
                <div className="flex-1 flex flex-col items-center justify-center overflow-hidden rounded">
                  <img
                    alt="Visual Snapshot"
                    className="object-contain w-full h-full"
                    src={visualSnapshotUrl}
                  />
                </div>
              </VisualElementRow>
            )}
          </div>
        </section>

        {/* ── Brand in Context ─────────────────────────────────────────────── */}
        <section className="bg-white w-full px-10 md:px-20 py-24">
          <div className="max-w-[1200px] mx-auto flex flex-col gap-12">
            <div className="pb-8">
              <div className="flex flex-col items-center gap-2">
                <h2
                  className="text-black"
                  style={{
                    fontFamily: headingFamily,
                    fontSize: "36px",
                    fontWeight: 400,
                    lineHeight: "40px",
                  }}
                >
                  Brand in Context
                </h2>
                <p
                  className="text-[#64748b] text-[16px] text-center"
                  style={{ fontFamily: bodyFamily, fontWeight: 400, lineHeight: "24px" }}
                >
                  {contextDescription}
                </p>
              </div>
            </div>

            {/* Gallery grid — 2x2, using generated context images when available */}
            {contextImages.length > 0 ? (
              <div className="flex flex-col gap-8">
                <div className="flex gap-8">
                  {contextImages.slice(0, 2).map((url, idx) => (
                    <div key={idx} className="flex-1 min-w-0 rounded-lg overflow-hidden relative aspect-[16/9]">
                      <img
                        alt="Brand in context mockup"
                        className="absolute inset-0 w-full h-full object-cover"
                        src={url}
                      />
                    </div>
                  ))}
                </div>
                {contextImages.length > 2 && (
                  <div className="flex gap-8">
                    {contextImages.slice(2, 4).map((url, idx) => (
                      <div key={idx} className="flex-1 min-w-0 rounded-lg overflow-hidden relative aspect-[16/9]">
                        <img
                          alt="Brand in context mockup"
                          className="absolute inset-0 w-full h-full object-cover"
                          src={url}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-[14px] text-[#94a3b8]" style={{ fontFamily: bodyFamily }}>
                Contextual mockups will appear here once generated from the selected visual snapshot.
              </div>
            )}
          </div>
        </section>

        {/* ── Brand Summary Footer ────────────────────────────────────────── */}
        {brief && (
          <section className="bg-[#f7f7f7] w-full px-10 md:px-20 py-16">
            <div className="max-w-[800px] mx-auto flex flex-col items-center gap-6 text-center">
              <h2
                className="text-[#0f172a]"
                style={{
                  fontFamily: headingFamily,
                  fontSize: "28px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: brandTextColor,
                }}
              >
                {brief.name}
              </h2>
              <p
                className="text-[#64748b] text-[16px]"
                style={{
                  fontFamily: bodyFamily,
                  fontWeight: 400,
                  lineHeight: 1.6,
                  color: brandSubtextColor,
                }}
              >
                {brief.description}
              </p>
            </div>
          </section>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className="bg-[#f7f7f7] w-full border-t border-[#e2e8f0] flex flex-col items-center py-16">
          <p className="text-[14px] text-[#0f172a]" style={{ fontFamily: "'Inter', sans-serif" }}>
            <span style={{ fontWeight: 400 }}>Created with </span>
            <span style={{ fontWeight: 900 }}>Brand Brew</span>
            <span style={{ fontWeight: 900 }}> ☕️</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────────

function VisualElementRow({
  title,
  titleIcon,
  children,
  rationale,
  onRationaleChange,
  bodyFamily,
  loading = false,
  headingFamily,
  accentColor,
  readOnly = false,
}: {
  title: string;
  titleIcon?: string;
  children: React.ReactNode;
  rationale: string;
  onRationaleChange: (v: string) => void;
  bodyFamily?: string;
  loading?: boolean;
  headingFamily?: string;
  accentColor?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex gap-8 items-stretch">
      {/* Card — visual content only */}
      <div className="flex-1 min-w-0 bg-white rounded-lg shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] h-[320px] flex flex-col p-4">
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
      </div>

      {/* Rationale — title above, textarea below */}
      <div className="flex-1 min-w-0 h-[320px] flex flex-col relative">
        <div className="flex items-center justify-between pb-4 shrink-0">
          <span
            className="flex items-center gap-3 text-[18px] text-[#0f172a]"
            style={{ fontFamily: headingFamily ?? "'Inter', sans-serif", fontWeight: 700, lineHeight: "28px" }}
          >
            {accentColor && (
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: accentColor,
                }}
              />
            )}
            {title}
          </span>
          {loading && (
            <div className="flex items-center gap-2 text-[#94a3b8] text-[12px]" style={{ fontFamily: bodyFamily ?? "'Inter', sans-serif" }}>
              <Loader2 size={14} className="animate-spin" />
              <span>Generating...</span>
            </div>
          )}
        </div>
        <textarea
          value={rationale}
          onChange={(e) => {
            if (!readOnly) onRationaleChange(e.target.value);
          }}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : "Add rationale..."}
          className={`flex-1 w-full text-[16px] text-[#374151] bg-transparent border-0 outline-none resize-none p-0 overflow-y-auto ${readOnly ? "cursor-default" : ""}`}
          style={{
            fontFamily: bodyFamily ?? "'Inter', sans-serif",
            fontWeight: 400,
            lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  );
}

function ColorPaletteDisplay({
  palette,
  gradientCss,
}: {
  palette: { name: string; hex: string; textDark: boolean; isGradient: boolean }[];
  gradientCss: string;
}) {
  return (
    <div className="flex flex-col gap-2 flex-1">
      {palette.map((swatch) => (
        <div
          key={swatch.name}
          className="flex-1 min-h-0 rounded relative"
          style={
            swatch.isGradient
              ? { background: gradientCss }
              : { backgroundColor: swatch.hex }
          }
        >
          <div className="flex items-center justify-between p-2 h-full gap-2">
            <span
              className={`text-[12px] ${swatch.textDark ? "text-black" : "text-white"}`}
              style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 400, lineHeight: "16px" }}
            >
              {swatch.name}
            </span>
            <span
              className={`text-[12px] ${swatch.textDark ? "text-[#0f172a]" : "text-white"}`}
              style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, lineHeight: "16px" }}
            >
              {swatch.hex}
            </span>
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_2px_4px_0px_rgba(0,0,0,0.05)]" />
        </div>
      ))}
    </div>
  );
}

function TypographyDisplay({ titleFont, bodyFont, bodyFamily }: { titleFont?: string; bodyFont?: string; bodyFamily?: string }) {
  const labelFamily = bodyFamily ?? "'Inter', sans-serif";
  return (
    <div className="flex flex-col gap-6 flex-1 justify-center">
      {/* Title font */}
      <div className="flex flex-col gap-2">
        <span
          className="text-[12px] text-[#94a3b8] uppercase tracking-[0.6px]"
          style={{ fontFamily: labelFamily, fontWeight: 600 }}
        >
          Title
        </span>
        <span
          className="text-[32px] text-[#0f172a]"
          style={{
            fontFamily: `'${titleFont ?? "Inter"}', serif`,
            fontWeight: 400,
            lineHeight: 1.2,
          }}
        >
          {titleFont ?? "Inter"}
        </span>
        <span
          className="text-[14px] text-[#64748b] pt-1"
          style={{ fontFamily: labelFamily, fontWeight: 400, lineHeight: 1.6 }}
        >
          Used for headlines and brand mark.
        </span>
      </div>

      {/* Body font */}
      <div className="flex flex-col gap-2">
        <span
          className="text-[12px] text-[#94a3b8] uppercase tracking-[0.6px]"
          style={{ fontFamily: labelFamily, fontWeight: 600 }}
        >
          Body
        </span>
        <span
          className="text-[32px] text-[#0f172a]"
          style={{
            fontFamily: `'${bodyFont ?? "Inter"}', sans-serif`,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {bodyFont ?? "Inter"}
        </span>
        <span
          className="text-[14px] text-[#64748b] pt-1"
          style={{ fontFamily: labelFamily, fontWeight: 400, lineHeight: 1.6 }}
        >
          Used for body copy and UI elements.
        </span>
      </div>
    </div>
  );
}