import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import { z } from "zod";
import { routing } from "@/i18n/routing";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const PROTECTED_PREFIXES = ["/team", "/market", "/leagues", "/leaderboard", "/matches", "/players", "/clubs", "/dashboard", "/account"];
const ADMIN_PREFIXES = ["/admin"];

// localePrefix "as-needed" : le FR (défaut) n'a pas de préfixe (/team), les
// autres langues en ont un (/en/team). PROTECTED_PREFIXES/ADMIN_PREFIXES sont
// écrits sans préfixe — il faut le retirer avant de comparer, sinon /en/team
// ne matche plus jamais "/team".startsWith et la route se retrouve déprotégée.
function splitLocale(pathname: string): { locale: string; rest: string } {
  const [, maybeLocale, ...restSegs] = pathname.split("/");
  if (maybeLocale && (routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, rest: "/" + restSegs.join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

function withLocale(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Auth.js ne fait confiance au Host de la requête que sur Vercel (détection
  // automatique) ou en dev — sur Railway (et tout hébergeur non-Vercel), sans ce
  // flag chaque requête est vue comme provenant d'un hôte non fiable
  // ("UntrustedHost"), ce qui perturbe la gestion interne des cookies de
  // session/CSRF au point de produire une boucle de redirection sur `/`.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      const { locale, rest } = splitLocale(pathname);
      const isProtected = PROTECTED_PREFIXES.some((p) => rest.startsWith(p));
      const isAdmin = ADMIN_PREFIXES.some((p) => rest.startsWith(p));

      // pages.signIn ci-dessous est une valeur statique (impossible d'y
      // injecter la locale courante) : les redirections métier passent donc
      // par Response.redirect explicite, locale-aware, plutôt que de s'y fier.
      if ((isProtected || isAdmin) && !session) {
        const loginUrl = new URL(withLocale(locale, "/login"), request.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return Response.redirect(loginUrl);
      }

      // @ts-expect-error — role étendu
      if (isAdmin && session?.user?.role !== "ADMIN") {
        return Response.redirect(new URL(withLocale(locale, "/"), request.url));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // @ts-expect-error — role est dans notre User étendu
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // @ts-expect-error — role étendu
        session.user.role = token.role;
      }
      return session;
    },
  },
});
