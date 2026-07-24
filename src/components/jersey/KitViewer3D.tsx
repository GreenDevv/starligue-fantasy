"use client";
// Rendu 3D interactif du kit (maillot + short + chaussettes) sur un
// mannequin sculpté par silhouettes courbes (THREE.LatheGeometry — profil 2D
// révolutionné à 360°) plutôt que des cônes droits : torse cambré
// épaules/taille/poitrine, bras avec galbe biceps/coude, jambes avec galbe
// cuisse/mollet, complétés par tête/cou/mains/pieds. Remplace les itérations
// précédentes (cartes plates, puis cylindres coniques) jugées trop
// géométriques / peu "corps humain" par les retours utilisateur. La texture
// de chaque pièce réutilise le même registre de motifs que le rendu SVG
// (src/lib/team/kitPatterns.ts) pour rester visuellement cohérent entre
// badges 2D et aperçu 3D.
//
// IMPORTANT : ce module importe three.js — à charger uniquement via
// next/dynamic({ ssr: false }) depuis JerseyEditor. Ne jamais l'importer
// depuis un composant affiché en liste (JerseyBadge, leaderboard, etc.), pour
// ne pas alourdir leur bundle avec three.js.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
// Sous-module direct plutôt que le barrel racine — @react-three/drei exporte
// ~370 helpers (Text 3D, loaders GLTF, environnements HDRI…) dont on n'a besoin
// d'aucun ici, et l'import du barrel entier alourdit inutilement le chunk
// dynamique (surtout en dev, où webpack ne tree-shake pas).
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { zoneColor, zonePattern, type JerseyConfig, type KitZone } from "@/lib/team/jersey";

const TEXTURE_SIZE = 256;
const UNIT = 100;
const RADIAL_SEGMENTS = 28;

// Teinte neutre "mannequin de boutique" pour tête/cou/mains/pieds — ce ne
// sont pas des éléments customisables du kit, donc pas de couleur de peau
// spécifique (le jeu ne représente pas de joueur précis ici).
const MANNEQUIN_TONE = "#c9c3b8";
const SHOE_TONE = "#20242b";

// Proportions du mannequin (unités arbitraires, cohérentes entre elles —
// pas une échelle physique réelle). Chaque silhouette est un profil (rayon,
// hauteur) révolutionné à 360° (LatheGeometry), pas un simple cône : galbe
// poitrine/taille pour le torse, biceps/coude pour les bras, cuisse/mollet
// pour les jambes. Bras/jambes/chaussettes sont des profils "pivot en haut"
// (y=0 = point d'attache, y négatif vers le bas) pour s'accoler exactement
// à la pièce du dessus sans chevauchement possible.
// Gabarit athlétique (carrure de lanceur de handball : épaules larges,
// taille marquée) plutôt qu'un gabarit générique.
const TORSO_HEIGHT = 46;
const TORSO_PROFILE: [number, number][] = [
  [12, 0], // bas / ourlet
  [13, 9], // bas du dos, léger évasement
  [11, 17], // taille (le plus étroit)
  [13.5, 27], // cage thoracique
  [15.5, 37], // poitrine (le plus large)
  [15, 43], // amorce d'épaule (large, carrure athlétique)
  [12.5, TORSO_HEIGHT], // haut d'épaule / col
];

const NECK_HEIGHT = 6;
const NECK_RADIUS = 4.2;
const HEAD_RADIUS = 6;
// Tête légèrement ovale/allongée plutôt qu'une sphère parfaite (moins
// "tête de mannequin/jouet").
const HEAD_SCALE: [number, number, number] = [0.86, 1.15, 0.92];

// Bras en 2 segments (bras + avant-bras) articulés au coude, pour une pose
// athlétique "prêt à jouer" plutôt que des bras raides tombant le long du
// corps (le principal indice visuel de "mannequin figé").
const UPPER_ARM_LENGTH = 17;
const FOREARM_LENGTH = 15;
const ARM_TILT = 0.22; // radians, écart de l'épaule par rapport à la verticale
const ELBOW_BEND = 0.55; // radians, flexion du coude vers l'avant
const ARM_ATTACH_X = 14;
const ARM_ATTACH_Y = TORSO_HEIGHT * 0.93;
const UPPER_ARM_PROFILE: [number, number][] = [
  [4.6, 0], // épaule
  [4.9, -6], // galbe biceps
  [4.2, -14], // amorce du coude
  [3.9, -UPPER_ARM_LENGTH], // coude
];
const FOREARM_PROFILE: [number, number][] = [
  [3.9, 0], // coude
  [3.5, -7], // avant-bras
  [3.1, -FOREARM_LENGTH], // poignet
];
const HAND_RADIUS = 2.6;

const LEG_HEIGHT = 26;
const LEG_OFFSET_X = 8.5;
const LEG_PROFILE: [number, number][] = [
  [6, -LEG_HEIGHT], // genou
  [7, -LEG_HEIGHT * 0.5], // milieu de cuisse
  [8.3, -LEG_HEIGHT * 0.15], // galbe cuisse, proche hanche
  [7.6, 0], // hanche
];

const SOCK_HEIGHT = 24;
const SOCK_PROFILE: [number, number][] = [
  [4.2, -SOCK_HEIGHT], // cheville
  [4.6, -SOCK_HEIGHT * 0.65], // bas du mollet
  [5.6, -SOCK_HEIGHT * 0.35], // galbe mollet
  [5.2, 0], // genou
];

const FOOT_SIZE: [number, number, number] = [5, 3, 9];

const HIP_Y = 0; // bas du maillot / haut du short
const KNEE_Y = HIP_Y - LEG_HEIGHT; // bas du short / haut des chaussettes
const ANKLE_Y = KNEE_Y - SOCK_HEIGHT; // bas des chaussettes
// Centre approximatif de l'ensemble (pieds → sommet du crâne) — sert de
// cible caméra pour cadrer tout le mannequin.
const RIG_CENTER_Y = 6;

function tracePath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

// Profil → LatheGeometry (silhouette révolutionnée à 360°). Even convention
// UV que CylinderGeometry : u=0 (théta=0, donc face avant, z max) au niveau
// du 1er/dernier point du profil selon phiStart=0 ; v=1 au dernier point du
// tableau, v=0 au premier — d'où la construction des profils ci-dessus du
// bas vers le haut.
function lathe(profile: [number, number][]): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    RADIAL_SEGMENTS,
  );
}

// Texture "à plat" enroulée autour d'une silhouette révolutionnée : x
// (0-100) fait le tour de la circonférence, y (0-100) longe la hauteur (haut
// du canvas = haut de la pièce, cohérent avec l'uv.y=1 en haut du profil de
// Three.js en flipY par défaut). La jointure de l'image (x=0/100) tombe par
// défaut pile au milieu de la face avant (theta=0 ⇔ u=0) : offset.x=0.5 la
// déplace à l'arrière du mannequin, et centre plutôt le canvas (x=50) sur la
// face avant — donc tout élément "face avant" (numéro, col) se dessine à
// x=50, et tout élément "dos" (nom floqué) à x=0/100.
function finishWrapTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.offset.x = 0.5;
  texture.needsUpdate = true;
  return texture;
}

function paintZonePattern(ctx: CanvasRenderingContext2D, zone: KitZone) {
  for (const region of zonePattern(zone).regions) {
    ctx.beginPath();
    tracePath(ctx, region.points);
    ctx.fillStyle = zoneColor(zone, region.slot);
    ctx.fill();
  }
}

function buildBandTexture(zone: KitZone): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return finishWrapTexture(canvas);
  ctx.scale(TEXTURE_SIZE / UNIT, TEXTURE_SIZE / UNIT);
  paintZonePattern(ctx, zone);
  return finishWrapTexture(canvas);
}

function drawCollarBand(ctx: CanvasRenderingContext2D, collar: JerseyConfig["collar"], trimColor: string) {
  ctx.fillStyle = trimColor;
  if (collar === "v-neck") {
    // Encolure dégagée : pas de bande complète, juste un liseré en V (face avant).
    ctx.beginPath();
    ctx.moveTo(44, 2);
    ctx.lineTo(50, 13);
    ctx.lineTo(56, 2);
    ctx.lineTo(53, 2);
    ctx.lineTo(50, 8);
    ctx.lineTo(47, 2);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // crew & polo : bande complète autour de l'encolure.
  ctx.fillRect(0, 2, UNIT, 5);
  if (collar === "polo") {
    ctx.fillRect(46, 5, 8, 12);
    ctx.fillStyle = "#00000066";
    [9, 14].forEach((y) => {
      ctx.beginPath();
      ctx.arc(50, y, 1, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

interface TorsoExtras {
  number?: number;
  collar?: JerseyConfig["collar"];
  trimColor?: string;
  nameFlock?: string;
}

function buildTorsoTexture(zone: KitZone, extras: TorsoExtras): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return finishWrapTexture(canvas);
  ctx.scale(TEXTURE_SIZE / UNIT, TEXTURE_SIZE / UNIT);

  paintZonePattern(ctx, zone);

  if (extras.collar && extras.trimColor) drawCollarBand(ctx, extras.collar, extras.trimColor);

  if (extras.number !== undefined) {
    ctx.fillStyle = "#00000055";
    ctx.font = "700 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(extras.number), 50, 45);
  }

  if (extras.nameFlock) {
    // Dos du maillot, à la jointure de la silhouette — dessiné en 3
    // exemplaires décalés de -100/0/+100 pour rester continu de part et
    // d'autre de la couture quand le texte déborde du bord du canvas.
    ctx.fillStyle = "#00000070";
    ctx.font = "700 7px sans-serif";
    ctx.textAlign = "center";
    const label = extras.nameFlock.toUpperCase();
    for (const dx of [-UNIT, 0, UNIT]) ctx.fillText(label, dx, 25);
  }

  return finishWrapTexture(canvas);
}

function useDisposable<T extends { dispose(): void }>(resource: T): void {
  useEffect(() => () => resource.dispose(), [resource]);
}

function TorsoPart({ zone, number, collar, trimColor, nameFlock }: TorsoExtras & { zone: KitZone }) {
  const texture = useMemo(
    () => buildTorsoTexture(zone, { number, collar, trimColor, nameFlock }),
    [zone, number, collar, trimColor, nameFlock],
  );
  useDisposable(texture);

  const geometry = useMemo(() => lathe(TORSO_PROFILE), []);
  useDisposable(geometry);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
    </mesh>
  );
}

function HeadAndNeck() {
  const neckGeometry = useMemo(
    () => new THREE.CylinderGeometry(NECK_RADIUS, NECK_RADIUS * 1.05, NECK_HEIGHT, RADIAL_SEGMENTS),
    [],
  );
  useDisposable(neckGeometry);
  const headGeometry = useMemo(() => new THREE.SphereGeometry(HEAD_RADIUS, 20, 16), []);
  useDisposable(headGeometry);

  const neckY = TORSO_HEIGHT + NECK_HEIGHT / 2;
  const headY = TORSO_HEIGHT + NECK_HEIGHT + HEAD_RADIUS * HEAD_SCALE[1] * 0.85;

  return (
    <>
      <mesh geometry={neckGeometry} position={[0, neckY, 0]}>
        <meshStandardMaterial color={MANNEQUIN_TONE} roughness={0.7} metalness={0.02} />
      </mesh>
      <mesh geometry={headGeometry} position={[0, headY, 0]} scale={HEAD_SCALE}>
        <meshStandardMaterial color={MANNEQUIN_TONE} roughness={0.7} metalness={0.02} />
      </mesh>
    </>
  );
}

function ArmPart({
  zone,
  trimColor,
  contrastSleeves,
  side,
}: {
  zone: KitZone;
  trimColor: string;
  contrastSleeves: boolean;
  side: 1 | -1;
}) {
  // Manches contrastées = uni couleur de liseré ; sinon même motif que le maillot.
  const armZone = useMemo<KitZone>(
    () => (contrastSleeves ? { patternId: "solid", colors: [trimColor] } : zone),
    [contrastSleeves, trimColor, zone],
  );
  const texture = useMemo(() => buildBandTexture(armZone), [armZone]);
  useDisposable(texture);

  const upperArmGeometry = useMemo(() => lathe(UPPER_ARM_PROFILE), []);
  useDisposable(upperArmGeometry);
  const forearmGeometry = useMemo(() => lathe(FOREARM_PROFILE), []);
  useDisposable(forearmGeometry);
  const handGeometry = useMemo(() => new THREE.SphereGeometry(HAND_RADIUS, 16, 12), []);
  useDisposable(handGeometry);

  return (
    <group position={[side * ARM_ATTACH_X, ARM_ATTACH_Y, 0]} rotation={[0, 0, side * ARM_TILT]}>
      <mesh geometry={upperArmGeometry}>
        <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Avant-bras fléchi vers l'avant au coude — rotation.x négative pour
          amener le poignet en +Z (pose "prêt à jouer" plutôt que bras raide
          tombant le long du corps). Peau nue (pas de texture maillot) : une
          manche courte de handball s'arrête au coude, pas au poignet. */}
      <group position={[0, -UPPER_ARM_LENGTH, 0]} rotation={[-ELBOW_BEND, 0, 0]}>
        <mesh geometry={forearmGeometry}>
          <meshStandardMaterial color={MANNEQUIN_TONE} roughness={0.7} metalness={0.02} />
        </mesh>
        <mesh geometry={handGeometry} position={[0, -FOREARM_LENGTH - HAND_RADIUS * 0.6, 0]}>
          <meshStandardMaterial color={MANNEQUIN_TONE} roughness={0.7} metalness={0.02} />
        </mesh>
      </group>
    </group>
  );
}

// Le short s'arrête au-dessus du genou (cuisse nue visible) plutôt que de
// couvrir toute la cuisse jusqu'à la chaussette — sans quoi short + bas se
// rejoignent et donnent l'impression d'un pantalon plutôt qu'une tenue de
// hand. THIGH_SKIN_FROM_PCT = point (en % de la hauteur du profil de
// cuisse, 0 = hanche, 100 = genou) où le tissu du short cède la place à la
// peau.
const THIGH_SKIN_FROM_PCT = 55;

function buildThighTexture(zone: KitZone): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return finishWrapTexture(canvas);
  ctx.scale(TEXTURE_SIZE / UNIT, TEXTURE_SIZE / UNIT);
  paintZonePattern(ctx, zone);
  ctx.fillStyle = MANNEQUIN_TONE;
  ctx.fillRect(0, THIGH_SKIN_FROM_PCT, UNIT, UNIT - THIGH_SKIN_FROM_PCT);
  return finishWrapTexture(canvas);
}

function LegPart({ zone, side }: { zone: KitZone; side: 1 | -1 }) {
  const texture = useMemo(() => buildThighTexture(zone), [zone]);
  useDisposable(texture);

  const geometry = useMemo(() => lathe(LEG_PROFILE), []);
  useDisposable(geometry);

  return (
    <mesh geometry={geometry} position={[side * LEG_OFFSET_X, HIP_Y, 0]}>
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
    </mesh>
  );
}

function SockAndFoot({ zone, side }: { zone: KitZone; side: 1 | -1 }) {
  const texture = useMemo(() => buildBandTexture(zone), [zone]);
  useDisposable(texture);

  const sockGeometry = useMemo(() => lathe(SOCK_PROFILE), []);
  useDisposable(sockGeometry);
  const footGeometry = useMemo(() => new THREE.BoxGeometry(...FOOT_SIZE), []);
  useDisposable(footGeometry);

  return (
    <group position={[side * LEG_OFFSET_X, KNEE_Y, 0]}>
      <mesh geometry={sockGeometry}>
        <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Pied : décalé vers l'avant (+Z) et légèrement vers le bas depuis la cheville. */}
      <mesh geometry={footGeometry} position={[0, -SOCK_HEIGHT - FOOT_SIZE[1] / 2, FOOT_SIZE[2] / 2 - 2]}>
        <meshStandardMaterial color={SHOE_TONE} roughness={0.5} metalness={0.1} />
      </mesh>
    </group>
  );
}

export interface KitViewer3DProps {
  config: JerseyConfig;
  className?: string;
}

export default function KitViewer3D({ config, className = "" }: KitViewer3DProps) {
  return (
    <div className={className}>
      {/* Distance/fov calés pour cadrer tout le mannequin (pieds → sommet du
          crâne, ~118 unités) avec de la marge. */}
      <Canvas camera={{ position: [0, 0, 280], fov: 30 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[80, 120, 160]} intensity={0.7} />
        <directionalLight position={[-80, -40, 80]} intensity={0.3} />

        <TorsoPart
          zone={config.jersey}
          number={config.number}
          collar={config.collar}
          trimColor={config.trimColor}
          nameFlock={config.nameFlock}
        />
        <HeadAndNeck />
        <ArmPart zone={config.jersey} trimColor={config.trimColor} contrastSleeves={config.contrastSleeves} side={1} />
        <ArmPart zone={config.jersey} trimColor={config.trimColor} contrastSleeves={config.contrastSleeves} side={-1} />
        <LegPart zone={config.shorts} side={1} />
        <LegPart zone={config.shorts} side={-1} />
        <SockAndFoot zone={config.socks} side={1} />
        <SockAndFoot zone={config.socks} side={-1} />

        <OrbitControls
          target={[0, RIG_CENTER_Y, 0]}
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 2}
          maxPolarAngle={Math.PI / 2}
          rotateSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
