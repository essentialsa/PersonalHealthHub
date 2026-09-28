import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-[#9a9ab0] selection:bg-[#6c5ce7] selection:text-white border-[rgba(32,27,72,0.09)] flex h-10 w-full min-w-0 rounded-[10px] border px-3 py-1 text-base bg-[#f8f7fc] transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-[#6c5ce7] focus-visible:bg-white focus-visible:ring-[rgba(108,92,231,0.16)] focus-visible:ring-[4px]",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
