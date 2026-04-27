export interface SupermoduleColor {
  dot: string;    // hex for the colored dot
  bg: string;     // subtle background
  text: string;   // colored text
  border: string; // border color
}

export const SUPERMODULE_COLORS: Record<number, SupermoduleColor> = {
  1:  { dot: '#a78bfa', bg: '#f5f3ff', text: '#7c3aed', border: '#ddd6fe' },
  2:  { dot: '#60a5fa', bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  3:  { dot: '#22d3ee', bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
  4:  { dot: '#2dd4bf', bg: '#f0fdfa', text: '#0d9488', border: '#99f6e4' },
  5:  { dot: '#34d399', bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  6:  { dot: '#a3e635', bg: '#f7fee7', text: '#65a30d', border: '#d9f99d' },
  7:  { dot: '#fbbf24', bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  8:  { dot: '#fb923c', bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' },
  9:  { dot: '#f87171', bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  10: { dot: '#fb7185', bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' },
  11: { dot: '#f472b6', bg: '#fdf2f8', text: '#db2777', border: '#fbcfe8' },
  12: { dot: '#e879f9', bg: '#fdf4ff', text: '#c026d3', border: '#f5d0fe' },
};
