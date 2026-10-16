"use client";

import { useState } from "react";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className="input pr-20" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-1 right-1 rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-canvas"
        aria-pressed={visible}
      >
        {visible ? "Dölj" : "Visa"}
        <span className="sr-only"> lösenord</span>
      </button>
    </div>
  );
}
