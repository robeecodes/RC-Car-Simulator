import * as THREE from "three";
import {GLTFLoader} from "three/addons";
import * as CANNON from "cannon-es";
import {ShapeType, threeToCannon} from "three-to-cannon";
import RoadKit from "../roadkits/RoadKit.js";

/**
 * Abstract Class World.
 *
 * @class World
 */
export default class World {
    // World is a Singleton
    static instance = null;

    /**
     *
     * @param {GLTFLoader} loader The Three.js GLTFLoader
     * @param {THREE.Scene} scene The Three.js scene
     * @param {CANNON.World} physicsWorld The cannon-es physics world
     * @param {CANNON.Material} groundMaterial The ground physics material
     * @param {THREE.PerspectiveCamera} camera The Three.js camera
     * @param {Function} createCarCallback Function to create a car in the world
     * @param {String} modelPath The path to the world model
     */
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

        // Reference the car once it's created
        this.car = null

        this.roadKit = new RoadKit(this.scene, physicsWorld, groundMaterial, camera);

        this.isLoaded = false;

        // Info for living room objects
        this.objects = {};

        // Info for interactable objects
        this.interactables = {};

        this._loadModel(loader, modelPath).then(() => {
            this._addPhysics(physicsWorld, groundMaterial);
            this._createInstance();
            this._assignInteractables();
            createCarCallback();

            // Wait for car to load before proceeding
            const checkCarLoaded = () => {
                if (this.car && this.car.isLoaded) {
                    this._start();
                } else {
                    requestAnimationFrame(checkCarLoaded); // Check again in the next frame
                }
            };

            checkCarLoaded();
        });
    }

    /**
     * Load and store model attributes
     * @param {GLTFLoader} loader The Three.js GLTFLoader
     * @param {String} modelPath The path to the model
     * @returns {Promise<void>}
     * @protected
     */
    async _loadModel(loader, modelPath) {

        // Load the model
        const gltf = await loader.loadAsync(modelPath);
        const model = gltf.scene;

        // Traverse the model to find each object
        model.traverse(child => {
            if (child.isMesh) {
                // Store the car starting postion
                if (child.name === "CarStart") {
                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    this.carStart.position = position;
                    this.carStart.rotation = 0;
                    return;
                }

                // Check what the model is based on its name
                const name = child.name.split("_");
                const isNested = !isNaN(name[name.length - 1]);

                const tag = name.length >= 3 && isNaN(name[2]) ? name[0] + "_" + name[2] : name[0];

                child.castShadow = true;
                child.receiveShadow = true;

                // Store roadkit tiles
                if (name.length > 1 && name[1] === "RoadKit") {
                    const tag = name[0];

                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(isNested ? child.parent : child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    // Assign the first tile position of the grid
                    if (tag === "StartTile") {
                        if (!(name[2] === "1")) return;
                        // Initialise the roadkit grid
                        this.roadKit.initialiseGrid(5, 5, position);
                    } else if (!this.roadKit.tiles[tag].mesh) {
                        // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                        const mesh = isNested ? child.parent : child;
                        const height = box3.max.y - box3.min.y;

                        // Make sure all geometry is centered
                        if (mesh.children) {
                            mesh.children.forEach(child => {
                                child.geometry.translate(-position.x, -position.y + height / 2, -position.z);
                            });
                        }

                        // Store tile info
                        this.roadKit.tiles[tag].mesh = mesh;
                        this.roadKit.tiles[tag].height = height;
                    }
                    return
                }
                // If the object hasn't been stored yet, store it
                if (!this.objects[tag]) {
                    const shapeType = name.length > 1 && isNaN(name[1]) && name[1] !== "None" ? name[1] : null;
                    // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                    const mesh = isNested ? child.parent : child;

                    // Get the position of the mesh
                    const box3 = new THREE.Box3().setFromObject(isNested ? child.parent : child);
                    const position = new THREE.Vector3();
                    box3.getCenter(position);

                    // Set the origin of the geometry
                    child.geometry.translate(-position.x, -position.y, -position.z);
                    child.position.set(position.x, position.y, position.z);

                    // Store the object
                    this.objects[tag] = {shapeType, position, mesh};
                }
            }
        });
    }

    /**
     * Add physics to objects with assigned shapes
     * @param {CANNON.World} physicsWorld The cannon-es physics world
     * @param {CANNON.Material} groundMaterial The cannon-es ground material
     * @protected
     */
    _addPhysics(physicsWorld, groundMaterial) {
        Object.entries(this.objects).forEach(([key, target]) => {
            this._addBody(physicsWorld, groundMaterial, key, target);
        });
    }

    /**
     * For each world, if any bodies need additional transforms, it happens here
     * @param {String} key The key for the object
     * @param {THREE.Mesh} mesh The mesh of the object
     * @param {CANNON.Body} body The physics body of the object
     * @private
     */
    _applyCustomisations(key, mesh, body) {
    }

    /**
     * Add a physics body to an object
     * @param {CANNON.World} physicsWorld The cannon-es physics world
     * @param {CANNON.Material} groundMaterial The cannon-es ground material
     * @param {String} key The key of the object
     * @param {Object} target The object to add a body to
     * @private
     */
    _addBody(physicsWorld, groundMaterial, key, target) {
        if (!target.shapeType) return;

        // Create cannon body
        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(target.position.x, target.position.y, target.position.z),
            material: groundMaterial
        });

        // Create body based on shape type
        const shapeType = this._getShapeType(target.shapeType);
        const mesh = target.mesh.isMesh ? target.mesh : target.mesh.children[0];
        const physicsShape = threeToCannon(mesh, {type: shapeType});

        // Add shape to body
        const {shape, offset, orientation} = physicsShape;
        body.addShape(shape);

        // Apply any customisations
        this._applyCustomisations(key, mesh, body);

        // Add body to physics world
        physicsWorld.addBody(body);
        target.body = body;
    }

    /**
     * Get the shape type for the body
     * @param {String} shapeType The shape type to get
     * @returns {ShapeType|null}
     * @protected
     */
    _getShapeType(shapeType) {
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

    /**
     * Assign any interactable elements in the world
     * @protected
     */
    _assignInteractables() {

    }

    /**
     * Interactions to detect in the world
     * @protected
     */
    _interactions() {

    }

    /**
     * Add all pbjects to the scene
     * @protected
     */
    _createInstance() {
        Object.entries(this.objects).forEach(([key, value]) => {
            if (value.mesh.parent !== null) value.mesh.parent.remove(value.mesh);
            this.scene.add(value.mesh);
        });
    }

    /**
     * Any additional operations which need to happen after all models are loaded and configured
     * @protected
     */
    _start() {
        this.isLoaded = true;
    }

    /**
     * Update function to run every frame
     */
    update() {

    }
}