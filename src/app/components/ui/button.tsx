import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[rgba(108,92,231,0.35)] focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-[#7b6cf6] via-[#6c5ce7] to-[#2f7ff6] text-white shadow-[0_10px_24px_-8px_rgba(99,102,241,0.55),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-[1.06]",
        destructive:
          "bg-gradient-to-r from-[#f43f5e] to-[#dc2626] text-white shadow-[0_10px_24px_-8px_rgba(244,63,94,0.55),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-[1.06] focus-visible:ring-destructive/20",
        outline:
          "border border-[rgba(32,27,72,0.12)] bg-white text-[#5a5a75] hover:bg-[#f4f2fe] hover:text-[#5a49d6] hover:border-[#cfc2f8]",
        secondary:
          "bg-[#efedfd] text-[#5a49d6] hover:bg-[#e3defc]",
        ghost:
          "text-[#5a5a75] hover:bg-[#f1f1f7] hover:text-[#20203a]",
        link: "text-[#6c5ce7] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-full has-[>svg]:px-3",
        sm: "h-8 rounded-full gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5",
        lg: "h-10 rounded-full px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

type ButtonRef = React.ElementRef<"button">;

const Button = React.forwardRef<ButtonRef, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
