import { Link } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  label?: string;
  variant?: "flat" | "3d";
};

export default function BrandLogo({
  className = "",
  imageClassName = "",
  label = "ECR home",
  variant = "3d",
}: BrandLogoProps) {
  const { theme } = useTheme();
  const flatLogo = theme === "light" ? "/ecr-logo-flat.png" : "/ecr-logo.jpg";

  return (
    <Link
      href="/"
      aria-label={label}
      className={`inline-flex shrink-0 items-center rounded-2xl transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${className}`}
    >
      <img
        src={variant === "3d" ? "/ecr-logo-3d.png" : flatLogo}
        alt="Emergency Community Response"
        className={`h-auto w-full object-contain ${imageClassName}`}
      />
    </Link>
  );
}
