import World from "./World.js";
import * as THREE from "three";
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
    constructor(loader, scene, physicsWorld, groundMaterial, camera, createCarCallback, modelPath = 'models/environments/living-room/room.glb') {
        super(loader, scene, physicsWorld, groundMaterial, camera, createCarCallback, modelPath);
    }

    _ApplyCustomisations(key, mesh, body) {
        if (key === "Ramp") {
            const rotation = THREE.MathUtils.degToRad(16);
            mesh.rotateZ(rotation);

            const axis = new CANNON.Vec3(0, 0, 1);
            body.quaternion.setFromAxisAngle(axis, rotation);
        }
    }

    _AssignInteractables() {
        const toolboxBoundingBox = new Box3().setFromObject(this.objects["Toolbox"].mesh);
        this.interactables["Toolbox"] = {};
        this.interactables["Toolbox"].box = toolboxBoundingBox.clone().expandByScalar(0.7);
        this.interactables["Toolbox"].modal = createModal("Toolbox", `Press <strong>E</strong> to change the tracks.`);

        const radioBoundingBox = new Box3().setFromObject(this.objects["Radio"].mesh);
        this.interactables["Radio"] = {};
        this.interactables["Radio"].box = radioBoundingBox.clone().expandByScalar(0.3);
        this.interactables["Radio"].modal = createModal("Radio", `Press <strong>E</strong> to change the station, or <strong>Q</strong> to turn the radio on/off.`);

        const remoteBoundingBox = new Box3().setFromObject(this.objects["Remote"].mesh);
        this.interactables["Remote"] = {};
        this.interactables["Remote"].box = remoteBoundingBox.clone().expandByScalar(0.5);
        this.interactables["Remote"].modal = createModal("Remote", `Press <strong>Q</strong> to turn the TV on/off.`);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'e' || event.key === 'E') {
                if (document.getElementById('ToolboxModal').classList.contains('show')) {
                    this._ChangeTracks();
                }
                if (document.getElementById('RadioModal').classList.contains('show')) {
                    if (this.radio.isPlaying) this.radio.changeStation();
                }
            }
            if (event.key === 'q' || event.key === 'Q') {
                if (document.getElementById('RadioModal').classList.contains('show')) {
                    this.radio.toggleRadio();
                    if (this.tv.isPlaying) this.tv.toggleVideo();
                }
                if (document.getElementById('RemoteModal').classList.contains('show')) {
                    this.tv.toggleVideo();
                    if (this.radio.isPlaying) this.radio.toggleRadio();
                }
            }
        });
    }

    _ChangeTracks() {
        this.roadKit.openEditor();
    }

    _Interactions() {
        const carBoundingBox = new Box3().setFromObject(this.car.models.chassis.mesh);

        if (this.roadKit.editMode) this.car.stopDriving();
        else this.car.resumeDriving();

        Object.entries(this.interactables).forEach(([key, interactable]) => {
            if (carBoundingBox.intersectsBox(interactable.box) && !this.roadKit.editMode) {
                interactable.modal.show();
            } else {
                interactable.modal.hide();
            }
        });
    }

    _Start() {
        this.radio = new Radio(this.objects["Radio"], this.camera);
        this.tv = new TV(this.objects["TVScreen"], this.camera, this.scene);
    }

    update() {
        this._Interactions();
        this.radio.update();
        this.tv.update();
    }
}