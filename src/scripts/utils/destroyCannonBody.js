export default function destroyCannonBody(body, physicsWorld) {
    if (body && physicsWorld) {
        physicsWorld.removeBody(body);
    }
}
