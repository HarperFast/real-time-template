import { Resource, tables } from 'harper';

const DEFAULT_LIMIT = 100;

/**
 * Example custom Resource: a *bounded* listing of topics.
 *
 * `Topic` is an `@export`ed table, so `GET /Topic/` already lists records via the table's own
 * read path — a bare `search({})` passthrough would just re-expose that at a second URL. What
 * this adds is the reason to hand-roll a resource at all: it caps the result set, so a
 * high-volume pub/sub log can't be materialized in full by a single request. Real apps should
 * paginate properly (offset/cursor); this shows the guard rail, not a complete pager.
 */
export class TopicList extends Resource {
	static get(target) {
		// `target` is a RequestTarget (a parsed URLSearchParams), so honor a caller-supplied
		// `?limit=` rather than always returning the same page size.
		//
		// Validate rather than `?? DEFAULT_LIMIT`: Harper's query parser coerces `limit` with a
		// unary `+` (resources/search.ts), so `?limit=abc` yields NaN — not undefined — and `??`
		// only substitutes on null/undefined. NaN would flow through to the slice end
		// (`offset + limit`), whose termination check is `i >= end`; `i >= NaN` is always false,
		// so the limit would be silently ignored and the entire table returned.
		const requested = Number(target?.limit);
		const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT;
		return tables.Topic.search({ limit });
	}
}
