import * as THREE from "three";
import { planTrees } from "./tree-placement.mjs";

// Procedural low-poly trees are illustrative models, not surveyed tree geometry.
// Instance meshes share geometry and keep phone GPU draw calls bounded.
window.umbraCreateTreeLayer = (maplibregl) => {
  const maxTrees = 700;
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
      const trees = planTrees(features, maxTrees);
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
          flatShading: false,
        });
      const trunk = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.15, 0.27, 1, 8),
        material(0x76533a),
        trees.length,
      );
      const crowns = [0x39733a, 0x478345, 0x528e4a, 0x619c56, 0x70a85e].map(
        (color) =>
          new THREE.InstancedMesh(
            new THREE.SphereGeometry(1, 8, 6),
            material(color),
            trees.length,
          ),
      );
      objects = [trunk, ...crowns];
      const transform = new THREE.Object3D();
      const offsets = [
        [-0.42, -0.12, -0.08],
        [0.38, 0.12, -0.07],
        [-0.04, 0.38, -0.04],
        [0.05, -0.35, 0.0],
        [0, 0, 0.15],
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
          transform.rotation.set(0, 0, j * 0.8 + tree.seed);
          transform.scale.set(
            tree.radius * (j === 4 ? 0.72 : 0.66),
            tree.radius * (j === 4 ? 0.72 : 0.66),
            tree.height * (j === 4 ? 0.24 : 0.21),
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
      if (!count || !window.umbraTreeModelsEnabled || !origin) return;
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
