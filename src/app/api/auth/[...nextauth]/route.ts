export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { BASE_PATH, forwardedOrigin } from "@/lib/base-path";

// Jeu LBE (servi sous /lbe via le rewrite du jeu Starligue, ARCHITECTURE.md
// §35.7) : la requête arrive avec l'adresse interne du service, dont Auth.js
// ferait l'origine de ses URL de redirection (connexion, déconnexion). On lui
// rend l'adresse publique transmise par le jeu Starligue — même effet
// qu'AUTH_URL, mais limité à cette route : AUTH_URL casserait le middleware
// (next-auth y reconstruit la requête en perdant le basePath). Jeu Starligue :
// requête transmise telle quelle.
function withPublicOrigin(req: NextRequest): NextRequest {
  if (!BASE_PATH) return req;
  const origin = forwardedOrigin(req.headers);
  if (!origin || origin === req.nextUrl.origin) return req;
  return new NextRequest(req.nextUrl.href.replace(req.nextUrl.origin, origin), req);
}

export const GET = (req: NextRequest) => handlers.GET(withPublicOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(withPublicOrigin(req));
