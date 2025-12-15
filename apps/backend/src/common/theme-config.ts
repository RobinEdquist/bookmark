// Theme color keys for validation
// Note: This is duplicated from web app - will be consolidated into shared package later

export const primaryColorKeys = [
  'white',
  'gray',
  'red',
  'coral',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'purple',
  'pink',
  'rose',
] as const;

export const surfaceColorKeys = [
  'pitch',
  'charcoal',
  'espresso',
  'midnight',
  'zinc',
  'stone',
  'forest',
  'olive',
  'wine',
  'mauve',
  'silver',
  'pearl',
  'snow',
] as const;

export type PrimaryColor = (typeof primaryColorKeys)[number];
export type SurfaceColor = (typeof surfaceColorKeys)[number];
