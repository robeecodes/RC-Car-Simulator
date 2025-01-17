import World from "./World.js";
import * as THREE from "three";
import {GLTFLoader} from "three/addons";
import * as CANNON from "cannon-es";
import {Box3} from "three";
import createModal from "../utils/createModal.js";
import Radio from "../objects/Radio.js";
import TV from "../objects/TV.js";

/**
 * Class LivingRoom.
 *
 * @class LivingRoom
 */
export default class LivingRoom extends World {
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
    constructor(loader, scene, physicsWorld, groundMaterial, camera, createCarCallback, modelPath = 'models/environments/living-room/room.glb') {
        super(loader, scene, physicsWorld, groundMaterial, camera, createCarCallback, modelPath);
    }

    /**
     * @inheritDoc
     * @override
     */
    _applyCustomisations(key, mesh, body) {
        if (key === "Ramp") {
            const rotation = THREE.MathUtils.degToRad(16);
            mesh.rotateZ(rotation);

            const axis = new CANNON.Vec3(0, 0, 1);
            body.quaternion.setFromAxisAngle(axis, rotation);
        }
    }

    /**
     * @inheritDoc
     * @override
     */
    _assignInteractables() {
        // Add interaction zone for the toolbox
        const toolboxBoundingBox = new Box3().setFromObject(this.objects["Toolbox"].mesh);
        this.interactables["Toolbox"] = {};
        this.interactables["Toolbox"].box = toolboxBoundingBox.clone().expandByScalar(0.7);
        // Add popup instruction for the toolbox
        this.interactables["Toolbox"].modal = createModal("Toolbox", `Press <strong>E</strong> to open the tile editor.`);

        // Add interaction zone for the radio
        const radioBoundingBox = new Box3().setFromObject(this.objects["Radio"].mesh);
        this.interactables["Radio"] = {};
        this.interactables["Radio"].box = radioBoundingBox.clone().expandByScalar(0.3);
        // Add popup instruction for the radio
        this.interactables["Radio"].modal = createModal("Radio", `Press <strong>E</strong> to change the station, or <strong>Q</strong> to turn the radio on/off.`);

        // Add interaction zone for the remote
        const remoteBoundingBox = new Box3().setFromObject(this.objects["Remote"].mesh);
        this.interactables["Remote"] = {};
        this.interactables["Remote"].box = remoteBoundingBox.clone().expandByScalar(0.5);
        // Add popup instruction for the remote
        this.interactables["Remote"].modal = createModal("Remote", `Press <strong>Q</strong> to play/pause the TV.`);

        // Handle interaction events
        document.addEventListener('keydown', (event) => {
            // When e is pressed
            if (event.key === 'e' || event.key === 'E') {
                // Open roadkit tile editor if in range
                if (document.getElementById('ToolboxModal').classList.contains('show')) {
                    this._changeTracks();
                }
                // Change the radio station if in range
                if (document.getElementById('RadioModal').classList.contains('show')) {
                    if (this.radio.isPlaying) this.radio.changeStation();
                }
            }

            // When q is pressed
            if (event.key === 'q' || event.key === 'Q') {
                // Turn the radio on if in range
                if (document.getElementById('RadioModal').classList.contains('show')) {
                    this.radio.toggleRadio();
                    // Turn the tv off automatically
                    if (this.tv.isPlaying) this.tv.toggleVideo();
                }
                // Play the tv video if in range
                if (document.getElementById('RemoteModal').classList.contains('show')) {
                    this.tv.toggleVideo();
                    // Automatically turn off the radio
                    if (this.radio.isPlaying) this.radio.toggleRadio();
                }
            }
        });
    }

    /**
     * Open the roadkit tile editor
     * @protected
     */
    _changeTracks() {
        this.roadKit.openEditor();
    }

    /**
     * @inheritDoc
     * @override
     */
    _interactions() {
        // Box to detect if car is in range of interactable
        const carBoundingBox = new Box3().setFromObject(this.car.models.chassis.mesh);

        // Disable car driving if in edit mode
        if (this.roadKit.editMode) this.car.stopDriving();
        else this.car.resumeDriving();

        // Check each interactable and show modal if car in range
        Object.entries(this.interactables).forEach(([key, interactable]) => {
            if (carBoundingBox.intersectsBox(interactable.box) && !this.roadKit.editMode) {
                interactable.modal.show();
            } else {
                interactable.modal.hide();
            }
        });
    }

    /**
     * @inheritDoc
     * @override
     */
    _start() {
        // Create tv and radio
        this.radio = new Radio(this.objects["Radio"], this.camera);
        this.tv = new TV(this.objects["TVScreen"], this.camera, this.scene);
    }

    /**
     * @inheritDoc
     * @override
     */
    update() {
        // Update interactions, radio and tv
        this._interactions();
        this.radio.update();
        this.tv.update();
    }
}