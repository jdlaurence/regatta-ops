// The app's data API. Feature code imports from '@/data' only; never from the store files.

export type {
  BatchOp,
  ChangeEvent,
  CreateInput,
  DataStore,
  ListQuery,
  Patch,
  RecordOf,
  SortKey,
  UpdateOptions,
} from './store';
export { StoreError, batchOp, newId } from './store';
export {
  useList,
  useRecord,
  useCreate,
  useUpdate,
  useDelete,
  useBatch,
  useStoreMutation,
  useCurrentUser,
  useCan,
  useAuthActions,
  useDataMode,
  useResetDemo,
  listQueryOptions,
  recordQueryOptions,
  type StoreMutationOptions,
  type UpdateVars,
  type UseListOptions,
} from './hooks';
export { change, type OptimisticChange } from './optimistic';
export { queryKeys } from './query-keys';
export {
  useRegattaWorkingSet,
  prefetchRegattaWorkingSet,
  type RegattaWorkingSet,
  type WorkingSetResult,
} from './working-set';
export {
  useFindings,
  buildConflictInput,
  countBySeverity,
  findingsForEntry,
  findingsForTeam,
  worstSeverity,
  type FindingsResult,
  type SeverityCounts,
} from './findings';
export { useRealtimeEvents, RealtimeProvider } from './realtime';
export {
  useGuardedUpdate,
  type GuardedUpdateOptions,
  type GuardedUpdateVars,
} from './guarded-update';
export {
  CONFLICT_TOAST,
  GUARDED_COLLECTIONS,
  isGuarded,
  type GuardedCollection,
} from './concurrency';
export { useChangeToasts } from './change-toasts';
export {
  ANNOUNCED_COLLECTIONS,
  ChangeCoalescer,
  describeChanges,
  remoteChange,
  type ChangeNotice,
  type RemoteChange,
} from './change-coalescer';
export { capitalize, initialsOf, shortUserName, targetCollection } from './collab-format';
export { useNow } from './use-now';
export { StoreProvider } from './context';
export { can, ROLE_LABELS, type Action } from './permissions';
