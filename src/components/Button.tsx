import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.scss";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "dark" | "ghost";
  size?: "normal" | "small";
}

export function Button({ children, variant = "primary", size = "normal", className = "", ...props }: ButtonProps) {
  const classes = [styles.button, styles[variant], size === "small" ? styles.small : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
