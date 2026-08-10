// Here we can define any JavaScript-based resources and extensions to tables

import { tables } from 'harper';

export class Topic extends tables.Topic {
	// Custom subscribe handler, e.g. to replay recent messages to a new subscriber.
	//
	// This overrides the INSTANCE method, not the static one. In v5 the static
	// `Resource.subscribe` is a `transactional(...)` wrapper whose body is
	// `resource.subscribe ? resource.subscribe(query) : missingMethod(...)`
	// (harper resources/Resource.ts) — it opens the transaction and then delegates to the
	// instance method, which is where `Table` implements subscriptions
	// (`async subscribe(request)` in harper resources/Table.ts). Overriding the static would
	// replace that dispatcher and drop the transaction handling, so the instance method is
	// the extension point.
	//
	// `previousCount` is supported in v5: it is declared on the subscription request
	// (resources/ResourceInterface.ts) and consumed by the table subscribe path
	// (resources/Table.ts). Harper rejects combining it with `startTime` for a table-level
	// subscription, which is why it is only set when no `startTime` was requested.
	//
	// `options` defaults to `{}` so a subscriber connecting without any options doesn't hit
	// a TypeError here before `super` gets a chance to normalize the request. Not `async`:
	// there is nothing to await, so returning the parent's promise directly avoids a
	// state-machine allocation on every subscription handshake.
	subscribe(options = {}) {
		if (!options.startTime)
			// seed the last five messages when no explicit startTime is requested
			options.previousCount = 5;
		return super.subscribe(options);
	}
}
