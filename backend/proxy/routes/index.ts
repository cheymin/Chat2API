/**
 * Proxy Service Module - Route Index
 * Export all routes
 */

import chatRouter from './chat'
import modelsRouter from './models'
import completionsRouter from './completions'
import messagesRouter from './messages'
import imagesRouter from './images'
import videosRouter from './videos'

export {
  chatRouter,
  modelsRouter,
  completionsRouter,
  messagesRouter,
  imagesRouter,
  videosRouter,
}

export default [
  chatRouter,
  modelsRouter,
  completionsRouter,
  messagesRouter,
  imagesRouter,
  videosRouter,
]
