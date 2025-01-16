import * as THREE from "three";
import * as CANNON from "cannon-es";
import {ShapeType, threeToCannon} from "three-to-cannon";
import destroyThreeMesh, {destroyMaterial} from "../utils/destroyThreeMesh.js";
import destroyCannonBody from "../utils/destroyCannonBody.js";

export default class RoadKit {
    constructor(scene, physicsWorld, groundMaterial, camera, tileSize = 0.5) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.groundMaterial = groundMaterial;

        this.tileSize = tileSize;
        this.tiles = {
            BendSidewalk: {span: [1, 1]},
            BendSquare: {span: [1, 1]},
            Bridge: {span: [1, 1]},
            Crossroad: {span: [1, 1]},
            End: {span: [1, 1]},
            Intersection: {span: [1, 1]},
            SlantHigh: {span: [1, 1]},
            Single: {span: [1, 1]},
        };
        this.grid = [];

        // Properties for moving tiles
        this.selectedTile = null;
        this.isDragging = false;
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.camera = camera;
        this.editMode = false;

        // Properties for hovered tile
        this.hoveredObject = null;
        this.originalMaterials = [];
    }

    /**
     * Create the grid for the world storing the x,z position for each tile
     * @param {number} rows the number of grid rows
     * @param {number} cols the number of grid columns
     * @param {THREE.Vector3} startPosition the first grid position in the top-left
     */
    initialiseGrid(rows, cols, startPosition) {
        this.grid = Array.from({length: rows}, (_, row) =>
            Array.from({length: cols}, (_, col) => ({
                position: new THREE.Vector3(
                    startPosition.x + row * this.tileSize,
                    startPosition.y - 0.032,
                    startPosition.z - col * this.tileSize
                ),
                tile: null,
                rotation: 0,
            }))
        );

        this._tileOffsets();
        this._assignTiles();
        this._addToScene();
    }

    /**
     * Set position offsets for certain tiles
     */
    _tileOffsets() {
        Object.entries(this.tiles).forEach(([key, tile]) => {
            if (key === "SlantHigh") {
                this.tiles[key].yOffset = 0.12;
            }
        });
    }

    /**
     * Set up the initial tiles in the grid
     */
    _assignTiles() {
        // First row
        this.grid[0][2].tile = this.tiles.End;

        // Second row
        this.grid[1][0].tile = this.tiles.BendSidewalk;
        this.grid[1][0].rotation = Math.PI + Math.PI / 2;
        this.grid[1][1].tile = this.tiles.SlantHigh;
        this.grid[1][1].rotation = Math.PI;
        this.grid[1][2].tile = this.tiles.Bridge;
        this.grid[1][3].tile = this.tiles.SlantHigh;
        this.grid[1][4].tile = this.tiles.BendSidewalk;
        this.grid[1][4].rotation = Math.PI;

        // Third row
        this.grid[2][0].tile = this.tiles.BendSidewalk;
        this.grid[2][1].tile = this.tiles.Single;
        this.grid[2][2].tile = this.tiles.Intersection;
        this.grid[2][4].tile = this.tiles.Single;
        this.grid[2][4].rotation = Math.PI / 2;

        // Fourth row
        this.grid[3][2].tile = this.tiles.Single;
        this.grid[3][2].rotation = Math.PI / 2;
        this.grid[3][4].tile = this.tiles.Single;
        this.grid[3][4].rotation = Math.PI / 2;

        // Fifth row
        this.grid[4][2].tile = this.tiles.BendSquare;
        this.grid[4][3].tile = this.tiles.Single;
        this.grid[4][4].tile = this.tiles.BendSquare;
        this.grid[4][4].rotation = Math.PI / 2;
    }

    /**
     * Add the grid to the scene
     */
    _addToScene() {
        this.grid.forEach(row => {
            row.forEach(col => {
                // Return if there is no tile in the current cell or if the cell is occupied by another large tile
                if (!col.tile) return;
                // Create a copy of the mesh to place in the grid position
                col.mesh = col.tile.mesh.clone();
                // Place the new mesh
                col.mesh.position.set(col.position.x, col.position.y, col.position.z);

                // Assignment for tiles which require physics bodies
                const tag = col.tile.mesh.name.split('_')[0];

                if (col.tile.yOffset > 0) {
                    col.mesh.position.y += col.tile.yOffset;
                }

                if (tag === "Bridge") {
                    // The bridge tile needs a box collider
                    this._addBody(col, tag);
                }

                if (tag === "SlantHigh") {
                    // The slant needs a box collider and to be rotated
                    this._addBody(col, tag);
                    col.body.position.y += col.tile.yOffset;

                    // Rotate the mesh on y if required
                    col.mesh.rotateY(col.rotation);

                    this._rotateSlant(col);
                    this._rotatePhysicsBody(col, col.rotation);

                } else if (col.rotation) {
                    // rotate the mesh on y if required
                    col.mesh.rotation.y = col.rotation;
                }
                this.scene.add(col.mesh);
            });
        });
    }

    /**
     * Rotate slants to be diagonal
     * @param {Object} col the cell containing the properties for the slant
     */
    _rotateSlant(col) {
        // Rotate the mesh by 25 degrees on x to make the slant
        const x = THREE.MathUtils.degToRad(-25);
        col.mesh.rotateX(x);

        const quatX = new CANNON.Quaternion();
        quatX.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), x);

        col.body.quaternion = quatX;
    }

    /**
     * Rotate physics body
     * @param {Object} target object containing the mesh and rotation amount
     * @param {Number} rotationAmount the amount to rotate the body by on the y-axis
     */
    _rotatePhysicsBody(target, rotationAmount) {
        let quaternion;
        if (target.body.quaternion.x !== 0 || target.body.quaternion.y !== 0) {
            // Add rotation around the Y-axis to the existing quaternion
            const quatY = new CANNON.Quaternion();
            quatY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationAmount);
            quaternion = quatY.mult(target.body.quaternion); // Multiply to add rotation
            quaternion.normalize(); // Normalize to ensure it's valid
        } else {
            // Create a new quaternion for the Y-axis rotation if no prior rotation exists
            quaternion = new CANNON.Quaternion();
            quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationAmount);
        }

        // Update the body's quaternion
        target.body.quaternion.copy(quaternion);
    }

    /**
     * Add physics body to a target
     * @param {Object} target the cell containing the properties for the physics body
     * @param {String} tag the name of the target
     */
    _addBody(target, tag) {
        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(target.position.x, target.position.y, target.position.z),
            material: this.groundMaterial
        });
        if (tag === "Bridge") {
            const halfExtents = new CANNON.Vec3(this.tileSize / 2, 0.005, this.tileSize / 2);
            const shape = new CANNON.Box(halfExtents);
            body.position.y = this.tiles[tag].height - 0.02;
            body.addShape(shape);
        } else if (tag === "SlantHigh") {
            const mesh = target.mesh.isMesh ? target.mesh : target.mesh.children[0];
            const physicsShape = threeToCannon(mesh, {type: ShapeType.BOX});

            const {shape, offset, orientation} = physicsShape;

            body.addShape(shape);
        }

        this.physicsWorld.addBody(body);
        target.body = body;
    }

    openEditor() {
        this.editMode = true;
        this._createEditorUI();
        const prevCameraposition = this.camera.position.clone();
        const prevCamerarotation = this.camera.rotation.clone();

        this.camera.position.set(1.2, 2.9, -0.1);
        this.camera.rotation.set(-1.5, 0, 0);

        const threeCanvas = document.querySelector("canvas");
        threeCanvas.addEventListener('click', this._handleClick);
        threeCanvas.addEventListener('mousemove', this._dragTile);
        document.querySelector('#closeEditor').addEventListener('click', e => {
            if (this.selectedTile) this._dropTile(e);
            this._deleteEditorUI(e)
        });
    }

    _handleClick = (e) => {
        this.isDragging ? this._dropTile() : this._grabTile()
    }

    _createEditorUI() {
        // Create the button
        const closeButton = document.createElement('button');
        closeButton.className = 'btn btn-danger';
        closeButton.id = 'closeEditor';
        closeButton.type = 'button';
        closeButton.innerText = 'Close Editor'; // Set button text

        // Append the button to the document body
        document.body.appendChild(closeButton);

        // Create the selection buttons
        const tileSelection = document.createElement('div');
        tileSelection.className = 'bg-dark text-center rounded-1';
        tileSelection.id = 'roadPieces';
        tileSelection.innerHTML =
            `<button type="button" id="BendSidewalk" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_bend.webp" alt="Bend Piece">Bend Piece</button>
            <button type="button" id="BendSquare" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_turn.webp" alt="Turn Piece">Turn Piece</button>
            <button type="button" id="Bridge" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_bridge.webp" alt="Bridge Piece">Bridge Piece</button>
            <button type="button" id="Crossroad" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_crossroad.webp" alt="Crossroad Piece">Crossroad Piece</button>
            <button type="button" id="End" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_end.webp" alt="End Piece">End Piece</button>
            <button type="button" id="Intersection" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_intersection.webp" alt="Intersection Piece">Intersection Piece</button>
            <button type="button" id="Single" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_single.webp" alt="Single Piece">Single Piece</button>
            <button type="button" id="SlantHigh" class="btn btn-lg btn-dark fs-6 fw-bolder"><img src="img/road_slant.webp" alt="Slant Piece">Slant Piece</button>`;
        document.body.appendChild(tileSelection);


        // Loop through the mappings and add listeners
        Object.entries(this.tiles).forEach(([id, tileType]) => {
            const handler = (e) => this._createTile(e, id);
            this.tiles[id].handler = handler;
            document.querySelector(`#${id}`).addEventListener('click', handler);
        });

        // Configure rotation
        this._handleKeydownBound = this._handleKeydown.bind(this);
        window.addEventListener('keydown', this._handleKeydownBound);
    }

    _handleKeydown(event) {
        if (event.key === "a" || event.key === "A") {
            if (this.selectedTile) {
                this._rotateTile(event, this.selectedTile, Math.PI / 2);
            }
        }
        if (event.key === "d" || event.key === "D") {
            if (this.selectedTile) {
                this._rotateTile(event, this.selectedTile, -Math.PI / 2);
            }
        }
        if (event.key === "Delete") {
            if (this.selectedTile) {
                destroyThreeMesh(this.selectedTile.mesh);
                if (this.selectedTile.body) destroyCannonBody(this.selectedTile.body);
                this.selectedTile = null;
                this.isDragging = false;
            }
        }
    }

    _deleteEditorUI = (e) => {
        this.editMode = false;
        const closeButton = document.querySelector('#closeEditor');
        document.body.removeChild(closeButton);
        closeButton.removeEventListener('click', this._deleteEditorUI);

        const threeCanvas = document.querySelector("canvas");
        threeCanvas.removeEventListener('click', this._handleClick);
        threeCanvas.removeEventListener('mousemove', this._dragTile);

        Object.keys(this.tiles).forEach(id => {
            document.querySelector(`#${id}`).removeEventListener('click', this.tiles[id].handler);
            this.tiles[id].handler = null;
        });

        const tileSelection = document.querySelector('#roadPieces');
        document.body.removeChild(tileSelection);

        window.removeEventListener('keydown', this._handleKeydownBound);
    }

    _createTile(e, tileType) {
        if (this.isDragging || this.selectedTile) return;
        this.selectedTile = {};

        // Get the tile from this.tiles
        this.selectedTile.tile = this.tiles[tileType];

        // Set tile to 0,0 to start
        this.selectedTile.position = this.grid[0][0].position.clone();
        if (this.selectedTile.tile.yOffset > 0) this.selectedTile.position.y += this.selectedTile.tile.yOffset;

        // Create the tile mesh
        this.selectedTile.mesh = this.selectedTile.tile.mesh.clone();
        this.selectedTile.mesh.position.set(this.selectedTile.position.x, this.selectedTile.position.y, this.selectedTile.position.z);
        this.scene.add(this.selectedTile.mesh);

        // Add a physics body for specific tile types if needed
        if (tileType === "Bridge" || tileType === "SlantHigh") {
            this._addBody(this.selectedTile, tileType);
        }

        // If the selected tile is a "SlantHigh" tile and not already rotated, rotate it
        if (tileType === "SlantHigh" && this.selectedTile.mesh.rotation.x === 0) {
            this._rotateSlant(this.selectedTile);
        }

        // Set the dragging flag to true
        this.isDragging = true;
    }

    _grabTile(event) {
        // Set up the raycaster from the camera to the mouse position
        this.raycaster.setFromCamera(this.pointer, this.camera);

        // Find all intersections with the raycaster
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // If an intersection is found, select the first object
        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            const name = clickedObject.name.split("_");
            const isTile = name[1] === "RoadKit";

            // Check if the clicked object is a tile
            if (clickedObject && isTile) {
                const intersection = intersects[0].point;
                // Clone the grid square the object is on for manipulation
                const cell = this._getCell(intersection.x, intersection.z);
                this.selectedTile = Object.assign({}, this.grid[cell[0]][cell[1]]);

                if (!this.selectedTile.mesh) {
                    this.selectedTile = null;
                    return;
                }

                this.selectedTile.cell = cell;

                // Set the dragging flag to true
                this.isDragging = true;
            }
        }
    }

    _dragTile = (e) => {
        // Convert mouse coordinates to normalised device coordinates
        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Set up the raycaster from the camera to the mouse position
        this.raycaster.setFromCamera(this.pointer, this.camera);

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (!this.isDragging || !this.selectedTile) {
            if (!(intersects.length > 0)) return;
            const intersection = intersects[0].object
            const name = intersection.name.split("_");
            const isTile = name[1] === "RoadKit";

            if (intersection.parent !== this.hoveredObject) {
                if (this.hoveredObject) {
                    this.hoveredObject.children.forEach((child, i) => {
                        destroyMaterial(child.material);
                        child.material = this.originalMaterials[i];
                    });
                    this.hoveredObject = null;
                    this.originalMaterials = [];
                }
            }

            if (isTile) {
                document.body.style.cursor = "pointer";
                intersection.parent.children.forEach((child) => {
                    this.originalMaterials.push(child.material);
                    const newMaterial = child.material.clone();
                    newMaterial.emissive = new THREE.Color(0xff0000);
                    newMaterial.emissiveIntensity = 0.1;
                    child.material = newMaterial;
                });
                this.hoveredObject = intersection.parent;
            } else {
                document.body.style.cursor = "initial";
            }
            return;
        }

        if (intersects.length > 0) {
            const intersection = intersects[0].point;

            // Snap the intersection to the grid
            const snappedPosition = this._snapToGrid(intersection.x, intersection.z);

            if (snappedPosition) {
                // Update the selected tile's position
                this.selectedTile.mesh.position.set(snappedPosition.x, this.selectedTile.mesh.position.y, snappedPosition.z);

                if (this.selectedTile.body) {
                    this.selectedTile.body.position.set(snappedPosition.x, this.selectedTile.body.position.y, snappedPosition.z);
                }
            }

        }
    }

    _rotateTile = (e, target, rotateAmount) => {
        // Create a quaternion for the Y-axis rotation
        const quatY = new THREE.Quaternion();
        quatY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotateAmount);

        // Apply the Y-axis rotation relative to the world
        target.mesh.quaternion.premultiply(quatY);

        // Update the physics body if it exists
        if (target.body) this._rotatePhysicsBody(target, rotateAmount);

        // Track the updated Y-axis rotation
        target.rotation += rotateAmount;
    };


    _dropTile(event) {
        if (!this.isDragging || !this.selectedTile) return;

        // Finalise the tile placement by snapping it to the grid and placing it
        const finalPosition = this.selectedTile.mesh.position;

        const finalCell = this._getCell(finalPosition.x, finalPosition.z);

        // Update the tile's mesh position
        this.selectedTile.mesh.position.set(finalPosition.x, this.selectedTile.mesh.position.y, finalPosition.z);

        if (this.selectedTile.body) {
            this.selectedTile.body.position.set(finalPosition.x, this.selectedTile.body.position.y, finalPosition.z);
            this.selectedTile.body.velocity.set(0, 0, 0);
            this.selectedTile.body.angularVelocity.set(0, 0, 0);
            this.selectedTile.body.force.set(0, 0, 0);
        }

        // If this is a new tile, there is no initial cell
        if (!this.selectedTile.cell) {
            // Update new cell position
            this._replaceCell(finalCell);
        } else { // If this is a moved cell
            const initialCell = this.selectedTile.cell;
            if (!((initialCell[0] === finalCell[0]) && (initialCell[1] === finalCell[1]))) {
                // Update new cell position
                this._replaceCell(finalCell);

                // Clear initial cell
                this.grid[initialCell[0]][initialCell[1]].tile = null;
                this.grid[initialCell[0]][initialCell[1]].mesh = null;
                this.grid[initialCell[0]][initialCell[1]].body = null;
                this.grid[initialCell[0]][initialCell[1]].rotation = null;
            }
        }

        // Reset dragging state
        this.isDragging = false;
        this.selectedTile = null;
    }

    _replaceCell(cell) {
        if (this.grid[cell[0]][cell[1]].mesh) destroyThreeMesh(this.grid[cell[0]][cell[1]].mesh, this.scene);
        if (this.grid[cell[0]][cell[1]].body) destroyCannonBody(this.grid[cell[0]][cell[1]].body, this.physicsWorld);

        this.grid[cell[0]][cell[1]].tile = this.selectedTile.tile;
        this.grid[cell[0]][cell[1]].mesh = this.selectedTile.mesh;
        this.grid[cell[0]][cell[1]].body = this.selectedTile.body;
        this.grid[cell[0]][cell[1]].rotation = this.selectedTile.rotation;
    }

    _getCell(mouseX, mouseZ) {
        // Get the world position of the grid's origin (the top-left corner)
        const gridOrigin = this.grid[0][0].position;

        // Calculate the mouse position in world space by subtracting the grid's origin
        const worldMouseX = mouseX - gridOrigin.x;
        const worldMouseZ = gridOrigin.z - mouseZ;

        // Calculate the closest row and column based on the mouse's world position
        const closestRow = Math.round(worldMouseX / this.tileSize);
        const closestCol = Math.round(worldMouseZ / this.tileSize);

        if (this.grid[closestRow] && this.grid[closestRow][closestCol]) {
            return [closestRow, closestCol];
        }

        return null;
    }

    _snapToGrid(mouseX, mouseZ) {
        const cell = this._getCell(mouseX, mouseZ);

        // Ensure the row and column are within grid bounds
        if (cell) {
            const row = cell[0];
            const col = cell[1];

            const targetPosition = this.grid[row][col].position;

            const y = this.selectedTile.yOffset > 0 ? this.grid[row][col].position.y + this.selectedTile.tile.yOffset : this.selectedTile.tile.yOffset;

            // Return the snapped position relative to the grid's origin
            return new THREE.Vector3(targetPosition.x, y, targetPosition.z);
        }

        // If the position is out of bounds or invalid, return null
        return null;
    }
}
