// Schedule pastes for the import tests (PLAN.md §9.5). The reference CSV holds equipment
// names only; the RegattaCentral-style rows are invented.

import referenceCsv from '../../../../../../data/reference/schedule-sample-2025-nw-youth-champs.csv?raw';

export const REFERENCE_CSV: string = referenceCsv;

export const NW_DAYS = ['2025-05-16', '2025-05-17', '2025-05-18'];

export const REGATTACENTRAL = [
  'Event #\tStart Time\tEvent\tClass\tRound',
  "1\t7:30 AM\tWomen's Youth\t8+\tHeat 1",
  "2\t7:36 AM\tWomen's Youth\t8+\tHeat 2",
  "14A\t9:40 AM\tMen's U17\t4+\tFinal A",
  '\t11:30 AM\tLunch break\t\t',
  '31\t1:04 PM\tMixed Masters C\t2x\tFinal',
  "40\tTBD\tMen's Open\tSingle\tTime Trial",
  "41\t9.40\tWomen's Open\tQuint\tSemifinal 1",
].join('\n');
