// Export/import Excel (.xlsx) de la valorisation joueurs — ARCHITECTURE.md §3.2
// (donnée externe passant par data-providers, comme CsvProvider).
//
// 4 colonnes : nom, prénom, club (shortName), valeur. Round-trip destiné à être
// envoyé à des consultants externes pour révision de la valorisation, puis
// réimporté — voir src/lib/players/value-import.ts pour le rapprochement.

import ExcelJS from "exceljs";
import { z } from "zod";
import type { CsvParseResult } from "./csv.provider";
import type { PlayerValueRow } from "../players/value-import";

const HEADERS = ["nom", "prenom", "club", "valeur"] as const;

const PlayerValueRowSchema = z.object({
  nom: z.string().min(1),
  prenom: z.string().min(1),
  club: z.string().min(1),
  valeur: z.coerce.number().min(0.5).max(99.9),
});

// Ligne d'export enrichie du statut de valorisation — le statut est purement
// informatif pour le consultant (tri/filtre/couleur), il n'est pas relu au
// réimport (parsePlayerValuesXlsx ignore toute colonne hors des 4 attendues).
export interface PlayerValueExportRow extends PlayerValueRow {
  valuationPending: boolean; // true = "ND", valeur encore approximative
}

const ND_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
const ND_FONT = { color: { argb: "FF92400E" }, bold: true };

export async function buildPlayerValuesXlsx(
  rows: PlayerValueExportRow[],
  sheetTitle = "Valorisation",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = [
    { header: "nom", key: "nom", width: 22 },
    { header: "prenom", key: "prenom", width: 22 },
    { header: "club", key: "club", width: 12 },
    { header: "valeur", key: "valeur", width: 12 },
    { header: "statut", key: "statut", width: 10 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  // Les lignes "ND" remontent en premier — c'est ce sur quoi le consultant doit travailler.
  const sorted = [...rows].sort((a, b) => Number(b.valuationPending) - Number(a.valuationPending));

  for (const r of sorted) {
    const row = sheet.addRow({
      nom: r.nom,
      prenom: r.prenom,
      club: r.club,
      valeur: r.valeur,
      statut: r.valuationPending ? "ND" : "OK",
    });
    if (r.valuationPending) {
      row.eachCell((cell) => {
        cell.fill = ND_FILL;
      });
      row.getCell("statut").font = ND_FONT;
    }
  }

  sheet.getColumn("valeur").numFmt = "0.0";
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "E1" };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function parsePlayerValuesXlsx(
  buffer: ArrayBuffer | Buffer,
): Promise<CsvParseResult<PlayerValueRow>> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as ExcelJS.Buffer);
  } catch {
    return { ok: false, errors: [{ line: 0, message: "Fichier .xlsx invalide ou corrompu" }] };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { ok: false, errors: [{ line: 0, message: "Feuille vide ou sans données" }] };
  }

  // Colonnes repérées par en-tête (insensible à la casse), pas par position —
  // tolère un consultant qui réordonne les colonnes.
  const headerRow = sheet.getRow(1);
  const colByHeader = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const label = String(cell.value ?? "").trim().toLowerCase();
    if (label) colByHeader.set(label, colNumber);
  });

  const missing = HEADERS.filter((h) => !colByHeader.has(h));
  if (missing.length > 0) {
    return {
      ok: false,
      errors: [{ line: 1, message: `Colonnes manquantes : ${missing.join(", ")} (attendu : ${HEADERS.join(", ")})` }],
    };
  }

  const errors: { line: number; message: string }[] = [];
  const rows: PlayerValueRow[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.actualCellCount === 0) continue; // ligne vide

    const obj: Record<string, string> = {};
    for (const h of HEADERS) {
      const cell = row.getCell(colByHeader.get(h)!);
      obj[h] = cell.value == null ? "" : String(cell.value).trim();
    }
    if (Object.values(obj).every((v) => v === "")) continue; // ligne vide

    const parsed = PlayerValueRowSchema.safeParse(obj);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      errors.push({
        line: rowNumber,
        message: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}
