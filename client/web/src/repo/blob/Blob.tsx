import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import classNames from 'classnames'
import * as H from 'history'
import { isEqual } from 'lodash'
import { BehaviorSubject, fromEvent, ReplaySubject, Subject } from 'rxjs'
import { filter, mapTo, switchMap, tap, withLatestFrom } from 'rxjs/operators'
import useDeepCompareEffect from 'use-deep-compare-effect'

import { getCodeElementsInRange, HoveredToken, locateTarget } from '@sourcegraph/codeintellify'
import {
    isErrorLike,
    isDefined,
    LineOrPositionOrRange,
    toPositionOrRangeQueryParameter,
    addLineRangeQueryParameter,
    formatSearchParameters,
} from '@sourcegraph/common'
import { PlatformContextProps } from '@sourcegraph/shared/src/platform/context'
import { Settings, SettingsCascadeProps } from '@sourcegraph/shared/src/settings/settings'
import { TelemetryProps } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { ThemeProps } from '@sourcegraph/shared/src/theme'
import { codeCopiedEvent } from '@sourcegraph/shared/src/tracking/event-log-creators'
import {
    AbsoluteRepoFile,
    FileSpec,
    ModeSpec,
    UIPositionSpec,
    RepoSpec,
    ResolvedRevisionSpec,
    RevisionSpec,
    parseQueryAndHash,
} from '@sourcegraph/shared/src/util/url'
import { Code, useObservable } from '@sourcegraph/wildcard'

import { BlobStencilFields, ExternalLinkFields, Scalars } from '../../graphql-operations'
import { BlameHunk } from '../blame/useBlameHunks'
import { HoverThresholdProps } from '../RepoContainer'

import { BlameColumn } from './BlameColumn'

import styles from './Blob.module.scss'

// Logical grouping of props that are only used by the CodeMirror blob view
// implementation.
interface CodeMirrorBlobProps {
    overrideBrowserSearchKeybinding?: boolean
}

export interface BlobProps
    extends SettingsCascadeProps,
        PlatformContextProps,
        TelemetryProps,
        HoverThresholdProps,
        ThemeProps,
        CodeMirrorBlobProps {
    location: H.Location
    history: H.History
    className: string
    wrapCode: boolean
    /** The current text document to be rendered and provided to extensions */
    blobInfo: BlobInfo
    'data-testid'?: string

    // When navigateToLineOnAnyClick=true, the code intel popover is disabled
    // and clicking on any line should navigate to that specific line.
    navigateToLineOnAnyClick?: boolean

    // Enables experimental navigation by rendering links for all interactive tokens.
    enableLinkDrivenCodeNavigation?: boolean
    // Enables experimental navigation by making interactive tokens selectable on click.
    enableSelectionDrivenCodeNavigation?: boolean

    // If set, nav is called when a user clicks on a token highlighted by
    // WebHoverOverlay
    nav?: (url: string) => void
    role?: string
    ariaLabel?: string

    supportsFindImplementations?: boolean

    isBlameVisible?: boolean
    blameHunks?: { current: BlameHunk[] | undefined; firstCommitDate: Date | undefined }
}

export interface BlobInfo extends AbsoluteRepoFile, ModeSpec {
    /** The raw content of the blob. */
    content: string

    /** The trusted syntax-highlighted code as HTML */
    html: string

    /** LSIF syntax-highlighting data */
    lsif?: string

    stencil?: BlobStencilFields[]

    /** If present, the file is stored in Git LFS (large file storage). */
    lfs?: { byteSize: Scalars['BigInt'] } | null

    /** External URLs for the file */
    externalURLs?: ExternalLinkFields[]
}

const domFunctions = {
    getCodeElementFromTarget: (target: HTMLElement): HTMLTableCellElement | null => {
        // If the target is part of the line decoration attachment, return null.
        if (
            target.hasAttribute('data-line-decoration-attachment') ||
            target.hasAttribute('data-line-decoration-attachment-content')
        ) {
            return null
        }

        const row = target.closest('tr')
        if (!row) {
            return null
        }
        return row.querySelector('td.code')
    },
    getCodeElementFromLineNumber: (codeView: HTMLElement, line: number): HTMLTableCellElement | null => {
        const table = codeView.firstElementChild as HTMLTableElement
        const row = table.rows[line - 1]
        if (!row) {
            return null
        }
        return row.querySelector('td.code')
    },
    getLineNumberFromCodeElement: (codeCell: HTMLElement): number => {
        const row = codeCell.closest('tr')
        if (!row) {
            throw new Error('Could not find closest row for codeCell')
        }
        const numberCell = row.querySelector<HTMLTableCellElement>('td.line')
        if (!numberCell || !numberCell.dataset.line) {
            throw new Error('Could not find line number')
        }
        return parseInt(numberCell.dataset.line, 10)
    },
}

/**
 * Renders a code view augmented by Sourcegraph extensions
 */
export const Blob: React.FunctionComponent<React.PropsWithChildren<BlobProps>> = props => {
    const { location, isLightTheme, blobInfo, settingsCascade, role, ariaLabel, 'data-testid': dataTestId } = props

    const settingsChanges = useMemo(() => new BehaviorSubject<Settings | null>(null), [])
    useEffect(() => {
        if (
            settingsCascade.final &&
            !isErrorLike(settingsCascade.final) &&
            (!settingsChanges.value || !isEqual(settingsChanges.value, settingsCascade.final))
        ) {
            settingsChanges.next(settingsCascade.final)
        }
    }, [settingsCascade, settingsChanges])

    // Element reference subjects passed to `hoverifier`
    const blobElements = useMemo(() => new ReplaySubject<HTMLElement | null>(1), [])
    const nextBlobElement = useCallback(
        (blobElement: HTMLElement | null) => blobElements.next(blobElement),
        [blobElements]
    )

    const codeViewElements = useMemo(() => new ReplaySubject<HTMLElement | null>(1), [])
    const codeViewReference = useRef<HTMLElement | null>()
    const nextCodeViewElement = useCallback(
        (codeView: HTMLElement | null) => {
            codeViewReference.current = codeView
            codeViewElements.next(codeView)
        },
        // We dangerousSetInnerHTML and modify the <code> element.
        // We need to listen to blobInfo to ensure that we correctly
        // respond whenever this element updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [codeViewElements, blobInfo.html]
    )

    // Emits on changes from URL search params
    const urlSearchParameters = useMemo(() => new ReplaySubject<URLSearchParams>(1), [])
    const nextUrlSearchParameters = useCallback(
        (value: URLSearchParams) => urlSearchParameters.next(value),
        [urlSearchParameters]
    )
    useEffect(() => {
        nextUrlSearchParameters(new URLSearchParams(location.search))
    }, [nextUrlSearchParameters, location.search])

    // Emits on position changes from URL hash
    const locationPositions = useMemo(() => new ReplaySubject<LineOrPositionOrRange>(1), [])
    const nextLocationPosition = useCallback(
        (lineOrPositionOrRange: LineOrPositionOrRange) => locationPositions.next(lineOrPositionOrRange),
        [locationPositions]
    )
    const parsedHash = useMemo(
        () => parseQueryAndHash(location.search, location.hash),
        [location.search, location.hash]
    )
    useDeepCompareEffect(() => {
        nextLocationPosition(parsedHash)
    }, [parsedHash])

    // Subject that emits on every render. Source for `hoverOverlayRerenders`, used to
    // reposition hover overlay if needed when `Blob` rerenders
    const rerenders = useMemo(() => new ReplaySubject(1), [])
    useEffect(() => {
        rerenders.next()
    })

    const popoverCloses = useMemo(() => new Subject<void>(), [])

    useObservable(
        useMemo(
            () =>
                popoverCloses.pipe(
                    withLatestFrom(urlSearchParameters),
                    tap(([, parameters]) => {
                        parameters.delete('popover')
                        updateBrowserHistoryIfChanged(props.history, location, parameters)
                    })
                ),
            [location, popoverCloses, props.history, urlSearchParameters]
        )
    )

    const customHistoryAction = props.nav
    // Update URL when clicking on a line (which will trigger the line highlighting defined below)
    useObservable(
        useMemo(
            () =>
                codeViewElements.pipe(
                    filter(isDefined),
                    switchMap(codeView => fromEvent<MouseEvent>(codeView, 'click')),
                    // Ignore click events caused by the user selecting text
                    filter(() => !window.getSelection()?.toString()),
                    tap(event => {
                        // Prevent selecting text on shift click (click+drag to select will still work)
                        // Note that this is only called if the selection was empty initially (see above),
                        // so this only clears a selection caused by this click.
                        window.getSelection()!.removeAllRanges()

                        const position = locateTarget(event.target as HTMLElement, domFunctions)
                        if (!position) {
                            return
                        }

                        const query = toPositionOrRangeQueryParameter({ position })

                        // Replace the current history entry instead of adding a new one if the
                        // newly selected line is within 10 lines of the currently selected one. If
                        // the current position is a range a new entry will always be added.
                        const currentPosition = parseQueryAndHash(location.search, location.hash)
                        const replace = Boolean(
                            currentPosition.line &&
                                !currentPosition.endLine &&
                                Math.abs(position.line - currentPosition.line) < 11
                        )

                        const parameters = new URLSearchParams(location.search)
                        parameters.delete('popover')

                        const isClickOnBlankSpace = !('character' in position)
                        if (isClickOnBlankSpace || props.navigateToLineOnAnyClick) {
                            if (customHistoryAction) {
                                const entry: H.LocationDescriptor<unknown> = {
                                    ...location,
                                    search: formatSearchParameters(addLineRangeQueryParameter(parameters, query)),
                                }
                                customHistoryAction(props.history.createHref(entry))
                            } else {
                                updateBrowserHistoryIfChanged(
                                    props.history,
                                    location,
                                    addLineRangeQueryParameter(parameters, query),
                                    replace
                                )
                            }
                        }
                    }),
                    mapTo(undefined)
                ),
            [codeViewElements, location, props.navigateToLineOnAnyClick, props.history, customHistoryAction]
        )
    )

    // Line highlighting when position in hash changes
    useEffect(() => {
        if (codeViewReference.current) {
            const codeCells = getCodeElementsInRange({
                codeView: codeViewReference.current,
                position: parsedHash,
                getCodeElementFromLineNumber: domFunctions.getCodeElementFromLineNumber,
            })
            // Remove existing highlighting
            for (const selected of codeViewReference.current.querySelectorAll('.selected')) {
                selected.classList.remove('selected')
            }
            for (const { element } of codeCells) {
                // Highlight row
                const row = element.parentElement as HTMLTableRowElement
                row.classList.add('selected')
            }
        }
        // It looks like `parsedHash` is updated _before_ `blobInfo` when
        // navigating between files. That means we have to make this effect
        // dependent on `blobInfo` even if it is not used inside the effect,
        // otherwise the highlighting would not be updated when the new file
        // content is available.
    }, [parsedHash, blobInfo])
    // TODO

    // Add top and bottom spacers to improve code readability.
    // TODO
    useEffect(() => {
        const subscription = codeViewElements.subscribe(codeView => {
            if (codeView) {
                const table = codeView.firstElementChild as HTMLTableElement
                const firstRow = table.rows[0]
                const lastRow = table.rows[table.rows.length - 1]

                if (firstRow) {
                    for (const cell of firstRow.cells) {
                        if (!cell.querySelector('.top-spacer')) {
                            const spacer = document.createElement('div')
                            spacer.classList.add('top-spacer')
                            cell.prepend(spacer)
                        }
                    }
                }

                if (lastRow) {
                    for (const cell of lastRow.cells) {
                        if (!cell.querySelector('.bottom-spacer')) {
                            const spacer = document.createElement('div')
                            spacer.classList.add('bottom-spacer')
                            cell.append(spacer)
                        }
                    }
                }
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [codeViewElements])

    // Add the `.clickable-row` CSS class to all rows to give visual hints that they're clickable.
    useLayoutEffect(() => {
        if (!props.navigateToLineOnAnyClick) {
            return
        }

        const subscription = codeViewElements.subscribe(codeView => {
            if (codeView) {
                const table = codeView.firstElementChild as HTMLTableElement
                for (const row of table.rows) {
                    if (row.cells.length === 0) {
                        continue
                    }
                    row.className = styles.clickableRow
                }
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [codeViewElements, props.navigateToLineOnAnyClick])

    const logEventOnCopy = useCallback(() => {
        props.telemetryService.log(...codeCopiedEvent('blob'))
    }, [props.telemetryService])

    return (
        <>
            <div
                data-testid={dataTestId}
                className={classNames(props.className, styles.blob)}
                ref={nextBlobElement}
                tabIndex={-1}
                role={role}
                aria-label={ariaLabel}
            >
                <Code
                    className={classNames('test-blob', styles.blobCode, props.wrapCode && styles.blobCodeWrapped)}
                    ref={nextCodeViewElement}
                    onCopy={logEventOnCopy}
                    dangerouslySetInnerHTML={{
                        __html: blobInfo.html,
                    }}
                />
                <BlameColumn
                    isBlameVisible={props.isBlameVisible}
                    blameHunks={props.blameHunks}
                    codeViewElements={codeViewElements}
                    history={props.history}
                    isLightTheme={isLightTheme}
                />
            </div>
        </>
    )
}

/**
 * Adds an entry to the browser history only if new search parameters differ
 * from the current ones. This prevents adding a new entry when e.g. the user
 * clicks the same line multiple times.
 */
export function updateBrowserHistoryIfChanged(
    history: H.History,
    location: H.Location,
    newSearchParameters: URLSearchParams,
    /** If set to true replace the current history entry instead of adding a new one. */
    replace: boolean = false
): void {
    const currentSearchParameters = [...new URLSearchParams(location.search).entries()]

    // Update history if the number of search params changes or if any parameter
    // value changes. This will also work for file position changes, which are
    // encoded as parameter without a value. The old file position will be a
    // non-existing key in the new search parameters and thus return `null`
    // (whereas it returns an empty string in the current search parameters).
    const needsUpdate =
        currentSearchParameters.length !== [...newSearchParameters.keys()].length ||
        currentSearchParameters.some(([key, value]) => newSearchParameters.get(key) !== value)

    if (needsUpdate) {
        const entry = {
            ...location,
            search: formatSearchParameters(newSearchParameters),
        }
        if (replace) {
            history.replace(entry)
        } else {
            history.push(entry)
        }
    }
}

export function getLSPTextDocumentPositionParameters(
    position: HoveredToken & RepoSpec & RevisionSpec & FileSpec & ResolvedRevisionSpec,
    mode: string
): RepoSpec & RevisionSpec & ResolvedRevisionSpec & FileSpec & UIPositionSpec & ModeSpec {
    return {
        repoName: position.repoName,
        filePath: position.filePath,
        commitID: position.commitID,
        revision: position.revision,
        mode,
        position,
    }
}
