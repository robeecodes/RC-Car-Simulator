import * as THREE from 'three';
import * as Tone from "tone";
import * as CANNON from "cannon-es";

import {threeToCannon, ShapeType} from 'three-to-cannon';
import proximityVolume from "../utils/proximityVolume.js";
import * as Three from "three";

/**
 * Abstract Class Car.
 *
 * @class Car
 */
export default class Car {
    static instance = null;
    static pressed = {};

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
        this.vehicle = null;
        this.chassis = null;
        this.models = {
            chassis: {
                mesh: null,
                position: new THREE.Vector3(0, 0, 0),
                size: new THREE.Box3()
            },
            wheels: [{}, {}, {}, {}],
            deco: []
        }
        this.maxForce = maxForce;
        this.isDriving = true;
        this.startPosition = startPosition;

        // Code for loading the model
        this.isLoaded = false;
        this.model = null;

        this._loadModel(loader, modelPath).then(() => {
            this._addPhysics(physicsWorld, wheelMaterial);
            this._createInstance(scene);
            this.isLoaded = true;
        });

        this.camera = camera;

        this.engineRunning = false;

        // Audio
        // Configure gainNode to control gain
        this.gainNode = new Tone.Gain(1).toDestination();
        this._createHonk();
        this._createEngineNoise();
    }

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

                if (name.includes("Wheel")) {
                    if (!isNaN(name[name.length - 1]) && name[name.length - 1] !== "1") {
                        let position = new THREE.Vector3();
                        if (tag === "L_Front") position = thisCar.models.wheels[0].position;
                        else if (tag === "R_Front") position = thisCar.models.wheels[1].position;
                        else if (tag === "L_Back") position = thisCar.models.wheels[2].position;
                        else if (tag === "R_Back") position = thisCar.models.wheels[3].position;
                        child.geometry.translate(-position.x, -position.y, -position.z);
                    } else {
                        const thisWheel = {
                            position: new THREE.Vector3(),
                            radius: 0,
                            mesh: new THREE.Object3D(),
                            tag: tag
                        }

                        thisWheel.position = center;

                        thisWheel.radius = size.y / 2;

                        // If there are nested elements (i.e. the name is numbered), set mesh to the parent, otherwise, just use the child
                        if (!isNaN(name[name.length - 1])) thisWheel.mesh = child.parent;
                        else thisWheel.mesh = child;

                        // Set new origin for the mesh
                        child.geometry.translate(-center.x, -center.y, -center.z);

                        if (tag === "L_Front") thisCar.models.wheels[0] = thisWheel;
                        else if (tag === "R_Front") thisCar.models.wheels[1] = thisWheel;
                        else if (tag === "L_Back") thisCar.models.wheels[2] = thisWheel;
                        else if (tag === "R_Back") thisCar.models.wheels[3] = thisWheel;
                    }
                } else if (tag === "Car_Body") {
                    if (child.name === "Car_Body_1" || child.name === "Car_Body") {
                        thisCar.models.chassis.size = size;

                        // If there are nested elements, set mesh to the parent, otherwise, just use the child
                        if (!isNaN(name[name.length - 1])) thisCar.models.chassis.mesh = child.parent;
                        else thisCar.models.chassis.mesh = child;

                        thisCar.models.chassis.position = center;
                        // Set new origin for the mesh
                        child.geometry.translate(-center.x, -center.y, -center.z);
                    } else {
                        child.geometry.translate(-thisCar.models.chassis.position.x, -thisCar.models.chassis.position.y, -thisCar.models.chassis.position.z);
                    }
                } else {
                    thisCar.models.deco.push({
                        mesh: child,
                        position: new THREE.Vector3(center.x, center.y, center.z)
                    });
                }
            }
        });
        this.model = null;
    }

    _addPhysics(physicsWorld, wheelMaterial) {
        const bodyPosition = this.models.chassis.position;

        const chassisShape = threeToCannon(this.models.chassis.mesh, {type: ShapeType.HULL});

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

        const {shape, offset, orientation} = chassisShape;

        this.chassis.addShape(shape);

        this.chassis.angularDamping = 0.98;

        physicsWorld.addBody(this.chassis);

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

        this.vehicle.setSteeringValue(0, 0);
        this.vehicle.setSteeringValue(0, 1);

        // Add the vehicle to the physics world
        this.vehicle.addToWorld(physicsWorld);
    }

    _createInstance(scene) {
        if (this.models.chassis.mesh.parent !== null) {
            this.models.chassis.mesh.parent.remove(this.models.chassis.mesh);
        }
        scene.add(this.models.chassis.mesh);
        this.models.wheels.forEach((wheel, index) => {
            if (wheel.mesh.parent !== null) {
                wheel.mesh.parent.remove(wheel.mesh);
            }
            scene.add(wheel.mesh);
        });
        this.models.deco.forEach(deco => {
            if (deco.mesh.parent !== null) {
                deco.mesh.parent.remove(deco.mesh);
            }
            this.models.chassis.mesh.attach(deco.mesh);
            deco.mesh.position.y = deco.mesh.position.y - this.models.chassis.position.y;
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
        this.isLoaded = true;
    }

    _drive() {
        if (Car.pressed['W'] || Car.pressed['ARROWUP']) {
            this.vehicle.setWheelForce(this.maxForce, 0);
            this.vehicle.setWheelForce(this.maxForce, 1);
            this.vehicle.setWheelForce(this.maxForce, 2);
            this.vehicle.setWheelForce(this.maxForce, 3);
            if (this.engine.state === "stopped")
                if (!this.engineRunning) {
                    this.engine.start();
                    this.engineRunning = true;
                }
        }
        if (Car.pressed['S'] || Car.pressed['ARROWDOWN']) {
            this.vehicle.setWheelForce(-this.maxForce, 0);
            this.vehicle.setWheelForce(-this.maxForce, 1);
            this.vehicle.setWheelForce(-this.maxForce, 2);
            this.vehicle.setWheelForce(-this.maxForce, 3);
            if (!this.engineRunning) {
                this.engine.start();
                this.engineRunning = true;
            }
        }
        if (!(Car.pressed['W'] || Car.pressed['ARROWUP'] || Car.pressed['S'] || Car.pressed['ARROWDOWN'])) {
            this.vehicle.setWheelForce(0, 0);
            this.vehicle.setWheelForce(0, 1);
            this.vehicle.setWheelForce(0, 2);
            this.vehicle.setWheelForce(0, 3);
            if (this.engineRunning) {
                this.engine.stop();
                // Brief timeout to ensure the player has stopped
                setTimeout(() => {
                        this.engineRunning = false;
                    }, 200);
            }
        }
        if (Car.pressed['A'] || Car.pressed['ARROWLEFT']) {
            this.vehicle.setSteeringValue(0.25, 0);
            this.vehicle.setSteeringValue(0.25, 1);
        }
        if (Car.pressed['D'] || Car.pressed['ARROWRIGHT']) {
            this.vehicle.setSteeringValue(-0.25, 0);
            this.vehicle.setSteeringValue(-0.25, 1);
        }
        if (!(Car.pressed['A'] || Car.pressed['ARROWLEFT'] || Car.pressed['D'] || Car.pressed['ARROWRIGHT'])) {
            this.vehicle.setSteeringValue(0, 0);
            this.vehicle.setSteeringValue(0, 1);
        }
    }

    stopDriving() {
        this.isDriving = false;
    }

    resumeDriving() {
        this.isDriving = true;
    }

    _createHonk() {
        // Honk sfx
        const dist = new Tone.Distortion(0.8).toDestination();
        this.honk = new Tone.Synth({
            "volume": -12,
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

        dist.connect(this.gainNode);
        this.honk.connect(dist);

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

    _createEngineNoise() {
        // Create a player for engine noise
        this.engine = new Tone.Player("sfx/engine.mp3").toDestination();
        this.engine.volume.value = -12;
        this.engine.loop = true;
        this.engine.connect(this.gainNode);
    }

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

        // Apply the calculated frequency to the synth
        this.engine.playbackRate = freq;
    }

    update() {
        if (!this.isLoaded) return;
        if (this.isDriving) this._drive();

        // Sync the chassis
        this.models.chassis.mesh.position.copy(this.chassis.position);
        this.models.chassis.mesh.quaternion.copy(this.chassis.quaternion);

        // Sync each wheel mesh with the wheel body
        this.vehicle.wheelBodies.forEach((wheelBody, index) => {
            const wheelMesh = this.models.wheels[index].mesh
            wheelMesh.position.copy(wheelBody.position);
            wheelMesh.quaternion.copy(wheelBody.quaternion);
        });

        proximityVolume(this.chassis.position, this.camera, this.gainNode, -0.3);
        if (this.engine) this._updateEngineNoise();
    }
}