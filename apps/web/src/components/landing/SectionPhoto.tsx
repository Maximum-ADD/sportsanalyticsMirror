import { cn } from "@/lib/utils";

const WIDTHS = [640, 960, 1440, 1920] as const;
const NARROW_WIDTHS = [480, 720, 1080, 1440] as const;
const NARROW_MEDIA = "(max-width: 1023px)";
const JPEG_FALLBACK_WIDTH = 1440;

interface SectionPhotoProps {
  name: string;
  narrowName?: string;
  priority?: boolean;
  /** Intrinsic size of the rendered box, e.g. "100vw" or "(min-width: 1024px) 640px". */
  sizes?: string;
  className?: string;
}

export function SectionPhoto({ name, narrowName, priority = false, sizes = "100vw", className }: SectionPhotoProps) {
  return (
    <picture>
      {narrowName ? (
        <source
          type="image/webp"
          media={NARROW_MEDIA}
          sizes={sizes}
          srcSet={NARROW_WIDTHS.map((w) => `/photos/${narrowName}-${w}.webp ${w}w`).join(", ")}
        />
      ) : null}
      <source
        type="image/webp"
        sizes={sizes}
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
