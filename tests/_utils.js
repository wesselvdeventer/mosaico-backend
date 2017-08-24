'use strict'

process.env.TEST  = true

const {
  promisify,
  inspect }         = require( 'util' )
const Nightmare     = require( 'nightmare' )
const realMouse     = require('nightmare-real-mouse')
const child_process = require( 'child_process' )
const exec          = promisify( child_process.exec )
const path          = require( 'path' )
const c             = require( 'chalk' )
const clearRequire  = require( 'clear-require' )

const config        = require('../server/config')
const createServer  = require('../server')
const testDatas     = path.join( __dirname, './sql-test.sqlc' )

const dbTest        = `postgres://localhost:5432/mosaico-backend-test`

// found that it is less prone to errors
realMouse( Nightmare )

////////
// SHARED FUNCTIONNAL THINGS
////////

function createWindow(show = false) {
  return Nightmare({ show })
  // return Nightmare({ show: true })
  .viewport(1280, 780)
}

function connectUser(email = 'p@p.com', password = 'p' ) {
  return nightmare => {
    return nightmare
    .goto( `http://${ config.host }?lang=en` )
    .insert('#email-field', email)
    .insert('#password-field', password)
    .click('form[action*="/login"] [type=submit]')
    .wait(10)
    .wait('.mailing-list')
  }
}

function connectAdmin() {
  return nightmare => {
    return nightmare
    .goto( `http://${ config.host }/admin?lang=en` )
    .insert('#password-field', 'admin')
    .click('form[action*="/login"] [type=submit]')
    .wait(10)
    .wait('.js-admin-home')
  }
}

////////
// DB
////////

//----- SETUP

async function setupDB() {
  const command = `pg_restore --clean --if-exists --dbname=${dbTest} ${testDatas}`
  await exec( command )
  console.log( c.blue('[TEST]'), `DB setup has been done` )
}

async function setupServer() {
  // always run the test server with a clean test db
  const db          = await setupDB()

  // because tests will do many require('../server')() and then server.shutdown()
  // connection will be disabled. Then if a model cached by nodes do any action on DB it will have this error
  // >>  ConnectionManager.getConnection was called after the connection manager was closed
  // so:
  // clean the cache!
  // https://stackoverflow.com/questions/9210542/node-js-require-cache-possible-to-invalidate
  clearRequire.match( /\/server\// )

  // get the server instance so we can stop it at the end of a test
  const server      = await createServer()
  return server
}

//----- TEARDOWN

// while using tape t.plan,
// - calling the last test will end the current test
// - next test will be called
// - BUT we need to wait the server to be shutted
// - AND we need to wait NIGHTMARE to close
// https://github.com/segmentio/nightmare/issues/546

function teardownDBAndNightmare(t, nightmare, server) {
  return function (tapeFinalTest) {
    return function nightmarePromiseCallback(result) {
      nightmare.halt()
      server.shutdown()
      server.on('shutdown', () => tapeFinalTest(result) )
    }
  }
}

function teardownAndError(t, nightmare, server) {
  return function(testError) {
    nightmare.halt()
    server.shutdown()
    server.on('shutdown', () => t.end(testError) )
  }
}

function getTeardownHandlers(t, nightmare, server) {
  return {
    onEnd:    teardownDBAndNightmare(t, nightmare, server),
    onError:  teardownAndError(t, nightmare, server),
  }
}

////////
// EXPORTS
////////

module.exports = {
  createWindow,
  connectUser,
  connectAdmin,
  getTeardownHandlers,
  setupServer,
}
