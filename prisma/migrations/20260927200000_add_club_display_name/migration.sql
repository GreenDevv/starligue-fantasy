-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "displayName" TEXT;

-- Noms affichés (validés le 2026-09-27), par clé technique shortName. Idempotent.
UPDATE "Club" SET "displayName" = v.name
FROM (VALUES
  ('CAEN', 'Caen'),
  ('CCMHB', 'Chartres'),
  ('CRMHB', 'Cesson'),
  ('CSMBH', 'Chambéry'),
  ('FENIX', 'Toulouse'),
  ('HBCN', 'Nantes'),
  ('LIMOGES', 'Limoges'),
  ('MHB', 'Montpellier'),
  ('PAUC', 'Aix'),
  ('PSG', 'Paris SG'),
  ('SAHB', 'Sélestat'),
  ('SARAN', 'Saran'),
  ('SRVH', 'St-Raph'),
  ('TREMBLAY', 'Tremblay'),
  ('USAM', 'Nîmes'),
  ('USDK', 'Dunkerque')
) AS v(short, name)
WHERE "Club"."shortName" = v.short;
