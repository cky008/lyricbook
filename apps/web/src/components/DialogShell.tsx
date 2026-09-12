import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { useI18n } from "@app/lib/i18n";

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  wide?: boolean;
  dismissible?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  wide = false,
  dismissible = true,
  children,
  footer,
}: DialogShellProps) {
  const { t } = useI18n();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next || dismissible) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className={`dialog-content${wide ? " wide" : ""}`}>
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="dialog-description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close className="icon-button" aria-label={t("close")} disabled={!dismissible}>
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
          {footer ? <div className="dialog-footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
