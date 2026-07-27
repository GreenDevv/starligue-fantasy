import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { compare } from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const PROTECTED_PREFIXES = ["/team", "/market", "/leagues", "/leaderboard", "/matches", "/players", "/clubs", "/dashboard", "/account"];
const ADMIN_PREFIXES = ["/admin"];

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
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
      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
      const isAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

      if ((isProtected || isAdmin) && !session) return false;

      // @ts-expect-error — role étendu
      if (isAdmin && session?.user?.role !== "ADMIN") {
        return Response.redirect(new URL("/", request.url));
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
