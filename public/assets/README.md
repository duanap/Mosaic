# Lobby artwork

`lobby-entry-sprites.png` is the original transparent 1672×941 PNG supplied by the user as the glossy icon asset sheet. It is preserved without raster edits. The three top-row illustrations are displayed through CSS sprite windows; the supplied arrow illustrations are unused because the interactive arrows use the existing SVG icon.

The asset is served through the explicit static-file allowlist in `server/index.mjs`. The cropping offsets and theme colors live in the `.entry-*` rules in `public/style.css`.
