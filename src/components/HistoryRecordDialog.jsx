import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import "./HistoryRecordDialog.css";

export default function HistoryRecordDialog({ title, subtitle, closeLabel = "Close", onClose, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const ownerDocument = dialog.ownerDocument;
    const previousFocus = ownerDocument.activeElement;
    const previousOverflow = ownerDocument.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    ownerDocument.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      ownerDocument.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  function outsideDialog(event) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  return <dialog
    ref={dialogRef}
    className="history-record-dialog"
    aria-labelledby={titleId}
    aria-describedby={subtitle ? subtitleId : undefined}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { backdropPress.current = outsideDialog(event); }}
    onPointerCancel={() => { backdropPress.current = false; }}
    onClick={(event) => {
      const close = backdropPress.current && outsideDialog(event);
      backdropPress.current = false;
      if (close) onClose();
    }}
  >
    <header className="history-record-dialog-header">
      <div>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p id={subtitleId}>{subtitle}</p>}
      </div>
      <button ref={closeRef} type="button" className="history-record-dialog-close"
        aria-label={closeLabel} title={closeLabel} onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
    </header>
    <div className="history-record-dialog-content">{children}</div>
  </dialog>;
}
