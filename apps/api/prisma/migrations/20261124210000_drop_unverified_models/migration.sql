-- The owner dropped the Whatsminer models: MicroBT publishes no chip data, so they could not be checked.
-- Devices keep their model name; only the link to the model list goes. Parts stop listing them.
UPDATE "devices" SET "miner_model_id" = NULL
  WHERE "miner_model_id" IN (SELECT "id" FROM "miner_models" WHERE "verified" = false);

UPDATE "parts" SET "model_ids" = ARRAY(
  SELECT x FROM unnest("model_ids") AS x WHERE x NOT IN (SELECT "id" FROM "miner_models" WHERE "verified" = false)
) WHERE "model_ids" && ARRAY(SELECT "id" FROM "miner_models" WHERE "verified" = false);

DELETE FROM "miner_models" WHERE "verified" = false;
