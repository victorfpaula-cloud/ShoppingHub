import type { InputHTMLAttributes } from "react";

export function CampoDeTexto({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-semibold text-neutral-400">{label}</label>
      <input
        {...props}
        className="mt-1.5 h-[42px] w-full rounded-[10px] border border-white/14 bg-ink-850 px-3.5 text-[13.5px] font-medium text-neutral-100 outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20"
      />
    </div>
  );
}
