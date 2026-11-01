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
 * Pure Vector SVG Mascot for CivicSense — Handcrafted from the official Assam Rhino reference.
 * Features:
 * - One-horned Kaziranga rhino silhouette with warm mochi/ivory curves
 * - Authentic Assamese Gamosa (গামোচা) with traditional red geometric woven borders
 * - 7 expressive, culturally authentic poses (Hero, Happy, Thinking, Helping, Concerned, Celebrating, Learning)
 * - 100% scalable vector SVG with zero external dependencies
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
        {/* Soft 3D Body Lighting */}
        <linearGradient id="civi-body-grad" x1="60" y1="40" x2="140" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFDF9" />
          <stop offset="35%" stopColor="#FAF1E6" />
          <stop offset="80%" stopColor="#EEDBC7" />
          <stop offset="100%" stopColor="#DFC8B0" />
        </linearGradient>

        {/* Rhino Horn Gradient */}
        <linearGradient id="civi-horn-grad" x1="94" y1="35" x2="108" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF4E6" />
          <stop offset="50%" stopColor="#F0DCBE" />
          <stop offset="100%" stopColor="#DEC29F" />
        </linearGradient>

        {/* Gamosa Fabric Gradient */}
        <linearGradient id="civi-gamosa-grad" x1="60" y1="95" x2="140" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F9F6F0" />
          <stop offset="100%" stopColor="#EFE8DE" />
        </linearGradient>

        {/* Cheek Blush Radial Gradient */}
        <radialGradient id="civi-blush" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F89D88" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#F89D88" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#F89D88" stopOpacity="0" />
        </radialGradient>

        {/* Shadow under feet/body */}
        <radialGradient id="civi-drop-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.16" />
          <stop offset="60%" stopColor="#000000" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Dark Laptop Body */}
        <linearGradient id="civi-laptop-grad" x1="100" y1="130" x2="150" y2="175" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3F484D" />
          <stop offset="100%" stopColor="#242B2E" />
        </linearGradient>

        {/* Green Book Cover */}
        <linearGradient id="civi-book-grad" x1="75" y1="130" x2="125" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4E7E74" />
          <stop offset="100%" stopColor="#335A52" />
        </linearGradient>

        {/* Lightbulb Glow */}
        <radialGradient id="civi-bulb-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#F59E0B" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient Drop Shadow on Floor */}
      <ellipse cx="100" cy="184" rx="66" ry="9" fill="url(#civi-drop-shadow)" />

      {/* Rhino Horn (Slightly tilted cone behind or on top of head) */}
      <g id="civi-horn">
        <path
          d="M 92 78 C 93 58, 97 38, 100 32 C 103 38, 107 58, 108 78 C 103 80, 97 80, 92 78 Z"
          fill="url(#civi-horn-grad)"
        />
        {/* Horn subtle 3D highlight */}
        <path
          d="M 96 74 C 97 58, 99 44, 100 36 C 101 44, 102 58, 103 74"
          stroke="#FFFFFF"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* Main Chubby Dumpling Body */}
      <g id="civi-body">
        {/* Soft rounded pear/dome contour */}
        <path
          d="M 38 158 
             C 28 135, 42 98, 66 78 
             C 80 66, 120 66, 134 78 
             C 158 98, 172 135, 162 158 
             C 152 178, 48 178, 38 158 Z"
          fill="url(#civi-body-grad)"
        />

        {/* Bottom subtle ambient occlusion shading */}
        <path
          d="M 42 160 C 70 178, 130 178, 158 160 C 150 175, 50 175, 42 160 Z"
          fill="#D6BFA7"
          opacity="0.35"
        />
      </g>

      {/* Traditional Assamese Gamosa (গামোচা) Wrapped Around Shoulders */}
      <g id="civi-gamosa">
        {/* Base White Scarf Fabric */}
        {/* Left shoulder drape */}
        <path
          d="M 68 84 C 50 100, 36 126, 44 150 C 48 162, 58 168, 68 170 C 75 171, 78 158, 76 142 C 73 120, 72 98, 68 84 Z"
          fill="url(#civi-gamosa-grad)"
        />
        {/* Right shoulder drape */}
        <path
          d="M 132 84 C 150 100, 164 126, 156 150 C 152 162, 142 168, 132 170 C 125 171, 122 158, 124 142 C 127 120, 128 98, 132 84 Z"
          fill="url(#civi-gamosa-grad)"
        />
        {/* Back collar drape */}
        <path
          d="M 66 84 C 80 94, 120 94, 134 84 C 126 98, 74 98, 66 84 Z"
          fill="#E8DFD3"
        />

        {/* Traditional Assamese Red Woven Geometric Patterns ("Kalka" / Diamond Borders) */}
        {/* Left Gamosa Red Stripes & Diamond Motif */}
        <g stroke="#C62828" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Outer red edge line */}
          <path d="M 42 138 C 45 152, 53 162, 64 167" strokeWidth="2.2" />
          <path d="M 45 132 C 48 146, 56 156, 67 161" strokeWidth="1.2" />
          {/* Traditional Diamond Cross Weaves on left end */}
          <path d="M 47 146 L 51 142 L 55 146 L 51 150 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 54 153 L 58 149 L 62 153 L 58 157 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 61 160 L 65 156 L 69 160 L 65 164 Z" fill="#C62828" strokeWidth="0.5" />
          {/* Fringe threads at tip */}
          <line x1="64" y1="168" x2="63" y2="173" strokeWidth="1" />
          <line x1="67" y1="169" x2="66" y2="174" strokeWidth="1" />
          <line x1="70" y1="169" x2="70" y2="174" strokeWidth="1" />
        </g>

        {/* Right Gamosa Red Stripes & Diamond Motif */}
        <g stroke="#C62828" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Outer red edge line */}
          <path d="M 158 138 C 155 152, 147 162, 136 167" strokeWidth="2.2" />
          <path d="M 155 132 C 152 146, 144 156, 133 161" strokeWidth="1.2" />
          {/* Traditional Diamond Cross Weaves on right end */}
          <path d="M 153 146 L 149 142 L 145 146 L 149 150 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 146 153 L 142 149 L 138 153 L 142 157 Z" fill="#C62828" strokeWidth="0.5" />
          <path d="M 139 160 L 135 156 L 131 160 L 135 164 Z" fill="#C62828" strokeWidth="0.5" />
          {/* Fringe threads at tip */}
          <line x1="136" y1="168" x2="137" y2="173" strokeWidth="1" />
          <line x1="133" y1="169" x2="134" y2="174" strokeWidth="1" />
          <line x1="130" y1="169" x2="130" y2="174" strokeWidth="1" />
        </g>
      </g>

      {/* Cheeks Blush (Applies to all poses) */}
      <circle cx="70" cy="125" r="9" fill="url(#civi-blush)" />
      <circle cx="130" cy="125" r="9" fill="url(#civi-blush)" />

      {/* ======================================================== */}
      {/* POSE-SPECIFIC FACIAL EXPRESSIONS & PROPS                  */}
      {/* ======================================================== */}

      {/* 1. HERO / DEFAULT / IDLE POSE */}
      {pose === "hero" && (
        <g id="pose-hero">
          {/* Big glossy black eyes */}
          <ellipse cx="82" cy="114" rx="5.5" ry="8" fill="#181A1C" />
          <circle cx="80" cy="111" r="2.2" fill="#FFFFFF" />
          <circle cx="83.5" cy="116.5" r="1.1" fill="#FFFFFF" opacity="0.8" />

          <ellipse cx="118" cy="114" rx="5.5" ry="8" fill="#181A1C" />
          <circle cx="116" cy="111" r="2.2" fill="#FFFFFF" />
          <circle cx="119.5" cy="116.5" r="1.1" fill="#FFFFFF" opacity="0.8" />

          {/* Gentle happy smile */}
          <path
            d="M 95 124 Q 100 128.5 105 124"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Three green energetic curved dashes (from reference) */}
          <g stroke="#3D7E73" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M 28 92 C 32 90, 36 94, 38 100" />
            <path d="M 24 104 C 28 104, 32 108, 33 114" />
            <path d="M 166 74 C 168 70, 172 68, 178 70" />
            <path d="M 172 84 C 176 82, 180 84, 184 88" />
          </g>
        </g>
      )}

      {/* 2. HAPPY POSE */}
      {pose === "happy" && (
        <g id="pose-happy">
          {/* Inverted arc closed happy eyes ^ ^ */}
          <path
            d="M 74 116 Q 82 106 90 116"
            fill="none"
            stroke="#181A1C"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M 110 116 Q 118 106 126 116"
            fill="none"
            stroke="#181A1C"
            strokeWidth="3.2"
            strokeLinecap="round"
          />

          {/* Open smiling mouth with tongue */}
          <path
            d="M 94 122 Q 100 134 106 122 Z"
            fill="#181A1C"
          />
          <path
            d="M 96 126 Q 100 133 104 126 Q 100 124 96 126 Z"
            fill="#FF748E"
          />

          {/* Joy burst dashes radiating around horn */}
          <g stroke="#3D7E73" strokeWidth="2.8" strokeLinecap="round" fill="none">
            <line x1="100" y1="18" x2="100" y2="25" />
            <line x1="114" y1="22" x2="110" y2="28" />
            <line x1="86" y1="22" x2="90" y2="28" />
          </g>

          {/* Front cute resting paws */}
          <ellipse cx="86" cy="162" rx="7" ry="5.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
          <ellipse cx="114" cy="162" rx="7" ry="5.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
        </g>
      )}

      {/* 3. THINKING POSE */}
      {pose === "thinking" && (
        <g id="pose-thinking">
          {/* Left curious eye looking up */}
          <ellipse cx="82" cy="114" rx="5.5" ry="7.5" fill="#181A1C" />
          <circle cx="81" cy="111" r="2.2" fill="#FFFFFF" />

          {/* Right winking eye > */}
          <path
            d="M 113 118 L 120 113 L 125 118"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Small pondering mouth */}
          <path
            d="M 97 125 Q 101 127 104 125"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Little mochi paw touching chin */}
          <ellipse cx="108" cy="142" rx="7.5" ry="6" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />

          {/* Floating Teal Question Mark ? */}
          <g transform="translate(142, 38)">
            <path
              d="M 6 16 C 6 8, 18 4, 18 14 C 18 20, 12 21, 12 26"
              fill="none"
              stroke="#3D7E73"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="34" r="2.8" fill="#3D7E73" />
          </g>
        </g>
      )}

      {/* 4. HELPING POSE (With Laptop) */}
      {pose === "helping" && (
        <g id="pose-helping">
          {/* Cheerful focused eyes */}
          <ellipse cx="82" cy="114" rx="5.2" ry="7.5" fill="#181A1C" />
          <circle cx="80" cy="111.5" r="2.2" fill="#FFFFFF" />

          <ellipse cx="118" cy="114" rx="5.2" ry="7.5" fill="#181A1C" />
          <circle cx="116" cy="111.5" r="2.2" fill="#FFFFFF" />

          {/* Focused happy smile */}
          <path
            d="M 96 123 Q 100 127 104 123"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Open Mini Laptop in front */}
          <g id="civi-laptop">
            {/* Screen lid tilted */}
            <path
              d="M 108 116 L 158 110 L 154 154 L 104 160 Z"
              fill="url(#civi-laptop-grad)"
              stroke="#1C2022"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* Screen glow inside */}
            <path
              d="M 111 119 L 155 113 L 151 151 L 107 157 Z"
              fill="#E2EDEA"
              opacity="0.9"
            />
            {/* Little Civic Leaf logo on laptop lid */}
            <path
              d="M 132 131 C 137 127, 142 129, 140 136 C 136 138, 130 136, 132 131 Z"
              fill="#3D7E73"
            />
            {/* Keyboard base resting flat */}
            <path
              d="M 96 160 L 150 154 L 160 172 L 102 178 Z"
              fill="#242B2E"
              stroke="#1C2022"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Cute paws typing on keyboard */}
            <ellipse cx="106" cy="164" rx="6" ry="4.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
            <ellipse cx="138" cy="158" rx="6" ry="4.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
          </g>
        </g>
      )}

      {/* 5. CONCERNED POSE */}
      {pose === "concerned" && (
        <g id="pose-concerned">
          {/* Drooped worried eyes with inner tilt */}
          <ellipse cx="83" cy="117" rx="5.5" ry="7.5" fill="#181A1C" transform="rotate(10 83 117)" />
          <circle cx="81.5" cy="115" r="2" fill="#FFFFFF" />

          <ellipse cx="117" cy="117" rx="5.5" ry="7.5" fill="#181A1C" transform="rotate(-10 117 117)" />
          <circle cx="115.5" cy="115" r="2" fill="#FFFFFF" />

          {/* Worried eyebrows angled up toward center */}
          <path d="M 77 106 L 87 109" stroke="#181A1C" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M 123 106 L 113 109" stroke="#181A1C" strokeWidth="2.2" strokeLinecap="round" />

          {/* Quivering downturned mouth */}
          <path
            d="M 96 128 Q 100 124 104 128"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Little Worry squiggles above head */}
          <g stroke="#566266" strokeWidth="2" strokeLinecap="round" fill="none">
            <path d="M 122 52 C 126 48, 134 48, 136 54 C 138 58, 130 62, 126 64 C 132 66, 138 68, 136 74" />
          </g>

          {/* Paws held closely together */}
          <ellipse cx="94" cy="158" rx="6.5" ry="5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
          <ellipse cx="106" cy="158" rx="6.5" ry="5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
        </g>
      )}

      {/* 6. CELEBRATING POSE */}
      {pose === "celebrating" && (
        <g id="pose-celebrating">
          {/* Joyful closed eyes > < */}
          <path
            d="M 75 112 L 83 117 L 75 122"
            fill="none"
            stroke="#181A1C"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 125 112 L 117 117 L 125 122"
            fill="none"
            stroke="#181A1C"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Big cheering open mouth with tongue */}
          <path
            d="M 93 121 Q 100 136 107 121 Z"
            fill="#181A1C"
          />
          <path
            d="M 95 126 Q 100 135 105 126 Z"
            fill="#FF748E"
          />

          {/* Chubby paws raised up in victory! */}
          <ellipse cx="50" cy="120" rx="8" ry="6.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" transform="rotate(-30 50 120)" />
          <ellipse cx="150" cy="120" rx="8" ry="6.5" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" transform="rotate(30 150 120)" />

          {/* Festive colorful confetti & joy sparkles bursting around */}
          {/* Teal joy bars */}
          <path d="M 44 82 L 48 74" stroke="#3D7E73" strokeWidth="3" strokeLinecap="round" />
          <path d="M 64 56 L 68 48" stroke="#3D7E73" strokeWidth="3" strokeLinecap="round" />
          {/* Amber/Gold celebration dots */}
          <circle cx="138" cy="54" r="3" fill="#F59E0B" />
          <circle cx="160" cy="76" r="3.2" fill="#F59E0B" />
          {/* Coral celebration confetti */}
          <path d="M 152 92 L 158 88" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="98" r="2.5" fill="#EA580C" />
        </g>
      )}

      {/* 7. LEARNING POSE (With Book & Lightbulb) */}
      {pose === "learning" && (
        <g id="pose-learning">
          {/* Curious eyes looking up from book */}
          <ellipse cx="82" cy="112" rx="5.2" ry="7.5" fill="#181A1C" />
          <circle cx="80" cy="109" r="2.2" fill="#FFFFFF" />

          <ellipse cx="118" cy="112" rx="5.2" ry="7.5" fill="#181A1C" />
          <circle cx="116" cy="109" r="2.2" fill="#FFFFFF" />

          {/* Pleased smile */}
          <path
            d="M 96 122 Q 100 126 104 122"
            fill="none"
            stroke="#181A1C"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Glowing Idea Lightbulb Floating Overhead */}
          <g id="civi-lightbulb" transform="translate(142, 28)">
            {/* Glow circle */}
            <circle cx="12" cy="14" r="16" fill="url(#civi-bulb-glow)" />
            {/* Bulb glass */}
            <path
              d="M 6 12 C 6 6, 18 6, 18 12 C 18 16, 15 18, 15 21 L 9 21 C 9 18, 6 16, 6 12 Z"
              fill="#FBBF24"
              stroke="#D97706"
              strokeWidth="1.2"
            />
            {/* Bulb base */}
            <rect x="9" y="21" width="6" height="3.5" rx="1" fill="#78716C" />
            {/* Radiating rays */}
            <g stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round">
              <line x1="12" y1="2" x2="12" y2="4.5" />
              <line x1="22" y1="7" x2="20" y2="9" />
              <line x1="2" y1="7" x2="4" y2="9" />
            </g>
          </g>

          {/* Open Handbook in front */}
          <g id="civi-book" transform="translate(68, 134)">
            {/* Left page */}
            <path
              d="M 32 14 C 22 10, 8 12, 0 16 L 2 44 C 10 40, 24 38, 32 42 Z"
              fill="url(#civi-book-grad)"
              stroke="#24423C"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Right page */}
            <path
              d="M 32 14 C 42 10, 56 12, 64 16 L 62 44 C 54 40, 40 38, 32 42 Z"
              fill="url(#civi-book-grad)"
              stroke="#24423C"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* White pages block inside */}
            <path
              d="M 32 16 C 24 12, 12 14, 4 18 L 4 41 C 12 37, 24 36, 32 39 C 40 36, 52 37, 60 41 L 60 18 C 52 14, 40 12, 32 16 Z"
              fill="#F4EFEB"
            />
            {/* Leaf motif on cover */}
            <path
              d="M 32 24 C 35 21, 38 23, 37 27 C 34 28, 30 27, 32 24 Z"
              fill="#3D7E73"
            />
            {/* Paws holding book sides */}
            <ellipse cx="6" cy="30" rx="5" ry="4" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
            <ellipse cx="58" cy="30" rx="5" ry="4" fill="#FAF1E6" stroke="#DBC5AD" strokeWidth="1" />
          </g>
        </g>
      )}
    </svg>
  );
}
