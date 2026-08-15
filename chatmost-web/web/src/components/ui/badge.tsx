import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-normal transition-none border rounded-none",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-black",
        secondary:
          "border-secondary bg-secondary text-white",
        destructive:
          "border-destructive bg-destructive/15 text-destructive",
        outline: "text-foreground border-border bg-card/40",
        gold: "border-gold bg-gold/15 text-gold",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };