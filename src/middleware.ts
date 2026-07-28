import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { auth } from "@/lib/auth";

// La logique de protection des routes est dans auth.ts → callbacks.authorized,
// qui s'exécute AVANT ce middleware next-intl (auth() n'appelle le callback
// wrappé que si authorized() renvoie true — voir auth.ts pour le détail du
// strip de préfixe de locale et des redirections locale-aware).
const handleI18nRouting = createMiddleware(routing);

export default auth((req) => {
  const res = handleI18nRouting(req);
  // DEBUG TEMPORAIRE — à retirer une fois la boucle de redirection FR diagnostiquée.
  console.log("[mw-debug]", {
    url: req.nextUrl.href,
    pathname: req.nextUrl.pathname,
    host: req.headers.get("host"),
    xfHost: req.headers.get("x-forwarded-host"),
    xfProto: req.headers.get("x-forwarded-proto"),
    acceptLanguage: req.headers.get("accept-language"),
    cookieLocale: req.cookies.get("NEXT_LOCALE")?.value,
    resStatus: res.status,
    resLocation: res.headers.get("location"),
    resRewrite: res.headers.get("x-middleware-rewrite"),
  });
  return res;
});

// Exclut TOUT /api (pas seulement /api/auth) : sinon next-intl tenterait de
// préfixer/rediriger les appels fetch("/api/...") du client. Exclut aussi tout
// chemin avec une extension de fichier (ex: /clubs/hbcn.png) — sans ça, un
// asset statique placé sous un préfixe protégé (public/clubs/*.png vs
// PROTECTED_PREFIXES "/clubs" dans auth.ts) se fait rediriger au lieu d'être
// servi, pour tout visiteur non connecté.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
