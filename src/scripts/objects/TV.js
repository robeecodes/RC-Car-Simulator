import * as THREE from "three";
import * as Tone from "tone";

import proximityVolume from "../utils/proximityVolume.js";

/**
 * Controls for the radio in the LivingRoom scene
 * @class TV
 * @property {Object} tvObject the object containing information about the tv such as mesh and position
 * @property {Object} listener the object where the audio is heard from (typically camera)
 * @property {THREE.Scene} scene the three.js scene
 */
export default class TV {
    constructor(tvObject, camera, scene) {
        this.camera = camera;

        // Create the video element and texture
        this.video = document.createElement('video');
        this.video.width = 1920;
        this.video.height = 1080;
        this.video.loop = true;
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.src = "video/jerma_the_saga.mp4";
        this.video.load();

        this.videoTexture = new THREE.VideoTexture(this.video);
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;

        // Replace the screen with a PlaneGeometry
        const screenGeometry = new THREE.PlaneGeometry(1.58, 0.9);
        const screenMaterial = new THREE.MeshBasicMaterial({ map: this.videoTexture });
        this.screen = new THREE.Mesh(screenGeometry, screenMaterial);

        // Add the new screen to the TV object
        this.screen.position.set(tvObject.mesh.position.x, tvObject.mesh.position.y, tvObject.mesh.position.z);
        this.screen.rotateY(Math.PI / 2);
        scene.add(this.screen);

        if (tvObject.mesh) {
            tvObject.mesh.visible = false;
        }

        this._setupProximityAudio();
        this.isPlaying = false;
    }

    /**
     * Configure the gainNode for the proximity audio to function
     * @protected
     */
    _setupProximityAudio() {
        this.audio = new Tone.Player({
            url: "video/jerma_the_saga.mp4",
            loop: true,
        }).toDestination();

        this.audio.volume.value = -10;

        this.gainNode = new Tone.Gain(1).toDestination();
        this.audio.connect(this.gainNode);
    }

    toggleVideo() {
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
            this.video.play();
            this.audio.start(0, this.video.currentTime);
        } else {
            this.video.pause();
            this.audio.stop();
        }
        this.isPlaying ? this.video.play() : this.video.pause();
    }

    update() {
        if (this.isPlaying) proximityVolume(this.screen.position, this.camera, this.gainNode, 0.8);
    }
}