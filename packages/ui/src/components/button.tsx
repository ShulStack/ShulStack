import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({ variant = "primary", className, type, ...rest }: ButtonProps) {
  const classes = ["button", variant === "primary" ? "" : variant, className]
    .filter(Boolean)
    .join(" ");
  return <button className={classes} type={type ?? "button"} {...rest} />;
}
