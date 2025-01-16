import * as bootstrap from 'bootstrap'

export default function createModal(object, content) {
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