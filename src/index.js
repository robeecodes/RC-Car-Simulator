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

let scene, physicsWorld, camera, renderer, controls;
let colour, intensity, light;
let ambientLight;

let sceneHeight, sceneWidth;

let clock, deltaTime, interval;

let loadingManager, gltfLoader;

let world, car;

let groundMaterial, wheelMaterial;

const {overlay, worldSelect, carSelect, guide} = UITools.getUIElements();

UITools.removeUIElement(worldSelect);
UITools.removeUIElement(carSelect);
UITools.removeUIElement(guide);

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

    carChoice.forEach((choice, i) => {
        choice.addEventListener("click", changeCarDesc);
        if (choice.checked) descBox.appendChild(descriptions[i]);
    });
}

function changeCarDesc(e) {
    for (let i = 0; i < carChoice.length; i++) {
        if (carChoice[i].checked) {
            descBox.innerHTML = '';
            descBox.appendChild(descriptions[i]);
        }
    }
}

let playButton;

function toGuide(e) {
    carChoice.forEach((choice, i) => {
        choice.removeEventListener("click", changeCarDesc);
    });
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
    playButton.addEventListener("click", init);
}

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

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
    );

    camera.position.set(0, 0.66, 2.84);

    scene.add(camera);

    // load models
    loadingManager = new THREE.LoadingManager();
    gltfLoader = new GLTFLoader(loadingManager);

    loadEntities();

    window.addEventListener("resize", onWindowResize, false); //resize callback
    controls = new OrbitControls(camera, renderer.domElement);
    play();
}

// simple render function
function render() {
    renderer.render(scene, camera);
}

// start animating

function play() {
    renderer.setAnimationLoop(() => {
        update();
        render();
    });
}

function update() {
    deltaTime += clock.getDelta();

    if (deltaTime > interval) {
        physicsWorld.fixedStep();
        if (world.car && world) {
            if (world.car.isLoaded && world.isLoaded) {
                world.car.update();
                world.update();
            }
        }
        controls.update(deltaTime);
        deltaTime = deltaTime % interval;
    }
}

function onWindowResize() {
    //resize & align
    sceneHeight = window.innerHeight;
    sceneWidth = window.innerWidth;
    renderer.setSize(sceneWidth, sceneHeight);
    camera.aspect = sceneWidth / sceneHeight;
    camera.updateProjectionMatrix();
}
