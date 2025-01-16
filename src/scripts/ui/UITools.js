export function getUIElements() {
    const overlay = document.getElementById("overlay");
    const worldSelect = document.getElementById("worldSelect");
    const carSelect = document.getElementById("carSelect");

    return {overlay, worldSelect, carSelect};
}

export function removeUIElement(el) {
    document.body.removeChild(el);
}

export function addUIElement(el) {
    document.body.appendChild(el);
}