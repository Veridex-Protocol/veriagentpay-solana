'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ConfirmDialog, DialogOptions } from '../ui/ConfirmDialog';
import { ToastContainer } from '../ui/ToastContainer';
import { ToastItem, ToastType } from '../ui/Toast';

interface DialogState {
  isOpen: boolean;
  options: DialogOptions | null;
  resolver: ((value: boolean) => void) | null;
}

interface ToastOptions {
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  confirm: (options: DialogOptions | string) => Promise<boolean>;
  alert: (options: DialogOptions | string) => Promise<void>;
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  dismissToast: (id?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

// Global singleton bridge for `toast` outside React components if needed
let globalToastHandler: {
  show: (message: string, type?: ToastType, options?: ToastOptions) => string;
  dismiss: (id?: string) => void;
} | null = null;

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    return globalToastHandler?.show(message, 'success', options) || '';
  },
  error: (message: string, options?: ToastOptions) => {
    return globalToastHandler?.show(message, 'error', options) || '';
  },
  warning: (message: string, options?: ToastOptions) => {
    return globalToastHandler?.show(message, 'warning', options) || '';
  },
  info: (message: string, options?: ToastOptions) => {
    return globalToastHandler?.show(message, 'info', options) || '';
  },
  loading: (message: string, options?: ToastOptions) => {
    return globalToastHandler?.show(message, 'loading', { duration: 0, ...options }) || '';
  },
  dismiss: (id?: string) => {
    globalToastHandler?.dismiss(id);
  },
  promise: async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: any) => string);
    }
  ): Promise<T> => {
    const id = globalToastHandler?.show(messages.loading, 'loading', { duration: 0 });
    try {
      const result = await promise;
      if (id) globalToastHandler?.dismiss(id);
      const successMsg = typeof messages.success === 'function' ? messages.success(result) : messages.success;
      globalToastHandler?.show(successMsg, 'success');
      return result;
    } catch (err: any) {
      if (id) globalToastHandler?.dismiss(id);
      const errorMsg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
      globalToastHandler?.show(errorMsg, 'error');
      throw err;
    }
  },
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Confirm/Alert Dialog State
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    options: null,
    resolver: null,
  });

  // Toasts State
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const showToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      id,
      message,
      type,
      title: options?.title,
      duration: options?.duration,
      action: options?.action,
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 4)]); // Keep maximum 5 toasts active
    return id;
  }, []);

  const dismissToast = useCallback((id?: string) => {
    if (id) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    } else {
      setToasts([]);
    }
  }, []);

  // Bind singleton
  useEffect(() => {
    globalToastHandler = {
      show: showToast,
      dismiss: dismissToast,
    };
    return () => {
      globalToastHandler = null;
    };
  }, [showToast, dismissToast]);

  const confirm = useCallback((options: DialogOptions | string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      const parsedOptions: DialogOptions = typeof options === 'string'
        ? {
            title: 'Confirmation',
            message: options,
            variant: 'danger',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
          }
        : {
            ...options,
            isAlertOnly: false,
          };

      setDialogState({
        isOpen: true,
        options: parsedOptions,
        resolver: resolve,
      });
    });
  }, []);

  const alert = useCallback((options: DialogOptions | string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const parsedOptions: DialogOptions = typeof options === 'string'
        ? {
            title: 'Notice',
            message: options,
            variant: 'info',
            confirmText: 'Got It',
            isAlertOnly: true,
          }
        : {
            ...options,
            isAlertOnly: true,
            confirmText: options.confirmText || 'Got It',
          };

      setDialogState({
        isOpen: true,
        options: parsedOptions,
        resolver: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialogState.resolver) {
      dialogState.resolver(true);
    }
    setDialogState({ isOpen: false, options: null, resolver: null });
  }, [dialogState]);

  const handleCancel = useCallback(() => {
    if (dialogState.resolver) {
      dialogState.resolver(false);
    }
    setDialogState({ isOpen: false, options: null, resolver: null });
  }, [dialogState]);

  return (
    <NotificationContext.Provider value={{ confirm, alert, showToast, dismissToast }}>
      {children}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        options={dialogState.options}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <ToastContainer toasts={toasts} onClose={dismissToast} />
    </NotificationContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useConfirm must be used within a NotificationProvider');
  }
  return context.confirm;
};

export const useAlert = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useAlert must be used within a NotificationProvider');
  }
  return context.alert;
};

export const useToast = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    // Return singleton wrapper if hook called outside context
    return toast;
  }
  return {
    success: (message: string, options?: ToastOptions) => context.showToast(message, 'success', options),
    error: (message: string, options?: ToastOptions) => context.showToast(message, 'error', options),
    warning: (message: string, options?: ToastOptions) => context.showToast(message, 'warning', options),
    info: (message: string, options?: ToastOptions) => context.showToast(message, 'info', options),
    loading: (message: string, options?: ToastOptions) => context.showToast(message, 'loading', { duration: 0, ...options }),
    dismiss: context.dismissToast,
    promise: toast.promise,
  };
};
