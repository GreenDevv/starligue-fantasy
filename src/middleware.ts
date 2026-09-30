import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { BASE_PATH, isLbeProxyPath, PUBLIC_ORIGIN_HEADER } from "@/lib/base-path";

// La logique de protection des routes est dans auth.ts → callbacks.authorized,
// qui s'exécute AVANT ce middleware next-intl (auth() n'appelle le callback
// wrappé que si authorized() renvoie true — voir auth.ts pour le détail du
// strip de préfixe de locale et des redirections locale-aware).
const handleI18nRouting = createMiddleware(routing);

const authAndI18n = auth((req) => handleI18nRouting(req)) as unknown as NextMiddleware;

// Jeu servi à la racine (Starligue) : /lbe/* appartient au jeu LBE et est
// transféré par le rewrite de next.config.mjs (ARCHITECTURE.md §35.7). Sans cette
// sortie anticipée, next-intl redirigerait /lbe vers /fr/lbe avant le rewrite.
// On lui transmet aussi l'adresse publique (x-forwarded-host/proto) : le proxy du
// rewrite présente sinon l'adresse interne du service LBE, dont Auth.js se
// servirait pour ses URL de redirection (connexion, déconnexion).
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (!BASE_PATH && isLbeProxyPath(req.nextUrl.pathname)) {
    const headers = new Headers(req.headers);
    // Hôte réel de la requête, jamais un x-forwarded-host fourni par le client
    // (il orienterait les redirections d'Auth.js). Protocole : celui posé par
    // l'hébergeur (Railway termine le HTTPS en amont), à défaut celui de l'URL.
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "");
    headers.set("x-forwarded-host", req.nextUrl.host);
    headers.set("x-forwarded-proto", proto);
    // Écrasé par le proxy d'entrée Railway du service LBE : on double avec un
    // en-tête propre à l'appli (voir forwardedOrigin, src/lib/base-path.ts).
    headers.set(PUBLIC_ORIGIN_HEADER, `${proto}://${req.nextUrl.host}`);
    return NextResponse.next({ request: { headers } });
  }
  return authAndI18n(req, event);
}

// Exclut TOUT /api (pas seulement /api/auth) : sinon next-intl tenterait de
// préfixer/rediriger les appels fetch("/api/...") du client. Exclut aussi tout
// chemin avec une extension de fichier (ex: /market/icon.png) — sans ça, un
// asset statique placé sous un préfixe protégé (public/market/*.png vs
// PROTECTED_PREFIXES "/market" dans auth.ts) se fait rediriger au lieu d'être
// servi, pour tout visiteur non connecté.
// "/" explicite : avec un basePath (jeu LBE), Next préfixe le motif en
// "/lbe/(…)", qui ne couvre plus "/lbe" tout court → 404 au lieu de la redirection
// vers /lbe/fr (constaté en local). Sans effet pour le jeu Starligue.
export const config = {
  matcher: ["/", "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
