import { CircleCheck, TriangleAlert, CircleAlert } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

const ICONS = {
  success: <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />,
  warning: <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />,
  destructive: <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />,
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            {ICONS[props.variant] || null}
            <div className="grid flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
} 