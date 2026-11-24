-- Miner model numbers checked on 2026-11-24 against hash board repair guides (ZeusBTC, and Bitmain's own
-- repair guides hosted by D-Central) and, for the T21, Bitmain's spec page. Two sources agreeing = checked.
-- Whatsminer: MicroBT publishes no chip counts and the sources disagree, so those stay unchecked.

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1398', "chips_per_board" = 76, "hashrate_th" = 95, "verified" = true, "updated_at" = now(),
  "notes" = '38 voltage domains of 2 chips, about 0.36 V each. Same board layout as the T19.',
  "source_url" = 'https://ar.zeusbtc.com/manuals/Antminer-S19-Hash-Board-Repair-Guide.asp'
  WHERE "name" = 'Antminer S19';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1398', "chips_per_board" = 114, "hashrate_th" = 110, "verified" = true, "updated_at" = now(),
  "notes" = '38 voltage domains of 3 chips, 342 chips in total. A 104-105 TH/s bin also exists.',
  "source_url" = 'https://www.zeusbtc.com/manuals/Antminer-S19-Pro-Hash-Board-Repair-Guide.asp'
  WHERE "name" = 'Antminer S19 Pro';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1362', "chips_per_board" = 126, "hashrate_th" = 104, "verified" = true, "updated_at" = now(),
  "notes" = '42 domains of 3 chips at 0.32 V. Sold as 92, 96, 100 and 104 TH/s. A noPIC board version needs different repair steps.',
  "source_url" = 'https://zeusbtc.com/manuals/3530-antminer-s19j-pro-hash-board-repair-guide'
  WHERE "name" = 'Antminer S19j Pro';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1366', "chips_per_board" = 110, "hashrate_th" = 140, "verified" = true, "updated_at" = now(),
  "notes" = 'Air-cooled: 11 domains of 10 chips. The S19 XP Hydro board is different (204 chips per board).',
  "source_url" = 'https://www.zeusbtc.com/manuals/4675-antminer-s19-xp-hash-board-repair-guide'
  WHERE "name" = 'Antminer S19 XP';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1398', "chips_per_board" = 76, "hashrate_th" = 84, "verified" = true, "updated_at" = now(),
  "notes" = '38 groups of 2 chips, same board layout as the S19. An 88 TH/s version also exists.',
  "source_url" = 'https://zeusbtc.com/manuals/3606-antminer-t19-hash-board-repair-guide'
  WHERE "name" = 'Antminer T19';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1368', "chips_per_board" = 108, "hashrate_th" = 200, "verified" = true, "updated_at" = now(),
  "notes" = '12 voltage domains of 9 chips, 324 chips in total. Same hash board as the T21.',
  "source_url" = 'https://www.zeusbtc.com/manuals/5042-antminer-s21-t21-hash-board-repair-guide'
  WHERE "name" = 'Antminer S21';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = 'BM1368', "chips_per_board" = 108, "hashrate_th" = 190, "verified" = true, "updated_at" = now(),
  "notes" = '12 domains of 9 chips, 324 in total. 190 TH/s at 3610 W in normal mode (Bitmain).',
  "source_url" = 'https://support.bitmain.com/hc/en-us/articles/24967960325785-T21-Specifications'
  WHERE "name" = 'Antminer T21';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = NULL, "chips_per_board" = NULL, "hashrate_th" = 88, "verified" = false, "updated_at" = now(),
  "notes" = 'Samsung 8 nm chips. Chips per board not published by MicroBT; sources say 148 or 105. Rated 86-88 TH/s. Check the firmware chip count on a real unit.',
  "source_url" = 'https://www.asicminervalue.com/miners/microbt/whatsminer-m30s'
  WHERE "name" = 'Whatsminer M30S';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = NULL, "chips_per_board" = NULL, "hashrate_th" = 100, "verified" = false, "updated_at" = now(),
  "notes" = 'About 100 TH/s (one source). Chip and count per board not published by MicroBT.',
  "source_url" = 'https://d-central.tech/whatsminer-m30s-maintenance-repair-guide/'
  WHERE "name" = 'Whatsminer M30S+';

UPDATE "miner_models" SET "hashboards" = 3, "chip_model" = NULL, "chips_per_board" = NULL, "hashrate_th" = 114, "verified" = false, "updated_at" = now(),
  "notes" = '5 nm, about 114 TH/s at 3306 W (one source). Chip and count per board not published by MicroBT.',
  "source_url" = 'https://d-central.tech/product/microbt-whatsminer-m50/'
  WHERE "name" = 'Whatsminer M50';
