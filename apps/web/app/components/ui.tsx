"use client";

import { forwardRef } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string }
>(function Input({ label, id, ...props }, ref) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <input
        ref={ref}
        id={id}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none transition focus:border-neutral-400 disabled:opacity-50"
        {...props}
      />
    </label>
  );
});

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-neutral-100 text-neutral-900 hover:bg-white"
      : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900";
  return (
    <button className={`${base} ${styles}`} {...props}>
      {children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300"
    >
      {message}
    </p>
  );
}
