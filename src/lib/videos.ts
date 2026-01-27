import rawVideos from '../../videos.json';

export type VideoResourceType = 'pdf' | 'html' | 'code' | 'slides' | 'link' | 'text';

export type VideoResource = {
  label: string;
  type: VideoResourceType;
  url: string;
};

export type Video = {
  slug: string;
  title: string;
  youtubeId: string;
  date: string; // YYYY-MM-DD
  description: string;
  descriptionFile?: string;
  primaryCta?: {
    label: string;
    url: string;
  };
  tags: string[];
  resources: VideoResource[];
};

function isResource(value: unknown): value is VideoResource {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<VideoResource>;
  const allowed: VideoResourceType[] = ['pdf', 'html', 'code', 'slides', 'link', 'text'];
  return (
    typeof r.label === 'string' &&
    typeof r.url === 'string' &&
    typeof r.type === 'string' &&
    allowed.includes(r.type as VideoResourceType)
  );
}

function isVideo(value: unknown): value is Video {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Video>;
  return (
    typeof v.slug === 'string' &&
    typeof v.title === 'string' &&
    typeof v.youtubeId === 'string' &&
    typeof v.date === 'string' &&
    typeof v.description === 'string' &&
    (v.descriptionFile === undefined || typeof v.descriptionFile === 'string') &&
    (v.primaryCta === undefined ||
      (typeof v.primaryCta === 'object' &&
        v.primaryCta !== null &&
        typeof (v.primaryCta as any).label === 'string' &&
        typeof (v.primaryCta as any).url === 'string')) &&
    Array.isArray(v.tags) &&
    v.tags.every((t) => typeof t === 'string') &&
    Array.isArray(v.resources) &&
    v.resources.every(isResource)
  );
}

export function getAllVideos(): Video[] {
  const list = Array.isArray(rawVideos) ? (rawVideos as unknown[]) : [];
  const videos = list.filter(isVideo);
  return videos.slice().sort((a, b) => b.date.localeCompare(a.date));
}

export function getVideoBySlug(slug: string): Video | undefined {
  return getAllVideos().find((v) => v.slug === slug);
}

export function truncate(text: string, max = 160): string {
  const s = text.trim().replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}


