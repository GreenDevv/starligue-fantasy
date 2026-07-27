"use client";

import { useRef, useState } from "react";

export interface PhotoCrop {
  offsetX: number; // -50 à 150 (au-delà de 0-100 : cadrer sur une tête proche d'un bord)
  offsetY: number; // -50 à 150
  zoom: number; // 1.0-5.0
}

const OFFSET_MIN = -50;
const OFFSET_MAX = 150;

// Recadrage circulaire d'une photo joueur — glisser pour repositionner, slider
// pour zoomer. Le rendu ici doit rester identique à PlayerAvatar (même
// object-position/scale) pour que le réglage corresponde exactement à ce que
// verront les joueurs sur le pitch/marché/etc.
export function PhotoPositionEditor({
  photoUrl,
  crop,
  onChange,
}: {
  photoUrl: string;
  crop: PhotoCrop;
  onChange: (crop: PhotoCrop) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offsetX: crop.offsetX, offsetY: crop.offsetY };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragStart.current.x) / width) * 100;
    const dyPct = ((e.clientY - dragStart.current.y) / height) * 100;
    // Glisser vers la droite doit déplacer visuellement la photo vers la
    // droite → object-position X diminue (voir commentaire composant). Plage
    // élargie au-delà de 0-100 : sinon impossible de bien cadrer une tête
    // proche d'un bord une fois zoomé (demande explicite).
    const nextX = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, dragStart.current.offsetX - dxPct));
    const nextY = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, dragStart.current.offsetY - dyPct));
    onChange({ ...crop, offsetX: Math.round(nextX), offsetY: Math.round(nextY) });
  }

  function handlePointerUp(e: React.PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    dragStart.current = null;
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-36 w-36 shrink-0 touch-none select-none overflow-hidden rounded-full border-2 border-accent/50"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <img
          src={photoUrl}
          alt="Recadrage"
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
          style={{
            objectPosition: `${crop.offsetX}% ${crop.offsetY}%`,
            transform: `scale(${crop.zoom})`,
          }}
        />
      </div>

      <div className="w-full max-w-[220px]">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-text-muted">
          <span>Zoom</span>
          <span>{crop.zoom.toFixed(2)}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={0.05}
          value={crop.zoom}
          onChange={(e) => onChange({ ...crop, zoom: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
      </div>

      <button
        type="button"
        onClick={() => onChange({ offsetX: 50, offsetY: 50, zoom: 1 })}
        className="text-[11px] text-text-muted underline hover:text-text"
      >
        Réinitialiser
      </button>
    </div>
  );
}
