import * as THREE from "three";
import * as CANNON from "cannon-es";
import {ShapeType, threeToCannon} from "three-to-cannon";
import RoadKit from "../roadkits/RoadKit.js";

/**
 * Abstract Class World.
 *
 * @class World
 */
export default class World {
    static instance = null;

    constructor(loader, scene, physicsWorld, groundMaterial, camera, createCarCallback, modelPath) {
        // Stop if trying to instantiate abstract
        if (this.constructor === World) {
            throw new Error("Abstract classes can't be instantiated.");
        }

        // Stop if a World already exists
        if (World.instance) {
            throw new Error("A World instance already exists!");
        }

        // Where the car should spawn
        this.carStart = {
            position: new THREE.Vector3(),
            rotation: 0
        }

        // Reference the scene
        this.scene = scene;

        // Reference the camera
        this.camera = camera;

        this.loader = loader;

        this.physicsWorld = physicsWorld;

        // Reference the car once it's created
        this.car = null

        this.roadKit = new RoadKit(this.scene, physicsWorld, groundMaterial, camera);

        this.isLoaded = false;

        // Info for living room objects
        this.objects = {};

        // Info for interactable objects
        this.interactables = {};

        this._LoadModel(loader, modelPath).then(() => {
            this._AddPhysics(physicsWorld, groundMaterial);
            this._CreateInstance();
            this._AssignInteractables();
            createCarCallback();

            // Wait for car to load before proceeding
            const checkCarLoaded = () => {
                if (this.car && this.car.isLoaded) {
                    this._Start();
                    this.isLoaded = true;
                } else {
                    requestAnimationFrame(checkCarLoaded); // Check again in the next frame
                }
            };

            checkCarLoaded();
        });
    }

    async _LoadModel(loader, modelPath) {
        const gltf = await loader.loadAsync(modelPath);

        const model = gltf.scene;

        model.traverse(child => {
            if (child.isMesh) {
                if (child.name === "CarStart") {
                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    this.carStart.position = position;
                    this.carStart.rotation = 0;
                    return;
                }
                const name = child.name.split("_");
                const isNested = !isNaN(name[name.length - 1]);

                const tag = name.length >= 3 && isNaN(name[2]) ? name[0] + "_" + name[2] : name[0];

                child.castShadow = true;
                child.receiveShadow = true;
                if (name.length > 1 && name[1] === "RoadKit") {
                    const tag = name[0];

                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(isNested ? child.parent : child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    // Assign the first tile position of the grid
                    if (tag === "StartTile") {
                        if (!(name[2] === "1")) return;
                        this.roadKit.initialiseGrid(5, 5, position);
                    } else if (!this.roadKit.tiles[tag].mesh) {
                        // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                        const mesh = isNested ? child.parent : child;
                        const height = box3.max.y - box3.min.y;

                        if (mesh.children) {
                            mesh.children.forEach(child => {
                                child.geometry.translate(-position.x, -position.y + height / 2, -position.z);
                            });
                        }

                        this.roadKit.tiles[tag].mesh = mesh;
                        this.roadKit.tiles[tag].height = height;
                    }
                    return
                }
                if (!this.objects[tag]) {
                    const shapeType = name.length > 1 && isNaN(name[1]) && name[1] !== "None" ? name[1] : null;
                    // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                    const mesh = isNested ? child.parent : child;

                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(isNested ? child.parent : child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    child.geometry.translate(-position.x, -position.y, -position.z);
                    child.position.set(position.x, position.y, position.z);

                    this.objects[tag] = {shapeType, position, mesh};
                }
            }
        });
    }

    _AddPhysics(physicsWorld, groundMaterial) {
        Object.entries(this.objects).forEach(([key, target]) => {
            this._AddBody(physicsWorld, groundMaterial, key, target);
        });
    }

    _ApplyCustomisations(key, mesh, body) {
        // For each world, if any bodies need additional transforms, it happens here
    }

    _AddBody(physicsWorld, groundMaterial, key, target) {
        if (!target.shapeType) return;

        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(target.position.x, target.position.y, target.position.z),
            material: groundMaterial
        });

        const shapeType = this._GetShapeType(target.shapeType);
        const mesh = target.mesh.isMesh ? target.mesh : target.mesh.children[0];
        const physicsShape = threeToCannon(mesh, {type: shapeType});

        const {shape, offset, orientation} = physicsShape;
        body.addShape(shape);

        this._ApplyCustomisations(key, mesh, body);

        physicsWorld.addBody(body);
        target.body = body;
    }

    _GetShapeType(shapeType) {
        switch (shapeType) {
            case "Box":
                return ShapeType.BOX;
            case "Sphere":
                return ShapeType.SPHERE;
            case "Hull":
                return ShapeType.HULL;
            case "Cylinder":
                return ShapeType.CYLINDER;
            case "Mesh":
                return ShapeType.MESH;
            default:
                return null;
        }
    }

    _AssignInteractables() {

    }

    _Interactions() {

    }

    _CreateInstance() {
        Object.entries(this.objects).forEach(([key, value]) => {
            if (value.mesh.parent !== null) value.mesh.parent.remove(value.mesh);
            this.scene.add(value.mesh);
        });
    }

    /**
     * Any additional operations which need to happen after all models are loaded and configured
     * @protected
     */
    _Start() {

    }

    update() {

    }
}