// ─────────────────────────────────────────────────────────────────────────────
// shared/snapshot-prompts.ts — Visual snapshot (identity board) prompt
//
// A snapshot is a filled bento of brand assets, including color blocks and
// live type specimens. Hex/typeface-as-caption constraints for mockups live
// on the mockup text policy, not here.
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotPromptContext {
  brandName?: string;
  brandDescription?: string;
  keywords?: string[];
  visualConcept?: { concept: string; description: string };
  colorPalette?: string[];
  font1?: string;
  font2?: string;
  hasPalette: boolean;
  referenceImageRoles?: string[];
}

function clean(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildSnapshotPrompt(ctx: SnapshotPromptContext): string {
  const roles = ctx.referenceImageRoles ?? [];
  const compositionLines: string[] = [];
  let compIdx = 1;

  if (ctx.hasPalette) {
    compositionLines.push(
      `- a filled color-block compartment of solid swatches taken from Image ${compIdx} (no hex codes, no captions)`,
    );
    compIdx++;
  }

  for (const role of roles) {
    const n = compIdx++;
    if (role === "art-style") {
      compositionLines.push(
        `- graphic elements remixed from Image ${n}, filling their compartment`,
      );
    } else if (role === "logo") {
      compositionLines.push(`- the Logo from Image ${n}, filling its compartment`);
    } else {
      console.warn(
        `[snapshot-prompt] unexpected referenceImageRoles entry "${role}" (Image ${n}); no composition bullet`,
      );
    }
  }

  const colors = (ctx.colorPalette ?? []).map(clean).filter(Boolean);
  if (!ctx.hasPalette && colors.length > 0) {
    compositionLines.push(
      `- a filled color-block compartment of solid swatches using these fills (do not letter the values): ${colors.join(", ")}`,
    );
  }

  const fonts = [ctx.font1, ctx.font2].map(clean).filter(Boolean);
  if (fonts.length > 0) {
    const brand = clean(ctx.brandName);
    const specimen = brand
      ? `set "${brand}" and short specimens such as Aa, a headline word, and a body-copy line`
      : "set short specimens such as Aa, a headline word, and a body-copy line";
    compositionLines.push(
      `- a filled lettering compartment of live type in the visual character of ${fonts.join(" and ")}: ${specimen}. Do not letter the typeface names`,
    );
  }

  const intro =
    "A filled modular brand identity snapshot in a bento-box grid. Every compartment contains a finished visual asset — no blank panels, no white voids, no empty cells. The composition features:";

  return [intro, compositionLines.join("\n")].filter((part) => part.trim().length > 0).join("\n\n");
}
