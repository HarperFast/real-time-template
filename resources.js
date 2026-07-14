// Here we can define any JavaScript-based resources and extensions to tables

import { tables } from 'harper';

export class Topic extends tables.Topic {
	// We can define our own custom subscribe handler for doing things like returning previous messages.
	// `subscribe` is an instance method on the exported table (see harper's Table/Resource): the static
	// `Resource.subscribe` is a transactional dispatcher that delegates to `resource.subscribe(query)`,
	// so overriding the instance method is what actually customizes the subscription. Default `options`
	// to `{}` so a subscriber that connects without any options (e.g. no startTime) doesn't crash.
	async subscribe(options = {}) {
		if (!options.startTime) // seed the last five messages when no explicit startTime is requested
			options.previousCount = 5;
		return super.subscribe(options);
	}
}
