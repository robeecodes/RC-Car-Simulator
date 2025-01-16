import * as THREE from "three";
import * as Tone from "tone";

/**
 * Controls the volume of audio elements based on their proximity to the listener
 * @param {THREE.Vector3} emitterPosition The position of the emitting audio element
 * @param {Object} listener The object which is listening to the audio (typically a camera)
 * @param {Tone.Gain} gainNode The node to control the volume of the emitter
 * @param {Number} maxVolume The maximum volume for this node
 */
export default function proximityVolume(emitterPosition, listener, gainNode, maxVolume) {
    // Calculate the distance between the listener and the emitter
    const listenerPosition = listener.getWorldPosition(new THREE.Vector3());
    const distance = emitterPosition.distanceTo(listenerPosition);

    // Adjust the volume based on distance
    const maxDistance = 3;
    const minVolume = -0.9;

    // Volume decreases as distance increases, but never lower than `minVolume`
    let volume = Math.max(minVolume, maxVolume - (distance / maxDistance));

    // Set the volume of the PositionalAudio
    gainNode.gain.value = volume;
}