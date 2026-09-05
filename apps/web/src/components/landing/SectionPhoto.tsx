import { cn } from "@/lib/utils";

const WIDTHS = [640, 960, 1440, 1920] as const;
const NARROW_WIDTHS = [480, 720, 1080, 1440] as const;
const NARROW_MEDIA = "(max-width: 1023px)";
const JPEG_FALLBACK_WIDTH = 1440;

interface SectionPhotoProps {
  name: string;
  narrowName?: string;
  priority?: boolean;
  className?: string;
}

export function SectionPhoto({ name, narrowName, priority = false, className }: SectionPhotoProps) {
  return (
    <picture>
      {narrowName ? (
        <source
          type="image/webp"
          media={NARROW_MEDIA}
          sizes="100vw"
          srcSet={NARROW_WIDTHS.map((w) => `/photos/${narrowName}-${w}.webp ${w}w`).join(", ")}
        />
      ) : null}
      <source
        type="image/webp"
        sizes="100vw"
        srcSet={WIDTHS.map((width) => `/photos/${name}-${width}.webp ${width}w`).join(", ")}
      />
      <img
        src={`/photos/${name}-${JPEG_FALLBACK_WIDTH}.jpg`}
        alt=""
        width={1920}
        height={1080}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className={cn("absolute inset-0 size-full object-cover object-center", className)}
      />
    </picture>
  );
}
