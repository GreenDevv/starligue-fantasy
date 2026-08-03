import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";

// La logique de protection des routes est dans auth.ts → callbacks.authorized,
// qui s'exécute AVANT ce middleware next-intl (auth() n'appelle le callback
// wrappé que si authorized() renvoie true — voir auth.ts pour le détail du
// strip de préfixe de locale et des redirections locale-aware).
const handleI18nRouting = createMiddleware(routing);

export default auth((req) => handleI18nRouting(req));

// Exclut TOUT /api (pas seulement /api/auth) : sinon next-intl tenterait de
// préfixer/rediriger les appels fetch("/api/...") du client. Exclut aussi tout
// chemin avec une extension de fichier (ex: /market/icon.png) — sans ça, un
// asset statique placé sous un préfixe protégé (public/market/*.png vs
// PROTECTED_PREFIXES "/market" dans auth.ts) se fait rediriger au lieu d'être
// servi, pour tout visiteur non connecté.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
