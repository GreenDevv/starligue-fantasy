"use client";

import { motion } from "framer-motion";

const FEATURES: { title: string; description: string; dotClassName: string }[] = [
  {
    title: "Compose ton effectif",
    description:
      "14 joueurs parmi les 16 clubs de Starligue, un budget serré, un poste à la fois — gardien, ailiers, arrières, demi-centre, pivot.",
    dotClassName: "bg-accent shadow-glow-accent",
  },
  {
    title: "Aligne-toi chaque journée",
    description:
      "7 titulaires sur le terrain, 7 remplaçants sur le banc. Deadline avant chaque coup d'envoi, comme en vrai.",
    dotClassName: "bg-accent-secondary shadow-glow-amber",
  },
  {
    title: "Marque sur le réel",
    description:
      "Buts, arrêts, passes décisives : chaque statistique du match compte dans ton score de la journée.",
    dotClassName: "bg-points-pos",
  },
  {
    title: "Défie tes amis",
    description:
      "Crée ta ligue privée, suis le classement en direct, échange des joueurs entre les journées.",
    dotClassName: "bg-points-neg shadow-glow-red",
  },
];

const riseIn = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

export function ComingSoon() {
  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-bg">
      {/* Arcs de terrain de handball en fond, très discrets */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <circle cx="500" cy="1180" r="620" fill="none" stroke="#2DD4BF" strokeOpacity="0.10" strokeWidth="2" />
        <circle cx="500" cy="1180" r="460" fill="none" stroke="#2DD4BF" strokeOpacity="0.14" strokeWidth="2" />
        <line x1="140" y1="1180" x2="140" y2="560" stroke="#2DD4BF" strokeOpacity="0.08" strokeWidth="2" />
        <line x1="860" y1="1180" x2="860" y2="560" stroke="#2DD4BF" strokeOpacity="0.08" strokeWidth="2" />
      </svg>
      <div className="scanlines pointer-events-none absolute inset-0" aria-hidden="true" />

      <main className="relative z-10 flex w-full flex-1 flex-col items-center px-6 pb-20 pt-12 sm:pt-20">
        <section className="flex w-full max-w-3xl flex-col items-center text-center">
          <motion.span
            initial="hidden"
            animate="visible"
            variants={riseIn}
            transition={{ duration: 0.5 }}
            className="pixel-corners-sm border border-accent-secondary/35 bg-accent-secondary/10 px-4 py-1 font-arcade text-lg tracking-[0.18em] text-accent-secondary"
          >
            SAISON 2026 / 2027
          </motion.span>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={riseIn}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-6xl leading-[0.92] sm:text-8xl"
            style={{
              textShadow:
                "0.045em 0.05em 0 #F59E0B, -0.03em -0.02em 0 #1F7C72, 0 0 0.6em rgba(45,212,191,0.35)",
            }}
          >
            Starligue
            <br />
            <span
              className="text-accent"
              style={{
                textShadow:
                  "0.045em 0.05em 0 #A86A09, -0.03em -0.02em 0 rgba(45,212,191,0.6), 0 0 0.7em rgba(45,212,191,0.55)",
              }}
            >
              Fantasy
            </span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={riseIn}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-6 max-w-xl text-balance text-lg text-text-muted sm:text-xl"
          >
            Le jeu de <strong className="font-semibold text-text">fantasy handball</strong> basé sur les vrais
            joueurs de la Daikin StarLigue. Compose ton équipe et marque des points sur leurs vraies performances,
            journée après journée.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={riseIn}
            transition={{ duration: 0.6, delay: 0.34 }}
            className="pixel-corners-sm shadow-glow-accent mt-9 border border-border bg-surface px-5 py-2 font-arcade text-xl text-accent"
          >
            <span>BIENTÔT</span>
            <span className="ml-1 inline-block h-[1.1em] w-[0.55em] translate-y-[0.12em] animate-pulse bg-accent align-middle" />
          </motion.div>
        </section>

        <section
          aria-label="Aperçu du jeu"
          className="mt-16 grid w-full max-w-5xl grid-cols-1 gap-4 sm:mt-24 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial="hidden"
              animate="visible"
              variants={riseIn}
              transition={{ duration: 0.5, delay: 0.46 + index * 0.08 }}
              className="pixel-corners relative flex flex-col gap-2 border border-border bg-surface p-6 text-left"
            >
              <span className={`absolute right-5 top-5 h-2.5 w-2.5 rounded-full ${feature.dotClassName}`} />
              <h2 className="text-xl">{feature.title}</h2>
              <p className="text-sm leading-relaxed text-text-muted">{feature.description}</p>
            </motion.article>
          ))}
        </section>
      </main>

      <footer className="relative z-10 flex w-full flex-col items-center gap-1 border-t border-border px-6 py-8 text-center text-xs text-text-muted">
        <span className="font-arcade text-base tracking-wide text-text-muted">starliguefantasy.fr</span>
        <span>
          Projet perso, sans rapport officiel avec la LNH ou la Daikin StarLigue — ouverture avant le coup
          d&apos;envoi de la saison.
        </span>
      </footer>
    </div>
  );
}
