# 小組遊戲 (Church Small Group Games)

Single-page browser games for TV / group play:

1. 舒爾特方格 (Schulte grid)
2. 跟拍手勢 (follow the beat, hand postures 0–5)
3. Stroop 顏色字 (with recall breaks every 5 questions)

No build step, no server. Just open `index.html` in a browser.

## Publish with GitHub Pages

1. Create a new repository on GitHub (e.g. `church-games`).
2. In this folder:
   ```bash
   git init
   git add .
   git commit -m "Add church small group games"
   git branch -M main
   git remote add origin https://github.com/<your-username>/church-games.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
4. After a minute the site is live at `https://<your-username>.github.io/church-games/`.

## Notes
- Background music and click sounds are generated in the browser (Web Audio), so no audio files are needed.
- Fonts load from Google Fonts, so the device needs internet access the first time.
