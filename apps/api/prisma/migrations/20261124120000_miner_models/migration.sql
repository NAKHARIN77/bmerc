-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "miner_model_id" UUID;

-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "model_ids" UUID[] DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "miner_models" (
    "id" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashboards" INTEGER NOT NULL DEFAULT 3,
    "chip_model" TEXT,
    "chips_per_board" INTEGER,
    "hashrate_th" DECIMAL(10,2),
    "notes" TEXT,
    "source_url" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "miner_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "miner_models_name_key" ON "miner_models"("name");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_miner_model_id_fkey" FOREIGN KEY ("miner_model_id") REFERENCES "miner_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Platform reference data: no company_id and no RLS. Every signed-in user may read it; only the
-- platform owner changes it, through the API (@PlatformOnly), like plans.
ALTER TABLE "miner_models" ADD CONSTRAINT "miner_models_hashboards_check" CHECK ("hashboards" BETWEEN 1 AND 12);
ALTER TABLE "miner_models" ADD CONSTRAINT "miner_models_chips_check" CHECK ("chips_per_board" IS NULL OR "chips_per_board" > 0);

-- Starting list (2026-11-24), all unverified until the platform owner checks them. Figures come from repair
-- references (mostly D-Central); left empty where sources disagree or publish nothing.
INSERT INTO "miner_models" ("id", "brand", "name", "hashboards", "chip_model", "chips_per_board", "hashrate_th", "notes", "source_url", "updated_at") VALUES
  (gen_random_uuid(), 'Bitmain', 'Antminer S19', 3, 'BM1398', 76, 95, '38 voltage domains of 2 chips.', 'https://d-central.tech/antminer-s19/', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer S19 Pro', 3, 'BM1398', 114, 110, '38 voltage domains of 3 chips. One source lists 4 hashboards; most say 3.', 'https://d-central.tech/hardware-guides/antminer-s19-pro-specs/', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer S19j Pro', 3, 'BM1362', 126, NULL, '42 groups of 3 chips. One source lists 4 hashboards; most say 3.', 'https://d-central.tech/manuals/antminer-s19j-pro-maintenance-repair-guide/', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer S19 XP', 3, 'BM1366', 110, 140, '11 voltage domains of 10 chips. One source lists 4 hashboards.', 'https://d-central.tech/manuals/antminer-s19-xp-maintenance-repair-guide/', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer T19', 3, 'BM1398', NULL, NULL, 'Chips per board not published; check the board label or the firmware chip count.', 'https://d-central.tech/antminer-s19/', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer S21', 3, 'BM1368', 108, NULL, '12 voltage domains of 9 chips. One source says 132 per board.', 'https://hashrateindex.com/blog/content/files/2024/02/S21_Review-2.pdf', now()),
  (gen_random_uuid(), 'Bitmain', 'Antminer T21', 3, 'BM1368', 108, NULL, '12 domains per hashboard, 324 chips in total.', 'https://braiins.com/blog/antminer-t21-technical-deep-dive', now()),
  (gen_random_uuid(), 'MicroBT', 'Whatsminer M30S', 3, NULL, NULL, NULL, 'MicroBT does not publish the chip or count; about 105 per board is a reverse-engineered estimate.', 'https://d-central.tech/whatsminer-m-series/', now()),
  (gen_random_uuid(), 'MicroBT', 'Whatsminer M30S+', 3, NULL, NULL, NULL, 'Chip count per board not published by MicroBT.', 'https://d-central.tech/whatsminer-m-series/', now()),
  (gen_random_uuid(), 'MicroBT', 'Whatsminer M50', 3, NULL, NULL, NULL, 'Chip count per board not published by MicroBT.', 'https://d-central.tech/whatsminer-m-series/', now());

-- Link existing devices whose model name matches the list exactly.
UPDATE "devices" d SET "miner_model_id" = m."id" FROM "miner_models" m WHERE lower(trim(d."model")) = lower(m."name");

-- Existing chip parts fit the models that use that chip (e.g. "Hash chip BM1398" -> S19, S19 Pro, T19).
UPDATE "parts" p SET "model_ids" = sub.ids FROM (
  SELECT p2."id", array_agg(m."id") AS ids FROM "parts" p2 JOIN "miner_models" m
    ON m."chip_model" IS NOT NULL AND p2."name" ~* ('\m' || m."chip_model" || '\M')
  GROUP BY p2."id"
) sub WHERE p."id" = sub."id";
