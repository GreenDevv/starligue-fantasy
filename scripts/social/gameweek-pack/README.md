# Pack de contenu Instagram par journée

Génère les **5 visuels** (résultats · classement · top buteurs/passeurs/gardiens) et le
**reel récap fantasy** (~52 s) d'une journée, à partir des vraies données de la prod.

**Rien n'est publié.** La sortie est un dossier de fichiers à relire, plus une page
`preview.html` à publier en Artifact pour validation.

## Quand le lancer

Une fois la journée **clôturée** — le dernier match noté sur lnh.fr et la séquence de
crons prod passée (`sync-ratings` → `snapshot-lineups` → `compute-scores` →
`sync-standings`). Voir la mémoire `gameweek_close_and_matchday_pack`.

## Lancer

```bash
pnpm tsx scripts/social/gameweek-pack/generate.mjs <numéroDeJournée>
```

Exemple : `pnpm tsx scripts/social/gameweek-pack/generate.mjs 8`

Sortie par défaut : `scratch/gameweek-pack/j8/`
- `posts/1-resultats.png … 5-top-gardiens.png`
- `reel-recap-j8.mp4`
- `preview.html`
- `data.json` (données figées), `reel/` (html + frames intermédiaires)

### Options

| flag | effet |
|---|---|
| `--out <dir>` | dossier de sortie |
| `--posts-only` | seulement les 5 visuels (rapide, pas de rendu vidéo) |
| `--reel-only` | seulement le reel |
| `--no-render` | construit `reel/reel.html` sans rendre la vidéo |
| `--probe 1500 20000 40000` | rend seulement ces instants (ms) du reel, pour un aperçu |

Le rendu complet du reel prend ~15–20 min (≈ 1550 frames Playwright + ffmpeg).
Pour itérer sur le design, `--probe`.

## Pré-requis

- **Base prod** : résolue automatiquement via `PROD_DATABASE_URL` / `DATABASE_URL`
  (hors localhost) ou `railway variables --service Postgres`.
- **Routes OG déployées** : `gen-posts.mjs` appelle `starliguefantasy.fr/api/og/*`.
  Redéploie `main` si `/api/og/gameweek-results` renvoie 404.
- **Playwright** : `playwright@1.48.2` (macOS 13). Résolu depuis `node_modules` ou un
  cache `~/.npm/_npx/*` ; sinon `PLAYWRIGHT_DIR`.
- **ffmpeg** dans le `PATH`.

## Publier (manuel, après validation)

```bash
cp scratch/gameweek-pack/j8/reel-recap-j8.mp4 public/social/
git add public/social/reel-recap-j8.mp4 && git commit -m "Reel récap J8 (brouillon)" && git push
```
Puis Instagram : upload manuel des 5 PNG + du mp4 (voir `instagram_publishing`).

## Fichiers

| script | rôle |
|---|---|
| `generate.mjs` | orchestrateur |
| `config.mjs` | chemins, URL prod, résolution Playwright |
| `pull.ts` | dump des données journée → `data.json` |
| `gen-posts.mjs` | récupère les 5 visuels depuis les routes OG prod |
| `gen-reel.mjs` | `data.json` → `reel/reel.html` (+ télécharge photos/écussons) |
| `render-reel.mjs` | `reel.html` → frames → `reel-recap-jN.mp4` |
| `gen-preview.mjs` | assemble `preview.html` |
| `reel/logo-overrides/` | écussons recolorés (USAM, CRMHB) — lisibles sur fond sombre |
