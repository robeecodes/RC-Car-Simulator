export function getUIElements() {
    const overlay = document.getElementById("overlay");
    const worldSelect = document.getElementById("worldSelect");
    const carSelect = document.getElementById("carSelect");
    const info = document.getElementById("info");

    return {overlay, worldSelect, carSelect, guide};
}

export function removeUIElement(el) {
    document.body.removeChild(el);
}

export function addUIElement(el) {
    document.body.appendChild(el);
}