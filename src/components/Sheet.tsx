import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Modal sheet on the native <dialog> element (focus trap, Esc, backdrop for free).
 * Centered on desktop, bottom sheet on phones. */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={props.title}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      <div className="sheet-head">
        <h2>{props.title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={props.onClose}>
          <X className="icon" />
        </button>
      </div>
      <div className="sheet-body">{props.children}</div>
      {props.footer && <div className="sheet-foot">{props.footer}</div>}
    </dialog>
  );
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field" role="group" aria-label={props.label}>
      <span className="legend">{props.label}</span>
      <div className="segmented">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={props.value === o.value}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
