import { Resource, tables } from 'harper';

/**
 * The most records this endpoint will ever return, and the page size used when the caller
 * doesn't ask for a smaller one. A `?limit(n)` query can lower it; it can never raise it.
 */
const MAX_LIMIT = 100;

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
	// Note this is the INSTANCE `get`, not `static get`. The static `Resource.get` is a
	// `transactional(...)` dispatcher (harper resources/Resource.ts): it opens the transaction,
	// resolves the resource, runs the `allowRead` permission check, and only then calls
	// `resource.get(target)`. Overriding the static would replace that dispatcher, so this
	// resource would run outside the framework's transaction and authorization handling —
	// the instance method is the supported extension point.
	//
	// Authorization therefore comes from `Resource.allowRead`, which defaults to super-user only.
	// Override `allowRead(user, target, context)` here to open this endpoint to other roles.
	get(target) {
		// `target` is a RequestTarget (a parsed URLSearchParams), so honor a caller-supplied page
		// size rather than always returning the same one. Note the query syntax is Harper's
		// `?limit(5)` function form, which `parseQuery` (resources/search.ts) turns into
		// `target.limit` — `?limit=5` is parsed as an attribute filter instead, and never lands
		// here at all.
		//
		// Validate rather than `?? MAX_LIMIT`: the parser coerces the argument with a unary `+`,
		// so `?limit(abc)` yields NaN — not undefined — and `??` only substitutes on null/undefined.
		// NaN would flow through to the slice end (`offset + limit`), whose termination check is
		// `i >= end`; `i >= NaN` is always false, so the bound would be silently dropped and the
		// entire table returned.
		//
		// Clamp as well as validate: accepting any finite positive number lets `?limit(1e9)`
		// materialize the whole table, which is the hazard this resource exists to prevent.
		const requested = Number(target?.limit);
		const limit =
			Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_LIMIT) : MAX_LIMIT;
		return tables.Topic.search({ limit });
	}
}
