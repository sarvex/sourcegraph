import { mdiCheck, mdiClose, mdiFolderOpenOutline, mdiFolderOutline, mdiTimerSand } from '@mdi/js'
import { Timestamp } from '@sourcegraph/branded/src/components/Timestamp'
import { isDefined } from '@sourcegraph/common'
import { AuthenticatedUser } from '@sourcegraph/shared/src/auth'
import {
    Container,
    ErrorAlert,
    Icon,
    Link,
    LoadingSpinner,
    PageHeader,
    Tree,
    TreeNode as WTreeNode,
} from '@sourcegraph/wildcard'
import classNames from 'classnames'
import { FunctionComponent } from 'react'
import { PreciseIndexFields, PreciseIndexState } from '../../../../graphql-operations'
import { useCodeIntelStatus } from '../hooks/useCodeIntelStatus'

import styles from './RepoDashboardPage.module.scss'

export interface RepoDashboardPageProps {
    authenticatedUser: AuthenticatedUser | null
    repo: { id: string; name: string }
}

export const RepoDashboardPage: FunctionComponent<RepoDashboardPageProps> = ({ authenticatedUser, repo }) => {
    const { data, loading, error } = useCodeIntelStatus({ variables: { repository: repo.name } })

    const indexesByIndexerNameByRoot = new Map(
        [
            // Create an outer mapping from root to indexers
            ...groupBy(data?.recentActivity || [], index =>
                sanitize(index.projectRoot?.path || index.inputRoot)
            ).entries(),
        ].map(
            // Create a sub-mapping from indexer to indexes in each bucket
            ([root, indexes]) => [root, groupBy(indexes, index => index.indexer?.name || index.inputIndexer)]
        )
    )

    const availableIndexersByRoot = groupBy(
        // Flatten nested lists of roots grouped by indexers
        (data?.availableIndexers || []).flatMap(({ roots, ...rest }) => roots.map(root => ({ root, ...rest }))),
        // Then re-group by root
        index => sanitize(index.root)
    )

    const treeData = buildTreeData(new Set([...indexesByIndexerNameByRoot.keys(), ...availableIndexersByRoot.keys()]))

    return loading ? (
        <LoadingSpinner />
    ) : error ? (
        <ErrorAlert prefix="Failed to load code intelligence summary for repository" error={error} />
    ) : data ? (
        <>
            <PageHeader
                headingElement="h2"
                path={[
                    {
                        text: <>Code intelligence summary for {repo.name}</>,
                    },
                ]}
                className="mb-3"
            />

            {authenticatedUser?.siteAdmin && repo && (
                <Container className="mb-2">
                    View <Link to="/site-admin/code-graph/dashboard">dashbard</Link> for all repositories.
                </Container>
            )}

            <div>
                <small className="d-block">
                    This repository was scanned for auto-indexing{' '}
                    {data.lastIndexScan ? <Timestamp date={data.lastIndexScan} /> : <>never</>}.
                </small>

                <small className="d-block">
                    The indexes of this repository were last considered for expiration{' '}
                    {data.lastUploadRetentionScan ? <Timestamp date={data.lastUploadRetentionScan} /> : <>never</>}.
                </small>
            </div>

            <div className="mt-2">
                {treeData.length > 0 ? (
                    <Tree
                        data={treeData}
                        defaultExpandedIds={treeData.map(element => element.id)}
                        renderNode={({ element: { name, displayName }, ...props }) => (
                            <TreeNode
                                displayName={displayName}
                                indexesByIndexerNameForRoot={indexesByIndexerNameByRoot.get(name)}
                                availableIndexersForRoot={availableIndexersByRoot.get(name)}
                                {...props}
                            />
                        )}
                    />
                ) : (
                    <>No code intel available.</>
                )}
            </div>
        </>
    ) : (
        <></>
    )
}

interface TreeNodeProps {
    displayName: string
    isBranch: boolean
    isExpanded: boolean
    indexesByIndexerNameForRoot?: Map<string, PreciseIndexFields[]>
    availableIndexersForRoot?: IndexerDescription[]
}

interface TreeNodeWithDisplayName extends WTreeNode {
    displayName: string
}

interface IndexerDescription {
    index: string
    url: string
    root: string
}

const TreeNode: FunctionComponent<TreeNodeProps> = ({
    displayName,
    isBranch,
    isExpanded,
    indexesByIndexerNameForRoot,
    availableIndexersForRoot,
}) => (
    <div className="w-100">
        <div className={classNames('d-inline', !isBranch ? styles.spacer : '')}>
            <Icon
                svgPath={isBranch && isExpanded ? mdiFolderOpenOutline : mdiFolderOutline}
                className={classNames('mr-1', styles.icon)}
                aria-hidden={true}
            />
            {displayName}
        </div>

        {[...(indexesByIndexerNameForRoot?.entries() || [])].sort(byKey).map(([key, value]) => (
            <IndexStateBadge key={key} indexes={value} />
        ))}

        {availableIndexersForRoot?.map(indexer => (
            <ConfigurationStateBadge indexer={indexer} />
        ))}
    </div>
)

interface IndexStateBadgeProps {
    indexes: PreciseIndexFields[]
}

const IndexStateBadge: FunctionComponent<IndexStateBadgeProps> = ({ indexes }) =>
    indexes && indexes.length > 0 ? (
        <Link to={`./indexes/${indexes[0].id}`}>
            <small className={classNames('float-right', 'ml-2', styles.hint)}>
                {indexes.map(index => (
                    <IndexStateBadgeIcon index={index} />
                ))}
                {indexes[0].indexer ? indexes[0].indexer.name : indexes[0].inputIndexer}
            </small>
        </Link>
    ) : (
        <></>
    )

interface IndexStateBadgeIconProps {
    index: PreciseIndexFields
}

const IndexStateBadgeIcon: FunctionComponent<IndexStateBadgeIconProps> = ({ index }) =>
    index.state === PreciseIndexState.COMPLETED ? (
        <Icon aria-hidden={true} svgPath={mdiCheck} className="text-success" />
    ) : index.state === PreciseIndexState.INDEXING ||
      index.state === PreciseIndexState.PROCESSING ||
      index.state === PreciseIndexState.UPLOADING_INDEX ? (
        <LoadingSpinner />
    ) : index.state === PreciseIndexState.QUEUED_FOR_INDEXING ||
      index.state === PreciseIndexState.QUEUED_FOR_PROCESSING ? (
        <Icon aria-hidden={true} svgPath={mdiTimerSand} />
    ) : index.state === PreciseIndexState.INDEXING_ERRORED || index.state === PreciseIndexState.PROCESSING_ERRORED ? (
        <Icon aria-hidden={true} svgPath={mdiClose} className="text-danger" />
    ) : (
        <Icon aria-hidden={true} svgPath={mdiClose} className="text-muted" />
    )

interface ConfigurationStateBadgeProps {
    indexer: IndexerDescription
}

const ConfigurationStateBadge: FunctionComponent<ConfigurationStateBadgeProps> = ({ indexer }) => (
    <small className={classNames('float-right', 'ml-2', styles.hint)}>
        <Icon aria-hidden={true} svgPath={mdiClose} className="text-muted" />{' '}
        <strong>Configure {indexer.index}?</strong>
    </small>
)

// formatTreeData constructs an outline suitable for use with the wildcard <Tree /> component.
// This function constructs a file tree outline with a dummy root node (un-rendered) so that we
// can display explicit data for the root directory. We also attempt to collapse any runs of
// directories that have no data of its own to display and only one child.
function buildTreeData(dataPaths: Set<string>): TreeNodeWithDisplayName[] {
    // Construct a list of paths reachable from the given input paths by sanitizing the input path,
    // exploding the resulting path list into directory segments, constructing all prefixes of the
    // resulting segments, and deduplicating and sorting the result. This gives all ancestor paths
    // of the original input paths in lexicographic (NOTE: topological) order.
    const allPaths = [
        ...new Set(
            [...dataPaths]
                .map(root => sanitize(root).split('/'))
                .flatMap((segments: string[]): string[] => {
                    return segments.map((_, index) => sanitize(segments.slice(0, index + 1).join('/')))
                })
        ),
    ].sort()

    // Assign a stable set of identifiers for each of these paths. We start counting at one here due
    // to needing to have our indexes align with. See inline comments below for more detail.
    const treeIdsByPath = new Map(allPaths.map((name, index) => [name, index + 1]))

    // Build functions we can use to query which paths are direct parents and children of one another
    const { parentOf, childrenOf } = buildTreeQuerier(treeIdsByPath)

    // Build our list of tree nodes
    const nodes = [
        // The first is a synthetic fake node that isn't rendered
        buildNode(0, '', null, childrenOf(undefined)),
        // The remainder of the nodes come from our treeIds (which we started counting at one)
        ...[...treeIdsByPath.entries()]
            .sort(byKey)
            .map(([root, id]) => buildNode(id, root, parentOf(id), childrenOf(id))),
    ]

    // tryUnlink will attempt to unlink the give node from the list of nodes forming a tree.
    // Returns true if a node re-link occurred.
    const tryUnlink = (nodes: TreeNodeWithDisplayName[], nodeId: number): boolean => {
        const node = nodes[nodeId]
        if (nodeId === 0 || node.parent === null || node.children.length !== 1) {
            // Not a candidate - no  unique parent/child to re-link
            return false
        }
        const parentId = node.parent
        const childId = node.children[0]

        // Link parent to child
        nodes[childId].parent = parentId
        // Replace replace node by child in parent
        nodes[parentId].children = nodes[parentId].children.map(id => (id === nodeId ? childId : id))
        // Move (prepend) text from node to child
        nodes[childId].displayName = nodes[nodeId].displayName + nodes[childId].displayName

        return true
    }

    const unlinkedIds = new Set(
        nodes
            // Attempt to unlink/collapse all paths that do not have data
            .filter(node => !dataPaths.has(node.name) && tryUnlink(nodes, node.id))
            // Return node for organ harvesting :screamcat:
            .map(node => node.id)
    )

    return (
        nodes
            // Remove each of the roots we've marked for skipping in the loop above
            .filter((_, index) => !unlinkedIds.has(index))
            // Remap each of the identifiers. We just collapse numbers so the sequence remains gap-less.
            // For some reason the wildcard <Tree /> component is a big stickler for having id and indexes align.
            .map(node => rewriteNodeIds(node, id => id - [...unlinkedIds].filter(v => v < id).length))
    )
}

interface TreeQuerier {
    parentOf: (id: number) => number
    childrenOf: (id: number | undefined) => number[]
}

// Return a pair of functions that can return the immediate parents and children of paths given tree identifiers.
function buildTreeQuerier(idsByPath: Map<string, number>): TreeQuerier {
    // Construct a map from identifiers of paths to the identifier of their immediate parent path
    const parentTreeIdByTreeId = new Map(
        [...idsByPath.entries()].map(([path, id]) => [
            id,
            [...idsByPath.keys()]
                // Filter out any non-ancestor directories
                // (NOTE: paths here guaranteed to start with slash)
                .filter(child =>
                    // Trim trailing slash and split each input (covers the `/` case)
                    checkSubset(child.replace(/(\/)$/, '').split('/'), path.replace(/(\/)$/, '').split('/'))
                )
                .sort((a, b) => b.length - a.length) // Sort by reverse length (most specific proper ancestor first)
                .map(key => idsByPath.get(key))[0], // Take the first element as its associated identifier
        ])
    )

    return {
        // Return parent identifier of entry (or zero if undefined)
        parentOf: id => parentTreeIdByTreeId.get(id) || 0,
        // Return identifiers of entries that declare their own parent as the target
        childrenOf: id => keysMatchingPredicate(parentTreeIdByTreeId, parentId => parentId === id),
    }
}

// Strip leading/trailing slashes and add a single leading slash
function sanitize(root: string): string {
    return `/${root.replaceAll(/(^\/+)|(\/+$)/g, '')}`
}

// Return true if the given slices for a proper (pairwise) subset < superset relation
function checkSubset(subset: string[], superset: string[]): boolean {
    return subset.length < superset.length && subset.filter((value, index) => value !== superset[index]).length === 0
}

// Compare two flattened Map<string, T> entries by key.
function byKey<T>(a: [string, T], b: [string, T]): number {
    return a[0].localeCompare(b[0])
}

// Group values together based on the given function
function groupBy<V, K>(values: V[], f: (value: V) => K): Map<K, V[]> {
    return values.reduce((acc, val) => acc.set(f(val), (acc.get(f(val)) || []).concat([val])), new Map<K, V[]>())
}

// Return the list of keys for the associated vlalues for which the given predicate returned true.
function keysMatchingPredicate<K, V>(m: Map<K, V>, f: (value: V) => boolean): K[] {
    return [...m.entries()].map(([k, v]): K | undefined => (f(v) ? k : undefined)).filter(isDefined)
}

// Create a node with a default display name based on name (a filepath in this case)
function buildNode(id: number, name: string, parent: number | null, children: number[]): TreeNodeWithDisplayName {
    return { id, name, parent, children, displayName: `${name.split('/').reverse()[0]}/` }
}

// Rewrite the identifiers in each of the given tree node's fields.
function rewriteNodeIds({ id, parent, children, ...rest }: TreeNodeWithDisplayName, rewriteId: (id: number) => number) {
    return {
        id: rewriteId(id),
        parent: parent !== null ? rewriteId(parent) : null,
        children: children.map(rewriteId).sort(),
        ...rest,
    }
}
