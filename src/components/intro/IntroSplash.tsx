"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";

const STORAGE_KEY = "sf-intro-seen";

interface IntroClub {
  id: string;
  shortName: string;
  name: string;
  logoUrl: string | null;
}

interface IntroSplashProps {
  clubs: IntroClub[];
}

// Splash : les 16 logos de la saison entrent en éventail depuis les bords,
// convergent en couronne, tournent en cercle (carrousel), se regroupent au
// centre, défilent en bandeau horizontal, restent alignés un temps, puis
// s'effacent pour révéler le wordmark. Logos toujours droits (jamais de
// rotation individuelle — seule la formation se déplace). Joué une seule fois
// (localStorage) — voir la classe sf-intro-seen posée sur <html> avant
// hydratation (layout.tsx) + règle CSS (globals.css) qui évite tout flash pour
// un visiteur qui l'a déjà vue.
export function IntroSplash({ clubs }: IntroSplashProps) {
  // false = "pas encore vue" par défaut côté serveur ET au tout premier rendu
  // client (même valeur des deux côtés = pas de mismatch d'hydratation) ; passe
  // à true via l'effet ci-dessous si localStorage confirme que si. Pour un
  // visiteur récurrent, l'overlay est de toute façon masqué visuellement dès la
  // 1ère peinture par la classe posée en synchrone (script inline, layout.tsx).
  const [seen, setSeen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const usableClubs = clubs.filter((club) => club.logoUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const logosRef = useRef<HTMLDivElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (usableClubs.length === 0 || localStorage.getItem(STORAGE_KEY) === "1") {
        setSeen(true);
      }
    } catch {
      setSeen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Stockage indisponible (navigation privée stricte, quota) : l'intro
      // rejouera à la prochaine visite, dégradation acceptable pour un effet
      // purement décoratif.
    }
    document.documentElement.classList.add("sf-intro-seen");
    setDismissed(true);
  }

  useEffect(() => {
    if (seen || dismissed) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      finish();
      return undefined;
    }

    const container = containerRef.current;
    const logoEls = logosRef.current ? Array.from(logosRef.current.children) : [];
    if (!container || logoEls.length === 0) {
      finish();
      return undefined;
    }

    const { width, height } = container.getBoundingClientRect();
    const size = Math.min(width, height);
    // Cercle un peu plus grand/espacé en mobile (< 640px, seuil sm: du site —
    // ARCHITECTURE.md §8, mobile-first) : sur un petit écran le conteneur
    // (70vmin) est plus petit dans l'absolu, un même ratio y rend les logos
    // plus serrés qu'en desktop.
    const isMobile = window.innerWidth < 640;
    const startRadius = size * (isMobile ? 0.6 : 0.55);
    const ringRadius = size * (isMobile ? 0.48 : 0.32);
    const count = logoEls.length;
    const angleFor = (i: number) => (i / count) * Math.PI * 2 - Math.PI / 2;

    // Taille "au repos" (avant tout transform) — sert à calibrer l'échelle du
    // bandeau final pour que les 16 logos tiennent sans se chevaucher, y
    // compris sur petit écran (offsetWidth ignore les transforms GSAP déjà
    // posés, contrairement à getBoundingClientRect).
    const baseLogoSize = (logoEls[0] as HTMLElement).offsetWidth || 48;
    const bandWidth = Math.min(window.innerWidth * 0.92, baseLogoSize * count * 1.4);
    const spacing = count > 1 ? bandWidth / (count - 1) : 0;
    const bandScale = Math.min(1, (spacing * 0.85) / baseLogoSize);
    const slotXFor = (i: number) => (i - (count - 1) / 2) * spacing;

    const ctx = gsap.context(() => {
      logoEls.forEach((el, i) => {
        const angle = angleFor(i) + (Math.random() - 0.5) * 0.3;
        gsap.set(el, {
          x: Math.cos(angle) * startRadius,
          y: Math.sin(angle) * startRadius,
          scale: 0.3,
          opacity: 0,
        });
      });
      gsap.set(wordmarkRef.current, { opacity: 0, scale: 0.75 });

      const tl = gsap.timeline({ onComplete: finish });

      // 1. Entrée en éventail, un logo après l'autre (ordre séquentiel).
      tl.to(logoEls, {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        stagger: { each: 0.08, from: "start" },
        ease: "back.out(1.7)",
      })
        // 2. Convergence : chaque logo rejoint sa place sur une couronne
        //    resserrée autour du centre.
        .to(
          logoEls,
          {
            x: (i: number) => Math.cos(angleFor(i)) * ringRadius,
            y: (i: number) => Math.sin(angleFor(i)) * ringRadius,
            duration: 0.9,
            ease: "power3.inOut",
            stagger: { each: 0.02, from: "random" },
          },
          "-=0.15"
        )
        // 3. La couronne tourne sur elle-même comme un carrousel (formation en
        //    rotation, chaque logo reste droit — seule sa position bouge).
        .to(
          { angle: 0 },
          {
            angle: Math.PI * 2 * 0.75,
            duration: 3.2,
            ease: "sine.inOut",
            onUpdate: function () {
              const a = this.targets()[0].angle as number;
              logoEls.forEach((el, i) => {
                gsap.set(el, {
                  x: Math.cos(angleFor(i) + a) * ringRadius,
                  y: Math.sin(angleFor(i) + a) * ringRadius,
                });
              });
            },
          }
        )
        // 4. Regroupement au centre.
        .to(logoEls, {
          x: 0,
          y: 0,
          duration: 0.55,
          ease: "power2.inOut",
          stagger: { each: 0.02, from: "random" },
        })
        // 5. Défilé en bandeau : les logos se déploient en ligne horizontale.
        .to(logoEls, {
          x: (i: number) => slotXFor(i),
          y: 0,
          scale: bandScale,
          duration: 0.5,
          ease: "power2.out",
          stagger: { each: 0.035, from: "start" },
        })
        // 6. Restent alignés un temps.
        .to({}, { duration: 0.6 })
        // 7. Fondu vers le wordmark.
        .to(wordmarkRef.current, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" })
        .to(logoEls, { opacity: 0, scale: bandScale * 0.6, duration: 0.5, ease: "power2.in" }, "<")
        // 8. Petit temps de pose sur le wordmark avant le fade out (Framer Motion).
        .to({}, { duration: 0.6 });
    }, container);

    return () => ctx.revert();
  }, [seen, dismissed, usableClubs.length]);

  if (seen) return null;

  return (
    <AnimatePresence onExitComplete={() => setSeen(true)}>
      {!dismissed && (
        <motion.div
          id="sf-intro-splash"
          role="presentation"
          className="fixed inset-0 z-[999] flex items-center justify-center overflow-hidden bg-bg"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <button
            type="button"
            onClick={finish}
            className="absolute bottom-6 right-6 rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-muted transition-colors hover:text-text sm:bottom-8 sm:right-8"
          >
            Passer l&rsquo;intro
          </button>

          <div ref={containerRef} className="relative h-[70vmin] w-[70vmin]">
            <div ref={logosRef} className="absolute inset-0" aria-hidden="true">
              {usableClubs.map((club) => (
                <div
                  key={club.id}
                  className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 opacity-0 sm:h-16 sm:w-16"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- transform/opacity pilotés directement par GSAP sur l'élément, incompatible avec le wrapper de next/image */}
                  <img src={club.logoUrl ?? undefined} alt="" className="h-full w-full object-contain" />
                </div>
              ))}
            </div>

            <div
              ref={wordmarkRef}
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center opacity-0"
            >
              <p className="font-display text-3xl uppercase tracking-wide text-text sm:text-4xl">
                Starligue <span className="text-accent">Fantasy</span>
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
