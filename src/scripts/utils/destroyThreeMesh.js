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
        destroyThreeMesh(mesh.material);
    }

    mesh.children = [];
    mesh.geometry = null;
    mesh.material = null;
}

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