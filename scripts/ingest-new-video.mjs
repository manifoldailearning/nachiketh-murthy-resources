import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const VIDEOS_PATH = path.join(ROOT, 'videos.json');
const PUBLIC_RESOURCES = path.join(ROOT, 'public', 'resources');

const SITE_FULL_BASE_URL = 'https://manifoldailearning.github.io/nachiketh-murthy-resources';

function usage(exitCode = 1) {
  console.error('Usage: npm run ingest -- --youtube "<url>" [--cta-label "<text>" --cta-url "<url>"]');
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let youtube = null;
  let ctaLabel = null;
  let ctaUrl = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--youtube') {
      youtube = args[++i];
    } else if (a === '--cta-label') {
      ctaLabel = args[++i];
    } else if (a === '--cta-url') {
      ctaUrl = args[++i];
    }
  }

  if (!youtube) {
    usage(1);
  }

  if ((ctaLabel && !ctaUrl) || (!ctaLabel && ctaUrl)) {
    console.error('Error: --cta-label and --cta-url must be provided together.');
    usage(1);
  }

  const folder = path.join(ROOT, 'inbox', 'next');
  return { youtube, folder, ctaLabel, ctaUrl };
}

function extractYoutubeId(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return null;

  // Allow passing raw IDs too.
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
    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

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

async function fetchYoutubeTitle(youtubeId, originalUrl) {
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

function summarizeDescription(fullText) {
  const cleaned = fullText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const max = 450;
  const target = cleaned.slice(0, max);
  if (cleaned.length <= max) return cleaned;
  const lastSpace = target.lastIndexOf(' ');
  const cut = lastSpace > 300 ? target.slice(0, lastSpace) : target;
  return cut.trim();
}

async function ensureFileExists(filePath, label) {
  try {
    await fs.access(filePath);
  } catch {
    console.error(`Error: Required ${label} not found at: ${filePath}`);
    process.exit(1);
  }
}

async function convertHtmlToPdf(htmlPath, pdfPath) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const fileUrl = `file://${htmlPath}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const { youtube, folder, ctaLabel, ctaUrl } = parseArgs(process.argv);

  const youtubeId = extractYoutubeId(youtube);
  if (!youtubeId) {
    console.error('Error: Could not extract a YouTube video ID from:', youtube);
    usage(1);
  }

  const slidesSrc = path.join(folder, 'slides.html');
  const descriptionMdSrc = path.join(folder, 'description.md');
  const descriptionTxtSrc = path.join(folder, 'description.txt');
  const tagsSrc = path.join(folder, 'tags.txt');

  await ensureFileExists(slidesSrc, 'slides.html');

  let descriptionSrc = descriptionMdSrc;
  try {
    await fs.access(descriptionMdSrc);
  } catch {
    descriptionSrc = descriptionTxtSrc;
    await ensureFileExists(descriptionSrc, 'description.txt');
  }

  const [videos, fullDescriptionText, tagsText] = await Promise.all([
    readVideosJson(),
    fs.readFile(descriptionSrc, 'utf8'),
    fs.readFile(tagsSrc, 'utf8').catch(() => ''),
  ]);

  if (videos.some((v) => v && typeof v === 'object' && v.youtubeId === youtubeId)) {
    console.error(`Error: A video with youtubeId "${youtubeId}" already exists in videos.json.`);
    process.exit(1);
  }

  const titleFromWeb = await fetchYoutubeTitle(youtubeId, youtube);
  const title = titleFromWeb ?? `New Video (${youtubeId})`;

  const existingSlugs = new Set(
    videos
      .filter((v) => v && typeof v === 'object' && typeof v.slug === 'string')
      .map((v) => v.slug),
  );
  const baseSlug = slugify(titleFromWeb ?? `video-${youtubeId}`);
  const slug = uniqueSlug(baseSlug || `video-${youtubeId}`, existingSlugs);

  const today = new Date();
  const date = today.toISOString().slice(0, 10);

  const shortDescription = summarizeDescription(fullDescriptionText);

  const tags =
    tagsText
      ?.split(/[,\n]/)
      .map((t) => slugify(t))
      .filter(Boolean) ?? [];

  // Prepare resources folder
  const destDir = path.join(PUBLIC_RESOURCES, slug);
  await fs.mkdir(destDir, { recursive: true });

  const destSlidesHtml = path.join(destDir, 'slides.html');
  const destSlidesPdf = path.join(destDir, 'slides.pdf');
  const destDescriptionMd = path.join(destDir, 'description.md');
  const destDescriptionTxt = path.join(destDir, 'description.txt');

  await Promise.all([
    fs.copyFile(slidesSrc, destSlidesHtml),
    fs.copyFile(descriptionSrc, destDescriptionMd),
    fs.copyFile(descriptionSrc, destDescriptionTxt),
  ]);

  // Generate PDF from HTML
  await convertHtmlToPdf(destSlidesHtml, destSlidesPdf);

  const entry = {
    title,
    slug,
    youtubeId,
    date,
    description: shortDescription,
    descriptionFile: `/resources/${slug}/description.md`,
    tags,
    resources: [
      { label: 'Slides (HTML)', type: 'html', url: `/resources/${slug}/slides.html` },
      { label: 'Slides (PDF)', type: 'pdf', url: `/resources/${slug}/slides.pdf` },
      { label: 'Description', type: 'text', url: `/resources/${slug}/description.txt` },
    ],
  };

  if (ctaLabel && ctaUrl) {
    entry.primaryCta = {
      label: ctaLabel,
      url: ctaUrl,
    };
  }

  videos.unshift(entry);
  await writeVideosJson(videos);

  const pageUrl = `${SITE_FULL_BASE_URL}/videos/${slug}/`;
  console.log('✅ Ingested video');
  console.log(`- title: ${title}`);
  console.log(`- slug:  ${slug}`);
  console.log(`- date:  ${date}`);
  console.log(`- page:  ${pageUrl}`);
  if (ctaLabel && ctaUrl) {
    console.log(`- CTA:   ${ctaLabel} -> ${ctaUrl}`);
  }
  console.log('');
  console.log('Ingest complete. You may now replace inbox/next contents for the next video.');
}

await main();

