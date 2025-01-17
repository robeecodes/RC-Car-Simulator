import * as Tone from "tone";
import * as THREE from "three";
import proximityVolume from "../utils/proximityVolume.js";

/**
 * Controls for the radio in the LivingRoom scene
 * @class Radio
 */
export default class Radio {
    /**
     * Create the radio
     * @param {Object} radioObject The object containing information about the radio such as mesh and position
     * @param {Object} listener The object where the audio is heard from (typically camera)
     */
    constructor(radioObject, listener) {
        // Assign parameters
        this.radioObject = radioObject;
        this.listener = listener;
        this.currentStationIndex = 0;
        this.isPlaying = true;
        this.radioPosition = this.radioObject.position;
        this.isLoaded = false;

        // Load radio stations
        this.stations = [
            new Tone.Player("music/smooth.mp3").toDestination(),
            new Tone.Player("music/electronic.mp3").toDestination(),
            new Tone.Player("music/rock.mp3").toDestination(),
        ];

        // When all stations are loaded, set up the proximity audio
        Tone.loaded().then(() => {
            this._setupProximityAudio();
            this.isLoaded = true;
        });
    }

    /**
     * Configure the gainNode for the proximity audio to function
     * @protected
     */
    _setupProximityAudio() {
        // Set first station to play
        this.currentlyPlaying = this.stations[this.currentStationIndex];
        // Set station to loop
        this.currentlyPlaying.loop = true;

        this.currentlyPlaying.volume.value = -10;

        // Configure gainNode to control gain
        this.gainNode = new Tone.Gain(1).toDestination();

        // Connect the audio to the panner
        this.currentlyPlaying.connect(this.gainNode).start();
    }

    /**
     * Rotate between the radio stations
     * @public
     */
    changeStation() {
        // Stop the current station
        this.currentlyPlaying.stop();

        // Cycle to the next station
        this.currentStationIndex = (this.currentStationIndex + 1) % this.stations.length;

        // Play the new station
        this.currentlyPlaying = this.stations[this.currentStationIndex];
        this.currentlyPlaying.loop = true;
        this.currentlyPlaying.volume.value = -10;
        this.currentlyPlaying.connect(this.gainNode).start();
    }

    /**
     * Turns radio on or off
     * @public
     */
    toggleRadio() {
        this.isPlaying ? this.stations[this.currentStationIndex].stop() : this.stations[this.currentStationIndex].start();
        this.isPlaying = !this.isPlaying;
    }

    /**
     * Update function to run every frame
     * @public
     */
    update() {
        // Update volume if a station is currently playing
        if (this.currentlyPlaying) proximityVolume(this.radioPosition, this.listener, this.gainNode, 0.8);
    }
}