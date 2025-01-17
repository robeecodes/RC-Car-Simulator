import * as THREE from 'three';
import * as Tone from "tone";
import * as CANNON from "cannon-es";
import {GLTFLoader} from "three/addons";

import {threeToCannon, ShapeType} from 'three-to-cannon';
import proximityVolume from "../utils/proximityVolume.js";
import * as Three from "three";

/**
 * Abstract Class Car.
 *
 * @class Car
 * @abstract
 */
export default class Car {
    // Only one Car should exist
    static instance = null;
    // Store currently pressed keys
    static pressed = {};

    /**
     * Create a car
     * @param {GLTFLoader} loader The GLTFLoader
     * @param {THREE.Scene} scene The Three.js scene
     * @param {CANNON.World} physicsWorld The cannon-es physics world
     * @param {THREE.Vector3} startPosition The start position of the car
     * @param {CANNON.Material} wheelMaterial The physics material for the wheels
     * @param {THREE.PerspectiveCamera} camera The Three.js camera for the scene
     * @param {Number} maxForce The maximum force to apply to the car
     * @param {String} modelPath The path to the car model
     */
    constructor(loader, scene, physicsWorld, startPosition, wheelMaterial, camera, maxForce, modelPath) {
        // Stop if trying to instantiate abstract
        if (this.constructor === Car) {
            throw new Error("Abstract classes can't be instantiated.");
        }

        // Stop if a Car already exists
        if (Car.instance) {
            throw new Error("A Car instance already exists!");
        }

        // Code for car properties
        // The physics vehicle
        this.vehicle = null;
        // The chassis physics body
        this.chassis = null;
        // Data for all models
        this.models = {
            chassis: {
                mesh: null,
                position: new THREE.Vector3(0, 0, 0),
                size: new THREE.Box3()
            },
            wheels: [{}, {}, {}, {}],
            deco: []
        }

        // Max force to apply to the car
        this.maxForce = maxForce;

        // Flag id the car can drive
        this.isDriving = true;

        // The start position of the car
        this.startPosition = startPosition;

        // Code for loading the model
        this.isLoaded = false;
        this.model = null;

        // Audio
        // Configure gainNode to control gain
        this.gainNode = new Tone.Gain(1).toDestination();
        // Flag if engine is running
        this.engineRunning = false;

        // Configure collision frequency
        this.lastCollisionTime = 0;

        this.camera = camera;

        this._loadModel(loader, modelPath).then(() => {
            this._addPhysics(physicsWorld, wheelMaterial);
            this._createInstance(scene);

            // Wait for vehicle to load before proceeding
            const checkVehicleLoaded = () => {
                if (this.chassis) {
                    // Configure honk and engine noise
                    this._createHonk();
                    this._createEngineNoise();
                    this._createCollisionNoise();
                    this.isLoaded = true;
                } else {
                    requestAnimationFrame(checkVehicleLoaded); // Check again in the next frame
                }
            };
            checkVehicleLoaded();
        });
    }

    /**
     * Load and store models from a given gltf
     * @param {GLTFLoader} loader The GLTFLoader
     * @param {String} modelPath The path to the model
     * @returns {Promise<void>}
     * @async
     * @protected
     */
    async _loadModel(loader, modelPath) {
        const gltf = await loader.loadAsync(modelPath);

        // Save the loaded model
        this.model = gltf.scene;

        // Access the wheelPositions
        const thisCar = this;
        // Modify model properties
        this.model.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Get the size of the mesh
                const box3 = new THREE.Box3().setFromObject(child);
                const size = new THREE.Vector3();
                box3.getSize(size);

                // Get the center of the mesh
                const center = new THREE.Vector3();
                box3.getCenter(center);

                const name = child.name.split("_");
                let tag = name[0]
                if (name.length > 1) tag += "_" + name[1];

                // If the mesh is a wheel, store the wheel data
                if (name.includes("Wheel")) {
                    // If it's nested, position it to match the existing wheel
                    if (!isNaN(name[name.length - 1]) && name[name.length - 1] !== "1") {
                        let position = new THREE.Vector3();
                        // Left front wheel position
                        if (tag === "L_Front") position = thisCar.models.wheels[0].position;
                        // Right front wheel position
                        else if (tag === "R_Front") position = thisCar.models.wheels[1].position;
                        // Left back wheel position
                        else if (tag === "L_Back") position = thisCar.models.wheels[2].position;
                        // Right back wheel position
                        else if (tag === "R_Back") position = thisCar.models.wheels[3].position;

                        // Set origin to centre
                        child.geometry.translate(-position.x, -position.y, -position.z);
                    } else {
                        // Store wheel data
                        const thisWheel = {
                            position: new THREE.Vector3(),
                            radius: 0,
                            mesh: new THREE.Object3D(),
                            tag: tag // The specific wheel position
                        }

                        thisWheel.position = center;

                        thisWheel.radius = size.y / 2;

                        // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                        if (!isNaN(name[name.length - 1])) thisWheel.mesh = child.parent;
                        else thisWheel.mesh = child;

                        // Set new origin for the mesh
                        child.geometry.translate(-center.x, -center.y, -center.z);

                        // Assign wheel based on its position on the car
                        // Left front
                        if (tag === "L_Front") thisCar.models.wheels[0] = thisWheel;
                        // Right front
                        else if (tag === "R_Front") thisCar.models.wheels[1] = thisWheel;
                        // Left back
                        else if (tag === "L_Back") thisCar.models.wheels[2] = thisWheel;
                        // Right back
                        else if (tag === "R_Back") thisCar.models.wheels[3] = thisWheel;
                    }
                } else if (tag === "Car_Body") {
                    if (child.name === "Car_Body_1" || child.name === "Car_Body") {
                        // Store the chassis
                        thisCar.models.chassis.size = size;

                        // If there are nested elements, set mesh to the parent, otherwise, just use the child
                        if (!isNaN(name[name.length - 1])) thisCar.models.chassis.mesh = child.parent;
                        else thisCar.models.chassis.mesh = child;

                        thisCar.models.chassis.position = center;
                        // Set new origin for the mesh
                        child.geometry.translate(-center.x, -center.y, -center.z);
                    } else {
                        // If nested mesh, position it where the chassis is
                        child.geometry.translate(-thisCar.models.chassis.position.x, -thisCar.models.chassis.position.y, -thisCar.models.chassis.position.z);
                    }
                } else {
                    // Store any additional decorative elements of the car
                    thisCar.models.deco.push({
                        mesh: child,
                        position: new THREE.Vector3(center.x, center.y, center.z)
                    });
                }
            }
        });
        this.model = null;
    }

    /**
     * Create the physics car
     * @param {CANNON.World} physicsWorld The physics world
     * @param {CANNON.Material} wheelMaterial The wheel material
     * @private
     */
    _addPhysics(physicsWorld, wheelMaterial) {
        // Position for the car body
        const bodyPosition = this.models.chassis.position;

        // Adjust chassis position to match the start position
        this.startPosition = new CANNON.Vec3(
            this.startPosition.position.x + bodyPosition.x,
            bodyPosition.y,
            this.startPosition.position.z + bodyPosition.z
        );

        // Create a rigid body for the car chassis
        this.chassis = new CANNON.Body({
            mass: 1,
            position: this.startPosition,
        });

        // Create chassis shape
        const chassisShape = threeToCannon(this.models.chassis.mesh, {type: ShapeType.HULL});
        const {shape, offset, orientation} = chassisShape;
        this.chassis.addShape(shape);

        // Set damping to prevent rolling
        this.chassis.angularDamping = 0.98;

        // Add chassis body to the world
        physicsWorld.addBody(this.chassis);

        // Create vehicle from chassis
        this.vehicle = new CANNON.RigidVehicle({
            chassisBody: this.chassis
        });

        // Add wheels
        this.models.wheels.forEach((wheel, index) => {
            const wheelBody = new CANNON.Body({
                mass: 1,
                material: wheelMaterial
            });

            // Use a sphere shape for the wheels
            const wheelShape = new CANNON.Sphere(wheel.radius);
            wheelBody.addShape(wheelShape);
            wheelBody.angularDamping = 0.98;

            // Attach wheel to the chassis at the appropriate position
            this.vehicle.addWheel({
                body: wheelBody,
                position: new CANNON.Vec3(
                    wheel.position.x - bodyPosition.x,
                    wheel.position.y - bodyPosition.y,
                    wheel.position.z - bodyPosition.z
                ),
                axis: new CANNON.Vec3(1, 0, 0),
                direction: new CANNON.Vec3(0, -1, 0),
                frictionSlip: 1.5,
            });

            // Add the wheel body to the world
            physicsWorld.addBody(wheelBody);
        });

        // Wheels face forward by default
        this.vehicle.setSteeringValue(0, 0);
        this.vehicle.setSteeringValue(0, 1);

        // Add the vehicle to the physics world
        this.vehicle.addToWorld(physicsWorld);

        this._syncToPhysics();
    }

    /**
     * Sync models to their physics body
     * @protected
     */
    _syncToPhysics() {
        // Sync the chassis
        this.models.chassis.mesh.position.copy(this.chassis.position);
        this.models.chassis.mesh.quaternion.copy(this.chassis.quaternion);

        // Sync each wheel mesh with the wheel body
        this.vehicle.wheelBodies.forEach((wheelBody, index) => {
            const wheelMesh = this.models.wheels[index].mesh
            wheelMesh.position.copy(wheelBody.position);
            wheelMesh.quaternion.copy(wheelBody.quaternion);
        });
    }

    /**
     * Add the car models to the scene and set this instance
     * @param {THREE.Scene} scene The three.js scene
     * @protected
     */
    _createInstance(scene) {
        // Remove the chassis model from parent if applicable
        if (this.models.chassis.mesh.parent !== null) {
            this.models.chassis.mesh.parent.remove(this.models.chassis.mesh);
        }
        // Add chassis model to scene
        scene.add(this.models.chassis.mesh);

        // Remove each wheel model from parent, if applicable, and add to scene
        this.models.wheels.forEach((wheel, index) => {
            if (wheel.mesh.parent !== null) {
                wheel.mesh.parent.remove(wheel.mesh);
            }
            scene.add(wheel.mesh);
        });

        // Remove each decorative model from parent, if applicable, and add to scene
        this.models.deco.forEach(deco => {
            if (deco.mesh.parent !== null) {
                deco.mesh.parent.remove(deco.mesh);
            }
            this.models.chassis.mesh.attach(deco.mesh);
            // Position decorations to match the car position
            deco.mesh.position.x = deco.mesh.position.x - this.models.chassis.position.x;
            deco.mesh.position.y = deco.mesh.position.y - this.models.chassis.position.y;
            deco.mesh.position.z = deco.mesh.position.z - this.models.chassis.position.z;
        });

        // Event listeners for keypresses
        window.addEventListener('keydown', (e) => {
            Car.pressed[e.key.toUpperCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            Car.pressed[e.key.toUpperCase()] = false;
        });

        // Save instance
        Car.instance = this;
    }

    /**
     * Code to move the car
     * @protected
     */
    _drive() {
        // Accelerate when W or Arrow Up is pressed
        if (Car.pressed['W'] || Car.pressed['ARROWUP']) {
            this.vehicle.setWheelForce(this.maxForce, 0);
            this.vehicle.setWheelForce(this.maxForce, 1);
            this.vehicle.setWheelForce(this.maxForce, 2);
            this.vehicle.setWheelForce(this.maxForce, 3);
            // If no engine sound is playing, start playing
            if (!this.engineRunning) {
                this.engine.start();
                this.engineRunning = true;
            }
        }

        // Reverse when pressing S or Arrow Down
        if (Car.pressed['S'] || Car.pressed['ARROWDOWN']) {
            this.vehicle.setWheelForce(-this.maxForce, 0);
            this.vehicle.setWheelForce(-this.maxForce, 1);
            this.vehicle.setWheelForce(-this.maxForce, 2);
            this.vehicle.setWheelForce(-this.maxForce, 3);
            // If no engine sound is playing, start playing
            if (!this.engineRunning) {
                this.engine.start();
                this.engineRunning = true;
            }
        }

        // If car is not accelerating or decelerating, stop applying force to wheels
        if (!(Car.pressed['W'] || Car.pressed['ARROWUP'] || Car.pressed['S'] || Car.pressed['ARROWDOWN'])) {
            this.vehicle.setWheelForce(0, 0);
            this.vehicle.setWheelForce(0, 1);
            this.vehicle.setWheelForce(0, 2);
            this.vehicle.setWheelForce(0, 3);
            // If the engine is playing, stop it
            if (this.engineRunning) {
                this.engine.stop();
                // Brief timeout to ensure the player has stopped
                setTimeout(() => {
                    this.engineRunning = false;
                }, 200);
            }
        }

        // Steer left when pressing A or Arrow Left
        if (Car.pressed['A'] || Car.pressed['ARROWLEFT']) {
            this.vehicle.setSteeringValue(0.25, 0);
            this.vehicle.setSteeringValue(0.25, 1);
        }

        // Steer right when pressing D or Arrow Right
        if (Car.pressed['D'] || Car.pressed['ARROWRIGHT']) {
            this.vehicle.setSteeringValue(-0.25, 0);
            this.vehicle.setSteeringValue(-0.25, 1);
        }

        // Stop steering if no steering key is pressed
        if (!(Car.pressed['A'] || Car.pressed['ARROWLEFT'] || Car.pressed['D'] || Car.pressed['ARROWRIGHT'])) {
            this.vehicle.setSteeringValue(0, 0);
            this.vehicle.setSteeringValue(0, 1);
        }
    }

    /**
     * Disable car driving
     * @public
     */
    stopDriving() {
        this.isDriving = false;
    }

    /**
     * Enable car driving
     * @public
     */
    resumeDriving() {
        this.isDriving = true;
    }

    /**
     * Create the honk noise for the car
     * @protected
     */
    _createHonk() {
        // Honk sfx
        this.honk = new Tone.Synth({
            "volume": 0,
            "detune": 50,
            "portamento": 1,
            "envelope": {
                "attack": 0.05,
                "attackCurve": "exponential",
                "decay": 0.2,
                "decayCurve": "exponential",
                "release": 0.1,
                "releaseCurve": "exponential",
                "sustain": 0.2
            },
            "oscillator": {
                "partialCount": 50,
                "partials": [
                    0.39279815297067894,
                    -0.3183098861837907,
                    0.39279815297067894,
                    -0.15915494309189535,
                    0.12732395447351627,
                    0.586181640625,
                    0.586181640625,
                    0.586181640625,
                    0.586181640625,
                    0.39279815297067894,
                    0.39279815297067894,
                    0.586181640625,
                    0.048970751720583176,
                    0.030140817901234556,
                    0.7060667438271603,
                    -0.039788735772973836,
                    0.7060667438271603,
                    1,
                    1,
                    -0.03183098861837907,
                    0.8434636622299385,
                    1,
                    0.027679120537720932,
                    -0.026525823848649224,
                    0.8434636622299385,
                    -0.024485375860291588,
                    0.8434636622299385,
                    -0.022736420441699334,
                    0.030140817901234556,
                    0.00390625,
                    0.08608519000771608,
                    0.0625,
                    0.152587890625,
                    1,
                    0.39279815297067894,
                    -0.01768388256576615,
                    0.8434636622299385,
                    0.8434636622299385,
                    0.01632358390686106,
                    0.31640625,
                    0.015527311521160523,
                    -0.015157613627799556,
                    0.01480511098529259,
                    0.030140817901234556,
                    0.014147106052612919,
                    0.0625,
                    0.11578896604938264,
                    0.25173912519290115,
                    0.01299224025239962,
                    -0.012732395447351627
                ],
                "phase": 900,
                "type": "custom"
            }
        }).toDestination();

        // Connect to gain node to control proximity audio
        this.honk.connect(this.gainNode);

        // Honk with space
        window.addEventListener('keydown', (e) => {
            if (e.code === "Space") {
                if (this.honk.getLevelAtTime(Tone.now()) === 0) this.honk.triggerAttack('A#4');
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === "Space") this.honk.triggerRelease()
        });
    }

    /**
     * Configure engine noise for the care
     * @protected
     */
    _createEngineNoise() {
        // Create a player for engine noise
        this.engine = new Tone.Player("sfx/engine.mp3").toDestination();
        // Set volume
        this.engine.volume.value = -12;
        this.engine.loop = true;
        // Connect to gain node to control proximity audio
        this.engine.connect(this.gainNode);
    }

    /**
     * Change speed of engine noise to match car speed
     * @protected
     */
    _updateEngineNoise() {
        // Get the vehicle's speed
        const speed = this.chassis.velocity.length();

        // Map the speed to a frequency range
        const minSpeed = 0;
        const maxSpeed = this.maxForce;
        const minFreq = 0.8;
        const maxFreq = 1.2;

        // Calculate the pitch/frequency for the engine noise
        const freq = Three.MathUtils.mapLinear(speed, minSpeed, maxSpeed, minFreq, maxFreq);

        // Apply the calculated frequency to the player
        this.engine.playbackRate = freq;
    }

    /**
     * Create the noise for when the car collides with other objects
     * @protected
     */
    _createCollisionNoise() {
        // Membrane synth to represent hit
        this.collisionSynth = new Tone.MembraneSynth();
        this.collisionSynth.volume.value = -24.0;
        // Connect to gain node to control proximity audio
        this.collisionSynth.connect(this.gainNode);

        // Make collision sound on collision
        this.chassis.addEventListener('collide', e => {
            // Don't make sound when colliding with the tiles
            if (e.body.name === "roadkit") return;
            // Do nothing if car isn't moving fast
            if (this.chassis.velocity.length() < 1.5) return;
            // Prevent sound from triggering too frequently
            const now = Tone.now();
            if (now - this.lastCollisionTime > 0.1) { // 100ms minimum gap
                this.collisionSynth.triggerAttackRelease("C2", "8n");
                this.lastCollisionTime = now;
            }
        });
    }

    /**
     * Update function to run every frame
     * @public
     */
    update() {
        // Do nothing if the car isn't loaded
        if (!this.isLoaded) return;

        // Drive is enabled
        if (this.isDriving) this._drive();

        // Sync models to their physics body
        this._syncToPhysics();

        // Control proximity volume between car and camera
        proximityVolume(this.chassis.position, this.camera, this.gainNode, -0.3);

        // If the engine player is ready, play engine noises
        if (this.engine) this._updateEngineNoise();
    }
}