/**
* This file was @generated using pocketbase-typegen
*/

import type PocketBase from 'pocketbase'
import type { RecordService } from 'pocketbase'

export const Collections = {
	Authorigins: "_authOrigins",
	Externalauths: "_externalAuths",
	Mfas: "_mfas",
	Otps: "_otps",
	Superusers: "_superusers",
	ActivityLog: "activity_log",
	Athletes: "athletes",
	Availability: "availability",
	ClubSettings: "club_settings",
	Comments: "comments",
	Entries: "entries",
	EntrySeats: "entry_seats",
	Events: "events",
	GearItems: "gear_items",
	LoadItems: "load_items",
	LoadPlacements: "load_placements",
	LoadPlans: "load_plans",
	OarSets: "oar_sets",
	Presence: "presence",
	RegattaTeams: "regatta_teams",
	Regattas: "regattas",
	ShareLinks: "share_links",
	Shells: "shells",
	Teams: "teams",
	TrailerCompartments: "trailer_compartments",
	TrailerShelves: "trailer_shelves",
	Trailers: "trailers",
	Users: "users",
} as const
export type Collections = typeof Collections[keyof typeof Collections]

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type AuthoriginsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	fingerprint: string
	id: string
	recordRef: string
	updated: IsoAutoDateString
}

export type ExternalauthsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	provider: string
	providerId: string
	recordRef: string
	updated: IsoAutoDateString
}

export type MfasRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	method: string
	recordRef: string
	updated: IsoAutoDateString
}

export type OtpsRecord = {
	collectionRef: string
	created: IsoAutoDateString
	id: string
	password: string
	recordRef: string
	sentTo?: string
	updated: IsoAutoDateString
}

export type SuperusersRecord = {
	created: IsoAutoDateString
	email: string
	emailVisibility?: boolean
	id: string
	password: string
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

export const ActivityLogActionOptions = {
	"create": "create",
	"update": "update",
	"delete": "delete",
} as const
export type ActivityLogActionOptions = typeof ActivityLogActionOptions[keyof typeof ActivityLogActionOptions]
export type ActivityLogRecord<Tdiff = unknown> = {
	action: ActivityLogActionOptions
	actor?: RecordIdString
	created: IsoAutoDateString
	diff?: null | Tdiff
	id: string
	regatta?: RecordIdString
	summary: string
	target_id: string
	target_type: string
	updated: IsoAutoDateString
}

export const AthletesSideOptions = {
	"port": "port",
	"starboard": "starboard",
	"both": "both",
	"none": "none",
} as const
export type AthletesSideOptions = typeof AthletesSideOptions[keyof typeof AthletesSideOptions]

export const AthletesLevelOptions = {
	"novice": "novice",
	"experienced": "experienced",
} as const
export type AthletesLevelOptions = typeof AthletesLevelOptions[keyof typeof AthletesLevelOptions]

export const AthletesStatusOptions = {
	"active": "active",
	"inactive": "inactive",
} as const
export type AthletesStatusOptions = typeof AthletesStatusOptions[keyof typeof AthletesStatusOptions]
export type AthletesRecord = {
	birth_year?: number
	birthdate?: string
	can_cox?: boolean
	can_scull?: boolean
	created: IsoAutoDateString
	first_name: string
	gender?: string
	grad_year?: number
	id: string
	last_name?: string
	level: AthletesLevelOptions
	notes?: string
	preferred_name?: string
	side: AthletesSideOptions
	status: AthletesStatusOptions
	team: RecordIdString
	updated: IsoAutoDateString
	weight_kg?: number
}

export const AvailabilityStatusOptions = {
	"available": "available",
	"unavailable": "unavailable",
	"maybe": "maybe",
} as const
export type AvailabilityStatusOptions = typeof AvailabilityStatusOptions[keyof typeof AvailabilityStatusOptions]
export type AvailabilityRecord<Tdays = unknown> = {
	athlete: RecordIdString
	created: IsoAutoDateString
	days?: null | Tdays
	id: string
	reason?: string
	regatta: RecordIdString
	status: AvailabilityStatusOptions
	updated: IsoAutoDateString
	updated_by?: RecordIdString
}

export const ClubSettingsWeightUnitOptions = {
	"kg": "kg",
	"lb": "lb",
} as const
export type ClubSettingsWeightUnitOptions = typeof ClubSettingsWeightUnitOptions[keyof typeof ClubSettingsWeightUnitOptions]
export type ClubSettingsRecord<Ttiming_defaults = unknown> = {
	club_name: string
	created: IsoAutoDateString
	head_race_duration_min?: number
	id: string
	timezone: string
	timing_defaults?: null | Ttiming_defaults
	updated: IsoAutoDateString
	week_starts_on?: number
	weight_unit: ClubSettingsWeightUnitOptions
}

export const CommentsTargetTypeOptions = {
	"entry": "entry",
	"event": "event",
	"load_plan": "load_plan",
} as const
export type CommentsTargetTypeOptions = typeof CommentsTargetTypeOptions[keyof typeof CommentsTargetTypeOptions]
export type CommentsRecord = {
	author?: RecordIdString
	body: string
	created: IsoAutoDateString
	id: string
	target_id: string
	target_type: CommentsTargetTypeOptions
	updated: IsoAutoDateString
}

export const EntriesBoatClassOptions = {
	"1x": "1x",
	"2x": "2x",
	"2-": "2-",
	"2+": "2+",
	"4x": "4x",
	"4x+": "4x+",
	"4+": "4+",
	"4-": "4-",
	"8+": "8+",
} as const
export type EntriesBoatClassOptions = typeof EntriesBoatClassOptions[keyof typeof EntriesBoatClassOptions]

export const EntriesStatusOptions = {
	"draft": "draft",
	"planned": "planned",
	"confirmed": "confirmed",
	"scratched": "scratched",
} as const
export type EntriesStatusOptions = typeof EntriesStatusOptions[keyof typeof EntriesStatusOptions]
export type EntriesRecord<Tseat_sides = unknown> = {
	boat_class: EntriesBoatClassOptions
	coach?: RecordIdString
	created: IsoAutoDateString
	created_by?: RecordIdString
	event?: RecordIdString
	hot_seat_ack_by?: RecordIdString
	hot_seat_fingerprint?: string
	hot_seat_plan?: string
	id: string
	label?: string
	notes?: string
	oar_set?: RecordIdString
	regatta: RecordIdString
	seat_sides?: null | Tseat_sides
	shell?: RecordIdString
	status: EntriesStatusOptions
	team: RecordIdString
	updated: IsoAutoDateString
	updated_by?: RecordIdString
}

export const EntrySeatsSeatOptions = {
	"E1": "1",
	"E2": "2",
	"E3": "3",
	"E4": "4",
	"E5": "5",
	"E6": "6",
	"E7": "7",
	"E8": "8",
	"cox": "cox",
} as const
export type EntrySeatsSeatOptions = typeof EntrySeatsSeatOptions[keyof typeof EntrySeatsSeatOptions]
export type EntrySeatsRecord = {
	athlete?: RecordIdString
	created: IsoAutoDateString
	entry: RecordIdString
	id: string
	note?: string
	seat: EntrySeatsSeatOptions
	updated: IsoAutoDateString
}

export const EventsKindOptions = {
	"race": "race",
	"logistics": "logistics",
} as const
export type EventsKindOptions = typeof EventsKindOptions[keyof typeof EventsKindOptions]

export const EventsBoatClassOptions = {
	"1x": "1x",
	"2x": "2x",
	"2-": "2-",
	"2+": "2+",
	"4x": "4x",
	"4x+": "4x+",
	"4+": "4+",
	"4-": "4-",
	"8+": "8+",
} as const
export type EventsBoatClassOptions = typeof EventsBoatClassOptions[keyof typeof EventsBoatClassOptions]

export const EventsStageOptions = {
	"heat": "heat",
	"semi": "semi",
	"final": "final",
	"time_trial": "time_trial",
	"race": "race",
} as const
export type EventsStageOptions = typeof EventsStageOptions[keyof typeof EventsStageOptions]
export type EventsRecord = {
	boat_class?: EventsBoatClassOptions
	category?: string
	created: IsoAutoDateString
	day: string
	event_number?: string
	id: string
	kind: EventsKindOptions
	name: string
	notes?: string
	progression_group?: string
	regatta: RecordIdString
	scheduled_at?: IsoDateString
	sort_order?: number
	source?: string
	stage?: EventsStageOptions
	team_filter?: RecordIdString[]
	updated: IsoAutoDateString
}

export const GearItemsCategoryOptions = {
	"cox_box": "cox_box",
	"slings": "slings",
	"rigger_set": "rigger_set",
	"tool_kit": "tool_kit",
	"tent": "tent",
	"launch": "launch",
	"straps": "straps",
	"spare_parts": "spare_parts",
	"other": "other",
} as const
export type GearItemsCategoryOptions = typeof GearItemsCategoryOptions[keyof typeof GearItemsCategoryOptions]
export type GearItemsRecord = {
	category: GearItemsCategoryOptions
	created: IsoAutoDateString
	default_load?: boolean
	id: string
	name: string
	notes?: string
	quantity?: number
	updated: IsoAutoDateString
}

export const LoadItemsKindOptions = {
	"shell": "shell",
	"riggers": "riggers",
	"oar_set": "oar_set",
	"gear": "gear",
	"extra": "extra",
} as const
export type LoadItemsKindOptions = typeof LoadItemsKindOptions[keyof typeof LoadItemsKindOptions]
export type LoadItemsRecord = {
	container?: string
	created: IsoAutoDateString
	id: string
	kind: LoadItemsKindOptions
	label: string
	load_plan?: RecordIdString
	loaded_at?: IsoDateString
	loaded_by?: RecordIdString
	notes?: string
	quantity?: number
	ref_id?: string
	regatta: RecordIdString
	returned_at?: IsoDateString
	returned_by?: RecordIdString
	updated: IsoAutoDateString
}

export type LoadPlacementsRecord<Treasons = unknown> = {
	bow_forward?: boolean
	created: IsoAutoDateString
	id: string
	lane?: number
	load_plan: RecordIdString
	locked?: boolean
	offset_cm?: number
	reasons?: null | Treasons
	shelf: RecordIdString
	shell: RecordIdString
	updated: IsoAutoDateString
}

export const LoadPlansStatusOptions = {
	"draft": "draft",
	"final": "final",
} as const
export type LoadPlansStatusOptions = typeof LoadPlansStatusOptions[keyof typeof LoadPlansStatusOptions]
export type LoadPlansRecord<Trules = unknown> = {
	created: IsoAutoDateString
	id: string
	notes?: string
	packed_at?: IsoDateString
	regatta: RecordIdString
	rules?: null | Trules
	status: LoadPlansStatusOptions
	trailer: RecordIdString
	updated: IsoAutoDateString
}

export const OarSetsTypeOptions = {
	"sweep": "sweep",
	"scull": "scull",
} as const
export type OarSetsTypeOptions = typeof OarSetsTypeOptions[keyof typeof OarSetsTypeOptions]

export const OarSetsGenderAffinityOptions = {
	"women": "women",
	"men": "men",
	"any": "any",
} as const
export type OarSetsGenderAffinityOptions = typeof OarSetsGenderAffinityOptions[keyof typeof OarSetsGenderAffinityOptions]

export const OarSetsStatusOptions = {
	"in_service": "in_service",
	"limited": "limited",
	"out_of_service": "out_of_service",
	"retired": "retired",
} as const
export type OarSetsStatusOptions = typeof OarSetsStatusOptions[keyof typeof OarSetsStatusOptions]
export type OarSetsRecord = {
	blade?: string
	color?: string
	count?: number
	created: IsoAutoDateString
	gender_affinity: OarSetsGenderAffinityOptions
	grip_mm?: number
	home_team?: RecordIdString
	id: string
	inboard_cm?: number
	length_cm?: number
	name: string
	notes?: string
	status: OarSetsStatusOptions
	type: OarSetsTypeOptions
	updated: IsoAutoDateString
}

export type PresenceRecord = {
	created: IsoAutoDateString
	id: string
	page?: string
	regatta: RecordIdString
	seen_at?: IsoDateString
	team?: RecordIdString
	updated: IsoAutoDateString
	user: RecordIdString
}

export type RegattaTeamsRecord<Tpublished_snapshot = unknown> = {
	created: IsoAutoDateString
	id: string
	notes?: string
	published_at?: IsoDateString
	published_snapshot?: null | Tpublished_snapshot
	regatta: RecordIdString
	team: RecordIdString
	updated: IsoAutoDateString
}

export const RegattasFormatOptions = {
	"sprint": "sprint",
	"head": "head",
} as const
export type RegattasFormatOptions = typeof RegattasFormatOptions[keyof typeof RegattasFormatOptions]

export const RegattasStatusOptions = {
	"planning": "planning",
	"final": "final",
	"archived": "archived",
} as const
export type RegattasStatusOptions = typeof RegattasStatusOptions[keyof typeof RegattasStatusOptions]
export type RegattasRecord<Tsettings = unknown> = {
	city?: string
	created: IsoAutoDateString
	created_by?: RecordIdString
	end_date: string
	format: RegattasFormatOptions
	id: string
	name: string
	notes?: string
	settings?: null | Tsettings
	start_date: string
	status: RegattasStatusOptions
	timezone: string
	updated: IsoAutoDateString
	venue?: string
}

export type ShareLinksRecord = {
	can_check_load?: boolean
	created: IsoAutoDateString
	id: string
	regatta: RecordIdString
	revoked_at?: IsoDateString
	team?: RecordIdString
	token: string
	updated: IsoAutoDateString
}

export const ShellsBoatClassOptions = {
	"1x": "1x",
	"2x": "2x",
	"2-": "2-",
	"2+": "2+",
	"4x": "4x",
	"4x+": "4x+",
	"4+": "4+",
	"4-": "4-",
	"8+": "8+",
} as const
export type ShellsBoatClassOptions = typeof ShellsBoatClassOptions[keyof typeof ShellsBoatClassOptions]

export const ShellsCompatibleClassesOptions = {
	"1x": "1x",
	"2x": "2x",
	"2-": "2-",
	"2+": "2+",
	"4x": "4x",
	"4x+": "4x+",
	"4+": "4+",
	"4-": "4-",
	"8+": "8+",
} as const
export type ShellsCompatibleClassesOptions = typeof ShellsCompatibleClassesOptions[keyof typeof ShellsCompatibleClassesOptions]

export const ShellsRiggingOptions = {
	"sweep": "sweep",
	"scull": "scull",
	"convertible": "convertible",
} as const
export type ShellsRiggingOptions = typeof ShellsRiggingOptions[keyof typeof ShellsRiggingOptions]

export const ShellsStrokeSideOptions = {
	"port": "port",
	"starboard": "starboard",
} as const
export type ShellsStrokeSideOptions = typeof ShellsStrokeSideOptions[keyof typeof ShellsStrokeSideOptions]

export const ShellsCoxPositionOptions = {
	"stern": "stern",
	"bow": "bow",
} as const
export type ShellsCoxPositionOptions = typeof ShellsCoxPositionOptions[keyof typeof ShellsCoxPositionOptions]

export const ShellsRiggerTypeOptions = {
	"wing": "wing",
	"side": "side",
	"none": "none",
} as const
export type ShellsRiggerTypeOptions = typeof ShellsRiggerTypeOptions[keyof typeof ShellsRiggerTypeOptions]

export const ShellsLevelOptions = {
	"beginner": "beginner",
	"intermediate": "intermediate",
	"racer": "racer",
} as const
export type ShellsLevelOptions = typeof ShellsLevelOptions[keyof typeof ShellsLevelOptions]

export const ShellsGenderAffinityOptions = {
	"women": "women",
	"men": "men",
	"any": "any",
} as const
export type ShellsGenderAffinityOptions = typeof ShellsGenderAffinityOptions[keyof typeof ShellsGenderAffinityOptions]

export const ShellsStatusOptions = {
	"in_service": "in_service",
	"limited": "limited",
	"out_of_service": "out_of_service",
	"retired": "retired",
} as const
export type ShellsStatusOptions = typeof ShellsStatusOptions[keyof typeof ShellsStatusOptions]
export type ShellsRecord = {
	beam_cm?: number
	boat_class: ShellsBoatClassOptions
	color?: string
	compatible_classes?: ShellsCompatibleClassesOptions[]
	cox_position?: ShellsCoxPositionOptions
	created: IsoAutoDateString
	crew_weight_max_kg?: number
	crew_weight_min_kg?: number
	gender_affinity: ShellsGenderAffinityOptions
	home_team?: RecordIdString
	id: string
	is_private?: boolean
	length_cm?: number
	level?: ShellsLevelOptions
	location?: string
	manufacturer?: string
	model?: string
	name: string
	nickname?: string
	notes?: string
	photo?: FileNameString
	rigger_count?: number
	rigger_type: ShellsRiggerTypeOptions
	rigging: ShellsRiggingOptions
	serial?: string
	shoes?: string
	span_cm?: number
	spread_cm?: number
	status: ShellsStatusOptions
	stroke_side?: ShellsStrokeSideOptions
	updated: IsoAutoDateString
	weight_class_label?: string
	weight_kg?: number
	year?: number
}

export const TeamsProgramOptions = {
	"juniors": "juniors",
	"masters": "masters",
	"other": "other",
} as const
export type TeamsProgramOptions = typeof TeamsProgramOptions[keyof typeof TeamsProgramOptions]

export const TeamsColorKeyOptions = {
	"navy": "navy",
	"raspberry": "raspberry",
	"ochre": "ochre",
	"green": "green",
	"violet": "violet",
	"cyan": "cyan",
	"bronze": "bronze",
	"slate": "slate",
} as const
export type TeamsColorKeyOptions = typeof TeamsColorKeyOptions[keyof typeof TeamsColorKeyOptions]
export type TeamsRecord = {
	archived?: boolean
	color_key: TeamsColorKeyOptions
	created: IsoAutoDateString
	id: string
	name: string
	program: TeamsProgramOptions
	short_name?: string
	sort_order?: number
	updated: IsoAutoDateString
}

export const TrailerCompartmentsKindOptions = {
	"bed": "bed",
	"oar_box": "oar_box",
	"oar_tube": "oar_tube",
	"oar_rack": "oar_rack",
	"rigger_rack": "rigger_rack",
	"storage": "storage",
} as const
export type TrailerCompartmentsKindOptions = typeof TrailerCompartmentsKindOptions[keyof typeof TrailerCompartmentsKindOptions]
export type TrailerCompartmentsRecord = {
	capacity?: number
	capacity_unit?: string
	created: IsoAutoDateString
	id: string
	kind: TrailerCompartmentsKindOptions
	label?: string
	trailer: RecordIdString
	updated: IsoAutoDateString
}

export const TrailerShelvesColumnKeyOptions = {
	"left": "left",
	"right": "right",
	"full": "full",
} as const
export type TrailerShelvesColumnKeyOptions = typeof TrailerShelvesColumnKeyOptions[keyof typeof TrailerShelvesColumnKeyOptions]

export const TrailerShelvesAllowedClassesOptions = {
	"1x": "1x",
	"2x": "2x",
	"2-": "2-",
	"2+": "2+",
	"4x": "4x",
	"4x+": "4x+",
	"4+": "4+",
	"4-": "4-",
	"8+": "8+",
} as const
export type TrailerShelvesAllowedClassesOptions = typeof TrailerShelvesAllowedClassesOptions[keyof typeof TrailerShelvesAllowedClassesOptions]

export const TrailerShelvesLaneAccessOptions = {
	"any": "any",
	"outer_first": "outer_first",
} as const
export type TrailerShelvesLaneAccessOptions = typeof TrailerShelvesLaneAccessOptions[keyof typeof TrailerShelvesLaneAccessOptions]
export type TrailerShelvesRecord = {
	access_rank?: number
	active?: boolean
	allowed_classes?: TrailerShelvesAllowedClassesOptions[]
	column_key: TrailerShelvesColumnKeyOptions
	created: IsoAutoDateString
	front_overhang_max_cm?: number
	id: string
	label?: string
	lane_access: TrailerShelvesLaneAccessOptions
	lanes_override?: number
	length_cm?: number
	max_boats?: number
	max_weight_kg?: number
	rear_overhang_max_cm?: number
	sort_order?: number
	tier?: number
	trailer: RecordIdString
	updated: IsoAutoDateString
	width_cm?: number
}

export const TrailersStyleOptions = {
	"offset_post": "offset_post",
	"center_post": "center_post",
	"goalpost": "goalpost",
} as const
export type TrailersStyleOptions = typeof TrailersStyleOptions[keyof typeof TrailersStyleOptions]
export type TrailersRecord<Tdefault_rules = unknown> = {
	bow_forward_default?: boolean
	created: IsoAutoDateString
	default_rules?: null | Tdefault_rules
	frame_length_cm?: number
	id: string
	name: string
	notes?: string
	post_offset_pct?: number
	style: TrailersStyleOptions
	updated: IsoAutoDateString
	width_cm?: number
}

export const UsersRoleOptions = {
	"admin": "admin",
	"coach": "coach",
	"viewer": "viewer",
} as const
export type UsersRoleOptions = typeof UsersRoleOptions[keyof typeof UsersRoleOptions]
export type UsersRecord<Tpreferences = unknown> = {
	avatar?: FileNameString
	created: IsoAutoDateString
	default_team?: RecordIdString
	email: string
	emailVisibility?: boolean
	id: string
	name?: string
	password: string
	preferences?: null | Tpreferences
	role: UsersRoleOptions
	tokenKey: string
	updated: IsoAutoDateString
	verified?: boolean
}

// Response types include system fields and match responses from the PocketBase API
export type AuthoriginsResponse<Texpand = unknown> = Required<AuthoriginsRecord> & BaseSystemFields<Texpand>
export type ExternalauthsResponse<Texpand = unknown> = Required<ExternalauthsRecord> & BaseSystemFields<Texpand>
export type MfasResponse<Texpand = unknown> = Required<MfasRecord> & BaseSystemFields<Texpand>
export type OtpsResponse<Texpand = unknown> = Required<OtpsRecord> & BaseSystemFields<Texpand>
export type SuperusersResponse<Texpand = unknown> = Required<SuperusersRecord> & AuthSystemFields<Texpand>
export type ActivityLogResponse<Tdiff = unknown, Texpand = unknown> = Required<ActivityLogRecord<Tdiff>> & BaseSystemFields<Texpand>
export type AthletesResponse<Texpand = unknown> = Required<AthletesRecord> & BaseSystemFields<Texpand>
export type AvailabilityResponse<Tdays = unknown, Texpand = unknown> = Required<AvailabilityRecord<Tdays>> & BaseSystemFields<Texpand>
export type ClubSettingsResponse<Ttiming_defaults = unknown, Texpand = unknown> = Required<ClubSettingsRecord<Ttiming_defaults>> & BaseSystemFields<Texpand>
export type CommentsResponse<Texpand = unknown> = Required<CommentsRecord> & BaseSystemFields<Texpand>
export type EntriesResponse<Tseat_sides = unknown, Texpand = unknown> = Required<EntriesRecord<Tseat_sides>> & BaseSystemFields<Texpand>
export type EntrySeatsResponse<Texpand = unknown> = Required<EntrySeatsRecord> & BaseSystemFields<Texpand>
export type EventsResponse<Texpand = unknown> = Required<EventsRecord> & BaseSystemFields<Texpand>
export type GearItemsResponse<Texpand = unknown> = Required<GearItemsRecord> & BaseSystemFields<Texpand>
export type LoadItemsResponse<Texpand = unknown> = Required<LoadItemsRecord> & BaseSystemFields<Texpand>
export type LoadPlacementsResponse<Treasons = unknown, Texpand = unknown> = Required<LoadPlacementsRecord<Treasons>> & BaseSystemFields<Texpand>
export type LoadPlansResponse<Trules = unknown, Texpand = unknown> = Required<LoadPlansRecord<Trules>> & BaseSystemFields<Texpand>
export type OarSetsResponse<Texpand = unknown> = Required<OarSetsRecord> & BaseSystemFields<Texpand>
export type PresenceResponse<Texpand = unknown> = Required<PresenceRecord> & BaseSystemFields<Texpand>
export type RegattaTeamsResponse<Tpublished_snapshot = unknown, Texpand = unknown> = Required<RegattaTeamsRecord<Tpublished_snapshot>> & BaseSystemFields<Texpand>
export type RegattasResponse<Tsettings = unknown, Texpand = unknown> = Required<RegattasRecord<Tsettings>> & BaseSystemFields<Texpand>
export type ShareLinksResponse<Texpand = unknown> = Required<ShareLinksRecord> & BaseSystemFields<Texpand>
export type ShellsResponse<Texpand = unknown> = Required<ShellsRecord> & BaseSystemFields<Texpand>
export type TeamsResponse<Texpand = unknown> = Required<TeamsRecord> & BaseSystemFields<Texpand>
export type TrailerCompartmentsResponse<Texpand = unknown> = Required<TrailerCompartmentsRecord> & BaseSystemFields<Texpand>
export type TrailerShelvesResponse<Texpand = unknown> = Required<TrailerShelvesRecord> & BaseSystemFields<Texpand>
export type TrailersResponse<Tdefault_rules = unknown, Texpand = unknown> = Required<TrailersRecord<Tdefault_rules>> & BaseSystemFields<Texpand>
export type UsersResponse<Tpreferences = unknown, Texpand = unknown> = Required<UsersRecord<Tpreferences>> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	_authOrigins: AuthoriginsRecord
	_externalAuths: ExternalauthsRecord
	_mfas: MfasRecord
	_otps: OtpsRecord
	_superusers: SuperusersRecord
	activity_log: ActivityLogRecord
	athletes: AthletesRecord
	availability: AvailabilityRecord
	club_settings: ClubSettingsRecord
	comments: CommentsRecord
	entries: EntriesRecord
	entry_seats: EntrySeatsRecord
	events: EventsRecord
	gear_items: GearItemsRecord
	load_items: LoadItemsRecord
	load_placements: LoadPlacementsRecord
	load_plans: LoadPlansRecord
	oar_sets: OarSetsRecord
	presence: PresenceRecord
	regatta_teams: RegattaTeamsRecord
	regattas: RegattasRecord
	share_links: ShareLinksRecord
	shells: ShellsRecord
	teams: TeamsRecord
	trailer_compartments: TrailerCompartmentsRecord
	trailer_shelves: TrailerShelvesRecord
	trailers: TrailersRecord
	users: UsersRecord
}

export type CollectionResponses = {
	_authOrigins: AuthoriginsResponse
	_externalAuths: ExternalauthsResponse
	_mfas: MfasResponse
	_otps: OtpsResponse
	_superusers: SuperusersResponse
	activity_log: ActivityLogResponse
	athletes: AthletesResponse
	availability: AvailabilityResponse
	club_settings: ClubSettingsResponse
	comments: CommentsResponse
	entries: EntriesResponse
	entry_seats: EntrySeatsResponse
	events: EventsResponse
	gear_items: GearItemsResponse
	load_items: LoadItemsResponse
	load_placements: LoadPlacementsResponse
	load_plans: LoadPlansResponse
	oar_sets: OarSetsResponse
	presence: PresenceResponse
	regatta_teams: RegattaTeamsResponse
	regattas: RegattasResponse
	share_links: ShareLinksResponse
	shells: ShellsResponse
	teams: TeamsResponse
	trailer_compartments: TrailerCompartmentsResponse
	trailer_shelves: TrailerShelvesResponse
	trailers: TrailersResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>

// Type for usage with type asserted PocketBase instance
// https://github.com/pocketbase/js-sdk#specify-typescript-definitions

export type TypedPocketBase = {
	collection<T extends keyof CollectionResponses>(
		idOrName: T
	): RecordService<CollectionResponses[T]>
} & PocketBase
