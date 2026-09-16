'use client';

import { ReactNode, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface State extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm(): `await confirmDialog.ask({...})`
 * resolves true/false and renders through the shared Modal instead of a native dialog.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<State>({ open: false, title: '' });
  const [submitting, setSubmitting] = useState(false);

  function ask(options: ConfirmOptions) {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve });
    });
  }

  function settle(value: boolean) {
    state.resolve?.(value);
    setState((s) => ({ ...s, open: false }));
    setSubmitting(false);
  }

  const dialog = (
    <Modal
      open={state.open}
      onClose={() => settle(false)}
      title={state.title}
      description={state.description}
      icon={
        state.variant === 'danger' ? (
          <AlertTriangle className="h-5 w-5" />
        ) : (
          <HelpCircle className="h-5 w-5" />
        )
      }
    >
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => settle(false)}>
          {state.cancelLabel ?? 'Cancel'}
        </Button>
        <Button
          variant={state.variant === 'danger' ? 'danger' : 'primary'}
          loading={submitting}
          onClick={() => {
            setSubmitting(true);
            settle(true);
          }}
        >
          {state.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Modal>
  );

  return { ask, dialog };
}
