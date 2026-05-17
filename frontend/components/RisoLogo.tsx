// ============================================================
// RISO HUB — components/RisoLogo.tsx
// Uses the actual RISO HOME logo PNGs (transparent background).
//
// Two image assets (import from logoAssets.ts):
//   LOGO_DARK_B64  — dark letterforms on transparent bg
//                    → use on white/light backgrounds
//   LOGO_WHITE_B64 — white letterforms on transparent bg
//                    → use on olive (#7A8465) or dark backgrounds
//
// Variants:
//   "full"       — full logo (RH + RISO HOME + rule + tagline)
//                  used on: login page, standalone brand moments
//   "horizontal" — logo image with optional subtitle text below
//                  used on: sidebar, portal header, email header
//   "mark"       — monogram only (crops to just the RH letterforms)
//                  used on: favicon, very small slots
//
// Props:
//   height   — controls rendered height in px (width auto from aspect ratio)
//   color    — "dark" (on light bg) | "light" (on olive/dark bg)
//   subtitle — optional small label below the image (horizontal variant)
//   style    — passthrough to wrapper
//
// Usage:
//   <RisoLogo variant="full"       height={80} color="dark" />
//   <RisoLogo variant="horizontal" height={36} color="dark" subtitle="RISO HUB" />
//   <RisoLogo variant="horizontal" height={34} color="light" subtitle="INSTALLATION DOCUMENTS" />
//   <RisoLogo variant="mark"       height={28} color="light" />
// ============================================================

import React from 'react';
import { LOGO_DARK_B64, LOGO_WHITE_B64 } from './logoAssets';

type Variant   = 'full' | 'horizontal' | 'mark';
type ColorMode = 'dark' | 'light';

interface RisoLogoProps {
  variant?:   Variant;
  height?:    number;
  color?:     ColorMode;
  subtitle?:  string;
  style?:     React.CSSProperties;
  className?: string;
}

// The source image is 947×719px (cropped transparent PNG)
// Aspect ratio ≈ 1.317 wide
const IMG_W = 947;
const IMG_H = 719;
const ASPECT = IMG_W / IMG_H; // ~1.317

// The RH monogram occupies roughly:
//   horizontal: 18%–82% of width  (64% of total width)
//   vertical:   0%–60% of height  (top 60%)
const MARK_X_FRAC  = 0.18;
const MARK_W_FRAC  = 0.64;
const MARK_H_FRAC  = 0.60;

export default function RisoLogo({
  variant  = 'horizontal',
  height   = 36,
  color    = 'dark',
  subtitle,
  style,
  className,
}: RisoLogoProps) {
  const src = color === 'light' ? LOGO_WHITE_B64 : LOGO_DARK_B64;

  // ── Full logo — render entire image at requested height ───────────────────
  if (variant === 'full') {
    const w = Math.round(height * ASPECT);
    return (
      <div
        className={className}
        style={{ display: 'inline-block', ...style }}
        aria-label="RISO HOME"
      >
        <img
          src={src}
          alt="RISO HOME"
          width={w}
          height={height}
          style={{ display: 'block', width: w, height }}
          draggable={false}
        />
      </div>
    );
  }

  // ── Mark — crops to just the RH monogram ─────────────────────────────────
  // We size the full image so the monogram portion reaches `height`,
  // then clip the container to show only the monogram crop.
  if (variant === 'mark') {
    // If monogram is MARK_H_FRAC of full height, then:
    const fullH     = Math.round(height / MARK_H_FRAC);
    const fullW     = Math.round(fullH * ASPECT);
    const clipW     = Math.round(fullW * MARK_W_FRAC);
    const offsetX   = -Math.round(fullW * MARK_X_FRAC);

    return (
      <div
        className={className}
        aria-label="RISO HOME"
        style={{
          display:  'inline-block',
          width:    clipW,
          height,
          overflow: 'hidden',
          ...style,
        }}
      >
        <img
          src={src}
          alt="RISO HOME"
          style={{
            display:    'block',
            width:      fullW,
            height:     fullH,
            marginLeft: offsetX,
            marginTop:  0,
          }}
          draggable={false}
        />
      </div>
    );
  }

  // ── Horizontal — full image + optional subtitle ────────────────────────────
  // The logo image already contains RH + RISO HOME + rule + tagline at full size.
  // For sidebar use we render it tall enough to read the wordmark.
  if (variant === 'horizontal') {
    const w = Math.round(height * ASPECT);
    const subtitleColor = color === 'light'
      ? 'rgba(255,255,255,0.60)'
      : '#9a9a8e';

    return (
      <div
        className={className}
        aria-label="RISO HOME"
        style={{
          display:       'inline-flex',
          flexDirection: 'column',
          alignItems:    'flex-start',
          gap:           Math.round(height * 0.08),
          ...style,
        }}
      >
        <img
          src={src}
          alt="RISO HOME"
          width={w}
          height={height}
          style={{ display: 'block', width: w, height }}
          draggable={false}
        />
        {subtitle && (
          <div style={{
            fontFamily:    "'Satoshi', 'Inter', Arial, sans-serif",
            fontSize:      Math.max(10, Math.round(height * 0.20)),
            letterSpacing: '0.07em',
            color:         subtitleColor,
            lineHeight:    1,
            paddingLeft:   1,
          }}>
            {subtitle}
          </div>
        )}
      </div>
    );
  }

  return null;
}
