import React from 'react'

import { DecoratorFn, Meta } from '@storybook/react'
import * as H from 'history'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { NOOP_PLATFORM_CONTEXT } from '@sourcegraph/shared/src/testing/searchTestHelpers'

import { AppRouterContainer } from '../../components/AppRouterContainer'
import { WebStory } from '../../components/WebStory'

import { ActionItemsBar, useWebActionItems } from './ActionItemsBar'

import webStyles from '../../SourcegraphWebApp.scss'

const LOCATION: H.Location = {
    search: '',
    hash: '',
    pathname: '/github.com/sourcegraph/sourcegraph/-/blob/client/browser/src/browser-extension/ThemeWrapper.tsx',
    key: 'oq2z4k',
    state: undefined,
}

const decorator: DecoratorFn = story => (
    <>
        <style>{webStyles}</style>
        <WebStory>
            {() => (
                <AppRouterContainer>
                    <div className="container mt-3">{story()}</div>
                </AppRouterContainer>
            )}
        </WebStory>
    </>
)

const config: Meta = {
    title: 'web/extensions/ActionItemsBar',
    decorators: [decorator],
    component: ActionItemsBar,
    parameters: {
        chromatic: {
            enableDarkMode: true,
            disableSnapshot: false,
        },
    },
}

export default config

export const Default: React.FunctionComponent<React.PropsWithChildren<unknown>> = () => {
    const { useActionItemsBar } = useWebActionItems()

    return (
        <ActionItemsBar
            repo={undefined}
            location={LOCATION}
            useActionItemsBar={useActionItemsBar}
            platformContext={NOOP_PLATFORM_CONTEXT as any}
            telemetryService={NOOP_TELEMETRY_SERVICE}
        />
    )
}
