import { Container, ErrorAlert, LoadingSpinner, PageHeader } from '@sourcegraph/wildcard'
import { FunctionComponent } from 'react'
import { useGlobalCodeIntelStatus } from '../hooks/useGlobalCodeIntelStatus'

export interface GlobalDashboardPageProps {
    // TODO
}

export const GlobalDashboardPage: FunctionComponent<GlobalDashboardPageProps> = ({}) => {
    const { data, loading, error } = useGlobalCodeIntelStatus({ variables: {} })

    return loading ? (
        <LoadingSpinner />
    ) : error ? (
        <ErrorAlert prefix="Failed to load code intelligence summary" error={error} />
    ) : data ? (
        <>
            <PageHeader
                headingElement="h2"
                path={[
                    {
                        text: <>Code intelligence summary</>,
                    },
                ]}
                className="mb-3"
            />

            <Container className="mt-2">Number of repositories with code intel</Container>

            <Container className="mt-2">List of recent failures</Container>

            <Container className="mt-2">List of heavy use repos with their suggestions</Container>
        </>
    ) : (
        <></>
    )
}
