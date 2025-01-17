import Car from "./Car.js";
/**
 * Class Car.
 *
 * @class Truck
 * @extends Car
 */
export default class Truck extends Car {
    constructor(loader, scene, physicsWorld, startPosition, wheelMaterial, camera, maxForce = 0.35, modelPath = 'models/vehicles/Truck.glb') {
        super(loader, scene, physicsWorld, startPosition, wheelMaterial, camera, maxForce, modelPath);
    }
}