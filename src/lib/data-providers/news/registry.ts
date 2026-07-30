// Registre des sources d'actus scrapées, itéré par le cron sync-news
// (src/app/api/cron/sync-news/route.ts). lnh.fr couvre déjà toute la Starligue —
// les clubs s'ajoutent un fichier + une ligne ici à la fois (src/lib/data-providers/news/clubs/),
// sans toucher au pipeline. Reconnaissance du 2026-07-23 : 4 clubs tournent sous
// WordPress avec une API REST publique (wordpress.provider.ts, factory générique,
// beaucoup plus fiable qu'un scraping HTML) — les 12 autres restent à faire (voir
// mémoire du projet pour l'état détaillé).
import type { NewsSourceProvider } from "./types";
import { lnhNewsProvider } from "./lnh.provider";
import { istresNewsProvider } from "./clubs/istres.provider";
import { chamberyNewsProvider } from "./clubs/chambery.provider";
import { saintRaphaelNewsProvider } from "./clubs/saint-raphael.provider";
import { selestatNewsProvider } from "./clubs/selestat.provider";
import { dunkerqueNewsProvider } from "./clubs/dunkerque.provider";
import { dijonNewsProvider } from "./clubs/dijon.provider";
import { limogesNewsProvider } from "./clubs/limoges.provider";
import { saranNewsProvider } from "./clubs/saran.provider";
import { tremblayNewsProvider } from "./clubs/tremblay.provider";
import { nimesNewsProvider } from "./clubs/nimes.provider";
import { psgNewsProvider } from "./clubs/psg.provider";
import { nantesNewsProvider } from "./clubs/nantes.provider";

export const NEWS_PROVIDERS: NewsSourceProvider[] = [
  lnhNewsProvider,
  istresNewsProvider,
  chamberyNewsProvider,
  saintRaphaelNewsProvider,
  selestatNewsProvider,
  dunkerqueNewsProvider,
  dijonNewsProvider,
  limogesNewsProvider,
  saranNewsProvider,
  tremblayNewsProvider,
  nimesNewsProvider,
  psgNewsProvider,
  nantesNewsProvider,
];
