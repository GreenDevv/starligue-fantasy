# Reel « bilan après N journées » (Starligue + fantasy)

**Généré automatiquement après chaque journée** (décision utilisateur 2026-09-29), une fois
les corrections LNH passées : `.github/workflows/reel-bilan.yml` (mardi 09:30 UTC, après
`cron-lnh-corrections.yml` de 07:00 qui confirme la journée ; rattrapage mercredi 06:00)
lance `generate.mjs --auto`, commit le mp4 dans `public/social/` et ouvre une issue
GitHub avec le lien. Rien n'est posté sur Instagram automatiquement.

Reel (~99 s), rythmé (`PACE = 0.85`, entrées sèches, écrans « flash » avec impact),
qui fait parler les données cumulées J1→JN en deux actes :

**Acte 1 — le terrain (vraie Starligue)**
1. Intro « N journées. Le bilan. »
2. Les chiffres : matchs, buts, buts/match, nuls, matchs gagnés d'un but, % victoires à domicile
3. Les matchs hors normes : plus gros écart, match le plus prolifique
4. Le classement officiel après JN (couleurs par groupe de points, invaincus / 0 victoire)
5. Les leaders LNH de la saison : un écran par stat (buteurs, dernières passes, gardiens), top 5
6. L'équipe type cumulée (+ nombre d'équipes qui ont eu chaque joueur)
7. Top 10 des joueurs qui rapportent le plus (points fantasy cumulés)
8. Les 5 meilleures perfs fantasy en un match (+ combien de managers l'avaient)
+ écrans « flash » intercalés : secondes entre deux buts, % penaltys, record de buts en un
match, exclusions/cartons, tireur d'élite, capitaines qui ont coûté des points, pire score
d'une équipe en une journée (anonyme)

**Acte 2 — les managers**
8. Le jeu en chiffres : managers, équipes alignées, points distribués, moyenne, % de bons pronos
9. Les chouchous qui coûtent : les plus sélectionnés… et leur total
10. Le pari gagnant : peu sélectionné, gros total + le plus rentable (pts par M€)
11. Le capitaine préféré : nb de brassards + points rapportés par le ×2
12. Le record d'un manager sur une journée (vs moyenne, son capitaine)
13. L'équipe parfaite : 14 joueurs figés depuis J1, règles du jeu (budget, max par club,
    valeurs de départ), meilleur capitaine chaque journée — vs n°1 et manager moyen
14. Le top 5 du classement général (évolution depuis J1) + la plus grosse remontée
15. Le podium
16. Les clubs de cœur (carte) + la meilleure ligue
17. « Et toi ? » : points d'accueil offerts à un nouveau manager (même calcul que
    recomputeCatchupCredits), rang de départ, deadline de la journée suivante, appel
18. Plan final

**Rien n'est publié.** La sortie est un mp4 à relire.

## Lancer

Une fois la journée JN **clôturée** (settle-gameweek passé, `scripts/audit-gameweeks.ts` propre) :

```bash
pnpm tsx scripts/social/season-recap/generate.mjs <N>            # manuel
pnpm tsx scripts/social/season-recap/generate.mjs --auto          # dernière journée confirmée, si pas déjà publiée
```

Sortie : `scratch/season-recap/j<N>/reel-bilan-j1-j<N>.mp4` (+ `data.json`, `reel/`).

| flag | effet |
|---|---|
| `--out <dir>` | dossier de sortie |
| `--no-render` | construit `reel/reel.html` sans rendre la vidéo |
| `--probe 2000 7300 …` | rend seulement ces instants (ms) — **arguments séparés** (en zsh, `$T` ne se découpe pas) |

Rendu en flux direct vers ffmpeg (`render-reel.mjs … stream`, aucune image sur disque,
mêmes PNG et réglages x264 que full+encode) : ~17 min en local.

## Données

`pull-base.ts` (copie versionnée et typée de `../fantasy-recap/pull.ts` : équipe type cumulée, top perfs, classement général, ligues,
clubs de cœur) puis `pull-extra.ts` qui ajoute `data.recap` (chiffres Starligue, leaders
LNH, faits managers, équipe parfaite, record, remontée, pronos). Points joueurs =
`computeGameweekPlayerPoints` (même moteur que le scoring), notes définitives uniquement.

L'équipe parfaite : programmation dynamique poste par poste (titulaire + remplaçant),
état = coût au demi-million, on garde les meilleures combinaisons **par niveau de coût**
(une recherche en faisceau sur le seul score ne garde que les plus chères et finit hors
budget). Prix = dernière valorisation pré-saison (`PlayerValueHistory` sans journée) — les
joueurs créés en cours de saison n'en ont pas et sont exclus (ils n'étaient pas achetables).

## Publier (manuel, après validation)

```bash
cp scratch/season-recap/j4/reel-bilan-j1-j4.mp4 public/social/
git add public/social/reel-bilan-j1-j4.mp4 && git commit -m "Reel bilan J1-J4 en ligne" && git push
```

## Fichiers

| script | rôle |
|---|---|
| `generate.mjs` | orchestrateur |
| `pull-base.ts` | données fantasy cumulées (copie versionnée de fantasy-recap/pull.ts) |
| `pull-extra.ts` | faits du bilan → `data.recap` |
| `latest-confirmed.ts` | dernière journée notée + confirmée (mode `--auto`) |
| `gen-reel.mjs` | `data.json` → `reel/reel.html` (animation générique `.a` / `.cnt` / `.bar`) |
| `render-reel.mjs` | `reel.html` → images → mp4 (copie de `../fantasy-recap/render-reel.mjs`) |
