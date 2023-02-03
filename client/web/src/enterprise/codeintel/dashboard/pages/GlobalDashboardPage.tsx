import { Container, ErrorAlert, LoadingSpinner, PageHeader } from '@sourcegraph/wildcard'
import { FunctionComponent } from 'react'
import { useGlobalCodeIntelStatus } from '../hooks/useGlobalCodeIntelStatus'

export interface GlobalDashboardPageProps {
    // TODO
}

export const GlobalDashboardPage: FunctionComponent<GlobalDashboardPageProps> = ({}) => {
    const { data, loading, error } = useGlobalCodeIntelStatus({ variables: {} })

    const repositoryCount = 543 // TODO
    const problemCount = 123 // TODO
    const reposWithFailures = ['r1', 'r2', 'r3'] // TODO
    const reposToConfigure = ['r2', 'r4'] // TODO

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

            <Container className="mb-2">
                <Container className="mb-2">
                    <div className="d-inline p-4 m-4 b-2">
                        <span className="d-inline text-success">{repositoryCount}</span>
                        <span className="text-muted ml-1">Repositories with precise code intelligence</span>
                    </div>
                    <div className="d-inline p-4 m-4 b-2">
                        <span className="d-inline text-danger">{problemCount}</span>
                        <span className="text-muted ml-1">Repositories with problems</span>
                    </div>
                </Container>

                <div>Hello: {data.codeIntelSummary.hello}</div>

                <div className="mt-2 b-2">
                    Repositories with failures:{' '}
                    {reposWithFailures.map(repo => (
                        <>{repo}</>
                    ))}
                </div>
                <div className="mt-2 b-2">
                    Repositories you can configure:{' '}
                    {reposToConfigure.map(repo => (
                        <>{repo}</>
                    ))}
                </div>
            </Container>
        </>
    ) : (
        <></>
    )
}
