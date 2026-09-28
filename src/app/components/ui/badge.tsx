import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-[rgba(108,92,231,0.35)] focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#efedfd] text-[#5a49d6] [a&]:hover:bg-[#e3defc]",
        secondary:
          "border-transparent bg-[#f1f1f7] text-[#5a5a75] [a&]:hover:bg-[#e8e8f2]",
        destructive:
          "border-transparent bg-[#fdeef2] text-[#e5315c] [a&]:hover:bg-[#fbdce5] focus-visible:ring-destructive/20",
        outline:
          "text-[#5a5a75] border-[rgba(32,27,72,0.12)] [a&]:hover:bg-[#f4f2fe] [a&]:hover:text-[#5a49d6]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
