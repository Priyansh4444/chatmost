import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-xs font-mono font-bold tracking-wider transition-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 border rounded-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-black border-primary font-bold hover:bg-primary/90 active:translate-y-0.5",
        destructive:
          "bg-destructive text-white border-destructive font-bold hover:bg-destructive/90 active:translate-y-0.5",
        outline:
          "border-border bg-card/60 text-foreground hover:bg-muted/40 hover:border-foreground active:translate-y-0.5",
        secondary:
          "bg-secondary text-white border-secondary font-bold hover:bg-secondary/90 active:translate-y-0.5",
        gold:
          "bg-gold text-black border-gold font-bold hover:bg-gold/90 active:translate-y-0.5",
        ghost: "border-transparent hover:bg-muted/40 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline border-transparent",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 px-3 text-[11px]",
        lg: "h-11 px-8 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
