import { RepoLink } from '@sourcegraph/shared/src/components/RepoLink'
import { Badge, Container, ErrorAlert, LoadingSpinner, PageHeader } from '@sourcegraph/wildcard'
import { FunctionComponent } from 'react'
import { ExternalRepositoryIcon } from '../../../../site-admin/components/ExternalRepositoryIcon'
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

            <Container className="mb-2">
                <Container className="mb-2">
                    <div className="d-inline p-4 m-4 b-2">
                        <span className="d-inline text-success">
                            {data.codeIntelSummary.numRepositoriesWithCodeIntelligence}
                        </span>
                        <span className="text-muted ml-1">Repositories with precise code intelligence</span>
                    </div>
                    <div className="d-inline p-4 m-4 b-2">
                        <span className="d-inline text-danger">
                            {data.codeIntelSummary.repositoriesWithErrors.length}
                        </span>
                        <span className="text-muted ml-1">Repositories with problems</span>
                    </div>
                </Container>

                {data.codeIntelSummary.repositoriesWithErrors.length > 0 && (
                    <Container className="mb-2">
                        <span>Repositories with failures:</span>

                        <ul className="list-group p2">
                            {data.codeIntelSummary.repositoriesWithErrors.map(repo => (
                                <li key={repo.name} className="list-group-item">
                                    {repo.externalRepository && (
                                        <ExternalRepositoryIcon externalRepo={repo.externalRepository} />
                                    )}
                                    <RepoLink repoName={repo.name} to={`${repo.url}/-/code-graph/dashboard`} />

                                    <Badge variant="danger" className="ml-2" small={true} pill={true}>
                                        TODO
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    </Container>
                )}

                {/* TODO - guard by size */}
                <div className="mt-2 b-2">
                    <span>Configurable repositories:</span>

                    <ul className="list-group p2">
                        {new Array<{
                            name: string
                            url: string
                            externalRepository: {
                                serviceID: string
                                serviceType: string
                            } | null
                        }>().map(repo => (
                            <li key={repo.name} className="list-group-item">
                                {repo.externalRepository && (
                                    <ExternalRepositoryIcon externalRepo={repo.externalRepository} />
                                )}
                                <RepoLink repoName={repo.name} to={`${repo.url}/-/code-graph/dashboard`} />

                                <Badge variant="danger" className="ml-2" small={true} pill={true}>
                                    TODO
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </div>
            </Container>
        </>
    ) : (
        <></>
    )
}
