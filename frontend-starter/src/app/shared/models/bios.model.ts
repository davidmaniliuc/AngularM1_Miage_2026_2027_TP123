/** A BIOS returned by the API. Always private to its owner. */
export interface Bios {
  id: string;
  ownerId: string;
  originalName: string;
  size: number;
  /** False: the right size but absent from the emulator's table (usable, unidentified). */
  known: boolean;
  region?: 'america' | 'europe' | 'japan';
  version?: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
}

const BIOS_REGIONS: Record<string, string> = { america: 'Amérique', europe: 'Europe', japan: 'Japon' };

export function biosRegionLabel(region: string | undefined): string {
  return region ? (BIOS_REGIONS[region] ?? region) : '';
}
