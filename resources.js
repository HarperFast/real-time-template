// Here we can define any JavaScript-based resources and extensions to tables

import { tables } from 'harper';

export class Topic extends tables.Topic {
	// Custom subscribe handler: the extension point for customizing a subscription.
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
	// This deliberately does NOT seed history with `previousCount`. The option is declared
	// on the subscription request, but the table-level path that services it is broken in
	// harper 5.2.1: it reads the audit log with `auditStore.getRange({ start: 'z', ... })`
	// (resources/Table.ts), passing a string start key to a numerically-keyed transaction
	// log, so the subscription fails with "A number was expected" and the client never
	// receives events. Clients that need replay should pass an explicit `startTime`, which
	// Harper services on a separate code path.
	//
	// `options` defaults to `{}` so a subscriber connecting without any options doesn't hit
	// a TypeError here before `super` gets a chance to normalize the request. Not `async`:
	// there is nothing to await, so returning the parent's promise directly avoids a
	// state-machine allocation on every subscription handshake.
	subscribe(options = {}) {
		return super.subscribe(options);
	}
}
