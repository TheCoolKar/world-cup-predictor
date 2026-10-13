import { useEffect } from "react";

/**
 * Accessibility helper for modal/dialog components.
 * - Closes the dialog on Escape.
 * - Locks background scroll while the dialog is open.
 *
 * Pair with `role="dialog"` + `aria-modal="true"` on the dialog container and an
 * `aria-label`/`aria-labelledby` describing it.
 *
 * @param {() => void} onClose  called when Escape is pressed (omit to disable, e.g. for required gates)
 * @param {boolean} isOpen      whether the dialog is currently open
 */
export function useModalA11y(onClose, isOpen = true) {
  useEffect(() => {
    if (!isOpen) return;

    function onKey(e) {
      if (e.key === "Escape" && onClose) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, isOpen]);
}
