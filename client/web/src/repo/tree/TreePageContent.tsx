import React from 'react'

import classNames from 'classnames'
import * as H from 'history'

import { TreeFields } from '@sourcegraph/shared/src/graphql-operations'
import { PlatformContextProps } from '@sourcegraph/shared/src/platform/context'
import { TelemetryProps } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { Heading } from '@sourcegraph/wildcard'

import { TreePageRepositoryFields } from '../../graphql-operations'

import { TreeCommits } from './commits/TreeCommits'
import { TreeEntriesSection } from './TreeEntriesSection'

import styles from './TreePage.module.scss'

interface TreePageContentProps extends TelemetryProps, PlatformContextProps {
    filePath: string
    tree: TreeFields
    repo: TreePageRepositoryFields
    commitID: string
    location: H.Location
    revision: string
}

export const TreePageContent: React.FunctionComponent<React.PropsWithChildren<TreePageContentProps>> = ({
    filePath,
    tree,
    repo,
    commitID,
    revision,
    ...props
}) => (
    <>
        <section className={classNames('test-tree-entries mb-3', styles.section)}>
            <Heading as="h3" styleAs="h2">
                Files and directories
            </Heading>
            <TreeEntriesSection parentPath={filePath} entries={tree.entries} />
        </section>
        <TreeCommits repo={repo} commitID={commitID} filePath={filePath} className={styles.section} />
    </>
)
