"use client";

// Rendu carte du widget « D'où viennent les managers » — vraie carte Leaflet
// (tuiles CARTO dark, alignées sur le thème sombre du site) plutôt que le
// contour SVG dessiné à la main : zoom/pan précis, et les clubs proches se
// regroupent en bulles chiffrées quand on dézoome (leaflet.markercluster).
// Chargé uniquement côté client (voir dynamic() dans HomeClubsMapWidget.tsx) —
// Leaflet touche `window` au chargement du module, incompatible SSR.
//
// Geste façon Google Maps (leaflet-gesture-handling) : la molette et le
// glisser à un doigt sont ignorés tant que l'utilisateur n'a pas confirmé
// (ctrl+molette / deux doigts), pour ne jamais piéger le scroll de la page qui
// contient le widget — cf. src/types/leaflet-gesture-handling.d.ts pour les
// types de l'option `gestureHandling`.
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
// L doit venir de ce shim (pose `window.L`) et être importé avant les plugins
// UMD ci-dessous, qui s'attendent à trouver Leaflet en global — voir le
// commentaire dans leaflet-setup.ts.
import L from "@/lib/geo/leaflet-setup";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { GestureHandling } from "leaflet-gesture-handling";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";
import { METRO_FRANCE_BOUNDS } from "@/lib/geo/france-map";
import type { ClubPoint } from "@/lib/community/home-clubs";

L.Map.addInitHook("addHandler", "gestureHandling", GestureHandling);

// CARTO exige une clé depuis 2026 (gratuite, sans compte — carto.com/basemaps/apikey),
// même en usage minime : sans elle les tuiles renvoient un watermark "API KEY
// REQUIRED" au lieu du fond de carte. Voir .env.example.
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;
const TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`;
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Diamètre (px) d'un point club : aire ∝ nb de managers, borné pour rester lisible.
function clubDivIcon(count: number): L.DivIcon {
  const d = Math.round(Math.min(14 + Math.sqrt(count) * 5, 34));
  return L.divIcon({
    className: "",
    html: `<span class="sf-club-dot" style="width:${d}px;height:${d}px"></span>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    popupAnchor: [0, -d / 2 - 2],
  });
}

// Bulle de regroupement : le nombre affiché = nb de clubs dans le cluster
// (getChildCount compte les marqueurs, un par club) — exactement ce qu'on veut
// montrer, pas un total de managers.
function clusterDivIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const d = count < 5 ? 34 : count < 20 ? 42 : 52;
  return L.divIcon({
    className: "",
    html: `<span class="sf-cluster-badge" style="width:${d}px;height:${d}px">${count}</span>`,
    iconSize: [d, d],
  });
}

function ClubMarkers({ points, dotLabel }: { points: ClubPoint[]; dotLabel: (count: number) => string }) {
  const map = useMap();
  const didFitRef = useRef(false);

  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 48,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: clusterDivIcon,
    });

    for (const p of points) {
      const marker = L.marker([p.lat, p.lon], { icon: clubDivIcon(p.count) });
      const popup = document.createElement("div");
      const name = document.createElement("p");
      name.className = "sf-club-popup-name";
      name.textContent = p.city ? `${p.name} · ${p.city}` : p.name;
      const count = document.createElement("p");
      count.className = "sf-club-popup-count";
      count.textContent = dotLabel(p.count);
      popup.append(name, count);
      marker.bindPopup(popup);
      group.addLayer(marker);
    }
    map.addLayer(group);

    // Cadrage initial uniquement : la France reste toujours dans le cadre
    // (identité du jeu), puis on englobe tous les points de managers. Ensuite
    // l'utilisateur garde la main sur le zoom/pan.
    if (!didFitRef.current && points.length > 0) {
      const bounds = L.latLngBounds(
        [METRO_FRANCE_BOUNDS.latMin, METRO_FRANCE_BOUNDS.lonMin],
        [METRO_FRANCE_BOUNDS.latMax, METRO_FRANCE_BOUNDS.lonMax],
      );
      for (const p of points) bounds.extend([p.lat, p.lon]);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
      didFitRef.current = true;
    }

    return () => {
      map.removeLayer(group);
    };
  }, [map, points, dotLabel]);

  return null;
}

export function HomeClubsLeafletMap({
  points,
  dotLabel,
  height,
}: {
  points: ClubPoint[];
  dotLabel: (count: number) => string;
  height: number;
}) {
  if (!CARTO_API_KEY) {
    // Message d'exploitation, pas de contenu utilisateur → volontairement non
    // traduit (voir .env.example pour la config manquante).
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-dashed border-border bg-bg p-3 text-center text-[11px] text-text-muted"
        style={{ height }}
      >
        Fond de carte non configuré — NEXT_PUBLIC_CARTO_API_KEY manquante (.env.example)
      </div>
    );
  }

  return (
    <div className="sf-club-map overflow-hidden rounded-sm" style={{ height }}>
      <MapContainer
        center={[46.6, 2.5]}
        zoom={5}
        minZoom={2}
        maxZoom={18}
        gestureHandling
        style={{ height: "100%", width: "100%" }}
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
        <ClubMarkers points={points} dotLabel={dotLabel} />
      </MapContainer>
    </div>
  );
}
