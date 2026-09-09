# Reel Instagram « programme de la journée »

Reel vertical 1080×1920, muet (~33 s), à poster la veille du 1er match d'une
journée de Daikin StarLigue. Repris à l'identique de `scripts/social/j1-reel/`,
généralisé pour être rejoué à chaque journée.

Structure : intro (16 écussons en spirale → grille 4×4 → « JOURNÉE N ») → 8 fiches
match face-à-face (ordre chrono) → plan final (les 8 rencontres empilées).

Sur chaque fiche match, sous l'écusson : **classement Starligue** (gros chiffre) +
pour chaque journée déjà jouée l'**écusson de l'adversaire** (même taille) avec la
**pastille V/N/D** du résultat en overlay. Bandeau infos en bas : filet teal +
date/heure (heure en ambre) + salle · ville + diffuseur en pastille blanche.

## Fichiers

| fichier | rôle |
|---|---|
| `data.ts` | lit la **prod Railway**, écrit `data.json` : programme (FIXTURES figé), joueur mis en avant, classement + forme |
| `photos.mjs` | télécharge les 16 photos détourées lnh.fr → `<REEL_DIR>/players/<SHORT>.png` |
| `gen.mjs` | construit `reel.html` (self-contained, Google Fonts Barlow Condensed + Inter) |
| `render.mjs` | Playwright 30 fps → `<REEL_DIR>/frames/` (reprend les frames existantes) |
| `build.mjs` | ffmpeg `-crf 19 -preset slow` → `<REEL_DIR>/reel-j<N>.mp4` |
| `logo-overrides/` | écussons en encre sombre recolorés (USAM/Nîmes, Cesson) pour le fond sombre |
| `data.json` | dernière sortie committée (pour référence) |

## Rejouer pour une nouvelle journée (J3, J4, …)

1. **Mettre à jour `FIXTURES` dans `data.ts`** depuis le calendrier lnh.fr
   (`daikin-starligue/calendrier`, AJAX `sportsCalendars`, univers `d1-26623`) :
   pour chaque match `{ home, away, day: "Vendredi 11 sept.", time: "20h00", tv }`.
   Diffuseur = préfixe du logo TV : `hd1`/`hd3`/`4max`/… → `"beIN Sport"`,
   `htvsmall` → `"Handball TV"`. Les salles ne sont **pas** dans le calendrier —
   la table `CLUB` de `data.ts` (couleur + salle + ville, validée) suffit tant
   qu'aucun club ne déménage. Un garde-fou compare les affiches à la base et
   refuse un `FIXTURES` périmé.
2. Récupérer l'URL prod : `railway variables --service Postgres --kv | grep DATABASE_PUBLIC_URL`
   (ajouter `?sslmode=require` pour Prisma).
3. Lancer, avec `REEL_GW` = numéro de la journée :

```bash
export REEL_DIR=/abs/scratch/reelj3/        # dossier de travail (hors repo)
export DATABASE_URL="<DATABASE_PUBLIC_URL>?sslmode=require"

REEL_GW=3 pnpm tsx scripts/social/j2-reel/data.ts   # -> $REEL_DIR/data.json
node scripts/social/j2-reel/photos.mjs              # -> $REEL_DIR/players/
node scripts/social/j2-reel/gen.mjs                 # -> $REEL_DIR/reel.html
node scripts/social/j2-reel/render.mjs full         # -> $REEL_DIR/frames/  (~30 min)
node scripts/social/j2-reel/build.mjs               # -> $REEL_DIR/reel-j2.mp4
```

Le joueur mis en avant, le classement et la forme (résultats Starligue
uniquement — `Match` FINISHED, les amicaux sont dans `FriendlyMatch`) sont
calculés **automatiquement** depuis la prod ; rien à saisir.

4. Vérifier quelques frames, puis déployer : copier le `.mp4` en
   `public/social/reel-j<N>.mp4` sur `main`, commit + push (Railway redéploie) →
   `https://starliguefantasy.fr/social/reel-j<N>.mp4`. Committer aussi le
   `data.ts` + `data.json` mis à jour sur la branche `reel-programme-journee-j2`.
   Mail à `martinvanegue@icloud.com` (thread « Reel programme »), **non publié IG**
   (l'utilisateur poste lui-même, musique ajoutée dans l'app).

## Pièges

- **Render ≈ 30 min** (990 frames). Ne pas lancer 2 rendus Playwright en
  parallèle (OOM chromium). `render.mjs` reprend les frames existantes.
- `render.mjs` importe Playwright depuis le cache npx
  (`~/.npm/_npx/7f4967a1621aa3dc/...`) — adapter si absent.
- `dayShort` (dans `gen.mjs`) abrège JEU/VEN/SAM/DIM + « sept. » → « SEPT ». Pour
  octobre etc., étendre la règle.
- Affichage carte plafonné aux **4 dernières journées** de forme (place).
