export type VideoOrientation = "landscape" | "portrait" | "square" | "unknown";

export type VideoOrientationFilter = "all" | "landscape" | "portrait";

export interface VideoDimensions {
  width?: number;
  height?: number;
}

export function videoOrientation(video: VideoDimensions): VideoOrientation {
  const width = video.width ?? 0;
  const height = video.height ?? 0;

  if (width <= 0 || height <= 0) {
    return "unknown";
  }
  if (width > height) {
    return "landscape";
  }
  if (width < height) {
    return "portrait";
  }

  return "square";
}

export function videoOrientationLabel(video: VideoDimensions): string {
  switch (videoOrientation(video)) {
    case "landscape":
      return "横版";
    case "portrait":
      return "竖版";
    case "square":
      return "方形";
    case "unknown":
      return "未知";
  }
}

export function matchesOrientationFilter(
  video: VideoDimensions,
  filter: VideoOrientationFilter
): boolean {
  if (filter === "all") {
    return true;
  }

  return videoOrientation(video) === filter;
}
