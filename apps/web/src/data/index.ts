// The app's data API. Feature code imports from '@/data' only; never from the store files.

export type {
  BatchOp,
  ChangeEvent,
  CreateInput,
  DataStore,
  FileCollection,
  FileFieldOf,
  FileUrlOptions,
  ListQuery,
  Patch,
  RecordOf,
  SortKey,
  ThumbSize,
  UpdateOptions,
} from './store';
export { StoreError, batchOp, newId } from './store';
export {
  useFileUrl,
  useRemoveFile,
  useUploadFile,
  type RemoveFileVars,
  type UploadFileVars,
} from './file-hooks';
export {
  FILE_FIELDS,
  MEMORY_FILE_MAX_BYTES,
  NOT_A_PHOTO,
  PHOTO_TYPES,
  SERVER_FILE_MAX_BYTES,
  looksLikePhoto,
} from './files';
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
export {
  usePresence,
  useRegattaPresence,
  type RegattaPresence,
  type UsePresenceOptions,
} from './presence';
export {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_TTL_MS,
  presenceActivity,
  presencePageFromPath,
  type PresencePage,
  type PresenceViewer,
} from './presence-beacon';
export { capitalize, initialsOf, shortUserName, targetCollection } from './collab-format';
export { useNow } from './use-now';
export { StoreProvider } from './context';
export { can, ROLE_LABELS, type Action } from './permissions';
export { useOnline, isNetworkError, OFFLINE_EDIT_MESSAGE } from './online';
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
