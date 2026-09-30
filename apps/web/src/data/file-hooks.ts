// Hooks for file fields (PLAN.md §4.7): upload or remove a record's photo, and build its URL.
// `useFileUrl()` returns a function so tables can build a thumbnail URL per row.

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from './context';
import { useStoreMutation, type StoreMutationOptions } from './hooks';
import { applyChange, change } from './optimistic';
import type { FileCollection, FileFieldOf, FileUrlOptions, Patch, RecordOf } from './store';

export interface UploadFileVars<C extends FileCollection> {
  id: string;
  field: FileFieldOf<C>;
  file: Blob;
  /** File name to store; default: the file's own. */
  name?: string;
}

export interface RemoveFileVars<C extends FileCollection> {
  id: string;
  field: FileFieldOf<C>;
}

type FileMutationOptions<TVars, C extends FileCollection> = Pick<
  StoreMutationOptions<TVars, RecordOf<C>>,
  'errorMessage' | 'onSuccess' | 'onError'
>;

/**
 * Upload a photo into a record: `upload.mutate({ id, field: 'photoUrl', file })`. The saved
 * record replaces the cached one as soon as the store answers; nothing is shown before that,
 * so the caller previews the local file while `isPending`.
 */
export function useUploadFile<C extends FileCollection>(
  collection: C,
  options: FileMutationOptions<UploadFileVars<C>, C> = {},
) {
  const qc = useQueryClient();
  return useStoreMutation<UploadFileVars<C>, RecordOf<C>>({
    errorMessage: 'The photo was not saved. Try again.',
    ...options,
    mutationFn: (store, { id, field, file, name }) =>
      store.uploadFile(collection, id, field, file, name),
    invalidate: [collection],
    onSuccess: (record, vars) => {
      applyChange(qc, change.update(collection, record.id, record as Patch<RecordOf<C>>));
      options.onSuccess?.(record, vars);
    },
  });
}

/** Remove a record's photo: `remove.mutate({ id, field: 'photoUrl' })`. Optimistic. */
export function useRemoveFile<C extends FileCollection>(
  collection: C,
  options: FileMutationOptions<RemoveFileVars<C>, C> = {},
) {
  return useStoreMutation<RemoveFileVars<C>, RecordOf<C>>({
    errorMessage: 'The photo was not removed. Try again.',
    ...options,
    mutationFn: (store, { id, field }) => store.removeFile(collection, id, field),
    optimistic: ({ id, field }) => [
      change.update(collection, id, { [field]: null } as Patch<RecordOf<C>>),
    ],
  });
}

/**
 * A function that returns where to load a record's file from, or a thumbnail of it:
 * `fileUrl('shells', shell, 'photoUrl', { thumb: '96x96' })`. Null when there is no file.
 */
export function useFileUrl() {
  const store = useStore();
  return useCallback(
    <C extends FileCollection>(
      collection: C,
      record: RecordOf<C> | null | undefined,
      field: FileFieldOf<C>,
      options?: FileUrlOptions,
    ): string | null => (record ? store.fileUrl(collection, record, field, options) : null),
    [store],
  );
}
