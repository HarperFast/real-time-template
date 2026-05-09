import { Resource, tables } from 'harper';

export class GetAll extends Resource {
	async get() {
		return tables.Topic.list();
	}
}
