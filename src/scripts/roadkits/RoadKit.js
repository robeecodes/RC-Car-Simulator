import * as THREE from "three";
import * as CANNON from "cannon-es";
import {ShapeType, threeToCannon} from "three-to-cannon";
import destroyThreeMesh, {destroyMaterial} from "../utils/destroyThreeMesh.js";
import destroyCannonBody from "../utils/destroyCannonBody.js";
import {addUIElement, removeUIElement} from "../ui/UITools.js";

/**
 * Class containing the information for the editable tiles in the world
 *
 * @class RoadKit
 */
export default class RoadKit {
    /**
     * Create a RoadKit
     * @param {THREE.Scene} scene The Three.js scene
     * @param {CANNON.World} physicsWorld The cannon-es physics world
     * @param {CANNON.Material} groundMaterial The cannon-es ground material
     * @param {THREE.PerspectiveCamera} camera The Three.js camera for the scene
     * @param {Number} tileSize The size of each square tile
     */
    constructor(scene, physicsWorld, groundMaterial, camera, tileSize = 0.5) {
        // Store scene information
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.groundMaterial = groundMaterial;

        // Configure grid with span for each tile (though they currently only span one tile)
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
        this.hoveredTile = null;
        this.originalMaterials = [];
    }

    /**
     * Create the grid for the world storing the x,z position for each tile
     * @param {number} rows The number of grid rows
     * @param {number} cols The number of grid columns
     * @param {THREE.Vector3} startPosition The first grid position in the top-left
     * @public
     */
    initialiseGrid(rows, cols, startPosition) {
        // Create grid using rows, cols and the relative start position
        this.grid = Array.from({length: rows}, (_, row) =>
            Array.from({length: cols}, (_, col) => ({
                // Position is offset from the start based on the current row, col and tilesize
                position: new THREE.Vector3(
                    startPosition.x + row * this.tileSize,
                    startPosition.y - 0.032,
                    startPosition.z - col * this.tileSize
                ),
                tile: null,
                rotation: 0,
            }))
        );

        // Configure tiles in the grid and add to the scene
        this._tileOffsets();
        this._assignTiles();
        this._addToScene();
    }

    /**
     * Set position offsets for certain tiles
     * @protected
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
     * @protected
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
     * @protected
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

                // If the current tile has a yOffset, apply it
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

                    // Make the slant slanted
                    this._rotateSlant(col);
                    this._rotatePhysicsBody(col, col.rotation);

                } else if (col.rotation) {
                    // rotate the mesh on y if required
                    col.mesh.rotation.y = col.rotation;
                }

                // Add tile to scene
                this.scene.add(col.mesh);
            });
        });
    }

    /**
     * Rotate slants to be diagonal
     * @param {Object} col The cell containing the properties for the slant
     * @protected
     */
    _rotateSlant(col) {
        // Rotate the mesh by 25 degrees on x to make the slant
        const x = THREE.MathUtils.degToRad(-25);

        // Rotate the mesh on x
        col.mesh.rotateX(x);

        // Rotate the physics body on x
        const quatX = new CANNON.Quaternion();
        quatX.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), x);

        col.body.quaternion = quatX;
    }

    /**
     * Rotate physics body
     * @param {Object} target Object containing the mesh and rotation amount
     * @param {Number} rotationAmount Ohe amount to rotate the body by on the y-axis
     * @protected
     */
    _rotatePhysicsBody(target, rotationAmount) {
        let quaternion;
        if (target.body.quaternion.x !== 0 || target.body.quaternion.y !== 0) {
            // Add rotation around the y-axis to the existing quaternion
            const quatY = new CANNON.Quaternion();
            quatY.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationAmount);
            quaternion = quatY.mult(target.body.quaternion);
            quaternion.normalize();
        } else {
            // Create a new quaternion for the y-axis rotation if no prior rotation exists
            quaternion = new CANNON.Quaternion();
            quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationAmount);
        }

        // Update the body's quaternion
        target.body.quaternion.copy(quaternion);
    }

    /**
     * Add physics body to a target
     * @param {Object} target The cell containing the properties for the physics body
     * @param {String} tag The name of the target
     * @protected
     */
    _addBody(target, tag) {
        // Basic body configuration. Mass is 0, so it doesn't move
        const body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(target.position.x, target.position.y, target.position.z),
            material: this.groundMaterial
        });
        body.name = "roadkit";
        // Create a box collider for the top of the bridge
        if (tag === "Bridge") {
            const halfExtents = new CANNON.Vec3(this.tileSize / 2, 0.005, this.tileSize / 2);
            const shape = new CANNON.Box(halfExtents);
            body.position.y = this.tiles[tag].height - 0.02;
            body.addShape(shape);
        } else if (tag === "SlantHigh") {
            // Use threeToCannon for the slant collider
            const mesh = target.mesh.isMesh ? target.mesh : target.mesh.children[0];
            const physicsShape = threeToCannon(mesh, {type: ShapeType.BOX});

            const {shape, offset, orientation} = physicsShape;

            body.addShape(shape);
        }

        // Add physics body to physics world
        this.physicsWorld.addBody(body);
        target.body = body;
    }

    /**
     * Open the tile editor
     * @public
     */
    openEditor() {
        // Set edit mode to true so that procedures, like car driving, are disabled
        this.editMode = true;

        // Create the editor ui
        this._createEditorUI();

        // Add mouse controls to manipulate the tiles
        const threeCanvas = document.querySelector("canvas");

        // Select and drop tile
        threeCanvas.addEventListener('click', this._handleClick);

        // Hover and move tile
        threeCanvas.addEventListener('mousemove', this._handleMouseMove);

        // Close the editor ui
        document.querySelector('#closeEditor').addEventListener('click', e => {
            // Remove any hover filters applied to tiles
            if (this.hoveredTile) {
                this.hoveredTile.children.forEach((child, i) => {
                    destroyMaterial(child.material);
                    child.material = this.originalMaterials[i];
                });
                this.hoveredTile = null;
                this.originalMaterials = [];
            }
            // Drop any selected tiles
            if (this.selectedTile) this._dropTile(e);
            // Delete the ui
            this._deleteEditorUI(e)
        });
    }

    /**
     * Create the tile editor ui
     * @protected
     */
    _createEditorUI() {
        // Create the button to close the editor
        const closeButton = document.createElement('button');
        closeButton.className = 'btn btn-danger';
        closeButton.id = 'closeEditor';
        closeButton.type = 'button';
        closeButton.innerText = 'Close Editor';

        // Append the button to the document body
        addUIElement(closeButton);

        // Create the instructions
        const editInfo = document.createElement('div');
        editInfo.className = 'text-light p-3 rounded-1';
        editInfo.id = 'editInfo';
        editInfo.innerHTML =
            `<p class="lead">Tile Editor Instructions:</p>
            <ul class="list-group text-light">
                <li class="list-group-item text-light">Click a road tile on the rug and move your mouse to move it.</li>
                <li class="list-group-item text-light">Click a tile button to create a new tile.</li>
                <li class="list-group-item text-light">Click on the rug to place the tile. This will delete any tiles in its position.</li>
                <li class="list-group-item text-light">While a tile is selected, press A or D to rotate it.</li>
                <li class="list-group-item text-light">Press Delete to remove a selected tile.</li>
            </ul>`

        // Append the instructions to the document body
        addUIElement(editInfo);

        // Create the tile selection buttons
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

        // Append the tile selection buttons to the document body
        addUIElement(tileSelection);

        // Loop through the tile selection buttons and add listeners
        Object.entries(this.tiles).forEach(([id, tileType]) => {
            // Store handlers so they can be removed
            const handler = (e) => this._createTile(e, id);
            this.tiles[id].handler = handler;
            document.querySelector(`#${id}`).addEventListener('click', handler);
        });

        // Configure key down events to rotate and delete tiles
        // Bind _handleKeyDown so this context can be accessed
        this._handleKeydownBound = this._handleKeydown.bind(this);
        window.addEventListener('keydown', this._handleKeydownBound);
    }

    /**
     * On click, determine whether to drag or drop a tile
     * @param e
     * @protected
     */
    _handleClick = (e) => {
        this.isDragging ? this._dropTile() : this._grabTile()
    }

    /**
     * On mouse move, determine whether to move a tile or apply a hover effect
     * @param e
     * @protected
     */
    _handleMouseMove = (e) => {
        // Convert mouse coordinates to normalised device coordinates
        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Set up the raycaster from the camera to the mouse position
        this.raycaster.setFromCamera(this.pointer, this.camera);

        // Store any raycaster intersects
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        // Do nothing if there are no intersects
        if (!intersects.length > 0) return;

        // If there is no tile currently being moved, add hover effect to the current tile
        if (!this.selectedTile || !this.isDragging) this._hoverTile(e, intersects);
        else this._moveTile(e, intersects);
    }

    /**
     * Configure keydown events for the editor, rotate and delete
     * @param e
     * @protected
     */
    _handleKeydown(e) {
        // Do nothing if no tile is selected
        if (!this.selectedTile) return;

        // Rotate anti-clockwise when pressing a
        if (e.key === "a" || e.key === "A") {
            this._rotateTile(e, this.selectedTile, Math.PI / 2);
        }
        // Rotate clockwise when pressing d
        if (e.key === "d" || e.key === "D") {
            this._rotateTile(e, this.selectedTile, -Math.PI / 2);
        }
        // Delete the selected tile when pressing Delete
        if (e.key === "Delete") {
            destroyThreeMesh(this.selectedTile.mesh);
            if (this.selectedTile.body) destroyCannonBody(this.selectedTile.body);
            this.selectedTile = null;
            this.isDragging = false;
        }
    }

    /**
     * Delete the editor UI
     * @param e
     * @protected
     */
    _deleteEditorUI = (e) => {
        // Exit edit mode
        this.editMode = false;

        // Remove the closeButton
        const closeButton = document.querySelector('#closeEditor');
        removeUIElement(closeButton);
        closeButton.removeEventListener('click', this._deleteEditorUI);

        // Remove the instructions
        const editInfo = document.getElementById('editInfo');
        removeUIElement(editInfo);

        // Stop mouse events
        const threeCanvas = document.querySelector("canvas");
        threeCanvas.removeEventListener('click', this._handleClick);
        threeCanvas.removeEventListener('mousemove', this._handleMouseMove);

        // Remove tile button events
        Object.keys(this.tiles).forEach(id => {
            document.querySelector(`#${id}`).removeEventListener('click', this.tiles[id].handler);
            this.tiles[id].handler = null;
        });

        // Remove tile buttons
        const tileSelection = document.querySelector('#roadPieces');
        removeUIElement(tileSelection);

        // Remove keydown events
        window.removeEventListener('keydown', this._handleKeydownBound);
    }

    _addColourOverlay(tile) {
        tile.children.forEach((child) => {
            // Store the original material to restore later
            this.originalMaterials.push(child.material);
            // Create new red material and assign it
            const newMaterial = child.material.clone();
            newMaterial.emissive = new THREE.Color(0xff0000);
            newMaterial.emissiveIntensity = 0.1;
            child.material = newMaterial;
        });
        this.hoveredTile = tile;
    }

    _removeColourOverlay(tile) {
        tile.children.forEach((child, i) => {
            // For each child, remove its new material and restore the original
            destroyMaterial(child.material);
            child.material = this.originalMaterials[i];
        });

        // Now there is no hovered tile
        this.hoveredTile = null;
        this.originalMaterials = [];
    }

    /**
     * Create a new tile to add to the grid
     * @param e
     * @param {String} tileType The type of tile to create
     * @protected
     */
    _createTile(e, tileType) {
        // If a tile is already selected, do nothing
        if (this.isDragging || this.selectedTile) return;

        // Configure new tile
        this.selectedTile = {};

        // Get the tile from this.tiles
        this.selectedTile.tile = this.tiles[tileType];

        // Set tile to 0,0 to start
        this.selectedTile.position = this.grid[0][0].position.clone();
        if (this.selectedTile.tile.yOffset > 0) this.selectedTile.position.y += this.selectedTile.tile.yOffset;

        // Create the tile mesh
        this.selectedTile.mesh = this.selectedTile.tile.mesh.clone();
        this.selectedTile.mesh.position.set(this.selectedTile.position.x, this.selectedTile.position.y, this.selectedTile.position.z);

        if (this.hoveredTile) {
            this._removeColourOverlay(this.hoveredTile);
        }

        this._addColourOverlay(this.selectedTile.mesh);

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

    /**
     * Grab a pre-existing tile
     * @param e
     * @protected
     */
    _grabTile(e) {
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
                // Reference the grid square the object is on for manipulation
                const cell = this._getCell(intersection.x, intersection.z);
                this.selectedTile = Object.assign({}, this.grid[cell[0]][cell[1]]);

                // Stop if there is no mesh to select
                if (!this.selectedTile.mesh) {
                    this.selectedTile = null;
                    return;
                }

                // Store the cell the tile was grabbed from
                this.selectedTile.cell = cell;

                // Set the dragging flag to true
                this.isDragging = true;
            }
        }
    }

    /**
     * Add hover effect to tile with mouse over
     * @param e
     * @param {Array} intersects The array of detected raycast intersections
     * @protected
     */
    _hoverTile(e, intersects) {
        const intersection = intersects[0].object
        const name = intersection.name.split("_");
        const isTile = name[1] === "RoadKit";

        // If the tile currently being hovered is different from previous, remove hover effects from previous
        if (intersection.parent !== this.hoveredTile) {
            if (this.hoveredTile) {
                this._removeColourOverlay(this.hoveredTile);
            }
        }

        // If the new hovered object is a tile, give it a hover effect
        if (isTile) {
            // Pointer set to cursor to show you can click the tile
            document.body.style.cursor = "pointer";
            this._addColourOverlay(intersection.parent);
            // Reference hovered tile
            this.hoveredTile = intersection.parent;
        } else {
            // If no tile is hovered, cursor goes back to normal
            document.body.style.cursor = "initial";
        }
    }

    /**
     * Move the selected tile along the grid
     * @param e
     * @param {Array} intersects The array of detected raycast intersections
     * @protected
     */
    _moveTile(e, intersects) {
        if (intersects.length > 0) {
            // The position of the tile based on the mouse
            const intersection = intersects[0].point;

            // Snap the intersection to the grid
            const snappedPosition = this._snapToGrid(intersection.x, intersection.z);

            if (snappedPosition) {
                // Update the selected tile's position
                this.selectedTile.mesh.position.set(snappedPosition.x, this.selectedTile.mesh.position.y, snappedPosition.z);

                // Update the physics body if applicable
                if (this.selectedTile.body) {
                    this.selectedTile.body.position.set(snappedPosition.x, this.selectedTile.body.position.y, snappedPosition.z);
                }
            }

        }
    }

    /**
     * Rotate the selected tile
     * @param e
     * @param {Object} target The tile to rotate
     * @param {Number} rotateAmount The amount to rotate the tile
     * @protected
     */
    _rotateTile = (e, target, rotateAmount) => {
        // Create a quaternion for the y-axis rotation
        const quatY = new THREE.Quaternion();
        quatY.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotateAmount);

        // Apply the y-axis rotation
        target.mesh.quaternion.premultiply(quatY);

        // Update the physics body if applicable
        if (target.body) this._rotatePhysicsBody(target, rotateAmount);

        // Track the updated y-axis rotation
        target.rotation += rotateAmount;
    };


    /**
     * Drop the selected tile onto the grid
     * @param e
     * @protected
     */
    _dropTile(e) {
        // If there is no tile to drop, do nothing
        if (!this.isDragging || !this.selectedTile) return;

        // Finalise the tile placement by snapping it to the grid and placing it
        const finalPosition = this.selectedTile.mesh.position;

        // Get the final cell based on the final position
        const finalCell = this._getCell(finalPosition.x, finalPosition.z);

        // Update the tile's mesh position
        this.selectedTile.mesh.position.set(finalPosition.x, this.selectedTile.mesh.position.y, finalPosition.z);

        // Ensure any overlay is removed
        if (this.originalMaterials.length > 0) {
            this._removeColourOverlay(this.selectedTile.mesh);
        }

        // Place the physics body and remove any applied forces
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
        } else {
            // If this is a moved cell first check the final position is different from the initial position
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

    /**
     * Change the cell to match the selected tile
     * @param {Array} cell The coordinates of the grid cell
     * @protected
     */
    _replaceCell(cell) {
        // Delete anything currently occupying the cell
        if (this.grid[cell[0]][cell[1]].mesh) destroyThreeMesh(this.grid[cell[0]][cell[1]].mesh, this.scene);
        if (this.grid[cell[0]][cell[1]].body) destroyCannonBody(this.grid[cell[0]][cell[1]].body, this.physicsWorld);

        // Set the cell to match the selected tile
        this.grid[cell[0]][cell[1]].tile = this.selectedTile.tile;
        this.grid[cell[0]][cell[1]].mesh = this.selectedTile.mesh;
        this.grid[cell[0]][cell[1]].body = this.selectedTile.body;
        this.grid[cell[0]][cell[1]].rotation = this.selectedTile.rotation;
    }

    /**
     * Retrieve a grid cell based on a given (x,z) coordinate
     * @param {Number} x The x coordinate of the cell
     * @param {Number} z The z coordinate of the cell
     * @returns {number[]|null}
     * @protected
     */
    _getCell(x, z) {
        // Get the world position of the grid's origin (the top-left corner)
        const gridOrigin = this.grid[0][0].position;

        // Calculate the mouse position in world space by subtracting the grid's origin
        const worldMouseX = x - gridOrigin.x;
        const worldMouseZ = gridOrigin.z - z;

        // Calculate the closest row and column based on the mouse's world position
        const closestRow = Math.round(worldMouseX / this.tileSize);
        const closestCol = Math.round(worldMouseZ / this.tileSize);

        // Is a suitable cell is found return it
        if (this.grid[closestRow] && this.grid[closestRow][closestCol]) {
            return [closestRow, closestCol];
        }

        // Return null is no cell found
        return null;
    }


    /**
     * Snap tiles to the grid
     * @param {Number} x The x coordinate of the cell
     * @param {Number} z The z coordinate of the cell
     * @returns {null|THREE.Vector3}
     * @private
     */
    _snapToGrid(x, z) {
        // Get the closest cell based on (x, z) coordinate
        const cell = this._getCell(x, z);

        // If a cell is found, get the snapped position
        if (cell) {
            const row = cell[0];
            const col = cell[1];

            const targetPosition = this.grid[row][col].position;

            // Offset y if applicable
            const y = this.selectedTile.yOffset > 0 ? this.grid[row][col].position.y + this.selectedTile.tile.yOffset : this.selectedTile.tile.yOffset;

            // Return the snapped position relative to the grid's origin
            return new THREE.Vector3(targetPosition.x, y, targetPosition.z);
        }

        // If the position is out of bounds or invalid, return null
        return null;
    }
}
