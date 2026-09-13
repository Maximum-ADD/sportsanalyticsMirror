import { cn } from "@/lib/utils";

export function FlameBallLogo({ className }: { className?: string }) {
  return (
    <picture>
      <source type="image/webp" srcSet="/brand/flame-ball.webp" />
      <img
        src="/brand/flame-ball.png"

        alt=""
        width={200}
        height={241}
        decoding="async"
        className={cn("w-auto object-contain", className)}
      />
    </picture>
  );
}
