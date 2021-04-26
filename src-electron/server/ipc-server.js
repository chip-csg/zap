/**
 *
 *    Copyright (c) 2020 Silicon Labs
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

const ipc = require('node-ipc')
const env = require('../util/env.js')
const path = require('path')
const uiUtil = require('../ui/ui-util.js')
const util = require('../util/util.js')
const watchdog = require('../main-process/watchdog.js')
const httpServer = require('../server/http-server.js')

const serverIpc = new ipc.IPC()

const eventType = {
  ping: 'ping', // Receiver responds with pong, returning the object.
  pong: 'pong', // Return of the ping data, no response required.
  over: 'over', // Sent from server to client as an intermediate printout.
  overAndOut: 'overAndOut', // Sent from server to client as a final answer.
  version: 'version', // Sent from client to server to query version.
  new: 'new', // Sent from client to server to request new configuration
  open: 'open', // Sent from client to server with array of files to open
  convert: 'convert', // Sent from client to server when requesting to convert files
  generate: 'generate', // Sent from client to server when requesting generation.
  serverUrl: 'serverUrl', // Sent from client to ask for server URL
}

/**
 * Returns the socket path for the IPC.
 */
function socketPath() {
  return path.join(env.appDirectory(), 'main.ipc')
}

function log(msg) {
  env.logIpc(`Ipc server: ${msg}`)
}

function handlerPing(data, socket) {
  serverIpc.server.emit(socket, eventType.pong, data)
}

function handlerServerUrl(data, socket) {
  serverIpc.server.emit(
    socket,
    eventType.overAndOut,
    httpServer.httpServerStartupMessage()
  )
}

function handlerVersion(data, socket) {
  let ret = env.zapVersion()
  ret.url = httpServer.httpServerUrl()
  serverIpc.server.emit(socket, eventType.overAndOut, ret)
}

function handlerNew(data, socket, httpPort) {
  if (httpPort != null) {
    uiUtil.openNewConfiguration(httpPort)
    serverIpc.server.emit(socket, eventType.overAndOut)
  }
}

function handlerOpen(zapFileArray, socket, httpPort) {
  return util
    .executePromisesSequentially(zapFileArray, (f) =>
      uiUtil.openFileConfiguration(f, httpPort)
    )
    .then(() => {
      serverIpc.server.emit(socket, eventType.overAndOut)
    })
}

function handlerConvert(data, socket) {
  let zapFiles = data.files

  serverIpc.server.emit(socket, eventType.over, 'Convert')
  zapFiles.forEach((element) => {
    serverIpc.server.emit(socket, eventType.over, `File: ${element}`)
  })
  serverIpc.server.emit(socket, eventType.overAndOut, 'Done.')
}

function handlerGenerate(data, socket) {}

const handlers = [
  {
    eventType: eventType.ping,
    handler: handlerPing,
  },
  {
    eventType: eventType.serverUrl,
    handler: handlerServerUrl,
  },
  {
    eventType: eventType.version,
    handler: handlerVersion,
  },
  {
    eventType: eventType.new,
    handler: handlerNew,
  },
  {
    eventType: eventType.open,
    handler: handlerOpen,
  },
  {
    eventType: eventType.convert,
    handler: handlerConvert,
  },
  {
    eventType: eventType.generate,
    handler: handlerGenerate,
  },
]

/**
 * Runs just before every time IPC request is processed.
 */
function preHandler() {
  watchdog.reset()
}

/**
 * IPC initialization.
 *
 * @parem {*} isServer 'true' if this is a server, 'false' for client.
 * @param {*} options
 */
function initServer(db = null, httpPort = null) {
  return new Promise((resolve, reject) => {
    serverIpc.config.logger = log
    serverIpc.config.id = 'main'

    serverIpc.serve(socketPath(), () => {
      env.logIpc('IPC server started.')
      serverIpc.serverStarted = true

      // Register top-level handlers
      serverIpc.server.on('error', (err) => {
        env.logIpc('IPC error', err)
      })
      serverIpc.server.on('connect', () => {
        env.logIpc('New connection.')
        watchdog.reset()
      })
      serverIpc.server.on('destroy', () => {
        env.logIpc('IPC server destroyed.')
      })

      // Register individual type handlers
      handlers.forEach((handlerRecord) => {
        serverIpc.server.on(handlerRecord.eventType, (data, socket) => {
          preHandler()
          handlerRecord.handler(data, socket, httpPort)
        })
      })
      resolve()
    })
    serverIpc.server.start()
  })
}

/**
 * Returns true if server is running.
 *
 * @returns true if server is running.
 */
function isServerRunning() {
  return serverIpc.serverStarted === true
}

/**
 * Shuts down the IPC server.
 *
 * @param {*} isServer
 */
function shutdownServerSync() {
  env.logIpc('Shutting down the server.')
  if (serverIpc.server) serverIpc.server.stop()
  else env.logIpc('There is no server.')
}

exports.socketPath = socketPath
exports.initServer = initServer
exports.shutdownServerSync = shutdownServerSync
exports.isServerRunning = isServerRunning
exports.eventType = eventType