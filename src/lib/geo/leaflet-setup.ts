// leaflet.markercluster et leaflet-gesture-handling sont des plugins UMD qui
// s'attendent à trouver Leaflet en variable globale `L` (usage historique via
// <script>), pas via `import`/`require` — sous un bundler ES module, `import L
// from "leaflet"` ne peuple PAS `window.L`. Ce module importe le vrai Leaflet
// UNE fois et pose `window.L` en effet de bord ; tout le monde (nos composants
// ET les plugins) doit importer L d'ICI, jamais directement de "leaflet", pour
// garantir que ce module s'évalue — donc que window.L soit posé — avant les
// imports des plugins dans HomeClubsLeafletMap.tsx (l'ordre d'évaluation ES
// module fait que ce module (et sa seule dépendance, "leaflet") se termine
// avant que les imports de plugins suivants ne démarrent).
import L from "leaflet";

if (typeof window !== "undefined") {
  (window as unknown as { L: typeof L }).L = L;
}

export default L;
