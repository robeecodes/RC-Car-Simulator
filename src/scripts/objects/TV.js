import * as THREE from "three";
import * as Tone from "tone";

import proximityVolume from "../utils/proximityVolume.js";

/**
 * Controls for the radio in the LivingRoom scene
 * @class TV
 */
export default class TV {
    /**
     * Create the TV
     * @param {Object} tvObject The object containing information about the tv such as mesh and position
     * @param {Object} listener The object where the audio is heard from (typically camera)
     * @param {THREE.Scene} scene The three.js scene
     */
    constructor(tvObject, listener, scene) {
        this.listener = listener;
        this.isLoaded = false;

        // Create the video element and texture
        this.video = document.createElement('video');
        this.video.width = 1920;
        this.video.height = 1080;
        this.video.loop = true;
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.src = "video/jerma_the_saga.mp4";

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

        // Hide the original screen
        if (tvObject.mesh) {
            tvObject.mesh.visible = false;
        }

        // Add video audio to Tone.Player
        this.audio = new Tone.Player({
            url: "video/jerma_the_saga.mp4",
            loop: true,
        }).toDestination();

        Tone.loaded().then(() => {
            this._setupProximityAudio();
            this.isLoaded = true;
        });

        this.isPlaying = false;
    }

    /**
     * Configure the gainNode for the proximity audio to function
     * @protected
     */
    _setupProximityAudio() {

        // Set volume
        this.audio.volume.value = -10;

        // Attach to gainNode to control volume
        this.gainNode = new Tone.Gain(1).toDestination();
        this.audio.connect(this.gainNode);
    }

    /**
     * Pause and play the video
     * @public
     */
    async toggleVideo() {
        // Try to play the video if it's paused
        if (!this.isPlaying) {
            try {
                await this.video.play().then(async () => {
                    this.audio.start(0, this.video.currentTime);
                    this.isPlaying = true;
                });
            } catch (error) {
                this.isPlaying = false;
            }
        } else {
            // Pause the video if it's playing
            this.video.pause();
            this.audio.stop();
            this.isPlaying = false;
        }
    }

    /**
     * Update function to run every frame
     * @public
     */
    update() {
        // Update proximity volume of TV
        if (this.isPlaying) proximityVolume(this.screen.position, this.listener, this.gainNode, 0.8);
    }
}