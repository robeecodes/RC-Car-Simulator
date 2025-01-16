import * as THREE from "three";

/**
 * Destroy a Three.js mesh
 * @param {THREE.Mesh} mesh The mesh to destroy
 * @param {THREE.Scene} scene The scene containing the mesh to destroy
 * @public
 */
export default function destroyThreeMesh(mesh, scene) {
    // Remove the mesh from the scene
    if (scene && mesh) scene.remove(mesh);

    // Recursively destroy child meshes
    if (mesh.children && mesh.children.length > 0) {
        mesh.children.forEach((child) => {
            destroyThreeMesh(child, null);
        });
    }

    // Dispose of the geometry
    if (mesh.geometry) mesh.geometry.dispose();

    // Dispose of the material
    if (mesh.material) {
        destroyMaterial(mesh.material);
    }

    // Make sure all properties are gone
    mesh.children = [];
    mesh.geometry = null;
    mesh.material = null;
}

/**
 * Destroy a Three.js material
 * @param {THREE.Material} material
 */
export function destroyMaterial(material) {
    // Handle materials that are arrays
    if (Array.isArray(material)) {
        material.forEach((mat) => mat.dispose());
    } else {
        material.dispose();
    }
    // Clean up texture references if applicable
    if (material.map) {
        material.map.dispose();
    }
}