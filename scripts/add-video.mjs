import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const VIDEOS_PATH = path.join(ROOT, 'videos.json');
const RESOURCES_DIR = path.join(ROOT, 'public', 'resources');

function usage(exitCode = 1) {
  console.error('Usage: npm run add-video -- <youtube-url>');
  console.error('Example: npm run add-video -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  process.exit(exitCode);
}

function extractYoutubeId(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return null;

  // Allow passing raw IDs too (common case).
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    // /watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // /embed/<id> or /shorts/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    const maybe = parts[0] === 'embed' || parts[0] === 'shorts' ? parts[1] : null;
    return maybe && /^[a-zA-Z0-9_-]{11}$/.test(maybe) ? maybe : null;
  }

  return null;
}

function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function tryFetchTitle(youtubeId, originalUrl) {
  // YouTube oEmbed does not require an API key.
  // Works in most environments with outbound HTTPS.
  const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    originalUrl ?? `https://www.youtube.com/watch?v=${youtubeId}`,
  )}`;

  try {
    const res = await fetch(oembedUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && typeof json.title === 'string' && json.title.trim()) return json.title.trim();
    return null;
  } catch {
    return null;
  }
}

async function readVideosJson() {
  const raw = await fs.readFile(VIDEOS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('videos.json must be a JSON array');
  }
  return parsed;
}

async function writeVideosJson(videos) {
  const out = JSON.stringify(videos, null, 2) + '\n';
  await fs.writeFile(VIDEOS_PATH, out, 'utf8');
}

function uniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug || 'new-video';
  if (!existingSlugs.has(slug)) return slug;
  let i = 2;
  while (existingSlugs.has(`${slug}-${i}`)) i++;
  return `${slug}-${i}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) usage(1);

  const youtubeId = extractYoutubeId(arg);
  if (!youtubeId) {
    console.error('Error: Could not extract a YouTube video ID from:', arg);
    usage(1);
  }

  const videos = await readVideosJson();

  if (videos.some((v) => v && typeof v === 'object' && v.youtubeId === youtubeId)) {
    console.error(`Error: A video with youtubeId "${youtubeId}" already exists in videos.json.`);
    process.exit(1);
  }

  const titleFromWeb = await tryFetchTitle(youtubeId, arg);
  const title = titleFromWeb ?? `New Video (${youtubeId})`;

  const existingSlugs = new Set(
    videos
      .filter((v) => v && typeof v === 'object' && typeof v.slug === 'string')
      .map((v) => v.slug),
  );
  const baseSlug = slugify(titleFromWeb ?? `video-${youtubeId}`);
  const slug = uniqueSlug(baseSlug || `video-${youtubeId}`, existingSlugs);

  const today = new Date();
  const date = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const entry = {
    title,
    slug,
    youtubeId,
    date,
    description: '',
    tags: [],
    resources: [
      { label: 'Slides (PDF)', type: 'slides', url: `/resources/${slug}/slides.pdf` },
      { label: 'Notes (HTML)', type: 'html', url: `/resources/${slug}/notes.html` },
    ],
  };

  // Add newest-first (site sorts by date; this also keeps file readable).
  videos.unshift(entry);
  await writeVideosJson(videos);

  const folder = path.join(RESOURCES_DIR, slug);
  await fs.mkdir(folder, { recursive: true });
  // Keep directory tracked even if empty.
  await fs.writeFile(path.join(folder, '.gitkeep'), '', { flag: 'a' });

  // Success output
  console.log('✅ Added video entry');
  console.log(`- youtubeId: ${youtubeId}`);
  console.log(`- slug:      ${slug}`);
  console.log(`- date:      ${date}`);
  console.log(`- videos:    ${path.relative(ROOT, VIDEOS_PATH)}`);
  console.log(`- resources: ${path.relative(ROOT, folder)}/`);
  console.log('');
  console.log('Next: add files under the resources folder and update description/tags if needed.');
}

await main();

