import { Meta, Story } from '@storybook/react'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/shared/src/telemetry/telemetryService'

import { WebStory } from '../../../../../../components/WebStory'
import { useCodeInsightsState } from '../../../../../../stores'
import { CodeInsightsBackendContext, CodeInsightsGqlBackend } from '../../../../core'

import { IntroCreationPage } from './IntroCreationPage'

const config: Meta = {
    title: 'web/insights/creation-ui/IntroPage',
    decorators: [story => <WebStory>{() => story()}</WebStory>],
    parameters: {
        chromatic: {
            viewports: [576, 978, 1440],
            disableSnapshot: false,
        },
    },
}

export default config

const API = new CodeInsightsGqlBackend({} as any)

export const IntroPageLicensed: Story = () => {
    useCodeInsightsState.setState({ licensed: true, insightsLimit: null })

    return (
        <CodeInsightsBackendContext.Provider value={API}>
            <IntroCreationPage telemetryService={NOOP_TELEMETRY_SERVICE} />
        </CodeInsightsBackendContext.Provider>
    )
}

export const IntroPageUnLicensed: Story = () => {
    useCodeInsightsState.setState({ licensed: false, insightsLimit: 2 })

    return (
        <CodeInsightsBackendContext.Provider value={API}>
            <IntroCreationPage telemetryService={NOOP_TELEMETRY_SERVICE} />
        </CodeInsightsBackendContext.Provider>
    )
}
