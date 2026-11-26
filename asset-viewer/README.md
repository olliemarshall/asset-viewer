# Scheme Plan Asset Viewer (prototype)

Open a **vector** signalling scheme plan PDF, find the assets on it from the text labels,
colour-code them, and click any asset to add an owner, notes and links to drawings.

Everything runs in the browser. The PDF is never uploaded. Notes are saved in the
browser (localStorage) and can be exported/imported as JSON.

**Use fictional or permitted drawings only.** Do not load real scheme plans unless you are
allowed to, and don't deploy this publicly with real data in it.

## Colour convention (edit in `lib/extract.js`)

| Colour | Meaning |
|--------|---------|
| Red    | New |
| Black  | Existing |
| Green  | Recovered |
| Blue   | Proposed, not confirmed |

Label patterns (signals `SA###`, points `PT###`, track circuits `TC###`, location cases `LC##`)
are fictional. Change `PATTERNS` in `lib/extract.js` to match your own naming.

## Run locally

```bash
npm install        # also copies the PDF.js worker into /public
npm run dev        # http://localhost:3000
```

## Put it on GitHub, then Vercel

```bash
git init
git add .
git commit -m "Scheme plan asset viewer prototype"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

On vercel.com: **Add New → Project → import the repo → Deploy.** Next.js is detected
automatically. No environment variables needed. Use a new repo and a new Vercel project,
separate from Rail Treasure.

## How it works

1. PDF.js reads the page text and the position of every label.
2. Labels matching `PATTERNS` become assets.
3. PDF.js can't report text colour, so the page is rendered and the pixels under each label
   are classified against the legend colours.
4. Labels outside the drawing area (title block, notes) are ignored.

## Known limits

- First page only. Vector PDFs with a real text layer only. Scans need OCR or a vision model
  (the "Scanned sample" button shows this).
- Colour is read from pixels, so labels that overlap labels of a different colour can be
  misclassified. The status dropdown lets you correct any asset.
- The drawing-area limits (`DRAWING_AREA`) and colours are tuned to the sample plan.
- No accounts, no shared space. Two people can share work by exporting and importing JSON.
  A real shared space needs a backend (e.g. Supabase) and sign-in; not built yet.
- Not tested on real-world plans.

## Extras

`tools/` holds the Python scripts that generated the sample plan and checked extraction
against known answers (`pip install reportlab pdfplumber pypdfium2`).
