import React, { useMemo, useRef } from 'react'

import classNames from 'classnames'
import { identity } from 'lodash'
import { from } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'

import { Contributions } from '@sourcegraph/client-api'
import { useObservable } from '@sourcegraph/wildcard'

import { wrapRemoteObservable } from '../api/client/api/common'
import { getContributedActionItems } from '../contributions/contributions'
import { TelemetryProps } from '../telemetry/telemetryService'

import { ActionItem, ActionItemProps } from './ActionItem'
import { ActionsProps } from './ActionsContainer'

import styles from './ActionsNavItems.module.scss'

export interface ActionNavItemsClassProps {
    /**
     * CSS class name for one action item (`<button>` or `<a>`)
     */
    actionItemClass?: string

    /**
     * Additional CSS class name when the action item is a toogle in its enabled state.
     */
    actionItemPressedClass?: string

    actionItemIconClass?: string

    /**
     * CSS class name for each `<li>` element wrapping the action item.
     */
    listItemClass?: string
}

export interface ActionsNavItemsProps
    extends ActionsProps,
        ActionNavItemsClassProps,
        TelemetryProps,
        Pick<ActionItemProps, 'showLoadingSpinnerDuringExecution' | 'actionItemStyleProps'> {
    /**
     * If true, it renders a `<ul className="nav">...</ul>` around the items. If there are no items, it renders `null`.
     *
     * If falsey (the default behavior), it emits a fragment of just the `<li>`s.
     */
    wrapInList?: boolean
    /**
     * Only applied if `wrapInList` is `true`
     */

    listClass?: string

    /**
     * Transform function called when latest contributions from extensions are received.
     * Likely temporary: quick fix to dedup panel actions from various code intel extensions.
     */
    transformContributions?: (contributions: Contributions) => Contributions
}

/**
 * Renders the actions as a fragment of <li class="nav-item"> elements, for use in with <ul
 * class="nav"> or <ul class="navbar-nav">.
 */
export const ActionsNavItems: React.FunctionComponent<React.PropsWithChildren<ActionsNavItemsProps>> = props => {
    const { extensionsController, menu, wrapInList, transformContributions = identity } = props

    const contributions = useObservable(
        useMemo(
            () =>
                from(extensionsController.extHostAPI).pipe(
                    switchMap(extensionHostAPI => wrapRemoteObservable(extensionHostAPI.getContributions({}))),
                    map(transformContributions)
                ),
            [extensionsController, transformContributions]
        )
    )

    const actionItems = useRef<JSX.Element[] | null>(null)

    if (!contributions) {
        // Show last known list while loading, or empty if nothing has been loaded yet
        return <>{actionItems.current}</>
    }

    actionItems.current = getContributedActionItems(contributions, menu).map(item => (
        <React.Fragment key={item.action.id}>
            {' '}
            <li className={props.listItemClass}>
                <ActionItem
                    key={item.action.id}
                    {...item}
                    {...props}
                    variant="actionItem"
                    iconClassName={props.actionItemIconClass}
                    className={classNames(styles.actionItem, props.actionItemClass)}
                    pressedClassName={props.actionItemPressedClass}
                    actionItemStyleProps={props.actionItemStyleProps}
                />
            </li>
        </React.Fragment>
    ))

    if (wrapInList) {
        return actionItems.current.length > 0 ? <ul className={props.listClass}>{actionItems.current}</ul> : null
    }
    return <>{actionItems.current}</>
}
