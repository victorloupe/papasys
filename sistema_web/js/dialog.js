// ==============================================================================
// PapaSys UI - Sistema Central de Diálogos & Modais Customizados
// Substitui alert(), confirm() e prompt() nativos pelo design system oficial PapaSys
// ==============================================================================

const PapaSysDialog = {
  // Modal de Confirmação (Substitui confirm())
  confirm({
    title = "Confirmação",
    message = "Deseja prosseguir com esta ação?",
    confirmText = "Confirmar",
    cancelText = "Cancelar",
    type = "warning", // "danger" | "warning" | "info"
    icon = null
  } = {}) {
    return new Promise((resolve) => {
      this._createModal({
        title,
        message,
        confirmText,
        cancelText,
        showCancel: true,
        type,
        icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });
  },

  // Modal de Alerta / Informação (Substitui alert())
  alert({
    title = "Aviso do Sistema",
    message = "",
    buttonText = "Entendi",
    type = "info", // "info" | "success" | "warning" | "error"
    icon = null
  } = {}) {
    return new Promise((resolve) => {
      this._createModal({
        title,
        message,
        confirmText: buttonText,
        showCancel: false,
        type,
        icon,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(true)
      });
    });
  },

  // Modal de Input / Pergunta (Substitui prompt())
  prompt({
    title = "Preencha a informação",
    message = "",
    defaultValue = "",
    placeholder = "Digite aqui...",
    confirmText = "Salvar",
    cancelText = "Cancelar",
    type = "info"
  } = {}) {
    return new Promise((resolve) => {
      const inputHtml = `
        <div class="dialog-prompt-field" style="margin-top: 14px;">
          <input type="text" id="papasysPromptInput" class="form-input" value="${this._escapeHtml(defaultValue)}" placeholder="${this._escapeHtml(placeholder)}" autofocus style="width: 100%;" />
        </div>
      `;
      this._createModal({
        title,
        message,
        customBody: inputHtml,
        confirmText,
        cancelText,
        showCancel: true,
        type,
        onConfirm: () => {
          const val = document.getElementById("papasysPromptInput")?.value;
          resolve(val !== undefined ? val : null);
        },
        onCancel: () => resolve(null)
      });

      setTimeout(() => {
        const inp = document.getElementById("papasysPromptInput");
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 50);
    });
  },

  _createModal({
    title,
    message,
    customBody = "",
    confirmText = "OK",
    cancelText = "Cancelar",
    showCancel = true,
    type = "info",
    icon = null,
    onConfirm = () => {},
    onCancel = () => {}
  }) {
    this.close();

    const overlay = document.createElement("div");
    overlay.className = "papasys-dialog-overlay";
    overlay.id = "papasysDialogOverlay";

    let iconSvg = icon;
    let iconClass = `dialog-icon-${type}`;

    if (!iconSvg) {
      if (type === "danger") {
        iconSvg = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;
      } else if (type === "warning") {
        iconSvg = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        `;
      } else if (type === "success") {
        iconSvg = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        `;
      } else {
        iconSvg = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        `;
      }
    }

    const btnConfirmClass = type === "danger" ? "btn-danger" : "btn-primary";

    overlay.innerHTML = `
      <div class="papasys-dialog-card" role="dialog" aria-modal="true">
        <div class="papasys-dialog-header">
          <div class="papasys-dialog-icon ${iconClass}">
            ${iconSvg}
          </div>
          <div class="papasys-dialog-headings">
            <h3 class="papasys-dialog-title">${this._escapeHtml(title)}</h3>
            ${message ? `<p class="papasys-dialog-message">${this._escapeHtml(message)}</p>` : ""}
          </div>
        </div>
        ${customBody ? `<div class="papasys-dialog-body">${customBody}</div>` : ""}
        <div class="papasys-dialog-footer">
          ${showCancel ? `<button type="button" class="btn btn-secondary btn-sm" id="papasysDialogCancel">${this._escapeHtml(cancelText)}</button>` : ""}
          <button type="button" class="btn ${btnConfirmClass} btn-sm" id="papasysDialogConfirm">${this._escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const card = overlay.querySelector(".papasys-dialog-card");
    if (typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.animateModalIn(overlay, card);
    }

    const btnConfirm = overlay.querySelector("#papasysDialogConfirm");
    const btnCancel = overlay.querySelector("#papasysDialogCancel");

    const cleanup = () => {
      document.removeEventListener("keydown", keyHandler);
      if (typeof PapaSysAnimation !== "undefined") {
        PapaSysAnimation.animateModalOut(overlay, card, () => overlay.remove());
      } else {
        overlay.classList.add("closing");
        setTimeout(() => overlay.remove(), 180);
      }
    };

    btnConfirm.addEventListener("click", () => {
      cleanup();
      onConfirm();
    });

    if (btnCancel) {
      btnCancel.addEventListener("click", () => {
        cleanup();
        onCancel();
      });
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        onCancel();
      }
    });

    const keyHandler = (e) => {
      if (e.key === "Escape") {
        cleanup();
        onCancel();
      } else if (e.key === "Enter" && !e.shiftKey) {
        cleanup();
        onConfirm();
      }
    };
    document.addEventListener("keydown", keyHandler);

    setTimeout(() => {
      if (type === "danger" && btnCancel) {
        btnCancel.focus();
      } else {
        btnConfirm.focus();
      }
    }, 50);
  },

  close() {
    const existing = document.getElementById("papasysDialogOverlay");
    if (existing) existing.remove();
  },

  _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};
