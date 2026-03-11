import { Repository, RepositoryConfig } from './types';
import { JsonStoreRepository } from './json-store';

export function createRepository(config: RepositoryConfig = { type: 'json-store' }): Repository {
    switch (config.type) {
        case 'json-store':
            return new JsonStoreRepository();
        default:
            throw new Error(`Unknown repository type: ${(config as RepositoryConfig).type}`);
    }
}

export type { Repository, RepositoryConfig } from './types';
