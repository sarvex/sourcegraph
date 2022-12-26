import * as H from 'history'
import { Renderer } from 'react-dom'

import {
    ExtensionsControllerProps,
    RequiredExtensionsControllerProps,
} from '@sourcegraph/shared/src/extensions/controller'
import { createController as createExtensionsController } from '@sourcegraph/shared/src/extensions/createSyncLoadedController'
import { PlatformContextProps } from '@sourcegraph/shared/src/platform/context'

import { createPlatformContext, SourcegraphIntegrationURLs, BrowserPlatformContext } from '../../platform/context'

import { CodeHost } from './codeHost'

/**
 * Initializes extensions for a page. It creates the {@link PlatformContext} and extensions controller.
 *
 */
export function initializeExtensions(
    { urlToFile }: Pick<CodeHost, 'urlToFile'>,
    urls: SourcegraphIntegrationURLs,
    isExtension: boolean
): { platformContext: BrowserPlatformContext } & ExtensionsControllerProps {
    const platformContext = createPlatformContext({ urlToFile }, urls, isExtension)
    const extensionsController = createExtensionsController(platformContext)
    return { platformContext, extensionsController }
}

interface InjectProps extends PlatformContextProps<'settings' | 'sourcegraphURL'>, RequiredExtensionsControllerProps {
    history: H.History
    render: Renderer
}
