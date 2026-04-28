import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { formatMatchSummary, formatRankDistribution, heroLabels, type Benchmark, type FullMatch, type PlayerMatchSummary, type RankDistribution, type SparseMatch } from './modules/bindings.js';
import { assert, getLocalOrSet, setLocal, tryGetElement, tryGetJson, tryGetLocal, type NamedElement, type Result, type UnixTimestamp } from './modules/flow.js';
import { PATHS } from './modules/paths.js';
import { type Distributions, type AccountId, type Player, type SearchResult, type MatchForPlayer, leaverStatusByKey, LEAVER_STATUS } from './types/OpenDotaTypes.js'

// @ts-expect-error (only required for TypeScript projects)
import 'https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.1/bundles/datastar.js'
const HOST = 'https://api.opendota.com/'
axios.defaults.baseURL = 'https://api.opendota.com/api'
axios.defaults.allowAbsoluteUrls = false

const ENDPOINT = {
	MATCHES: '/matches',
	PLAYERS: '/players',
	TOP_PlAYERS:'/topPlayers',
	PRO_PLAYERS: '/proPlayers',
	PRO_MATCHES: '/ProMatches',
	PUBLIC_MATCHES: '/publicMatches',
	PARSED_MATCHES: '/parsedMatches',
	EXPLORER: '/explorer',
	METADATA: '/metadata',
	DISTRIBUTIONS: '/distributions',
	SEARCH: '/search',
	RANKINGS: '/rankings',
	BENCHMARKS: '/benchmarks',
	HEALTH: '/health',
	REQUEST: '/request',
	FIND_MATCHES: '/findMatches',
	HEROES: '/heroes',
	HEROSTATS: '/heroStats',
	LEAGUES: '/rankings',
	TEAMS: '/rankings',
	RECORDS: '/rankings',
	LIVE: '/rankings',
	SCENARIOS: '/rankings',
	SCHEMA: '/rankings',
	CONSTANTS: '/rankings',
} as const

const LocalDataKey = {
	CALL_LIMIT_TIMESTAMPS: 'callLimitTimestamps'
	RankDistribution: 'rankDistribution',
	Benchmarks: 'benchmarks',
	StoredMatches: 'storedMatches',
} as const

// INIT
let benchmarks = tryGetLocal<Benchmark[]>(LocalDataKey.Benchmarks)

const templates = {
	matchHistory: tryGetElement<HTMLTemplateElement>('#match-history-template'),
	matchSummary: tryGetElement<HTMLTemplateElement>('#match-summary-template')
}
const sections = {
	matchHistory: tryGetElement<HTMLDivElement>('#match-history')
}
interface CallsLeft {
	minute: {left: number, sinceWhen: UnixTimestamp},
	today: {left: number, sinceWhen: UnixTimestamp}
}
const calls = getLocalOrSet<CallsLeft>(
	LocalDataKey.CALL_LIMIT_TIMESTAMPS, {
		minute: {left: 60, sinceWhen: Date.now() as UnixTimestamp},
		today: {left: 3000, sinceWhen: Date.now() as UnixTimestamp}
	}
)

function updateCallsLeft(callsToSubtract?: number): void {
	const count = callsToSubtract ? callsToSubtract : 1
	const now = Date.now() as UnixTimestamp
	// This is wrong as we also need to update timestamp!
	calls.minute.left = (now - calls.minute.sinceWhen > 60000) ? 
		60 - count : calls.minute.left - count 
	calls.today.left =(now - calls.today.sinceWhen > 86400000) ?
		3000 - count : calls.today.left - count
	
	const evtObj = {detail:  {min: calls.minute.left, day: calls.today.left}}
	document.dispatchEvent( new CustomEvent('ratelimitchange', evtObj))
}

// page flow -> search accounts -> provide sample account ids.
// show match summary for recent matches. Let user click match.
// show match details with focus on account hero. Let user request parse if match is not parsed.
async function searchTypedAccount(searchTerm: string | AccountId) {
	/* TODO: Restructure validation and error for axios.
	Axios throws errors (usually rejecting the promise). Our validation
	should be simple catches initially. Any advanced validation we do should be
	on the datastructure. */
	const playerResponse = await tryGetPlayer(searchTerm)
	console.log(JSON.stringify(playerResponse, null, '\t' ))
	const player = playerResponse.data
	const matchesResponse = await tryGetMatches(player.profile.account_id)
	console.log(JSON.stringify(matchesResponse, null, '\t'))
	const matchHistory: PlayerMatchSummary[] = matchesResponse.data.map(match => 
		formatMatchSummary(match, player.profile.account_id)
	)
	const fragment = document.importNode(templates.matchHistory.content, true)
	sections.matchHistory.replaceChildren(fragment)
	const matchHistoryBody = sections.matchHistory.querySelector('tbody')
	matchHistory.forEach(match => 
		matchHistoryBody!.append(createMatchSummary(match))
	)
}
// We need to make the function available in the DOM for datastar. 
(window as any).searchTypedAccount = searchTypedAccount

async function tryGetPlayer(idOrPersona: AccountId | string): Promise<AxiosResponse> {
	let accountId: number
	if(typeof idOrPersona === 'string') {
		// url.search = `?q=${idOrPersona}`
		const response = await axios.get<SearchResult[]>(ENDPOINT.SEARCH, {params: {q: idOrPersona}})
		updateCallsLeft()
		if(!response.data[0].account_id) {
			return response
		}
		accountId = response.data[0].account_id
	}
	else {
		accountId = idOrPersona
	}
	const response = await axios.get<Player>(`${ENDPOINT.PLAYERS}/${accountId}`)
	updateCallsLeft()
	return response
}

async function tryGetMatches(id: AccountId): Promise<AxiosResponse<MatchForPlayer[]>> {
	return await axios.get<MatchForPlayer[]>(`${ENDPOINT.PLAYERS}/${id}/matches`)
}

async function tryGetMatch(matchId: number): Promise<SparseMatch | FullMatch | null> {
	let match = tryGetLocal<SparseMatch | FullMatch>(`match:${matchId}`)
	if(match) {
		return match
	}
	const result = await tryGetJson<SparseMatch | FullMatch>(new URL(`${ENDPOINT.MATCHES}/${matchId}`))
	if(!result.ok) {
		return null
	}
	setLocal(`match:${matchId}`, assert(result.data, 'match.data', 'Could not store match.'))
	return result.data
}

async function requestParse(matchId: number) {
	const result = await tryGetJson<unknown>(new URL(`${ENDPOINT.REQUEST}/${matchId}`), {method: 'POST', headers: {'Content-Type': 'application/json'}})
	if(!result.ok) {
		return null
	}
	return result.data
}

async function tryGetRankDistribution(): Promise<RankDistribution | null> {
	let rankDistribution = tryGetLocal<RankDistribution>(LocalDataKey.RankDistribution)
	// Try to get from localstorage first, fetch if not present or stale (here 24H shelf life).
	if(!(rankDistribution && new Date().getHours() - new Date(rankDistribution.timestamp).getHours() <= 24)) {
		const result = await axios.get<Distributions>(ENDPOINT.DISTRIBUTIONS)
		if(result.status != 200) {
			rankDistribution = formatRankDistribution(result.data)
			setLocal<RankDistribution>(LocalDataKey.RankDistribution, rankDistribution)
		}
	}
	return rankDistribution
}

// async function tryGetBenchmarks(hero: HeroId) {

// }

function createMatchSummary(playerMatch: PlayerMatchSummary): HTMLTableRowElement {
	const {match, player, hero} = playerMatch
	const startTime = match.startTime ? new Date(match.startTime).toLocaleString() : 'unknown'
	const rowFragment: NamedElement = {
		node: document.importNode(templates.matchSummary.content, true),
		name: 'matchSummaryFragment'
	}
	const cells = {
		matchId: tryGetElement<HTMLDivElement>('[data-cell="match-id"]', rowFragment),
		matchTime: tryGetElement<HTMLDivElement>('[data-cell="match-time"]', rowFragment),
		heroImg: tryGetElement<HTMLTableCellElement>('[data-cell="hero-img"]', rowFragment),
		result: tryGetElement<HTMLDivElement>('[data-cell="result"]', rowFragment),
		side: tryGetElement<HTMLDivElement>('[data-cell="side"]', rowFragment),
		duration: tryGetElement<HTMLTableCellElement>('[data-cell="duration"]', rowFragment),
		kills: tryGetElement<HTMLSpanElement>('[data-cell="kills"]', rowFragment),
		deaths: tryGetElement<HTMLSpanElement>('[data-cell="deaths"]', rowFragment),
		assists: tryGetElement<HTMLSpanElement>('[data-cell="assists"]', rowFragment),
		gamemode: tryGetElement<HTMLDivElement>('[data-cell="gamemode"]', rowFragment),
		lobbyType: tryGetElement<HTMLDivElement>('[data-cell="lobby-type"]', rowFragment),
		leftGame: tryGetElement<HTMLDivElement>('[data-cell="left"]', rowFragment),
	}
	const heroImg = document.createElement('img')
	heroImg.src = `${PATHS.IMG.HEROES}/${heroLabels[hero.id]}.png`
	heroImg.alt = heroLabels[hero.id]!
	let result = 'Result unavailable'
	let side = 'Side unavailable'
	if(player.slot) {
		const playerTeam = player.slot < 128 ? 0 : 1
		result = match.winningTeam === playerTeam ? 'Victory' : 'Defeat'
		cells.result.dataset.result = result
		side = playerTeam === 0 ? 'Radiant' : 'Dire'
		cells.side.dataset.side = side
	}
	cells.matchId.textContent = `Match: ${match.id}`
	cells.matchTime.textContent = `Time: ${startTime}`
	cells.heroImg.append(heroImg)
	cells.result.textContent = result
	cells.side.textContent = side
	cells.duration.textContent = timerStringFromSeconds(match.lengthSeconds)
	cells.kills.textContent = hero.kda.kills.toString()
	cells.deaths.textContent = hero.kda.deaths.toString()
	cells.assists.textContent = hero.kda.assists.toString()
	cells.gamemode.textContent = match.gameMode.toString()
	cells.lobbyType.textContent = match.lobbyType.toString()
	if(player.leaverStatus != LEAVER_STATUS.NONE) {
		cells.leftGame.textContent = leaverStatusByKey[player.leaverStatus]
	}
	else {
		cells.leftGame.remove()
	}
	return rowFragment.node as HTMLTableRowElement
}

function timerStringFromSeconds(duration: number): string {
	const wholeSeconds = Math.round(duration);
	const seconds = wholeSeconds % 60;
	const minutes = ((wholeSeconds - seconds) % 3600) / 60;
	const hours = Math.floor((wholeSeconds - seconds - minutes) / 3600);
	const hoursString = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : '';
	return `${hoursString}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}