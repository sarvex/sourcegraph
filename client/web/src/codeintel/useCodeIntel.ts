import { useEffect, useRef, useState } from 'react'

import { QueryResult } from '@apollo/client'

import { ErrorLike } from '@sourcegraph/common'
import { dataOrThrowErrors, useLazyQuery, useQuery } from '@sourcegraph/http-client'

import { ConnectionQueryArguments } from '../components/FilteredConnection'
import { asGraphQLResult } from '../components/FilteredConnection/utils'
import {
    UsePreciseCodeIntelForPositionVariables,
    UsePreciseCodeIntelForPositionResult,
    LoadAdditionalReferencesResult,
    LoadAdditionalReferencesVariables,
    LoadAdditionalImplementationsResult,
    LoadAdditionalImplementationsVariables,
} from '../graphql-operations'

import { LanguageSpec } from './language-specs/languagespec'
import { Location, buildPreciseLocation } from './location'
import {
    LOAD_ADDITIONAL_IMPLEMENTATIONS_QUERY,
    LOAD_ADDITIONAL_REFERENCES_QUERY,
    USE_PRECISE_CODE_INTEL_FOR_POSITION_QUERY,
} from './ReferencesPanelQueries'
import { SettingsGetter } from './settings'
import { useSearchBasedCodeIntel } from './useSearchBasedCodeIntel'

interface CodeIntelData {
    references: {
        endCursor: string | null
        nodes: Location[]
    }
    implementations: {
        endCursor: string | null
        nodes: Location[]
    }
    definitions: {
        endCursor: string | null
        nodes: Location[]
    }
}

export interface UseCodeIntelResult {
    data?: CodeIntelData
    error?: ErrorLike
    loading: boolean

    referencesHasNextPage: boolean
    fetchMoreReferences: () => void
    fetchMoreReferencesLoading: boolean

    implementationsHasNextPage: boolean
    fetchMoreImplementations: () => void
    fetchMoreImplementationsLoading: boolean
}

interface UseCodeIntelParameters {
    variables: UsePreciseCodeIntelForPositionVariables & ConnectionQueryArguments
    searchToken: string
    spec: LanguageSpec
    fileContent: string
    repoIsFork: boolean
    repoIsArchived: boolean
    getSetting: SettingsGetter
}

export const useCodeIntel = ({
    variables,
    searchToken,
    spec,
    fileContent,
    repoIsFork,
    repoIsArchived,
    getSetting,
}: UseCodeIntelParameters): UseCodeIntelResult => {
    const [codeIntelData, setCodeIntelData] = useState<CodeIntelData>()

    const fellBackToSearchBased = useRef(false)
    const shouldFetchPrecise = useRef(true)
    useEffect(() => {
        // We need to fetch again if the variables change
        shouldFetchPrecise.current = true
    }, [
        variables.repository,
        variables.commit,
        variables.path,
        variables.line,
        variables.character,
        variables.filter,
        variables.firstReferences,
        variables.firstImplementations,
    ])

    const handleSearchBasedReferences = (references: Location[]): void => {
        setCodeIntelData(previousData => ({
            ...(previousData || {
                implementations: { endCursor: null, nodes: [] },
                definitions: { endCursor: null, nodes: [] },
            }),
            references: {
                endCursor: null,
                nodes: references,
            },
        }))
    }

    const handleSearchBasedDefinitions = (definitions: Location[]): void => {
        setCodeIntelData(previousData => ({
            ...(previousData || {
                implementations: { endCursor: null, nodes: [] },
                references: { endCursor: null, nodes: [] },
            }),
            definitions: {
                endCursor: null,
                nodes: definitions,
            },
        }))
    }

    const {
        loading: searchBasedLoading,
        error: searchBasedError,
        fetch: fetchSearchBasedCodeIntel,
    } = useSearchBasedCodeIntel({
        repo: variables.repository,
        commit: variables.commit,
        path: variables.path,
        searchToken,
        fileContent,
        spec,
        isFork: repoIsFork,
        isArchived: repoIsArchived,
        getSetting,
    })

    const { error, loading } = useQuery<
        UsePreciseCodeIntelForPositionResult,
        UsePreciseCodeIntelForPositionVariables & ConnectionQueryArguments
    >(USE_PRECISE_CODE_INTEL_FOR_POSITION_QUERY, {
        variables,
        notifyOnNetworkStatusChange: false,
        fetchPolicy: 'no-cache',
        skip: !shouldFetchPrecise,
        onCompleted: result => {
            if (shouldFetchPrecise.current) {
                shouldFetchPrecise.current = false

                const lsifData = result ? getLsifData({ data: result }) : undefined
                if (lsifData) {
                    setCodeIntelData(lsifData)
                } else {
                    console.info('No LSIF data. Falling back to search-based code intelligence.')
                    fellBackToSearchBased.current = true

                    fetchSearchBasedCodeIntel(handleSearchBasedReferences, handleSearchBasedDefinitions)
                }
            }
        },
    })

    const [fetchAdditionalReferences, additionalReferencesResult] = useLazyQuery<
        LoadAdditionalReferencesResult,
        LoadAdditionalReferencesVariables & ConnectionQueryArguments
    >(LOAD_ADDITIONAL_REFERENCES_QUERY, {
        fetchPolicy: 'no-cache',
        onCompleted: result => {
            const previousData = codeIntelData

            const newReferenceData = result.repository?.commit?.blob?.lsif?.references

            if (!previousData || !newReferenceData) {
                return
            }

            setCodeIntelData({
                implementations: previousData.implementations,
                definitions: previousData.definitions,
                references: {
                    endCursor: newReferenceData.pageInfo.endCursor,
                    nodes: [...previousData.references.nodes, ...newReferenceData.nodes.map(buildPreciseLocation)],
                },
            })
        },
    })

    const [fetchAdditionalImplementations, additionalImplementationsResult] = useLazyQuery<
        LoadAdditionalImplementationsResult,
        LoadAdditionalImplementationsVariables & ConnectionQueryArguments
    >(LOAD_ADDITIONAL_IMPLEMENTATIONS_QUERY, {
        fetchPolicy: 'no-cache',
        onCompleted: result => {
            const previousData = codeIntelData

            const newImplementationsData = result.repository?.commit?.blob?.lsif?.implementations

            if (!previousData || !newImplementationsData) {
                return
            }

            setCodeIntelData({
                references: previousData.references,
                definitions: previousData.definitions,
                implementations: {
                    endCursor: newImplementationsData.pageInfo.endCursor,
                    nodes: [
                        ...previousData.implementations.nodes,
                        ...newImplementationsData.nodes.map(buildPreciseLocation),
                    ],
                },
            })
        },
    })

    const fetchMoreReferences = (): void => {
        const cursor = codeIntelData?.references.endCursor || null

        if (cursor !== null) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            fetchAdditionalReferences({
                variables: {
                    ...variables,
                    ...{ afterReferences: cursor },
                },
            })
        }
    }

    const fetchMoreImplementations = (): void => {
        const cursor = codeIntelData?.implementations.endCursor || null

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        fetchAdditionalImplementations({
            variables: {
                ...variables,
                ...{ afterImplementations: cursor },
            },
        })
    }

    const combinedLoading = loading || (fellBackToSearchBased.current && searchBasedLoading)

    const combinedError = error || searchBasedError

    return {
        data: codeIntelData,
        loading: combinedLoading,

        error: combinedError,

        fetchMoreReferences,
        fetchMoreReferencesLoading: additionalReferencesResult.loading,
        referencesHasNextPage: codeIntelData ? codeIntelData.references.endCursor !== null : false,

        fetchMoreImplementations,
        implementationsHasNextPage: codeIntelData ? codeIntelData.implementations.endCursor !== null : false,
        fetchMoreImplementationsLoading: additionalImplementationsResult.loading,
    }
}

const getLsifData = ({
    data,
    error,
}: Pick<QueryResult<UsePreciseCodeIntelForPositionResult>, 'data' | 'error'>): CodeIntelData | undefined => {
    const result = asGraphQLResult({ data, errors: error?.graphQLErrors || [] })

    const extractedData = dataOrThrowErrors(result)

    // If there weren't any errors and we just didn't receive any data
    if (!extractedData || !extractedData.repository?.commit?.blob?.lsif) {
        return undefined
    }

    const lsif = extractedData.repository?.commit?.blob?.lsif

    return {
        implementations: {
            endCursor: lsif.implementations.pageInfo.endCursor,
            nodes: lsif.implementations.nodes.map(buildPreciseLocation),
        },
        references: {
            endCursor: lsif.references.pageInfo.endCursor,
            nodes: lsif.references.nodes.map(buildPreciseLocation),
        },
        definitions: {
            endCursor: lsif.definitions.pageInfo.endCursor,
            nodes: lsif.definitions.nodes.map(buildPreciseLocation),
        },
    }
}
