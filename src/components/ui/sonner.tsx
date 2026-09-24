import { Toaster as SonnerToaster } from "sonner";

// App-wide toast host. Pages call `toast(...)` from "sonner"; without this mounted,
// every success/error/"out of credits" message is silently dropped.
export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: "oklch(14% 0.018 255)",
          border: "1px solid oklch(100% 0 0 / 0.1)",
          color: "oklch(96% 0.005 250)",
          fontFamily: '"Geist", system-ui, sans-serif',
        },
      }}
    />
  );
}
