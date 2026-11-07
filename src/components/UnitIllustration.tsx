import React from 'react';

interface UnitIllustrationProps {
  variant?: 'standard' | 'deluxe' | 'suite' | 'family' | 'single' | 'kitchen' | 'bath' | 'balcony';
  className?: string;
}

export const UnitIllustration: React.FC<UnitIllustrationProps> = ({
  variant = 'deluxe',
  className = 'w-full h-full',
}) => {
  const palettes: Record<string, { wall: string; floor: string; accent: string; wood: string; light: string; window: string }> = {
    standard: {
      wall: '#EAE6DF',
      floor: '#C8B69E',
      accent: '#6F8F79',
      wood: '#8C6747',
      light: '#FFFDF7',
      window: '#DCEEF2',
    },
    deluxe: {
      wall: '#E5DFD5',
      floor: '#B89B78',
      accent: '#4F6F5B',
      wood: '#6E4F35',
      light: '#FFF7E0',
      window: '#D4E9E2',
    },
    suite: {
      wall: '#DFDBD2',
      floor: '#A48767',
      accent: '#3E5B49',
      wood: '#5A3E28',
      light: '#FFF9E6',
      window: '#CBE4DE',
    },
    family: {
      wall: '#ECE8E1',
      floor: '#C2A887',
      accent: '#5C7E67',
      wood: '#7A583B',
      light: '#FFFDF5',
      window: '#D8EFEA',
    },
    single: {
      wall: '#EFECE6',
      floor: '#D1C0A8',
      accent: '#7D9B87',
      wood: '#947153',
      light: '#FFFFFF',
      window: '#E2F2EE',
    },
    kitchen: {
      wall: '#E8ECE9',
      floor: '#BFA588',
      accent: '#4D6B58',
      wood: '#6B4E35',
      light: '#FFFDF7',
      window: '#D6EBE4',
    },
    bath: {
      wall: '#E3EAE6',
      floor: '#CBD4CE',
      accent: '#597A66',
      wood: '#785A40',
      light: '#FFFFFF',
      window: '#DCF0EA',
    },
    balcony: {
      wall: '#E4E9E5',
      floor: '#B59B7E',
      accent: '#4A7058',
      wood: '#664930',
      light: '#FFF9E8',
      window: '#C4E6DC',
    },
  };

  const p = palettes[variant] || palettes.deluxe;

  return (
    <svg
      viewBox="0 0 400 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={` object-cover select-none ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Back Wall */}
      <rect width="400" height="190" fill={p.wall} />
      {/* Left Wall perspective */}
      <polygon points="0,0 65,30 65,185 0,225" fill="#D8D2C7" opacity="0.65" />
      {/* Right Wall perspective */}
      <polygon points="400,0 335,30 335,185 400,225" fill="#CFC8BC" opacity="0.55" />
      {/* Ceiling */}
      <polygon points="0,0 400,0 335,30 65,30" fill="#F7F5F0" />
      {/* Hardwood Floor */}
      <polygon points="65,185 335,185 400,260 0,260" fill={p.floor} />
      {/* Floor plank lines */}
      <line x1="110" y1="185" x2="60" y2="260" stroke={p.wood} strokeOpacity="0.2" strokeWidth="1" />
      <line x1="165" y1="185" x2="140" y2="260" stroke={p.wood} strokeOpacity="0.2" strokeWidth="1" />
      <line x1="220" y1="185" x2="220" y2="260" stroke={p.wood} strokeOpacity="0.2" strokeWidth="1" />
      <line x1="275" y1="185" x2="300" y2="260" stroke={p.wood} strokeOpacity="0.2" strokeWidth="1" />

      {/* Warm Ceiling Cove Lighting */}
      <rect x="85" y="28" width="230" height="4" rx="2" fill={p.light} />
      <ellipse cx="200" cy="36" rx="115" ry="14" fill={p.light} opacity="0.45" />

      {/* Large Architectural Window on Left/Back */}
      <rect x="78" y="46" width="64" height="118" rx="3" fill={p.window} stroke={p.wood} strokeWidth="3" />
      {/* Outside Greenery Hint */}
      <circle cx="105" cy="115" r="22" fill="#88B397" opacity="0.45" />
      <circle cx="125" cy="100" r="18" fill="#A5CCA8" opacity="0.5" />
      <line x1="110" y1="46" x2="110" y2="164" stroke={p.wood} strokeWidth="2" />
      <line x1="78" y1="105" x2="142" y2="105" stroke={p.wood} strokeWidth="2" />
      {/* Sheer Curtain */}
      <rect x="134" y="44" width="14" height="126" fill="#FAF8F5" opacity="0.8" />

      {/* Framed Botanical Wall Art */}
      <rect x="195" y="54" width="58" height="44" rx="2" fill="#FAF8F4" stroke={p.wood} strokeWidth="2.5" />
      <rect x="203" y="61" width="42" height="30" fill="#DCE6DF" />
      <path d="M214 85 C218 72, 230 68, 236 64" stroke={p.accent} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="228" cy="72" r="6" fill="#B5D6B2" />

      {/* Area Rug */}
      <polygon points="95,205 315,205 348,252 62,252" fill="#F2EFE9" />
      <polygon points="103,210 307,210 336,247 74,247" fill="#E6E1D6" />

      {/* Headboard & Upholstered Bed */}
      <rect x="156" y="114" width="136" height="58" rx="4" fill={p.wood} />
      <rect x="164" y="120" width="120" height="46" rx="3" fill="#D5CEC2" />
      {/* Pillows */}
      <rect x="172" y="136" width="48" height="22" rx="5" fill="#FFFFFF" />
      <rect x="228" y="136" width="48" height="22" rx="5" fill="#FFFFFF" />
      <rect x="180" y="142" width="34" height="16" rx="4" fill={p.accent} opacity="0.85" />
      <rect x="236" y="142" width="34" height="16" rx="4" fill={p.accent} opacity="0.85" />

      {/* Mattress & Duvet */}
      <rect x="148" y="156" width="152" height="48" rx="6" fill="#FAF8F5" />
      {/* Sage / Olive Throw Blanket at foot of bed */}
      <rect x="148" y="176" width="152" height="24" rx="4" fill={p.accent} />
      {/* Bed Frame Base */}
      <rect x="144" y="198" width="160" height="12" rx="2" fill={p.wood} />
      <rect x="152" y="210" width="8" height="12" fill={p.wood} />
      <rect x="288" y="210" width="8" height="12" fill={p.wood} />

      {/* Nightstand & Warm Lamp (Right) */}
      <rect x="304" y="168" width="28" height="34" rx="2" fill={p.wood} />
      <rect x="313" y="146" width="10" height="22" rx="2" fill="#D8C3A5" />
      <polygon points="306,148 330,148 325,132 311,132" fill={p.light} />
      <circle cx="318" cy="145" r="18" fill="#FFEFA6" opacity="0.35" />

      {/* Indoor Monstera Plant (Left foreground) */}
      <rect x="52" y="176" width="24" height="28" rx="4" fill="#D9CFC1" />
      <ellipse cx="64" cy="162" rx="14" ry="18" fill={p.accent} />
      <ellipse cx="54" cy="168" rx="12" ry="14" fill="#3D5A47" />
      <ellipse cx="74" cy="166" rx="11" ry="15" fill="#688F74" />
    </svg>
  );
};

interface AvatarIllustrationProps {
  name: string;
  bg?: string;
  className?: string;
}

export const AvatarBadge: React.FC<AvatarIllustrationProps> = ({
  name,
  bg = '#D9F2E4',
  className = 'w-9 h-9',
}) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Deterministic warm/natural portrait illustration per name
  const seed = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const skinTones = ['#F2C6A0', '#E0AC82', '#C68B59', '#F5D0B5', '#8D5524'];
  const hairTones = ['#2C221E', '#4A3728', '#784F33', '#1A1A1A', '#9A6B41'];
  const shirtTones = ['#2E4F3E', '#3A6B52', '#1E3A2F', '#52796F', '#354F52'];

  const skin = skinTones[seed % skinTones.length];
  const hair = hairTones[(seed + 2) % hairTones.length];
  const shirt = shirtTones[(seed + 1) % shirtTones.length];

  return (
    <div
      className={`relative rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-[#E2ECE7] ${className}`}
      style={{ backgroundColor: bg }}
      title={name}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" fill={bg} />
        {/* Shoulders / Collar */}
        <path d="M10 64 C10 46, 54 46, 54 64 Z" fill={shirt} />
        <path d="M24 48 L32 56 L40 48 Z" fill="#FFFFFF" opacity="0.85" />
        {/* Neck */}
        <rect x="27" y="36" width="10" height="12" rx="4" fill={skin} />
        {/* Head */}
        <circle cx="32" cy="27" r="13" fill={skin} />
        {/* Hair */}
        <path
          d="M19 26 C19 14, 45 14, 45 26 C45 20, 39 16, 32 16 C25 16, 19 20, 19 26 Z"
          fill={hair}
        />
        {/* Subtle facial features */}
        <circle cx="27.5" cy="27" r="1.3" fill="#1F2924" />
        <circle cx="36.5" cy="27" r="1.3" fill="#1F2924" />
        <path d="M29 32 Q32 34.5 35 32" stroke="#1F2924" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{initials}</span>
    </div>
  );
};
