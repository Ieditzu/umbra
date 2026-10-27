import * as THREE from "three";

// Procedural low-poly trees are illustrative models, not surveyed tree geometry.
// Instance meshes share geometry and keep phone GPU draw calls bounded.
window.umbraCreateTreeLayer = (maplibregl) => {
  const maxTrees = 350;
  let map,
    renderer,
    scene,
    camera,
    origin,
    objects = [],
    count = 0;
  const disposeObjects = () => {
    for (const object of objects) {
      scene?.remove(object);
      object.geometry.dispose();
      object.material.dispose();
      object.dispose();
    }
    objects = [];
    count = 0;
  };
  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  }
  function position(feature) {
    const rings = feature.geometry?.coordinates;
    const ring = rings?.[0];
    if (!ring || ring.length < 4) return null;
    const valid = (p) =>
      pointInRing(p, ring) &&
      !rings.slice(1).some((hole) => pointInRing(p, hole));
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of ring) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    let center = [(minX + maxX) / 2, (minY + maxY) / 2];
    if (!valid(center)) {
      // Find a point in the polygon, even for crescent-shaped canopies with holes.
      let found = false;
      for (let y = 1; y < 8 && !found; y++)
        for (let x = 1; x < 8 && !found; x++) {
          const p = [
            minX + ((maxX - minX) * x) / 8,
            minY + ((maxY - minY) * y) / 8,
          ];
          if (valid(p)) {
            center = p;
            found = true;
          }
        }
      if (!found) return null;
    }
    const radius = Math.max(
      1.5,
      Math.min(
        7,
        Math.min(
          (maxX - minX) * 111320 * Math.cos((center[1] * Math.PI) / 180),
          (maxY - minY) * 111320,
        ) / 2,
      ),
    );
    const height = Math.max(
      3,
      Math.min(25, Number(feature.properties?.height) || 8),
    );
    return { center, radius, height };
  }
  const layer = {
    id: "umbra-tree-models",
    type: "custom",
    renderingMode: "3d",
    onAdd(mapInstance, gl) {
      map = mapInstance;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.25));
      const light = new THREE.DirectionalLight(0xffffff, 1.6);
      light.position.set(-80, -100, 180);
      scene.add(light);
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
      this.update(window.umbraTreeFeatures || []);
    },
    update(features) {
      window.umbraTreeFeatures = features;
      if (!scene) return;
      disposeObjects();
      const trees = features
        .filter((f) =>
          ["tree_canopy", "satellite_canopy"].includes(f.properties?.source),
        )
        .map(position)
        .filter(Boolean)
        .slice(0, maxTrees);
      if (!trees.length) {
        map?.triggerRepaint();
        return;
      }
      origin = maplibregl.MercatorCoordinate.fromLngLat(trees[0].center);
      const metre = origin.meterInMercatorCoordinateUnits();
      const material = (color) =>
        new THREE.MeshStandardMaterial({
          color,
          roughness: 1,
          flatShading: true,
        });
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.17, 0.28, 1, 6),
        material(0x76533a),
        trees.length,
      );
      const crowns = [0x3f833f, 0x4d9748, 0x5a9f50].map(
        (color) =>
          new THREE.InstancedMesh(
            new THREE.IcosahedronGeometry(1, 1),
            material(color),
            trees.length,
          ),
      );
      objects = [trunk, ...crowns];
      const transform = new THREE.Object3D();
      const offsets = [
        [-0.26, 0, 0.02],
        [0.24, 0.12, 0],
        [0, -0.12, 0.18],
      ];
      trees.forEach((tree, i) => {
        const pos = maplibregl.MercatorCoordinate.fromLngLat(tree.center);
        const x = (pos.x - origin.x) / metre,
          y = -(pos.y - origin.y) / metre;
        const trunkHeight = tree.height * 0.42;
        transform.position.set(x, y, trunkHeight / 2);
        transform.rotation.set(Math.PI / 2, 0, 0);
        transform.scale.set(
          Math.max(0.7, tree.radius * 0.22),
          trunkHeight,
          Math.max(0.7, tree.radius * 0.22),
        );
        transform.updateMatrix();
        trunk.setMatrixAt(i, transform.matrix);
        crowns.forEach((mesh, j) => {
          const [dx, dy, dz] = offsets[j];
          transform.position.set(
            x + dx * tree.radius,
            y + dy * tree.radius,
            trunkHeight + tree.height * 0.28 + dz * tree.height,
          );
          transform.rotation.set(0, 0, j * 0.8);
          transform.scale.set(
            tree.radius * 0.72,
            tree.radius * 0.72,
            tree.height * 0.29,
          );
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
        });
      });
      for (const object of objects) {
        object.instanceMatrix.needsUpdate = true;
        object.frustumCulled = false;
        scene.add(object);
      }
      count = trees.length;
      map.triggerRepaint();
    },
    render(gl, args) {
      if (!count || map.getPitch() <= 2 || !origin) return;
      const meter = origin.meterInMercatorCoordinateUnits();
      const projection = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix,
      );
      const local = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(meter, -meter, meter));
      camera.projectionMatrix = projection.multiply(local);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      disposeObjects();
      renderer?.dispose();
      renderer = undefined;
      scene = undefined;
      map = undefined;
      if (window.umbraTreeLayer === layer) window.umbraTreeLayer = null;
    },
    inspect() {
      return { count, active: !!scene };
    },
  };
  return layer;
};
