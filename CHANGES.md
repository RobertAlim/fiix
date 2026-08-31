# Update — 2026-08-31

Printers → QR Code popover: a Copy button that copies the QR code itself
as an image.

## What changed

Everything is contained in the one existing file:

- `components/PrinterQrCodeButton.tsx` (modified) — the QR Code icon in
  the Printers grid's Actions column, and the popover it opens, are
  unchanged in behavior. Added:
  - A **Copy** button at the bottom of the popover.
  - Clicking it copies the generated QR code **as a PNG image** to the
    system clipboard — not the Serial No. text, not the QR's encoded
    payload as text. Pasting into an email, a chat, a Word doc, or an
    image editor drops in the actual picture.
  - A success toast — **"QR Code copied"** — confirms it, plus the
    button's own icon/label briefly switches to a checkmark and "Copied".
  - The generated image itself is now a fixed **1024×1024px** PNG
    (previously generated smaller, since it only had to fill a 224px
    preview). It's still displayed at the same 224×224px in the popover,
    but the underlying resolution is now high enough that the copied
    image stays clear and sharp if pasted somewhere much larger, printed,
    or shared on to someone else — not just adequate for the popover
    preview.

## Handling browsers that can't copy images

Not every browser/device exposes the image-clipboard API (older Safari
versions, some in-app/WebView browsers). Detected up front with a
feature check (`navigator.clipboard.write` and `window.ClipboardItem`
both need to exist) before attempting anything:

- If unsupported: a clear warning toast explains it and suggests the
  manual alternative (right-click/long-press the image → "Copy Image")
  instead of silently doing nothing, throwing an unhandled error, or
  quietly falling back to copying text as if that satisfied the request.
- If the copy attempt itself fails for some other reason (e.g. the
  browser blocks it, or the clipboard write is rejected): an error toast
  says so and suggests retrying or the same manual right-click fallback,
  instead of leaving the user guessing whether it worked.

One Safari-specific detail worth calling out: the click handler calls
`navigator.clipboard.write()` **synchronously** (not after an `await`),
passing it a `Promise<Blob>` rather than an already-resolved one. Safari
revokes the "user activation" a click carries the instant the handler
yields to the event loop via `await`, and a clipboard write attempted
after that point is silently rejected — passing a promise as the
`ClipboardItem`'s value (which the spec supports, and every browser that
implements `ClipboardItem` at all accepts) keeps the actual write call
inside the synchronous part of the click handler while the image
fetch/blob conversion still happens underneath it asynchronously.

## What did NOT change

- The QR Code button's placement, the popover's open/close behavior, and
  the QR code's content (still just the Serial No.) are all unchanged.
- No other page or component was touched — this is the same single
  file from the previous Printers QR Code update.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no errors.
- `npx next lint` — no new warnings; only the same pre-existing warnings
  as before this change (scan-qrcode `<img>`, a few `exhaustive-deps`
  hooks in CameraCapture/Maintenance/Schedule, `alt-text` in
  MaintainReport).

## Files in this delta

```
components/PrinterQrCodeButton.tsx     (modified)
```

Copy this file into your project at the exact same relative path — no
other files are touched.
