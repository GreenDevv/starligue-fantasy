// Next-Auth v5 : exporter auth directement comme middleware.
// La logique de protection des routes est dans auth.ts → callbacks.authorized.
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
