// Create imported fleet records in batches (PocketBase's batch API takes up to 200 writes per
// call; 100 leaves room). Each batch is atomic; the dialog reports the count on success.

import { useCallback } from 'react';
import { batchOp, useBatch, type CreateInput, type RecordOf } from '@/data';

const CHUNK = 100;

export function useImportRecords<C extends 'shells' | 'oar_sets' | 'gear_items'>(collection: C) {
  const { mutateAsync } = useBatch({
    errorMessage: 'The import did not finish. Check the list, then import the missing rows.',
  });
  return useCallback(
    async (records: CreateInput<RecordOf<C>>[]) => {
      for (let i = 0; i < records.length; i += CHUNK) {
        await mutateAsync(records.slice(i, i + CHUNK).map((r) => batchOp.create(collection, r)));
      }
    },
    [collection, mutateAsync],
  );
}
