// Rédaction des actus générées après le scoring d'une journée (équipe type +
// meilleures perfs). Fonctions PURES (aucun Prisma) : elles reçoivent des données
// déjà résolues et rendent { title, excerpt, content } — testable, et l'appelant
// (generate-weekly-news.ts) reste un simple orchestrateur d'I/O.
import type { Position } from "@/lib/squad/validation";

const POSITION_LABEL: Record<Position, string> = {
  GK: "dans les buts",
  LW: "à l'aile gauche",
  LB: "à l'arrière gauche",
  CB: "au poste de demi-centre",
  RB: "à l'arrière droit",
  RW: "à l'aile droite",
  PV: "au pivot",
};

export interface TeamOfWeekCopyInput {
  gameweekNumber: number;
  entries: {
    position: Position;
    firstName: string;
    lastName: string;
    clubShortName: string;
    points: number;
  }[];
}

export interface PerformancesCopyInput {
  gameweekNumber: number;
  entries: {
    firstName: string;
    lastName: string;
    clubShortName: string;
    points: number;
    lnhRating: number | null;
  }[];
}

export interface GeneratedCopy {
  title: string;
  excerpt: string;
  content: string;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Compte les clubs représentés et renvoie ceux qui en placent au moins deux. */
function clubBreakdown(shortNames: string[]): { total: number; multi: [string, number][] } {
  const count = new Map<string, number>();
  for (const sn of shortNames) count.set(sn, (count.get(sn) ?? 0) + 1);
  const multi = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  return { total: count.size, multi };
}

export function teamOfWeekCopy(input: TeamOfWeekCopyInput): GeneratedCopy {
  const { gameweekNumber, entries } = input;
  const title = `L'équipe type de la journée ${gameweekNumber}`;

  const ranked = [...entries].sort((a, b) => b.points - a.points);
  const top = ranked[0];
  const { total, multi } = clubBreakdown(entries.map((e) => e.clubShortName));

  const excerpt = top
    ? `${fullName(top)} (${top.clubShortName}) tire l'équipe type de la journée ${gameweekNumber} avec ${fmt(top.points)} points.`
    : `L'équipe type de la journée ${gameweekNumber}.`;

  const lines: string[] = [];
  lines.push(
    `Voici l'équipe type de la journée ${gameweekNumber}, les sept joueurs qui ont rapporté le plus de points fantasy à leur poste.`,
  );
  if (top) {
    lines.push(
      `${fullName(top)} sort du lot ${POSITION_LABEL[top.position]} : ${fmt(top.points)} points pour le joueur de ${top.clubShortName}, meilleur total de la formation.`,
    );
  }
  if (multi.length > 0) {
    const parts = multi.map(([sn, n]) => `${sn} (${n} joueurs)`);
    const singleDuo = multi.length === 1 && multi[0]?.[1] === 2;
    lines.push(
      `${parts.join(", ")} ${singleDuo ? "place" : "placent"} plusieurs éléments dans le onze ; ${total} clubs au total sont représentés.`,
    );
  } else {
    lines.push(`${total} clubs différents sont représentés dans ce onze.`);
  }
  lines.push(
    "Le détail poste par poste : " +
      [...entries]
        .sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position))
        .map((e) => `${fullName(e)} (${e.clubShortName}, ${fmt(e.points)} pts)`)
        .join(", ") +
      ".",
  );

  return { title, excerpt, content: lines.join("\n\n") };
}

const POSITION_ORDER: Position[] = ["GK", "LW", "LB", "CB", "RB", "RW", "PV"];

export function performancesCopy(input: PerformancesCopyInput): GeneratedCopy {
  const { gameweekNumber, entries } = input;
  const title = `Les meilleures performances de la journée ${gameweekNumber}`;
  const top = entries[0];

  const excerpt = top
    ? `${fullName(top)} (${top.clubShortName}) signe la meilleure performance de la journée ${gameweekNumber} avec ${fmt(top.points)} points fantasy.`
    : `Les meilleures performances de la journée ${gameweekNumber}.`;

  const lines: string[] = [];
  if (top) {
    lines.push(
      `${fullName(top)} a réalisé la meilleure performance de la journée ${gameweekNumber} : ${fmt(top.points)} points fantasy` +
        (top.lnhRating !== null ? `, sur une note LNH de ${fmt(top.lnhRating)}` : "") +
        `, sous les couleurs de ${top.clubShortName}.`,
    );
  }
  if (entries.length > 1) {
    const rest = entries
      .slice(1)
      .map(
        (e, i) =>
          `${i + 2}. ${fullName(e)} (${e.clubShortName}) — ${fmt(e.points)} pts` +
          (e.lnhRating !== null ? ` (note ${fmt(e.lnhRating)})` : ""),
      );
    lines.push(`Le reste du top ${entries.length} :\n${rest.join("\n")}`);
  }
  lines.push(
    "Ces totaux supposent le joueur titulaire et non capitaine — le barème exact dépend de l'alignement réel de chaque manager.",
  );

  return { title, excerpt, content: lines.join("\n\n") };
}
