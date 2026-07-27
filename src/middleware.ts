// Next-Auth v5 : exporter auth directement comme middleware.
// La logique de protection des routes est dans auth.ts → callbacks.authorized.
export { auth as middleware } from "@/lib/auth";

// Exclut aussi tout chemin avec une extension de fichier (ex: /clubs/hbcn.png) —
// sans ça, un asset statique placé sous un préfixe protégé (public/clubs/*.png
// vs PROTECTED_PREFIXES "/clubs" dans auth.ts) se fait rediriger vers /login au
// lieu d'être servi, pour tout visiteur non connecté.
export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
