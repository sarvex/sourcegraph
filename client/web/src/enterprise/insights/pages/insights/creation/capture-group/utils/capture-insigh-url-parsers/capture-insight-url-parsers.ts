import { CaptureGroupFormFields } from '../../types'

export type CaptureInsightUrlValues = Omit<CaptureGroupFormFields, 'step' | 'stepValue'>

export function encodeCaptureInsightURL(values: Partial<CaptureInsightUrlValues>): string {
    const parameters = new URLSearchParams()
    const keys = Object.keys(values) as (keyof CaptureInsightUrlValues)[]

    for (const key of keys) {
        const fields = values as CaptureInsightUrlValues

        switch (key) {
            case 'groupSearchQuery': {
                parameters.set(key, encodeURIComponent(fields[key].toString()))
                break
            }
            case 'repositories': {
                parameters.set(key, fields[key].join(','))
                break
            }

            default:
                parameters.set(key, fields[key].toString())
        }
    }

    return parameters.toString()
}

export function decodeCaptureInsightURL(queryParameters: string): Partial<CaptureGroupFormFields> | null {
    try {
        const searchParameter = new URLSearchParams(decodeURIComponent(queryParameters))

        const title = searchParameter.get('title')
        const allRepos = searchParameter.get('allRepos')
        const repositories = searchParameter.get('repositories')?.split(',')
        const groupSearchQuery = decodeURIComponent(searchParameter.get('groupSearchQuery') ?? '')

        if (repositories || title || groupSearchQuery || allRepos) {
            return {
                title: title ?? '',
                repositories: repositories ?? [],
                allRepos: !!allRepos,
                groupSearchQuery: groupSearchQuery ?? '',
            }
        }

        return null
    } catch {
        return null
    }
}
