/**
 * Get the initial screens when the page loads
 * @returns {{overlay: HTMLElement, worldSelect: HTMLElement, carSelect: HTMLElement, guide: HTMLElement}}
 * @public
 */
export function getUIElements() {
    const overlay = document.getElementById("overlay");
    const worldSelect = document.getElementById("worldSelect");
    const carSelect = document.getElementById("carSelect");
    const guide = document.getElementById("guide");

    return {overlay, worldSelect, carSelect, guide};
}

/**
 * Removes a UIElement
 * @param {HTMLElement} el The element to remove from the project
 */
export function removeUIElement(el) {
    document.body.removeChild(el);
}

/**
 * Adds a UIElement
 * @param {HTMLElement} el The element to add to the project
 */
export function addUIElement(el) {
    document.body.appendChild(el);
}