/** Minimal side-profile line icons for body-type cards (grey stroke; parent sets color). */
export function CarBodyTypeIcon({ bodyType, className }) {
  const cn = className || ''
  const vb = '0 0 72 44'
  const stroke = 1.75
  const common = { viewBox: vb, fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', className: cn }

  switch (bodyType) {
    case 'SUV':
      return (
        <svg {...common}>
          <path d="M6 28h8l3-8h18l4 8h20l2-6H52l-4-8H26l-6 8H6v6z" />
          <circle cx="18" cy="28" r="5" />
          <circle cx="54" cy="28" r="5" />
        </svg>
      )
    case 'Sedan':
      return (
        <svg {...common}>
          <path d="M8 30h10l6-12h22l8 12h12v-4H64l-6-8H24l-8 8H8v4z" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="56" cy="30" r="5" />
        </svg>
      )
    case 'Hatchback':
      return (
        <svg {...common}>
          <path d="M8 30h8l10-14h20l6 14h14v-4H56l-4-6H28l-8 8H8v4z" />
          <path d="M14 22 L20 16 H38" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="52" cy="30" r="5" />
        </svg>
      )
    case 'Compact Sedan':
      return (
        <svg {...common}>
          <path d="M10 30h8l5-10h18l7 10h10v-3H58l-5-7H26l-7 7H10v3z" />
          <circle cx="21" cy="30" r="4.5" />
          <circle cx="54" cy="30" r="4.5" />
        </svg>
      )
    case 'MUV/MPV':
      return (
        <svg {...common}>
          <path d="M6 28h6l4-10h34l4 10h14v-4H54l-3-8H18l-5 8H6v4z" />
          <path d="M22 18v8M34 18v8M46 18v8" />
          <circle cx="16" cy="28" r="5" />
          <circle cx="58" cy="28" r="5" />
        </svg>
      )
    case 'Convertible':
      return (
        <svg {...common}>
          <path d="M8 30h10l6-8h20l6 8h16v-4H64l-5-6H25l-6 6H8v4z" />
          <path d="M26 18h22" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="54" cy="30" r="5" />
        </svg>
      )
    case 'Coupe':
      return (
        <svg {...common}>
          <path d="M10 30h8l8-14h20l10 14h10v-4H56l-8-10H28l-8 10H10v4z" />
          <path d="M22 20 L34 16 H48" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="56" cy="30" r="5" />
        </svg>
      )
    case 'Minivan/Van':
      return (
        <svg {...common}>
          <path d="M4 28h8l2-12h40l2 12h10v-4H56l-2-10H16l-4 10H4v4z" />
          <rect x="18" y="14" width="10" height="8" rx="1" />
          <circle cx="14" cy="28" r="5" />
          <circle cx="60" cy="28" r="5" />
        </svg>
      )
    case 'Station Wagon':
      return (
        <svg {...common}>
          <path d="M8 30h8l8-12h14l10 12h18v-4H58l-8-10H28l-6 6H8v4z" />
          <path d="M32 18h16v8H32z" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="56" cy="30" r="5" />
        </svg>
      )
    case 'Pickup':
      return (
        <svg {...common}>
          <path d="M8 30h10l6-10h12V14h20v6h10l4 10h6v-4H66l-3-6H18l-5 6H8v4z" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="58" cy="30" r="5" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M10 30h52v-4H58l-6-8H20l-6 8H10v4z" />
          <circle cx="22" cy="30" r="5" />
          <circle cx="54" cy="30" r="5" />
        </svg>
      )
  }
}
