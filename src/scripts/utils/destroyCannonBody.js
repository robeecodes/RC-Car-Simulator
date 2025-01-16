/**
 * Destroy a cannon-es body
 * @param {CANNON.Body} body The physics body to destroy
 * @param {CANNON.World} physicsWorld The physics world the body is in
 * @public
 */
export default function destroyCannonBody(body, physicsWorld) {
    if (body && physicsWorld) {
        physicsWorld.removeBody(body);
    }
}
