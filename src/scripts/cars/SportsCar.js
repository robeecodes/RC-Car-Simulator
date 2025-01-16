import Car from "./Car.js";
/**
 * Class Car.
 *
 * @class SportsCar
 */
export default class SportsCar extends Car {
    constructor(loader, scene, physicsWorld, startPosition, wheelMaterial, camera, maxForce = 0.2, modelPath = 'models/vehicles/SportsCar.glb') {
        super(loader, scene, physicsWorld, startPosition, wheelMaterial, camera, maxForce, modelPath);
    }
}