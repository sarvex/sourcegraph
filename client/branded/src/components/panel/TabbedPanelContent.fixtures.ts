import { of } from 'rxjs'

import { NOOP_TELEMETRY_SERVICE } from '@sourcegraph/shared/src/telemetry/telemetryService'

export const panels = [
    {
        id: 'panel_1',
        title: 'Panel 1',
        content: 'Panel 1',
        priority: 3,
        component: null,
        selector: null,
    },
    {
        id: 'panel_2',
        title: 'Panel 2',
        content: 'Panel 2',
        priority: 2,
        component: null,
        selector: null,
    },
    {
        id: 'panel_3',
        title: 'Panel 3',
        content: 'Panel 3',
        priority: 1,
        component: null,
        selector: null,
    },
]

export const panelActions = [
    {
        id: 'a',
        actionItem: {
            label: 'Action A',
            description: 'This is Action A',
        },
        command: 'open',
        commandArguments: ['https://example.com'],
    },
    {
        id: 'b',
        actionItem: {
            label: 'Action B',
            description: 'This is Action B',
        },
        command: 'updateConfiguration',
        commandArguments: [],
    },
]

export const panelMenus = {
    'panel/toolbar': [
        {
            action: 'a',
        },
        {
            action: 'b',
        },
    ],
}

export const panelProps = {
    repoName: 'git://github.com/foo/bar',
    fetchHighlightedFileLineRanges: () => of([]),
    isLightTheme: true,
    platformContext: {} as any,
    settingsCascade: { subjects: null, final: null },
    telemetryService: NOOP_TELEMETRY_SERVICE,
}
