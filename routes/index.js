import { Resource, tables } from 'harper';

export class GetAll extends Resource {
	static get(target) {
		return tables.Topic.search({});
	}
}
