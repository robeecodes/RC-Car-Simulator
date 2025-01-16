import * as bootstrap from 'bootstrap'

/**
 * Create modals for interactables
 * @param {String} object The object which the modal relates to
 * @param {String} content What the modal should say
 * @returns {Modal}
 * @public
 */
export default function createModal(object, content) {
    // Create the HTML for the modal
    const modalHTML = `
    <div class="modal" id="${object}Modal" tabindex="-1" aria-labelledby="${object}Modal" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-body bg-dark text-center text-light fs-3">
            ${content}
          </div>
        </div>
      </div>
    </div>
  `;

    // Append the modal to the body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    // Initialize the modal
    return new bootstrap.Modal(document.getElementById(`${object}Modal`), {
        backdrop: false,
        keyboard: false
    });
}