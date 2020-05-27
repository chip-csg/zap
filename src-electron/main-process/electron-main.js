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

import { app } from 'electron'
import { version } from '../../package.json'
import { closeDatabase, initDatabase, loadSchema } from '../db/db-api.js'
import { initHttpServer } from '../server/http-server.js'
import { loadZcl } from '../zcl/zcl-loader.js'
import {
  httpPort,
  processCommandLineArguments,
  zclPropertiesFile,
} from './args.js'
import {
  logError,
  logInfo,
  logInitLogFile,
  logInitStdout,
  mainDatabase,
  schemaFile,
  setDevelopmentEnv,
  setMainDatabase,
  setProductionEnv,
  sqliteFile,
} from '../util/env.js'
import { initializeElectronUi, windowCreateIfNotThere } from './window.js'

logInitLogFile()

if (process.env.DEV) {
  setDevelopmentEnv()
} else {
  setProductionEnv()
}

function attachToDb(db) {
  return new Promise((resolve, reject) => {
    setMainDatabase(db)
    resolve(db)
  })
}

function startSelfCheck() {
  logInitStdout()
  logInfo('Starting self-check')
  initDatabase(sqliteFile())
    .then((db) => attachToDb(db))
    .then((db) => loadSchema(db, schemaFile(), version))
    .then((db) => loadZcl(db, zclPropertiesFile))
    .then(() => {
      logInfo('Self-check done!')
    })
    .catch((err) => {
      logError(err)
      throw err
    })
}

function startNormal(ui, showUrl) {
  initDatabase(sqliteFile())
    .then((db) => attachToDb(db))
    .then((db) => loadSchema(db, schemaFile(), version))
    .then((db) => loadZcl(db, zclPropertiesFile))
    .then((db) => initHttpServer(db, httpPort))
    .then(() => {
      if (ui) {
        initializeElectronUi(httpPort)
      } else {
        if (app.dock) {
          app.dock.hide()
        }
        if (showUrl) {
          console.log(`http://localhost:${httpPort}/index.html`)
        }
      }
    })
    .catch((err) => {
      logError(err)
      throw err
    })
}

app.on('ready', () => {
  var argv = processCommandLineArguments(process.argv)

  logInfo(argv)

  if (argv._.includes('selfCheck')) {
    startSelfCheck()
  } else {
    startNormal(!argv.noUi, argv.showUrl)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  logInfo('Activate...')
  windowCreateIfNotThere(httpPort)
})

app.on('quit', () => {
  closeDatabase(mainDatabase()).then(() =>
    logInfo('Database closed, shutting down.')
  )
})