import { CSSProperties, ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}

const FadeIn = ({ children, delay = 0, className = "", style, ...props }: FadeInProps) => (
  <div
    className={`motion-fade-up ${className}`.trim()}
    style={{ animationDelay: `${delay}s`, ...style }}
    {...props}
  >
    {children}
  </div>
);

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

const Stagger = ({ children, className = "" }: StaggerProps) => (
  <div className={`motion-stagger ${className}`.trim()}>{children}</div>
);

const StaggerItem = ({ children, className = "" }: StaggerProps) => (
  <div className={`motion-stagger-child ${className}`.trim()}>{children}</div>
);

export { FadeIn, Stagger, StaggerItem };