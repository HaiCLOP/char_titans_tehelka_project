"use client";

import React from "react";
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
 * Pure Vector SVG Mascot for CivicSense ("Civi" — Small. Friendly. Always here.)
 * Culturally authentic Kaziranga One-Horned Rhino in soft clay/dumpling aesthetic.
 * Draped in traditional Assamese Gamosa (গামোচা) with authentic red Phool / geometric weave.
 * 7 expressive poses matching the official CivicSense character sheet.
 */
export function CiviSvg({ pose = "hero", className, size = 120 }: CiviSvgProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-label={`CivicSense mascot Civi in ${pose} pose`}
    >
      <defs>
        {/* Soft 3D Volumetric Lighting for Dumpling Body */}
        <linearGradient id="civi-body-base" x1="100" y1="45" x2="100" y2="182" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFDF9" />
          <stop offset="30%" stopColor="#FAF2E8" />
          <stop offset="75%" stopColor="#EEDBC7" />
          <stop offset="100%" stopColor="#DFC3A4" />
        </linearGradient>

        <radialGradient id="civi-top-highlight" cx="100" cy="70" r="65" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>

        {/* Rhino Horn 3D Clay Gradient */}
        <linearGradient id="civi-horn-grad" x1="94" y1="30" x2="106" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF9F0" />
          <stop offset="45%" stopColor="#F5E4CE" />
          <stop offset="100%" stopColor="#D9BA93" />
        </linearGradient>

        {/* Traditional Assamese Gamosa Fabric Gradient */}
        <linearGradient id="civi-gamosa-fabric" x1="50" y1="95" x2="150" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F9F6F0" />
          <stop offset="100%" stopColor="#ECE4D8" />
        </linearGradient>

        {/* Soft Peach Blush */}
        <radialGradient id="civi-blush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F8927C" stopOpacity="0.45" />
          <stop offset="65%" stopColor="#F8927C" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#F8927C" stopOpacity="0" />
        </radialGradient>

        {/* Ambient Floor Contact Shadow */}
        <radialGradient id="civi-floor-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1E1610" stopOpacity="0.22" />
          <stop offset="50%" stopColor="#1E1610" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#1E1610" stopOpacity="0" />
        </radialGradient>

        {/* Laptop Body Gradient */}
        <linearGradient id="civi-laptop-body" x1="100" y1="120" x2="160" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3E474B" />
          <stop offset="100%" stopColor="#22282B" />
        </linearGradient>

        {/* Book Cover Gradient */}
        <linearGradient id="civi-book-cover" x1="75" y1="130" x2="125" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4A756D" />
          <stop offset="100%" stopColor="#2E524C" />
        </linearGradient>
      </defs>

      {/* 1. Floor Drop Shadow */}
      <ellipse cx="100" cy="182" rx="68" ry="10" fill="url(#civi-floor-shadow)" />

      {/* 2. Rhino Horn (Centered upright on top of head) */}
      <g id="civi-horn">
        {/* Soft horn shadow on forehead */}
        <ellipse cx="100" cy="74" rx="10" ry="3.5" fill="#D3B48F" opacity="0.4" />
        {/* Horn Cone */}
        <path
          d="M 92 72 C 93 52, 97 34, 100 28 C 103 34, 107 52, 108 72 C 103 74.5, 97 74.5, 92 72 Z"
          fill="url(#civi-horn-grad)"
        />
        {/* Horn Specular Highlight */}
        <path
          d="M 96 68 C 97 52, 99 38, 100 32 C 100.8 38, 101.5 52, 102 68"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.6"
        />
      </g>

      {/* 3. Main Dumpling/Mochi Body */}
      <g id="civi-body">
        {/* Wide rounded chubby pear contour */}
        <path
          d="M 36 156 
             C 26 130, 42 92, 68 72 
             C 80 62, 120 62, 132 72 
             C 158 92, 174 130, 164 156 
             C 154 177, 46 177, 36 156 Z"
          fill="url(#civi-body-base)"
        />

        {/* Overhead soft lighting overlay */}
        <path
          d="M 36 156 
             C 26 130, 42 92, 68 72 
             C 80 62, 120 62, 132 72 
             C 158 92, 174 130, 164 156 
             C 154 177, 46 177, 36 156 Z"
          fill="url(#civi-top-highlight)"
        />

        {/* Bottom ambient occlusion underbelly */}
        <path
          d="M 40 158 C 70 176, 130 176, 160 158 C 150 174, 50 174, 40 158 Z"
          fill="#CBAE90"
          opacity="0.32"
        />
      </g>

      {/* 4. Authentic Assamese Gamosa (গামোচা) Wrapped Stole */}
      <g id="civi-gamosa">
        {/* Behind-neck collar fold */}
        <path
          d="M 66 82 C 80 93, 120 93, 134 82 C 126 95, 74 95, 66 82 Z"
          fill="#DFD6C8"
        />

        {/* Left shoulder stole drape */}
        <path
          d="M 68 82 C 50 98, 35 125, 43 149 C 47 161, 57 167, 67 169 C 74 170, 77 157, 75 141 C 72 119, 71 97, 68 82 Z"
          fill="url(#civi-gamosa-fabric)"
        />

        {/* Right shoulder stole drape */}
        <path
          d="M 132 82 C 150 98, 165 125, 157 149 C 153 161, 143 167, 133 169 C 126 170, 123 157, 125 141 C 128 119, 129 97, 132 82 Z"
          fill="url(#civi-gamosa-fabric)"
        />

        {/* Traditional Assamese Red Woven Geometric Phool / Borders */}
        {/* Left Gamosa Red Motifs */}
        <g stroke="#C62828" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Main Red Stripe */}
          <path d="M 41 137 C 44 151, 52 161, 63 166" strokeWidth="2.2" />
          <path d="M 44 131 C 47 145, 55 155, 66 160" strokeWidth="1.2" />
          {/* Diamond Weaves (Assamese Geor-Phool) */}
          <path d="M 46 145 L 50 141 L 54 145 L 50 149 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 53 152 L 57 148 L 61 152 L 57 156 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 60 159 L 64 155 L 68 159 L 64 163 Z" fill="#C62828" strokeWidth="0.5" />
          {/* Hanging Fringes / Tassels */}
          <line x1="63" y1="167" x2="62" y2="173" strokeWidth="1.2" />
          <line x1="66" y1="168" x2="65" y2="174" strokeWidth="1.2" />
          <line x1="69" y1="168" x2="69" y2="174" strokeWidth="1.2" />
        </g>

        {/* Right Gamosa Red Motifs */}
        <g stroke="#C62828" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Main Red Stripe */}
          <path d="M 159 137 C 156 151, 148 161, 137 166" strokeWidth="2.2" />
          <path d="M 156 131 C 153 145, 145 155, 134 160" strokeWidth="1.2" />
          {/* Diamond Weaves (Assamese Geor-Phool) */}
          <path d="M 154 145 L 150 141 L 146 145 L 150 149 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 147 152 L 143 148 L 139 152 L 143 156 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 140 159 L 136 155 L 132 159 L 136 163 Z" fill="#C62828" strokeWidth="0.5" />
          {/* Hanging Fringes / Tassels */}
          <line x1="137" y1="167" x2="138" y2="173" strokeWidth="1.2" />
          <line x1="134" y1="168" x2="135" y2="174" strokeWidth="1.2" />
          <line x1="131" y1="168" x2="131" y2="174" strokeWidth="1.2" />
        </g>
      </g>

      {/* 5. Sweet Peach Cheek Blush */}
      <circle cx="68" cy="122" r="9" fill="url(#civi-blush)" />
      <circle cx="132" cy="122" r="9" fill="url(#civi-blush)" />

      {/* ======================================================== */}
      {/* 6. POSE SPECIFIC FACIAL EXPRESSIONS & ACCESSORIES         */}
      {/* ======================================================== */}

      {/* 1. HERO POSE */}
      {pose === "hero" && (
        <g id="pose-hero">
          {/* Glossy Black Vertical Bead Eyes */}
          <ellipse cx="80" cy="112" rx="6" ry="8.5" fill="#1A1C1E" />
          <circle cx="78" cy="109" r="2.4" fill="#FFFFFF" />
          <circle cx="82" cy="115" r="1.1" fill="#FFFFFF" opacity="0.8" />

          <ellipse cx="120" cy="112" rx="6" ry="8.5" fill="#1A1C1E" />
          <circle cx="118" cy="109" r="2.4" fill="#FFFFFF" />
          <circle cx="122" cy="115" r="1.1" fill="#FFFFFF" opacity="0.8" />

          {/* Gentle Cute Smile */}
          <path
            d="M 94 122 Q 100 127 106 122"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Resting Chubby Front Paws */}
          <ellipse cx="88" cy="162" rx="7.5" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
          <ellipse cx="112" cy="162" rx="7.5" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />

          {/* Signature 3 Teal Action Energy Ticks (from reference) */}
          <g stroke="#3D7E73" strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M 28 90 C 31 88, 35 92, 37 98" />
            <path d="M 24 102 C 28 102, 31 106, 32 112" />
            <path d="M 166 72 C 168 68, 172 66, 178 68" />
            <path d="M 172 82 C 176 80, 180 82, 184 86" />
          </g>
        </g>
      )}

      {/* 2. HAPPY POSE */}
      {pose === "happy" && (
        <g id="pose-happy">
          {/* Curved Happy Inverted Eyes ^ ^ */}
          <path
            d="M 72 114 Q 80 104 88 114"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
          <path
            d="M 112 114 Q 120 104 128 114"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="3.4"
            strokeLinecap="round"
          />

          {/* Open Joyful Mouth with Pink Tongue */}
          <path
            d="M 93 121 Q 100 134 107 121 Z"
            fill="#1A1C1E"
          />
          <path
            d="M 95 125 Q 100 133 105 125 Z"
            fill="#FF728B"
          />

          {/* Resting Paws */}
          <ellipse cx="86" cy="162" rx="7.5" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
          <ellipse cx="114" cy="162" rx="7.5" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />

          {/* Joy Sparks Radiating Above Head */}
          <g stroke="#3D7E73" strokeWidth="3" strokeLinecap="round" fill="none">
            <line x1="100" y1="16" x2="100" y2="23" />
            <line x1="116" y1="20" x2="112" y2="26" />
            <line x1="84" y1="20" x2="88" y2="26" />
          </g>
        </g>
      )}

      {/* 3. THINKING POSE */}
      {pose === "thinking" && (
        <g id="pose-thinking">
          {/* Curious bead eye */}
          <ellipse cx="80" cy="112" rx="5.8" ry="8" fill="#1A1C1E" />
          <circle cx="78.5" cy="109" r="2.2" fill="#FFFFFF" />

          {/* Winking eye > */}
          <path
            d="M 114 116 L 121 111 L 126 116"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Pondering tilted mouth */}
          <path
            d="M 96 124 Q 100 126 104 123"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Cute paw resting on chin */}
          <ellipse cx="106" cy="138" rx="8" ry="6" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />

          {/* Floating Teal Question Mark ? */}
          <g transform="translate(140, 34)">
            <path
              d="M 6 16 C 6 7, 19 4, 19 14 C 19 20, 12 21, 12 26"
              fill="none"
              stroke="#3D7E73"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <circle cx="12" cy="34" r="3" fill="#3D7E73" />
          </g>
        </g>
      )}

      {/* 4. HELPING POSE */}
      {pose === "helping" && (
        <g id="pose-helping">
          {/* Focused happy bead eyes */}
          <ellipse cx="80" cy="112" rx="5.5" ry="8" fill="#1A1C1E" />
          <circle cx="78.5" cy="109" r="2.2" fill="#FFFFFF" />

          <ellipse cx="120" cy="112" rx="5.5" ry="8" fill="#1A1C1E" />
          <circle cx="118.5" cy="109" r="2.2" fill="#FFFFFF" />

          {/* Confident smile */}
          <path
            d="M 95 122 Q 100 126.5 105 122"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Mini Laptop */}
          <g id="civi-laptop">
            {/* Screen Lid */}
            <path
              d="M 106 114 L 158 108 L 154 154 L 102 160 Z"
              fill="url(#civi-laptop-body)"
              stroke="#1A1E20"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Soft Screen Glow */}
            <path
              d="M 109 117 L 155 111 L 151 151 L 105 157 Z"
              fill="#E3ECE9"
              opacity="0.9"
            />
            {/* CivicSense Leaf Emblem on Lid */}
            <path
              d="M 131 129 C 137 125, 142 127, 140 134 C 136 136, 130 134, 131 129 Z"
              fill="#3D7E73"
            />
            {/* Keyboard base */}
            <path
              d="M 94 160 L 150 154 L 160 172 L 100 178 Z"
              fill="#22282B"
              stroke="#1A1E20"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Typing paws */}
            <ellipse cx="104" cy="164" rx="6.5" ry="5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
            <ellipse cx="138" cy="158" rx="6.5" ry="5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
          </g>
        </g>
      )}

      {/* 5. CONCERNED POSE */}
      {pose === "concerned" && (
        <g id="pose-concerned">
          {/* Tilted sad almond bead eyes */}
          <ellipse cx="81" cy="115" rx="5.8" ry="8" fill="#1A1C1E" transform="rotate(12 81 115)" />
          <circle cx="79.5" cy="113" r="2.2" fill="#FFFFFF" />

          <ellipse cx="119" cy="115" rx="5.8" ry="8" fill="#1A1C1E" transform="rotate(-12 119 115)" />
          <circle cx="117.5" cy="113" r="2.2" fill="#FFFFFF" />

          {/* Sad downturned eyebrows */}
          <path d="M 74 104 L 85 107" stroke="#1A1C1E" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M 126 104 L 115 107" stroke="#1A1C1E" strokeWidth="2.4" strokeLinecap="round" />

          {/* Quivering downturned mouth */}
          <path
            d="M 95 127 Q 100 123 105 127"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Worry Squiggle above head (from reference) */}
          <g stroke="#566266" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path d="M 124 50 C 128 46, 136 46, 138 52 C 140 56, 132 60, 128 62 C 134 64, 140 66, 138 72" />
          </g>

          {/* Paws held closely together in worry */}
          <ellipse cx="93" cy="158" rx="7" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
          <ellipse cx="107" cy="158" rx="7" ry="5.5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
        </g>
      )}

      {/* 6. CELEBRATING POSE */}
      {pose === "celebrating" && (
        <g id="pose-celebrating">
          {/* Joyful closed eyes > < */}
          <path
            d="M 73 111 L 82 116 L 73 121"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 127 111 L 118 116 L 127 121"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Big cheering open mouth with tongue */}
          <path
            d="M 92 120 Q 100 136 108 120 Z"
            fill="#1A1C1E"
          />
          <path
            d="M 94 125 Q 100 135 106 125 Z"
            fill="#FF728B"
          />

          {/* Raised paws in victory! */}
          <ellipse cx="48" cy="118" rx="8.5" ry="7" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" transform="rotate(-30 48 118)" />
          <ellipse cx="152" cy="118" rx="8.5" ry="7" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" transform="rotate(30 152 118)" />

          {/* Festive Colorful Confetti & Joy Particles (from reference) */}
          <path d="M 42 80 L 47 72" stroke="#3D7E73" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M 62 54 L 66 46" stroke="#3D7E73" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="138" cy="52" r="3.2" fill="#F59E0B" />
          <circle cx="162" cy="74" r="3.5" fill="#F59E0B" />
          <path d="M 152 90 L 159 86" stroke="#EA580C" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="46" cy="96" r="2.8" fill="#EA580C" />
        </g>
      )}

      {/* 7. LEARNING POSE */}
      {pose === "learning" && (
        <g id="pose-learning">
          {/* Studious bead eyes looking down at book */}
          <ellipse cx="80" cy="114" rx="5.5" ry="7.5" fill="#1A1C1E" />
          <circle cx="79" cy="112" r="2" fill="#FFFFFF" />

          <ellipse cx="120" cy="114" rx="5.5" ry="7.5" fill="#1A1C1E" />
          <circle cx="119" cy="112" r="2" fill="#FFFFFF" />

          {/* Little calm reading smile */}
          <path
            d="M 96 123 Q 100 126 104 123"
            fill="none"
            stroke="#1A1C1E"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Open Book */}
          <g id="civi-book">
            {/* Left page */}
            <path
              d="M 100 168 L 72 160 L 75 138 L 100 144 Z"
              fill="url(#civi-book-cover)"
              stroke="#213B36"
              strokeWidth="1.2"
            />
            {/* Right page */}
            <path
              d="M 100 168 L 128 160 L 125 138 L 100 144 Z"
              fill="url(#civi-book-cover)"
              stroke="#213B36"
              strokeWidth="1.2"
            />
            {/* White pages inside */}
            <path
              d="M 99 166 L 74 159 L 77 140 L 99 146 Z"
              fill="#F4F8F6"
            />
            <path
              d="M 101 166 L 126 159 L 123 140 L 101 146 Z"
              fill="#F4F8F6"
            />
            {/* Leaf Emblem on Right Page */}
            <path
              d="M 112 148 C 116 145, 120 147, 118 152 C 115 153, 111 152, 112 148 Z"
              fill="#3D7E73"
            />
            {/* Paws holding the book */}
            <ellipse cx="73" cy="154" rx="6.5" ry="5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
            <ellipse cx="127" cy="154" rx="6.5" ry="5" fill="#FAF1E6" stroke="#D9C2AA" strokeWidth="1" />
          </g>

          {/* Floating Insight Lightbulb above head */}
          <g transform="translate(138, 30)">
            <circle cx="14" cy="14" r="8" fill="#FBBF24" opacity="0.9" />
            <path
              d="M 10 18 L 18 18 L 16 23 L 12 23 Z"
              fill="#78716C"
            />
            {/* Filament */}
            <path
              d="M 12 14 Q 14 10 16 14"
              stroke="#FFFFFF"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            {/* Glow rays */}
            <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
              <line x1="14" y1="2" x2="14" y2="4" />
              <line x1="23" y1="6" x2="21" y2="8" />
              <line x1="5" y1="6" x2="7" y2="8" />
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}
