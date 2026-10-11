"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Edges, Line, OrbitControls, RoundedBox } from "@react-three/drei";
import { useMotionValueEvent, type MotionValue } from "motion/react";
import * as THREE from "three";
import {
  SceneFallback,
  type SceneLabels,
  type SceneView,
} from "./CornerShowcase";

import WalkingHuman from "./WalkingHuman";

const TURQUOISE = "#68ead2";
type Props = {
  labels: SceneLabels;
  onReady: () => void;
  progress: MotionValue<number>;
  view: SceneView;
  reset: number;
  reduced: boolean;
};
type ControlsHandle = { target: THREE.Vector3; update: () => void };

function ConcreteMaterial({ dark = false }: { dark?: boolean }) {
  const texture = useMemo(() => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    let seed = 4721;
    for (let i = 0; i < size * size; i++) {
      seed = (seed * 16807) % 2147483647;
      const value = 185 + (seed % 50);
      data.set([value, value, value, 255], i * 4);
    }
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(5, 5);
    map.needsUpdate = true;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <meshStandardMaterial
      color={dark ? "#3f4241" : "#aeb1ac"}
      roughness={0.87}
      metalness={0.05}
      bumpMap={texture}
      bumpScale={0.023}
    />
  );
}
function Architecture() {
  return (
    <group>
      <RoundedBox
        args={[10.5, 0.32, 9]}
        radius={0.09}
        smoothness={3}
        position={[0.35, -0.18, -0.2]}
        receiveShadow
      >
        <ConcreteMaterial dark />
      </RoundedBox>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0.35, -0.012, -0.2]}
        receiveShadow
      >
        <planeGeometry args={[10.3, 8.8]} />
        <meshStandardMaterial color="#535855" roughness={0.94} />
      </mesh>
      {Array.from({ length: 13 }, (_, i) => (
        <Line
          key={`h${i}`}
          points={[
            [-4.8, 0.001, -4.25 + i * 0.68],
            [5.4, 0.001, -4.25 + i * 0.68],
          ]}
          color="#484e4a"
          lineWidth={0.5}
          transparent
          opacity={0.38}
        />
      ))}
      {Array.from({ length: 15 }, (_, i) => (
        <Line
          key={`v${i}`}
          points={[
            [-4.8 + i * 0.72, 0.001, -4.55],
            [-4.8 + i * 0.72, 0.001, 4.15],
          ]}
          color="#484e4a"
          lineWidth={0.5}
          transparent
          opacity={0.38}
        />
      ))}
      <RoundedBox
        args={[3.2, 2.8, 3.8]}
        radius={0.025}
        smoothness={2}
        position={[-1.6, 1.4, 0.1]}
        castShadow
        receiveShadow
      >
        <ConcreteMaterial />
        <Edges threshold={25} color="#d0d1ca" transparent opacity={0.18} />
      </RoundedBox>
      <mesh position={[-1.6, 2.82, 0.1]} castShadow>
        <boxGeometry args={[3.28, 0.1, 3.88]} />
        <meshStandardMaterial color="#b9bcb5" roughness={0.82} />
      </mesh>
      <mesh position={[-1.6, 2.88, 0.1]}>
        <boxGeometry args={[2.85, 0.035, 3.45]} />
        <meshStandardMaterial color="#777c75" roughness={1} />
      </mesh>
      {[0.15, 1.05, 1.95].map((y) => (
        <Line
          key={y}
          points={[
            [0.008, y, -1.8],
            [0.008, y, 2],
            [-3.2, y, 2],
          ]}
          color="#72766f"
          lineWidth={0.65}
          transparent
          opacity={0.45}
        />
      ))}
      <Line
        points={[
          [0.015, 0.035, -1.8],
          [0.015, 2.79, -1.8],
        ]}
        color={TURQUOISE}
        lineWidth={1.5}
      />

      <mesh position={[1.65, 0.007, -2.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.35, 1.5]} />
        <meshBasicMaterial
          color={TURQUOISE}
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[
          [0, 0.022, -3.3],
          [3.33, 0.022, -3.3],
          [3.33, 0.022, -1.8],
          [0, 0.022, -1.8],
          [0, 0.022, -3.3],
        ]}
        color={TURQUOISE}
        lineWidth={1.3}
        dashed
        dashSize={0.09}
        gapSize={0.065}
      />
    </group>
  );
}
function CameraModel({ hidden }: { hidden: boolean }) {
  const lens = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-5.5, -0.8, -7).normalize(),
      ),
    [],
  );
  return (
    <group visible={!hidden}>
      <group position={[4.5, 0, 3.3]}>
        <mesh castShadow position={[0, 0.045, 0]}>
          <cylinderGeometry args={[0.36, 0.41, 0.09, 32]} />
          <meshStandardMaterial
            color="#252b29"
            metalness={0.75}
            roughness={0.27}
          />
        </mesh>
        <mesh castShadow position={[0, 0.68, 0]}>
          <cylinderGeometry args={[0.045, 0.065, 1.3, 16]} />
          <meshStandardMaterial
            color="#b4b7b4"
            metalness={0.75}
            roughness={0.23}
          />
        </mesh>
        <group position={[0, 1.4, 0]} quaternion={lens}>
          <RoundedBox
            args={[0.49, 0.32, 0.62]}
            radius={0.07}
            smoothness={3}
            castShadow
          >
            <meshStandardMaterial
              color="#d9ded8"
              roughness={0.36}
              metalness={0.35}
            />
          </RoundedBox>
          <mesh
            position={[0, 0, 0.36]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.132, 0.16, 0.14, 32]} />
            <meshStandardMaterial
              color="#151c1a"
              roughness={0.26}
              metalness={0.8}
            />
          </mesh>
          <mesh position={[0, 0, 0.435]}>
            <circleGeometry args={[0.095, 32]} />
            <meshStandardMaterial
              color="#143e37"
              metalness={0.9}
              roughness={0.08}
            />
          </mesh>
          <mesh position={[0, 0, 0.437]}>
            <ringGeometry args={[0.116, 0.125, 32]} />
            <meshBasicMaterial color={TURQUOISE} />
          </mesh>
          <mesh position={[0.17, 0.06, 0.317]}>
            <circleGeometry args={[0.012, 12]} />
            <meshBasicMaterial color={TURQUOISE} />
          </mesh>
        </group>
      </group>

      <Line
        points={[
          [4.5, 1.4, 3.3],
          [0, 0.025, -1.8],
        ]}
        color={TURQUOISE}
        transparent
        opacity={0.23}
        lineWidth={0.7}
        dashed
        dashSize={0.1}
        gapSize={0.12}
      />
      <Line
        points={[
          [4.5, 1.4, 3.3],
          [3.33, 0.025, -3.3],
        ]}
        color={TURQUOISE}
        transparent
        opacity={0.23}
        lineWidth={0.7}
        dashed
        dashSize={0.1}
        gapSize={0.12}
      />
    </group>
  );
}
function World({ labels, onReady, progress, view, reset, reduced }: Props) {
  const lightTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(0, 0, -2.6);
    return target;
  }, []);
  const { camera, invalidate, size } = useThree();
  const controls = useRef<ControlsHandle | null>(null);
  const moving = useRef(true);
  const target = useRef(new THREE.Vector3(0.15, 0.55, -0.35));
  const position = useRef(new THREE.Vector3(9.6, 8, -10.8));
  const annotations = useMemo(
    () => ({
      corner: new THREE.Vector3(-1.8, 3.15, 0.6),
      region: new THREE.Vector3(2.65, 0.12, -3.5),
      camera: new THREE.Vector3(4.5, 1.92, 3.3),
    }),
    [],
  );
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const key of ["corner", "region", "camera"] as const) {
      const node = labels[key].current;
      if (!node) continue;
      projected.copy(annotations[key]).project(camera);
      node.style.visibility =
        projected.z > 1 ||
        Math.abs(projected.x) > 0.96 ||
        Math.abs(projected.y) > 0.96 ||
        (key === "camera" && view === "camera")
          ? "hidden"
          : "visible";
      node.style.transform = `translate(-50%,-50%) translate3d(${(projected.x * 0.5 + 0.5) * size.width}px,${(-projected.y * 0.5 + 0.5) * size.height}px,0)`;
    }
  });
  useMotionValueEvent(progress, "change", () => invalidate());
  useEffect(() => {
    const views: Record<
      SceneView,
      [[number, number, number], [number, number, number]]
    > = {
      perspective: [
        [9.6, 8, -10.8],
        [0.15, 0.55, -0.35],
      ],
      camera: [
        [4.5, 1.43, 3.3],
        [0.0, 0.65, -2.5],
      ],
      overhead: [
        [0.4, 15, 0.01],
        [0.4, 0, -0.35],
      ],
    };
    position.current.set(...views[view][0]);
    target.current.set(...views[view][1]);
    const aspect = size.width / Math.max(1, size.height);
    if (view !== "camera") {
      position.current
        .sub(target.current)
        .multiplyScalar(Math.max(1, 1.28 / aspect))
        .add(target.current);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov =
        view === "camera"
          ? THREE.MathUtils.radToDeg(
              2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(26)) / aspect),
            )
          : 42;
      camera.updateProjectionMatrix();
    }
    moving.current = true;
    invalidate();
  }, [view, reset, invalidate, size.width, size.height, camera]);
  useFrame((_, delta) => {
    if (moving.current && controls.current) {
      const mix = reduced ? 1 : 1 - Math.exp(-delta * 6);
      camera.position.lerp(position.current, mix);
      controls.current.target.lerp(target.current, mix);
      controls.current.update();
      if (
        camera.position.distanceTo(position.current) < 0.008 &&
        controls.current.target.distanceTo(target.current) < 0.008
      )
        moving.current = false;
      else invalidate();
    }
  });
  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={["#f4f5f1", "#111313", 0.65]} />
      <directionalLight
        position={[-8, 7, -3]}
        target={lightTarget}
        intensity={3.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.1}
        shadow-camera-far={35}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[4, 3, 5]} intensity={0.65} color="#c6d0cb" />
      <primitive object={lightTarget} />
      <Architecture />
      <WalkingHuman progress={progress} onReady={onReady} />
      <CameraModel hidden={view === "camera"} />
      <OrbitControls
        ref={(value) => {
          controls.current = value;
        }}
        makeDefault
        enableDamping
        dampingFactor={0.09}
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0.02}
        maxPolarAngle={Math.PI / 2 - 0.06}
        onStart={() => {
          moving.current = false;
        }}
        target={[0.15, 0.55, -0.35]}
      />
    </>
  );
}
export default function CornerWorld(props: Props) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [9.6, 8, -10.8], fov: 42, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      fallback={<SceneFallback />}
      onCreated={({ gl }) => {
        gl.setClearColor("#080909", 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <World {...props} />
    </Canvas>
  );
}
