# Manifold AI Learning — Video Resources

Static site built with Astro and deployed to GitHub Pages (project site).

## Local development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages (GitHub Actions)

- **Enable Pages**: GitHub repo → **Settings** → **Pages** → **Source** = **GitHub Actions**
- **Workflow**: `.github/workflows/deploy.yml` deploys on every push to `main`
- **Verify URL**: `https://manifoldailearning.github.io/nachiketh-murthy-resources/`

## Ingest workflow (YouTube + `inbox/next/`)

First time only (for PDF export):

```bash
npx playwright install
```

After publishing a YouTube video:

```bash
npm run ingest -- --youtube "<youtube_url>"
```

You must only touch `inbox/next/`:

- Replace `inbox/next/slides.html` (required)
- Replace `inbox/next/description.txt` (required)
- Optionally update `inbox/next/tags.txt` (comma-separated)

The script will:

- Extract `youtubeId` and title via YouTube oEmbed
- Generate a unique slug and pick the resource folder name
- Copy files into `public/resources/<slug>/`
- Convert `slides.html` → `slides.pdf`
- Add a new entry at the top of `videos.json` with the correct structure

**Do NOT** edit `videos.json` manually.  
**Do NOT** move files into `public/resources` yourself.

