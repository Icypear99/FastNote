import {useCallback} from 'react';
import type {ReactNode} from 'react';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {useToast} from '@astryxdesign/core/Toast';

interface AppConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  actionLabel: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAction: () => unknown;
}

export function AppConfirmDialog({
  isOpen,
  title,
  description,
  actionLabel,
  cancelLabel = '取消',
  isLoading,
  onOpenChange,
  onAction,
}: AppConfirmDialogProps) {
  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      actionLabel={actionLabel}
      cancelLabel={cancelLabel}
      actionVariant="destructive"
      isActionLoading={isLoading}
      onAction={onAction}
    />
  );
}

export function useAppFeedback() {
  const showToast = useToast();
  const info = useCallback((message: ReactNode, uniqueID?: string) => showToast({
    body: message,
    type: 'info',
    isAutoHide: true,
    autoHideDuration: 3600,
    uniqueID,
  }), [showToast]);
  const success = useCallback((message: ReactNode, uniqueID?: string) => showToast({
    body: message,
    type: 'info',
    isAutoHide: true,
    autoHideDuration: 3200,
    uniqueID,
  }), [showToast]);
  const error = useCallback((message: ReactNode, uniqueID?: string) => showToast({
    body: message,
    type: 'error',
    isAutoHide: false,
    uniqueID,
  }), [showToast]);

  return {info, success, error};
}
