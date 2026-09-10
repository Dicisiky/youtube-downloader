'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const COLOR_IDLE = new THREE.Color('#6366f1'); // indigo -- "monitoring, live"
const COLOR_RECORDING = new THREE.Color('#f43f5e'); // rose -- "capturing right now"
const COLOR_ARCHIVED = new THREE.Color('#10b981'); // emerald -- "safely re-uploaded"

// Low metalness on purpose: a fully metallic PBR material renders almost
// black without an environment/reflection map, which we deliberately don't
// use (no external texture fetches). These read closer to painted/anodized
// steel -- mostly diffuse response, so the couple of direct lights we do
// have are enough to actually see the thing.
const RAIL_MAT = { color: '#20242f', roughness: 0.55, metalness: 0.25 } as const;
const CHASSIS_MAT = { color: '#2b3040', roughness: 0.5, metalness: 0.3 } as const;
const VENT_MAT = { color: '#14171e', roughness: 0.85, metalness: 0.1 } as const;

const UNIT_W = 1.7;
const UNIT_H = 0.4;
const UNIT_D = 1.15;
const UNIT_Y = [1.0, 0.15, -0.7]; // three 1U-ish slots, top to bottom
const RACK_X = { source: -2.35, dest: 2.35 };

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/** A vented grille: a small grid of thin dark slats, the single most recognizable "server front panel" cue. */
function Vents({ width, height }: { width: number; height: number }) {
  const rows = 4;
  const slats = useMemo(() => Array.from({ length: rows }, (_, i) => -height / 2 + (height / (rows - 1)) * i), [height]);
  return (
    <group>
      {slats.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[width, 0.02, 0.015]} />
          <meshStandardMaterial {...VENT_MAT} />
        </mesh>
      ))}
    </group>
  );
}

/** Three status LEDs -- one steady power light, one state-colored light that pulses. */
function StatusLeds({ stateColor }: { stateColor: THREE.Color }) {
  const pulseRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const mat = pulseRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.7 + Math.sin(clock.elapsedTime * 3) * 0.5;
  });
  return (
    <group>
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[0.035, 0.035, 0.015]} />
        <meshStandardMaterial color="#34d399" emissive="#34d399" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={pulseRef} position={[0, 0, 0]}>
        <boxGeometry args={[0.035, 0.035, 0.015]} />
        <meshStandardMaterial color={stateColor} emissive={stateColor} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Two hot-swap drive bays -- small inset rectangles with a handle line, the other classic server-front cue. */
function DriveBays() {
  return (
    <group>
      {[-0.1, 0.1].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.28, 0.01]} />
            <meshStandardMaterial color="#0e1116" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.1, 0.006]}>
            <boxGeometry args={[0.11, 0.015, 0.01]} />
            <meshStandardMaterial color="#3a4150" roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * One 1U server chassis mounted in a rack: dark metal body, a vented left
 * section, status LEDs, and a pair of drive bays on the right -- the front
 * panel is deliberately built from the same handful of details every real
 * rack server has, rather than a plain glowing block.
 */
function ServerUnit({ y, state }: { y: number; state: THREE.Color }) {
  const front = UNIT_D / 2;
  return (
    <group position={[0, y, 0]}>
      <RoundedBox args={[UNIT_W, UNIT_H, UNIT_D]} radius={0.02} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial {...CHASSIS_MAT} />
      </RoundedBox>
      <group position={[-0.42, 0, front + 0.005]}>
        <Vents width={0.85} height={0.22} />
      </group>
      <group position={[0.62, 0, front + 0.006]}>
        <DriveBays />
      </group>
      <group position={[0.16, 0, front + 0.006]}>
        <StatusLeds stateColor={state} />
      </group>
      {/* Edge-lit accent strip along the bottom front lip, tinted by this unit's current state. */}
      <mesh position={[0, -UNIT_H / 2 + 0.01, front + 0.002]}>
        <boxGeometry args={[UNIT_W - 0.06, 0.015, 0.008]} />
        <meshStandardMaterial color={state} emissive={state} emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Two vertical rack rails (square posts, not rounded -- reads as structural, not decorative) plus mounted units. */
function Rack({ x, units }: { x: number; units: { state: THREE.Color }[] }) {
  const railHeight = 2.5;
  return (
    <group position={[x, 0, 0]}>
      {[-UNIT_W / 2 - 0.06, UNIT_W / 2 + 0.06].map((rx, i) => (
        <group key={i} position={[rx, 0.1, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.07, railHeight, 0.07]} />
            <meshStandardMaterial {...RAIL_MAT} />
          </mesh>
          <mesh position={[0, 0, 0.036]}>
            <boxGeometry args={[0.012, railHeight - 0.1, 0.001]} />
            <meshStandardMaterial color="#2a3040" roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      ))}
      {units.map((u, i) => (
        <ServerUnit key={i} y={UNIT_Y[i]} state={u.state} />
      ))}
    </group>
  );
}

/** The small module physically carried between the two racks -- a chassis-like block with a latch handle. */
function ModuleCaddy({ meshRef }: { meshRef: React.RefObject<THREE.Mesh> }) {
  return (
    <group>
      <RoundedBox ref={meshRef} args={[0.5, 0.32, 0.7]} radius={0.02} smoothness={2} castShadow>
        <meshStandardMaterial color={COLOR_IDLE} emissive={COLOR_IDLE} emissiveIntensity={0.85} roughness={0.4} metalness={0.3} />
      </RoundedBox>
    </group>
  );
}

const SOURCE_SLOT = new THREE.Vector3(RACK_X.source, UNIT_Y[0], UNIT_D / 2 + 0.35);
const DEST_SLOT = new THREE.Vector3(RACK_X.dest, UNIT_Y[1], UNIT_D / 2 + 0.35);

/**
 * Single source of truth for "where is the module, what color is it" at any
 * scroll offset -- used by both the module mesh itself and the camera, so
 * the camera can always know exactly where to look without depending on
 * reading another component's mesh ref a frame late.
 */
function moduleStateAt(o: number) {
  const travelT = clamp01((o - 0.22) / 0.58);
  const arc = 0.9 * Math.sin(travelT * Math.PI);
  const position = new THREE.Vector3(
    THREE.MathUtils.lerp(SOURCE_SLOT.x, DEST_SLOT.x, travelT),
    THREE.MathUtils.lerp(SOURCE_SLOT.y, DEST_SLOT.y, travelT) + arc,
    THREE.MathUtils.lerp(SOURCE_SLOT.z, DEST_SLOT.z, travelT),
  );
  const toRecording = clamp01((o - 0.22) / 0.1);
  const toArchived = clamp01((o - 0.52) / 0.12);
  const color = COLOR_IDLE.clone().lerp(COLOR_RECORDING, toRecording).lerp(COLOR_ARCHIVED, toArchived);
  return { position, color, travelT };
}

// Hand-authored camera keyframes, one per narrative beat boundary (o = 0, .25, .5, .75, 1).
// The canvas now only occupies its own dedicated right-hand column (see
// ScrollStory), so "look at X" is genuinely "X renders at the center of that
// column" -- no more guessing how to bias a full-bleed shot toward one side.
const CAMERA_KEYFRAMES: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [
  { pos: new THREE.Vector3(-1.5, 0.35, 2.1), look: new THREE.Vector3(-2.35, 0.8, 0.3) }, // 0.00 -- on the source rack
  { pos: new THREE.Vector3(-1.6, 0.4, 2.5), look: new THREE.Vector3(-2.0, 0.8, 0.5) }, // 0.25 -- module about to eject
  { pos: new THREE.Vector3(0, 0.5, 3.6), look: new THREE.Vector3(0, 0.75, 0.7) }, // 0.50 -- mid-transit, arc peak
  { pos: new THREE.Vector3(1.6, 0.4, 2.5), look: new THREE.Vector3(2.0, 0.8, 0.5) }, // 0.75 -- arriving at destination (mirrors 0.25)
  { pos: new THREE.Vector3(0, 1.7, 7.2), look: new THREE.Vector3(0, 0.1, 0) }, // 1.00 -- wide reveal of both racks
];

function CameraRig({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const camRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(() => {
    if (!camRef.current) return;
    const o = offsetRef.current ?? 0;
    const segCount = CAMERA_KEYFRAMES.length - 1;
    const scaled = clamp01(o) * segCount;
    const i = Math.min(Math.floor(scaled), segCount - 1);
    const t = scaled - i;
    const a = CAMERA_KEYFRAMES[i];
    const b = CAMERA_KEYFRAMES[i + 1];

    camRef.current.position.lerpVectors(a.pos, b.pos, t);
    const look = a.look.clone().lerp(b.look, t);
    camRef.current.lookAt(look);
  });

  return <PerspectiveCamera ref={camRef} makeDefault fov={42} near={0.1} far={60} position={CAMERA_KEYFRAMES[0].pos} />;
}

/** The whole animated group: reads scroll offset each frame and re-poses the traveling module + unit states. */
function Scene({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const traveler = useRef<THREE.Mesh>(null);
  const travelerLight = useRef<THREE.PointLight>(null);

  useFrame(() => {
    if (!traveler.current) return;
    const { position, color, travelT } = moduleStateAt(offsetRef.current ?? 0);
    traveler.current.position.copy(position);
    traveler.current.rotation.y = travelT * Math.PI * 0.15;

    const mat = traveler.current.material as THREE.MeshStandardMaterial;
    mat.color.copy(color);
    mat.emissive.copy(color);
    if (travelerLight.current) {
      travelerLight.current.color.copy(color);
      travelerLight.current.position.copy(position);
    }
  });

  return (
    <group>
      <Rack x={RACK_X.source} units={[{ state: COLOR_IDLE }, { state: COLOR_IDLE }, { state: COLOR_IDLE }]} />
      <Rack
        x={RACK_X.dest}
        units={[{ state: COLOR_ARCHIVED }, { state: COLOR_ARCHIVED }, { state: new THREE.Color('#2a3040') }]}
      />
      <ModuleCaddy meshRef={traveler} />
      <pointLight ref={travelerLight} intensity={1.8} distance={3.5} color={COLOR_IDLE} />
      <CameraRig offsetRef={offsetRef} />
    </group>
  );
}

function Lighting() {
  return (
    <>
      {/* Hemisphere light is what actually makes a low-metalness surface readable without an env map --
          cheap sky/ground ambient fill, no reflections required. */}
      <hemisphereLight args={['#4b5a8a', '#0a0a0c', 0.65]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, 3, 4]} intensity={0.6} color="#8b93ff" />
      <pointLight position={[RACK_X.source, 1.5, 2]} intensity={1.1} color={COLOR_IDLE} distance={5} />
      <pointLight position={[RACK_X.dest, 1.5, 2]} intensity={1.1} color={COLOR_ARCHIVED} distance={5} />
    </>
  );
}

/**
 * Pure 3D canvas, no scroll-capture of its own -- it just reads whatever
 * scroll progress (0..1) ScrollStory hands it via offsetRef every frame.
 * Meant to fill whatever fixed-size column its parent gives it.
 */
export function RackCanvas({ offsetRef }: { offsetRef: React.RefObject<number> }) {
  const dpr = useMemo<[number, number]>(() => [1, 2], []);
  return (
    <Canvas shadows dpr={dpr} gl={{ antialias: true }}>
      <color attach="background" args={['#05070a']} />
      <fog attach="fog" args={['#05070a', 9, 26]} />
      <Lighting />
      <Scene offsetRef={offsetRef} />
    </Canvas>
  );
}
