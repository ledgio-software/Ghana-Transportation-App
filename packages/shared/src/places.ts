/** The 16 regions of Ghana, for station and place forms. */
export const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
] as const;

export type GhanaRegion = (typeof GHANA_REGIONS)[number];

/** URL-safe id from a name: "Kwame Nkrumah Circle" -> "kwame-nkrumah-circle". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ɛ]/g, 'e')
    .replace(/[ɔ]/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
