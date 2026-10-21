// raiz de composição: único lugar q liga os adapters de saída (WebHID, demo) na UI
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DemoChannel } from './adapters/demo/demoChannel'
import { App } from './adapters/ui/App'
import { WebHidChannel, hasWebHid } from './adapters/webhid/webHidChannel'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App
      webHid={hasWebHid(navigator)}
      openDevice={() => WebHidChannel.request(navigator.hid)}
      openDemo={() => new DemoChannel()}
    />
  </StrictMode>,
)
