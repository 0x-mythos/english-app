// Прості лінійні іконки розділів (stroke = currentColor), щоб не тягнути бібліотеку.
type P = { className?: string };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const CardsIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="7" width="13" height="14" rx="3" />
    <path d="M8 3h10a3 3 0 0 1 3 3v10" />
  </svg>
);

export const ChatIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 10h8M8 13h5" />
  </svg>
);

export const BookIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5c-3-.5-6 0-8 1.5z" />
    <path d="M12 6v14.5" />
  </svg>
);

export const SparkIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);

export const SpeakerIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const ArrowLeftIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);

export const FlameIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 21c-4 0-7-2.7-7-6.5 0-3.6 3-5.7 4-9.5 2.5 1.6 3.4 3.8 3.5 5.5.9-.7 1.6-1.9 1.8-3.3C17 9.4 19 12 19 14.5 19 18.3 16 21 12 21z" />
  </svg>
);

export const SnowIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
  </svg>
);

export const PlusIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
