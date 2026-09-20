import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (props: P): P => ({ width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', ...props })

export const IconSparkles = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </svg>
)
export const IconSettings = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)
export const IconRefresh = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </svg>
)
export const IconFolder = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
export const IconPlay = (p: P): React.JSX.Element => (
  <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
    <path d="M7 5v14l11-7z" />
  </svg>
)
export const IconStop = (p: P): React.JSX.Element => (
  <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)
export const IconWand = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M15 4l5 5L7 22l-5-5z" />
    <path d="M14 7l3 3" />
    <path d="M5 3v2M3 4h4M19 15v2M18 16h2" />
  </svg>
)
export const IconImage = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-8 8" />
  </svg>
)
export const IconClock = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
export const IconTerminal = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 17l6-5-6-5" />
    <path d="M12 19h8" />
  </svg>
)
export const IconBraces = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
    <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
  </svg>
)
export const IconBook = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z" />
  </svg>
)
export const IconLayers = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
)
export const IconSliders = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
)
export const IconPlug = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 17v5" />
  </svg>
)
export const IconOpen = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
)
export const IconSave = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v5h7V3M8 21v-7h8v7" />
  </svg>
)
export const IconTrash = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)
export const IconInfinity = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M18.2 8.5a3.5 3.5 0 0 1 0 7c-3.5 0-5-7-9.4-7a3.5 3.5 0 0 0 0 7c4.4 0 5.9-7 9.4-7z" />
  </svg>
)
export const IconClose = (p: P): React.JSX.Element => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
