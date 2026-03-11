import { Repository, RepositoryConfig } from './types';
import { JsonStoreRepository } from './json-store';

// This module is kept as a future database migration seam.
// Mainline routes still use store.ts directly today.
export function createRepository(config: RepositoryConfig = { type: 'json-store' }): Repository {
    switch (config.type) {
        case 'json-store':
            return new JsonStoreRepository();
        default:
            throw new Error(`Unknown repository type: ${(config as RepositoryConfig).type}`);
    }
}

export type { Repository, RepositoryConfig } from './types';
