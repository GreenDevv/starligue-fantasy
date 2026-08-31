// leaflet-gesture-handling n'étend pas les types de leaflet lui-même —
// augmentation ambiante pour pouvoir passer `gestureHandling: true` en option
// de carte de façon typée. Voir HomeClubsLeafletMap.tsx.
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    gestureHandling?: boolean;
    gestureHandlingOptions?: {
      text?: { touch?: string; scroll?: string; scrollMac?: string };
      duration?: number;
    };
  }

  interface Map {
    gestureHandling: Handler;
  }
}
