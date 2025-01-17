import * as THREE from "three";
import * as CANNON from 'cannon-es';
import * as Tone from "tone";
import 'bootstrap/dist/css/bootstrap.min.css';

import "./styles.css";
import {GLTFLoader, OrbitControls} from "three/addons";
import SportsCar from "./scripts/cars/SportsCar.js";
import LivingRoom from "./scripts/worlds/LivingRoom.js";
import Truck from "./scripts/cars/Truck.js";
import * as UITools from "./scripts/ui/UITools.js";

// Initialise global variables

let scene, physicsWorld, camera, renderer, controls;
let colour, intensity, light;
let ambientLight;

let sceneHeight, sceneWidth;

let clock, deltaTime, interval;

let loadingManager, gltfLoader;

let world, car;

let groundMaterial, wheelMaterial;


// Handle html overlays
const {overlay, worldSelect, carSelect, guide} = UITools.getUIElements();

// Only show splash screen to start
UITools.removeUIElement(worldSelect);
UITools.removeUIElement(carSelect);
UITools.removeUIElement(guide);


// When splash buton start is clicked, go to world select
let startButton = document.getElementById("startButton");
startButton.addEventListener("click", toWorldSelect);

let worldButton;

function toWorldSelect(e) {
    UITools.removeUIElement(overlay);
    UITools.addUIElement(worldSelect);
    startButton.removeEventListener("click", toWorldSelect);
    worldButton = document.getElementById("confirmWorld");
    worldButton.addEventListener("click", toCarSelect);
}

let carButton, carChoice, descBox, descriptions;

// When world button is clicked, go to car select
function toCarSelect(e) {
    UITools.removeUIElement(worldSelect);
    UITools.addUIElement(carSelect);
    worldButton.removeEventListener("click", toCarSelect);
    carButton = document.getElementById("confirmCar");
    carButton.addEventListener("click", toGuide);

    carChoice = document.getElementsByName("carChoice");
    descBox = document.getElementById("desc");
    descriptions = document.querySelectorAll(".carInfo");
    descBox.innerHTML = '';

    // Event listeners to track chosen car
    carChoice.forEach((choice, i) => {
        choice.addEventListener("click", changeCarDesc);
        if (choice.checked) descBox.appendChild(descriptions[i]);
    });
}

// Update car description based on selected car
function changeCarDesc(e) {
    for (let i = 0; i < carChoice.length; i++) {
        if (carChoice[i].checked) {
            descBox.innerHTML = '';
            descBox.appendChild(descriptions[i]);
        }
    }
}

let playButton;

// When care button is clicked, go to instructions
function toGuide(e) {
    carChoice.forEach((choice, i) => {
        choice.removeEventListener("click", changeCarDesc);
    });
    // Set car based on chosen car
    for (let i = 0; i < carChoice.length; i++) {
        const item = carChoice[i];
        if (!item.checked) continue;
        switch (item.value) {
            case "sports":
                car = SportsCar;
                break;
            case "truck":
                car = Truck;
                break;
        }
        break;
    }
    UITools.removeUIElement(carSelect);
    UITools.addUIElement(guide);
    carButton.removeEventListener("click", toGuide);
    playButton = document.getElementById("playButton");
    // When play button is clicked, run init
    playButton.addEventListener("click", init);
}

/**
 * Load all entities for the world and car
 */
function loadEntities() {
    world = new LivingRoom(gltfLoader, scene, physicsWorld, groundMaterial, camera, () => {
        world.car = new car(gltfLoader, scene, physicsWorld, world.carStart, wheelMaterial, camera);
    });

    const threeLoaderPromise =
        new Promise((resolve) => {
            loadingManager.onLoad = () => {
                resolve();
            };
        });

    // Wait for loading manager and Tone to be loaded
    Promise.all([threeLoaderPromise, Tone.loaded()]).then(() => {
        UITools.removeUIElement(guide);
    });
}

/**
 * Initialise the scene
 */
function init() {
    // Tone
    Tone.start();

    //create our clock and set interval at 60 fpx
    clock = new THREE.Clock();
    deltaTime = 0;
    interval = 1 / 60;

    //create our scene
    sceneWidth = window.innerWidth;
    sceneHeight = window.innerHeight;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    //create cannon physics world
    physicsWorld = new CANNON.World({gravity: new CANNON.Vec3(0, -9.82, 0)});
    physicsWorld.defaultContactMaterial.friction = 0.2;
    physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);

    // cannon-es contact materials
    groundMaterial = new CANNON.Material("groundMaterial");
    wheelMaterial = new CANNON.Material("wheelMaterial");
    const wheelGroundContactMaterial = window.wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
        friction: 0.3,
        restitution: 0,
        contactEquationStiffness: 1000
    });

    // We must add the contact materials to the world
    physicsWorld.addContactMaterial(wheelGroundContactMaterial);

    //create ground
    const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
        mass: 0,
        material: groundMaterial
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    physicsWorld.addBody(groundBody);

    //specify our renderer and add it to our document
    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // lighting
    colour = 0xffffff;
    intensity = 1;
    light = new THREE.DirectionalLight(colour, intensity);
    light.position.set(-1, 2, 4);
    scene.add(light);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    // Add camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );

    camera.position.set(-1.7429902804941595, 0.7616083627313399, -1.7814849500234389);
    camera.rotation.set(0, -Math.PI / 2, 0);

    scene.add(camera);

    // load models
    loadingManager = new THREE.LoadingManager();
    gltfLoader = new GLTFLoader(loadingManager);

    loadEntities();

    window.addEventListener("resize", onWindowResize, false); //resize callback
    controls = new OrbitControls(camera, renderer.domElement);
    play();
}

/**
 * Render the Three.js scene
 */
function render() {
    renderer.render(scene, camera);
}

/**
 * Play the Three.js scene
 */
function play() {
    renderer.setAnimationLoop(() => {
        update();
        render();
    });
}

/**
 * Update the Three.js scene
 */
function update() {
    deltaTime += clock.getDelta();

    if (deltaTime > interval) {
        physicsWorld.fixedStep();
        // Check car and world are available before calling update
        if (world.car && world) {
            if (world.car.isLoaded && world.isLoaded) {
                world.car.update();
                world.update();
            }
        }
        // Update orbit controls
        controls.update(deltaTime);
        deltaTime = deltaTime % interval;
    }
}

/**
 * Window resize handler
 */
function onWindowResize() {
    //resize & align
    sceneHeight = window.innerHeight;
    sceneWidth = window.innerWidth;
    renderer.setSize(sceneWidth, sceneHeight);
    camera.aspect = sceneWidth / sceneHeight;
    camera.updateProjectionMatrix();
}
