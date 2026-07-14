import { Resource, tables } from 'harper';

// Example custom Resource. Note that because `Topic` is an @export'ed table, `GET /Topic/`
// already lists records via the table's own read path — for a plain "list everything" endpoint
// prefer that. This route is kept as a teaching example of a custom `get` handler.
export class GetAll extends Resource {
	static get(target) {
		// Bound the result set: an unbounded `search({})` materializes the entire Topic table,
		// which is a memory hazard for a high-volume pub/sub log. Real apps should paginate.
		// `target` is a RequestTarget (a parsed URLSearchParams) carrying the request, so we
		// honor a caller-supplied `?limit=` instead of always returning everything.
		const limit = target?.limit ?? 100;
		return tables.Topic.search({ limit });
	}
}
