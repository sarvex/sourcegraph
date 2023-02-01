import { ApolloError } from '@apollo/client'

import { useQuery } from '@sourcegraph/http-client'

import {
    CodeIntelStatus2Result,
    CodeIntelStatus2Variables,
    InferedPreciseSupportLevel,
    InferredAvailableIndexersFields,
    PreciseIndexFields,
    PreciseSupportFields,
    SearchBasedCodeIntelSupportFields,
} from '../../../../graphql-operations'

import { codeIntelStatusQuery } from './queries'

export interface UseCodeIntelStatus2Parameters {
    variables: CodeIntelStatus2Variables
}

export interface UseCodeIntelStatusResult {
    data?: UseCodeIntelStatusPayload
    error?: ApolloError
    loading: boolean
}

export interface UseCodeIntelStatusPayload {
    lastIndexScan?: string
    lastUploadRetentionScan?: string
    availableIndexers: InferredAvailableIndexersFields[]
    recentActivity: PreciseIndexFields[]
    preciseSupport?: (PreciseSupportFields & { confidence?: InferedPreciseSupportLevel })[]
    searchBasedSupport?: SearchBasedCodeIntelSupportFields[]
}

export const useCodeIntelStatus = ({ variables }: UseCodeIntelStatus2Parameters): UseCodeIntelStatusResult => {
    const {
        data: rawData,
        error,
        loading,
    } = useQuery<CodeIntelStatus2Result, CodeIntelStatus2Variables>(codeIntelStatusQuery, {
        variables,
        notifyOnNetworkStatusChange: false,
        fetchPolicy: 'no-cache',
    })

    const repo = rawData?.repository
    const path = repo?.commit?.path
    if (!repo || !path) {
        return { loading, error }
    }

    const summary = repo.codeIntelSummary
    const common: Omit<UseCodeIntelStatusPayload, 'preciseSupport' | 'searchBasedSupport'> = {
        availableIndexers: summary.availableIndexers,
        lastIndexScan: summary.lastIndexScan || undefined,
        lastUploadRetentionScan: summary.lastUploadRetentionScan || undefined,
        recentActivity: summary.recentActivity,
    }

    switch (path?.__typename) {
        case 'GitTree': {
            const info = path.codeIntelInfo
            return {
                data: info
                    ? {
                          ...common,
                          searchBasedSupport: (info.searchBasedSupport || []).map(wrapper => wrapper.support),
                          preciseSupport: (info.preciseSupport || []).map(wrapper => ({
                              ...wrapper.support,
                              confidence: wrapper.confidence,
                          })),
                      }
                    : undefined,
                error,
                loading,
            }
        }

        default:
            return { data: undefined, error, loading }
    }
}
