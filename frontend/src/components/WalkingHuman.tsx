"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { MotionValue } from "motion/react";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/walking-human.glb`;
const HEIGHT = 1.75;
const TRAVEL = 6.2;
const STRIDE = 1.12;

/** CC0 Quaternius character; provenance and license are bundled with the GLB. */
const WalkingHuman = memo(function WalkingHuman({
  progress,
  onReady,
}: {
  progress: MotionValue<number>;
  onReady: () => void;
}) {
  // This GLB is uncompressed; avoid optional WASM decoders under the site's CSP.
  const { scene, animations } = useGLTF(MODEL_URL, false, false);
  const root = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const character = useMemo(() => {
    // Each showcase owns a skeleton/mixer so the login scene cannot share poses.
    const rig = clone(scene);
    const geometries: THREE.BufferGeometry[] = [];
    const material = new THREE.MeshStandardMaterial({
      color: "#c4c8bf",
      roughness: 0.72,
      metalness: 0.04,
    });
    rig.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.geometry.clone();
      source.deleteAttribute("normal");
      const smooth = mergeVertices(source, 0.00001);
      source.dispose();
      smooth.computeVertexNormals();
      object.geometry = smooth;
      geometries.push(smooth);
      object.material = material;
      object.castShadow = true;
      object.receiveShadow = true;
      // The skinned pose changes bounds while the source geometry stays fixed.
      object.frustumCulled = false;
    });
    const clip = animations.find((animation) => animation.name === "Walk");
    if (!clip)
      throw new Error("The showcase human is missing its walk animation");
    const mixer = new THREE.AnimationMixer(rig);
    mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.setTime(0);
    rig.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rig, true);
    const scale = HEIGHT / bounds.getSize(new THREE.Vector3()).y;
    const center = bounds.getCenter(new THREE.Vector3());
    const offset: [number, number, number] = [
      -center.x * scale,
      -bounds.min.y * scale,
      -center.z * scale,
    ];
    return { rig, mixer, clip, scale, offset, geometries, material };
  }, [scene, animations]);

  useEffect(() => {
    onReady();
    invalidate();
  }, [onReady, invalidate]);
  useEffect(() => {
    character.mixer
      .clipAction(character.clip)
      .reset()
      .setLoop(THREE.LoopRepeat, Infinity)
      .play();
    invalidate();
    return () => {
      character.mixer.stopAllAction();
      character.mixer.uncacheRoot(character.rig);
      character.rig.traverse((object) => {
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      });
      character.geometries.forEach((geometry) => geometry.dispose());
      character.material.dispose();
    };
  }, [character, invalidate]);
  useFrame(() => {
    const value = progress.get();
    // Sample from the shared playhead, not elapsed time: pause/scrub stay exact.
    character.mixer.setTime(
      ((value * TRAVEL) / STRIDE) * character.clip.duration,
    );
    if (root.current)
      root.current.position.set(-3.7 + value * TRAVEL, 0.02, -2.65);
  });

  return (
    <group
      ref={root}
      rotation={[0, Math.PI / 2, 0]}
      position={[-3.7 + progress.get() * TRAVEL, 0.02, -2.65]}
    >
      <group position={character.offset} scale={character.scale}>
        <primitive object={character.rig} dispose={null} />
      </group>
    </group>
  );
});

useGLTF.preload(MODEL_URL, false, false);
export default WalkingHuman;
