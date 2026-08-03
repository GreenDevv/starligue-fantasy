"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { ClubLogo } from "@/components/ui/ClubLogo";

// Petit island client pour le hover Framer Motion sur la grille des 16 logos de
// la home (page.tsx, Server Component) — whileHover/whileTap nécessitent un
// Client Component, d'où l'extraction plutôt qu'un <motion.div> inline là-bas.
export function ClubLogoLink({ club }: { club: { id: string; shortName: string; name: string; logoUrl: string | null } }) {
  return (
    <motion.div
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="shrink-0"
    >
      <Link href={`/clubs/${club.id}`} className="block">
        <ClubLogo club={club} size="lg" sizeClassName="w-8 h-8 sm:w-12 sm:h-12" title={club.name} />
      </Link>
    </motion.div>
  );
}
