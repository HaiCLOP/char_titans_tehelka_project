"use client";

import React, { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type CiviPose =
  | "hero"
  | "happy"
  | "thinking"
  | "helping"
  | "concerned"
  | "celebrating"
  | "learning";

export interface CiviSvgProps {
  pose?: CiviPose;
  className?: string;
  size?: number | string;
}

/**
 * Civi's own art palette. The mascot is illustration, not UI chrome, so these
 * literal colours are the one allowed exception to the token-only rule.
 */
const C = {
  bodyLight: "#FCF1E7",
  bodyMid: "#F3DACA",
  bodyDark: "#E6C2AC",
  bodyShade: "#C9A189",
  hornLight: "#F6DFCB",
  hornDark: "#D8AD91",
  ink: "#1E1A1B",
  mouth: "#4A2326",
  tongue: "#E8676B",
  blush: "#F29C9A",
  cloth: "#FFFDF9",
  clothShade: "#D9C8BA",
  weave: "#D8322E",
  laptop: "#46464B",
  laptopDark: "#2B2B2F",
  laptopLogo: "#7FA79E",
  book: "#3E6E5E",
  bookDark: "#2C5244",
  page: "#F5EEE1",
  bulb: "#F5B83D",
  bulbBase: "#8A8580",
  confettiYellow: "#F2B544",
} as const;

/** Accent strokes adapt to dark backgrounds via currentColor. */
const ACCENT_TEAL = "text-[#3a8f86] dark:text-[#62bdb2]";
const ACCENT_GREY = "text-[#868c92] dark:text-[#aab0b6]";

/** Body silhouette: soft gumdrop, round top, bulging lower sides, flat base. */
const BODY =
  "M 100 58 C 141 58 166 90 171 128 C 175 158 167 176 142 178 L 58 178 C 33 176 25 158 29 128 C 34 90 59 58 100 58 Z";

const BREATH_EASE = [0.45, 0, 0.55, 1] as const;

function Paw({ cx, cy, rx = 11, ry = 8, rotate = 0, grad }: { cx: number; cy: number; rx?: number; ry?: number; rotate?: number; grad: string }) {
  return (
    <g transform={`rotate(${rotate} ${cx} ${cy})`}>
      <ellipse cx={cx + 1} cy={cy + 2.5} rx={rx} ry={ry} fill={C.bodyShade} opacity={0.28} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${grad})`} />
      <ellipse cx={cx - rx * 0.3} cy={cy - ry * 0.4} rx={rx * 0.45} ry={ry * 0.3} fill="#FFFFFF" opacity={0.45} />
    </g>
  );
}

/** A gamosa band: white cloth, thin red edge lines, woven red motif rows. */
function Band({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="butt" strokeLinejoin="round">
      <path d={d} stroke={C.bodyShade} strokeWidth={31} opacity={0.3} transform="translate(1.5 3)" />
      <path d={d} stroke={C.clothShade} strokeWidth={31} />
      <path d={d} stroke={C.cloth} strokeWidth={29.5} />
      <path d={d} stroke={C.weave} strokeWidth={27} />
      <path d={d} stroke={C.cloth} strokeWidth={25.4} />
      <path d={d} stroke={C.weave} strokeWidth={24} strokeDasharray="3 1.6" />
      <path d={d} stroke={C.cloth} strokeWidth={17.6} />
      <path d={d} stroke={C.weave} strokeWidth={16.6} />
      <path d={d} stroke={C.cloth} strokeWidth={15} />
      <path d={d} stroke={C.clothShade} strokeWidth={5} opacity={0.3} />
    </g>
  );
}

function OvalEyes({ dx = 0, dy = 0, rx = 7, ry = 10.5 }: { dx?: number; dy?: number; rx?: number; ry?: number }) {
  return (
    <>
      <ellipse cx={78 + dx} cy={114 + dy} rx={rx} ry={ry} fill={C.ink} />
      <ellipse cx={122 + dx} cy={114 + dy} rx={rx} ry={ry} fill={C.ink} />
      <ellipse cx={76 + dx} cy={109 + dy} rx={1.8} ry={2.4} fill="#FFFFFF" opacity={0.55} />
      <ellipse cx={120 + dx} cy={109 + dy} rx={1.8} ry={2.4} fill="#FFFFFF" opacity={0.55} />
    </>
  );
}

function OpenMouth({ y = 124, w = 9, h = 13 }: { y?: number; w?: number; h?: number }) {
  return (
    <g>
      <path
        d={`M ${100 - w} ${y} Q 100 ${y + 2} ${100 + w} ${y} Q ${100 + w - 1} ${y + h} 100 ${y + h} Q ${100 - w + 1} ${y + h} ${100 - w} ${y} Z`}
        fill={C.mouth}
      />
      <ellipse cx={100} cy={y + h - 3.2} rx={w * 0.55} ry={3.2} fill={C.tongue} />
    </g>
  );
}

const inkStroke = { stroke: C.ink, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

/**
 * Civi, the CivicSense mascot: a soft cream clay blob with a little horn,
 * wrapped in an Assamese gamosa. Inline SVG, seven poses, gentle idle motion.
 */
export function CiviSvg({ pose = "hero", className, size = 120 }: CiviSvgProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const reduce = useReducedMotion();
  const id = (name: string) => `civi-${uid}-${name}`;

  const openEyes = pose !== "happy" && pose !== "celebrating";

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none overflow-visible", className)}
      role="img"
      aria-label={`Civi, the CivicSense mascot (${pose})`}
    >
      <defs>
        <linearGradient id={id("body")} x1="70" y1="58" x2="120" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.bodyLight} />
          <stop offset="0.55" stopColor={C.bodyMid} />
          <stop offset="1" stopColor={C.bodyDark} />
        </linearGradient>
        <radialGradient id={id("hi")} cx="76" cy="84" r="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shade")} cx="128" cy="182" r="96" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.bodyShade} stopOpacity="0.55" />
          <stop offset="0.6" stopColor={C.bodyShade} stopOpacity="0.12" />
          <stop offset="1" stopColor={C.bodyShade} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("horn")} x1="88" y1="40" x2="114" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.hornLight} />
          <stop offset="1" stopColor={C.hornDark} />
        </linearGradient>
        <linearGradient id={id("paw")} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={C.bodyLight} />
          <stop offset="1" stopColor={C.bodyDark} />
        </linearGradient>
        <radialGradient id={id("blush")}>
          <stop offset="0" stopColor={C.blush} stopOpacity="0.6" />
          <stop offset="1" stopColor={C.blush} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("floor")}>
          <stop offset="0" stopColor="#2A1D16" stopOpacity="0.26" />
          <stop offset="0.6" stopColor="#2A1D16" stopOpacity="0.09" />
          <stop offset="1" stopColor="#2A1D16" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("floorDark")}>
          <stop offset="0" stopColor="#000000" stopOpacity="0.7" />
          <stop offset="0.55" stopColor="#000000" stopOpacity="0.3" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("glow")}>
          <stop offset="0" stopColor="#FFF3E6" stopOpacity="0.14" />
          <stop offset="1" stopColor="#FFF3E6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("laptop")} x1="120" y1="112" x2="176" y2="170" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.laptop} />
          <stop offset="1" stopColor={C.laptopDark} />
        </linearGradient>
        <linearGradient id={id("book")} x1="100" y1="132" x2="160" y2="178" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={C.book} />
          <stop offset="1" stopColor={C.bookDark} />
        </linearGradient>
        <clipPath id={id("bodyClip")}>
          <path d={BODY} />
        </clipPath>
        <clipPath id={id("wrapClip")}>
          <path d={BODY} transform="translate(100 120) scale(1.06) translate(-100 -120)" />
        </clipPath>
      </defs>

      {/* Contact shadow: warm in light mode; deeper core plus faint floor glow in dark mode */}
      <g className="dark:hidden">
        <ellipse cx="100" cy="180" rx="80" ry="11" fill={`url(#${id("floor")})`} />
      </g>
      <g className="hidden dark:inline">
        <ellipse cx="100" cy="182" rx="92" ry="16" fill={`url(#${id("glow")})`} />
        <ellipse cx="100" cy="180" rx="76" ry="10" fill={`url(#${id("floorDark")})`} />
      </g>

      <motion.g
        style={{ originX: 0.5, originY: 1 }}
        animate={reduce ? undefined : { scaleY: [1, 0.972, 1], scaleX: [1, 1.014, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: BREATH_EASE }}
      >
        {/* Horn, tucked behind the dome so its base blends in */}
        <path
          d="M 86 72 C 90 55 95 40 98 33 Q 100 28.5 102 33 C 105 40 110 55 114 72 Z"
          fill={`url(#${id("horn")})`}
        />
        <path d="M 96 62 C 97 50 98.5 41 100 35" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.5" />

        {/* Body */}
        <path d={BODY} fill={`url(#${id("body")})`} />
        <g clipPath={`url(#${id("bodyClip")})`}>
          <path d={BODY} fill={`url(#${id("shade")})`} />
          <path d={BODY} fill={`url(#${id("hi")})`} />
          <ellipse cx="100" cy="64" rx="18" ry="5" fill={C.bodyShade} opacity="0.16" />
          <ellipse cx="100" cy="182" rx="74" ry="10" fill={C.bodyShade} opacity="0.35" />
        </g>

        {/* Blush */}
        <ellipse cx="64" cy="129" rx="10" ry="6" fill={`url(#${id("blush")})`} />
        <ellipse cx="136" cy="129" rx="10" ry="6" fill={`url(#${id("blush")})`} />

        {/* Gamosa shawl: over the left side down to the front, and hanging down the right */}
        <g clipPath={`url(#${id("wrapClip")})`}>
          <Band d="M 22 102 C 28 140 58 166 106 180" />
          <Band d="M 174 86 C 158 110 150 142 148 182" />
        </g>
        {/* Fringe at the hanging ends */}
        <g stroke={C.cloth} strokeWidth="1.6" strokeLinecap="round" opacity="0.95">
          <path d="M 98 179 l 0.5 4 M 103 180 l 0.5 4 M 108 180.5 l 0.5 3.5" />
          <path d="M 137 180 l -0.5 4 M 142 180.5 l 0 4 M 147 181 l 0 3.5 M 152 180.5 l 0 4 M 157 180 l 0.5 3.5" />
        </g>

        {/* Face */}
        <g>
          {openEyes && (
            <motion.g
              style={{ originX: 0.5, originY: 0.5 }}
              animate={reduce ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
              transition={{ duration: 4.8, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity, ease: "easeInOut" }}
            >
              {pose === "hero" && <OvalEyes />}
              {pose === "thinking" && (
                <>
                  <ellipse cx="124" cy="113" rx="6.8" ry="10" fill={C.ink} />
                  <ellipse cx="122" cy="108" rx="1.8" ry="2.4" fill="#FFFFFF" opacity="0.55" />
                </>
              )}
              {pose === "helping" && <OvalEyes dx={5} rx={6.5} ry={10} />}
              {pose === "concerned" && <OvalEyes dy={3} rx={6.5} ry={9.5} />}
              {pose === "learning" && <OvalEyes dx={3} dy={5} rx={6.5} ry={9} />}
            </motion.g>
          )}

          {pose === "hero" && <path d="M 93 128 Q 100 134 107 128" {...inkStroke} strokeWidth="2.8" />}

          {pose === "happy" && (
            <>
              <path d="M 68 117 Q 78 105 88 117" {...inkStroke} strokeWidth="3.8" />
              <path d="M 112 117 Q 122 105 132 117" {...inkStroke} strokeWidth="3.8" />
              <OpenMouth y={124} />
            </>
          )}

          {pose === "thinking" && (
            <>
              <path d="M 68 108 L 84 114 L 70 120" {...inkStroke} strokeWidth="3.6" />
              <path d="M 94 130 Q 99 127 103 129 T 110 128" {...inkStroke} strokeWidth="2.6" />
            </>
          )}

          {pose === "helping" && <path d="M 98 128 Q 104 132 110 128" {...inkStroke} strokeWidth="2.6" />}

          {pose === "concerned" && (
            <>
              <path d="M 68 102 Q 76 101 85 95" {...inkStroke} strokeWidth="2.8" />
              <path d="M 115 95 Q 124 101 132 102" {...inkStroke} strokeWidth="2.8" />
              <path d="M 93 135 Q 100 129 107 135" {...inkStroke} strokeWidth="2.8" />
            </>
          )}

          {pose === "celebrating" && (
            <>
              <path d="M 67 106 L 85 114 L 67 122" {...inkStroke} strokeWidth="3.8" />
              <path d="M 133 106 L 115 114 L 133 122" {...inkStroke} strokeWidth="3.8" />
              <OpenMouth y={123} w={11} h={16} />
            </>
          )}

          {pose === "learning" && <path d="M 97 131 Q 103 135 109 131" {...inkStroke} strokeWidth="2.6" />}
        </g>

        {/* Paws and props */}
        {(pose === "hero" || pose === "happy" || pose === "concerned") && (
          <>
            <Paw cx={56} cy={168} grad={id("paw")} rotate={-12} />
            <Paw cx={144} cy={168} grad={id("paw")} rotate={12} />
          </>
        )}

        {pose === "thinking" && (
          <>
            <Paw cx={56} cy={168} grad={id("paw")} rotate={-12} />
            <Paw cx={114} cy={152} rx={9} ry={11} grad={id("paw")} rotate={-18} />
          </>
        )}

        {pose === "celebrating" && (
          <>
            <Paw cx={144} cy={168} grad={id("paw")} rotate={12} />
            <Paw cx={38} cy={110} rx={9} ry={16} grad={id("paw")} rotate={-28} />
          </>
        )}

        {pose === "helping" && (
          <g>
            <Paw cx={56} cy={168} grad={id("paw")} rotate={-12} />
            {/* Laptop seen from behind: lid with leaf logo, thin base */}
            <path d="M 106 172 L 182 166 L 186 173 L 108 178 Z" fill={C.laptopDark} />
            <path
              d="M 120 118 Q 120 114 124 114 L 176 110 Q 180 110 180 114 L 178 164 Q 178 168 174 168 L 120 172 Q 116 172 116 168 Z"
              fill={`url(#${id("laptop")})`}
            />
            <path d="M 124 117 L 174 113" stroke="#FFFFFF" strokeWidth="1.4" strokeLinecap="round" opacity="0.18" />
            <path d="M 141 147 C 141 135 150 130 158 130 C 158 141 151 148 141 147 Z" fill={C.laptopLogo} />
            <path d="M 143 145 L 154 134" stroke={C.laptop} strokeWidth="1.2" strokeLinecap="round" />
            <Paw cx={112} cy={168} rx={10} ry={7.5} grad={id("paw")} rotate={-8} />
          </g>
        )}

        {pose === "learning" && (
          <g>
            {/* Open book, cover facing out */}
            <path d="M 98 140 L 160 134 L 162 138 L 100 144 Z" fill={C.page} />
            <path
              d="M 100 142 Q 99 138 103 138 L 157 133 Q 161 133 161 137 L 162 174 Q 162 177 158 177 L 104 180 Q 101 180 101 177 Z"
              fill={`url(#${id("book")})`}
            />
            <path d="M 106 143 L 106 176" stroke={C.bookDark} strokeWidth="2" opacity="0.6" />
            <path d="M 126 163 C 126 151 135 146 143 146 C 143 157 136 164 126 163 Z" fill={C.laptopLogo} />
            <path d="M 128 161 L 139 150" stroke={C.book} strokeWidth="1.2" strokeLinecap="round" />
            <Paw cx={100} cy={162} rx={9} ry={11} grad={id("paw")} rotate={-10} />
            <Paw cx={162} cy={158} rx={9} ry={11} grad={id("paw")} rotate={10} />
          </g>
        )}
      </motion.g>

      {/* Accent marks */}
      {pose === "hero" && (
        <g className={ACCENT_TEAL} stroke="currentColor" strokeWidth="6" strokeLinecap="round">
          <path d="M 146 30 L 142 50" />
          <path d="M 164 52 L 154 62" />
          <path d="M 22 96 L 30 104" />
          <path d="M 18 114 L 28 116" />
        </g>
      )}

      {pose === "happy" && (
        <g className={ACCENT_TEAL} stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
          <path d="M 140 26 L 145 40" />
          <path d="M 160 36 L 154 48" />
          <path d="M 174 56 L 162 60" />
        </g>
      )}

      {pose === "thinking" && (
        <g className={ACCENT_TEAL} stroke="currentColor" fill="none" strokeLinecap="round">
          <path d="M 148 22 C 148 10 170 8 170 21 C 170 30 159 30 159 40" strokeWidth="6" />
          <circle cx="159" cy="51" r="3.4" fill="currentColor" stroke="none" />
        </g>
      )}

      {pose === "helping" && (
        <g className={ACCENT_TEAL} stroke="currentColor" strokeWidth="5.5" strokeLinecap="round">
          <path d="M 162 30 L 154 46" />
          <path d="M 180 50 L 168 58" />
        </g>
      )}

      {pose === "concerned" && (
        <g className={ACCENT_GREY} stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M 142 22 C 152 18 168 18 172 22 C 168 27 150 28 146 24 C 152 32 166 32 168 30 C 164 35 152 36 150 34 C 154 39 162 39 162 38 L 158 44" />
        </g>
      )}

      {pose === "celebrating" && (
        <g strokeLinecap="round">
          <g className={ACCENT_TEAL} stroke="currentColor" strokeWidth="5.5">
            <path d="M 132 22 L 132 36" />
            <path d="M 20 64 L 26 76" />
            <path d="M 172 70 L 182 64" />
            <circle cx="160" cy="96" r="2.8" fill="currentColor" stroke="none" />
            <circle cx="36" cy="40" r="3" fill="currentColor" stroke="none" />
          </g>
          <g stroke={C.confettiYellow} strokeWidth="5">
            <path d="M 156 32 L 152 44" />
            <path d="M 44 54 L 52 58" />
            <circle cx="66" cy="34" r="3" fill={C.confettiYellow} stroke="none" />
            <circle cx="180" cy="88" r="2.6" fill={C.confettiYellow} stroke="none" />
          </g>
        </g>
      )}

      {pose === "learning" && (
        <g>
          <g stroke={C.bulb} strokeWidth="3.2" strokeLinecap="round">
            <path d="M 160 6 L 160 11" />
            <path d="M 144 12 L 147 15" />
            <path d="M 176 12 L 173 15" />
            <path d="M 140 27 L 144 27" />
            <path d="M 180 27 L 176 27" />
          </g>
          <path
            d="M 160 16 C 151 16 146 22 146 29 C 146 34 149 37 152 40 C 153 41 154 43 154 45 L 166 45 C 166 43 167 41 168 40 C 171 37 174 34 174 29 C 174 22 169 16 160 16 Z"
            fill={C.bulb}
          />
          <path d="M 152 25 Q 154 20 159 19" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />
          <path d="M 156 44 L 158 34 L 160 37 L 162 34 L 164 44" stroke="#C98A1E" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          <rect x="154" y="45" width="12" height="7" rx="2" fill={C.bulbBase} />
          <path d="M 156 54 L 164 54" stroke={C.bulbBase} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
