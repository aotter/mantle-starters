export const mantleOceanHeroSvg = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" role="img" aria-label="Ocean themed Mantle starter visual">
  <style>
    :root {
      color-scheme: light dark;
      --bg-0: #fbfaf6;
      --bg-1: #eef8f8;
      --bg-2: #d9eef1;
      --line: #6caab5;
      --line-soft: #aacfd3;
      --frame: #5aaebb;
      --ink: #40616a;
      --accent: #3ab7df;
      --glow: #8de7ff;
      --panel: #ffffff;
      --panel-opacity: .54;
      --surface: #e5f3f5;
      --dot-opacity: .48;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-0: #071216;
        --bg-1: #0a1f25;
        --bg-2: #0f3138;
        --line: #66d8e7;
        --line-soft: #b8fbff;
        --frame: #76edff;
        --ink: #dbfbff;
        --accent: #52dcff;
        --glow: #65e8ff;
        --panel: #dffcff;
        --panel-opacity: .055;
        --surface: #dffcff;
        --dot-opacity: .82;
      }
    }
  </style>
  <defs>
    <linearGradient id="bg" x1="80" y1="60" x2="720" y2="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="var(--bg-0)" />
      <stop offset=".58" stop-color="var(--bg-1)" />
      <stop offset="1" stop-color="var(--bg-2)" />
    </linearGradient>
    <radialGradient id="glow" cx="62%" cy="42%" r="46%">
      <stop offset="0" stop-color="var(--glow)" stop-opacity=".36" />
      <stop offset=".56" stop-color="var(--glow)" stop-opacity=".12" />
      <stop offset="1" stop-color="var(--glow)" stop-opacity="0" />
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="12" />
    </filter>
    <clipPath id="round">
      <rect x="32" y="32" width="736" height="536" rx="34" />
    </clipPath>
  </defs>
  <rect x="32" y="32" width="736" height="536" rx="34" fill="url(#bg)" />
  <g clip-path="url(#round)">
    <path d="M-8 408 C112 330 205 462 337 382 S572 298 808 398" fill="none" stroke="var(--line)" stroke-opacity=".28" stroke-width="2" />
    <path d="M-24 462 C111 388 212 510 354 434 S594 360 828 450" fill="none" stroke="var(--line)" stroke-opacity=".2" stroke-width="1.5" />
    <path d="M-10 514 C116 450 226 552 382 496 S614 432 822 500" fill="none" stroke="var(--line)" stroke-opacity=".14" stroke-width="1.3" />
    <path d="M64 130 C158 98 228 138 304 116 C383 93 457 112 546 82 C621 57 696 72 779 44" fill="none" stroke="var(--line-soft)" stroke-opacity=".2" stroke-width="1.2" />
    <path d="M56 174 C164 144 236 184 324 158 C414 132 488 154 574 126 C650 102 720 116 792 92" fill="none" stroke="var(--line-soft)" stroke-opacity=".14" stroke-width="1.1" />
    <circle cx="510" cy="254" r="210" fill="url(#glow)" />
    <circle cx="600" cy="192" r="62" fill="var(--glow)" opacity=".16" filter="url(#soft)" />
    <g opacity=".72">
      <rect x="182" y="174" width="436" height="256" rx="22" fill="var(--panel)" fill-opacity="var(--panel-opacity)" stroke="var(--frame)" stroke-opacity=".34" />
      <rect x="212" y="204" width="132" height="11" rx="5.5" fill="var(--ink)" opacity=".18" />
      <rect x="212" y="229" width="236" height="8" rx="4" fill="var(--ink)" opacity=".12" />
      <rect x="212" y="250" width="190" height="8" rx="4" fill="var(--ink)" opacity=".1" />
      <rect x="212" y="286" width="80" height="24" rx="7" fill="var(--accent)" opacity=".36" />
      <rect x="402" y="210" width="164" height="116" rx="15" fill="var(--surface)" fill-opacity=".42" stroke="var(--frame)" stroke-opacity=".22" />
      <path d="M418 306 L461 268 L497 294 L532 248 L566 306 Z" fill="var(--line)" opacity=".24" />
      <circle cx="532" cy="236" r="10" fill="var(--line)" opacity=".3" />
      <rect x="212" y="346" width="84" height="48" rx="12" fill="var(--panel)" fill-opacity=".22" stroke="var(--frame)" stroke-opacity=".18" />
      <rect x="318" y="346" width="84" height="48" rx="12" fill="var(--panel)" fill-opacity=".22" stroke="var(--frame)" stroke-opacity=".18" />
      <rect x="424" y="346" width="84" height="48" rx="12" fill="var(--panel)" fill-opacity=".22" stroke="var(--frame)" stroke-opacity=".18" />
    </g>
    <g fill="var(--glow)">
      <circle cx="145" cy="296" r="2.2" opacity="var(--dot-opacity)" />
      <circle cx="628" cy="272" r="2.8" opacity="var(--dot-opacity)" />
      <circle cx="666" cy="380" r="1.8" opacity=".62" />
      <circle cx="332" cy="456" r="2.4" opacity=".58" />
      <circle cx="708" cy="164" r="2.1" opacity=".68" />
      <circle cx="102" cy="456" r="1.7" opacity=".48" />
    </g>
    <g stroke="var(--line-soft)" stroke-opacity=".09" stroke-width="1">
      <path d="M112 76 V520" />
      <path d="M688 76 V520" />
      <path d="M72 472 H728" />
    </g>
  </g>
  <rect x="32" y="32" width="736" height="536" rx="34" fill="none" stroke="var(--frame)" stroke-opacity=".18" />
</svg>
`;
