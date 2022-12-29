// For search-related extension API features, such as query transformers

import { Remote } from 'comlink'
import { from, Observable, of, TimeoutError } from 'rxjs'
import { catchError, filter, first, switchMap, timeout } from 'rxjs/operators'

import { logger } from '@sourcegraph/common'

import { FlatExtensionHostAPI } from '../contract'
import { SharedEventLogger } from '../sharedEventLogger'

import { wrapRemoteObservable } from './api/common'

const TRANSFORM_QUERY_TIMEOUT = 3000

/**
 * Executes search query transformers contributed by Sourcegraph extensions.
 */
export function transformSearchQuery({
    query,
    extensionHostAPIPromise,
    eventLogger,
}: {
    query: string
    extensionHostAPIPromise: null | Promise<Remote<FlatExtensionHostAPI>>
    eventLogger: SharedEventLogger
}): Observable<string> {
    if (extensionHostAPIPromise === null) {
        return of(query)
    }

    return from(extensionHostAPIPromise).pipe(
        switchMap(extensionHostAPI =>
            // Since we won't re-compute on subsequent extension activation, ensure that
            // at least the initial set of extensions, which should include always-activated
            // query-transforming extensions, have been loaded to ensure that the initial
            // search query is transformed
            wrapRemoteObservable(extensionHostAPI.haveInitialExtensionsLoaded()).pipe(
                filter(haveLoaded => haveLoaded),
                first(), // Ensure that it only emits once
                switchMap(() =>
                    wrapRemoteObservable(extensionHostAPI.transformSearchQuery(query)).pipe(
                        first() // Ensure that it only emits once
                    )
                )
            )
        ),
        // Timeout: if this is hanging due to any sort of extension bug, it may not result in a thrown error,
        // but will degrade search UX.
        // Wait up to 5 seconds and log to console for users to debug slow query transformer extensions
        timeout(TRANSFORM_QUERY_TIMEOUT),
        catchError(error => {
            if (error instanceof TimeoutError) {
                logger.error(`Extension query transformers took more than ${TRANSFORM_QUERY_TIMEOUT}ms`)
            }
            return of(query)
        })
    )
}
