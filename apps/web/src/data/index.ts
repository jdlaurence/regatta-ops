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
export { StoreProvider } from './context';
export { can, ROLE_LABELS, type Action } from './permissions';
export {
  useShare,
  useShareApi,
  useTickShareItem,
  ShareApiProvider,
  shareApiFor,
  httpShareApi,
  memoryShareApi,
  projectShare,
  applyTick,
  cleanShareName,
  isShareGone,
  isTransientShareError,
  setShareItem,
  updateShareData,
  shareQueryKey,
  sharePath,
  SHARE_LINK_GONE,
  type ShareApi,
  type ShareData,
  type ShareEntry,
  type ShareLinkInfo,
  type ShareLoadItem,
  type ShareRegatta,
  type ShareScheduleItem,
  type ShareSeat,
  type ShareSource,
  type ShareTeam,
  type ShareTickInput,
  type ShareTickVars,
  type ShareView,
  type UseTickShareItemOptions,
} from './share';
export { findMentions, parseMentions, type MentionMatch, type MentionUser } from './mentions';
