'use strict'
/**
 * Main App
 *****************************/
const { app, Menu, ipcMain, screen } = require('electron'),
  { basename } = require('path'),
  { is } = require('electron-util'),
  debug = require('electron-debug'),
  unhandled = require('electron-unhandled'),
  contextMenu = require('electron-context-menu'),
  packageJson = require('../../package.json'),
  Store = require('electron-store'),
  Crypto = require('./lib/Crypto'),
  Server = require('./lib/Server'),
  Peers = require('./lib/Peers'),
  Wormholes = require('./lib/Wormholes'),
  menu = require('./menu'),
  windows = require('./windows')

unhandled()
debug()
contextMenu()

app.setAppUserModelId(packageJson.build.appId)
let db = 'launch',
  secondWin = false

if (!is.development) {
  // Prevent multiple instances of the app
  if (!app.requestSingleInstanceLock()) {
    app.quit()
  }

  // Someone tried to run a second instance, so focus the main window
  app.on('second-instance', windows.main.secondInstance)
} else {
  // Allow multiple instances of the app in dev
  if (!app.requestSingleInstanceLock()) {
    console.info('Second instance')
    db += '2'
    secondWin = true
  }
}

app.on('window-all-closed', () => {
  if (!is.macos) {
    app.quit()
  }
})

app.on('activate', windows.main.activate)

/**
 * Main
 *****************************/
;(async () => {
  console.log('\n\n\n**********************************************> New run\n')

  await app.whenReady()
  Menu.setApplicationMenu(menu)

  const store = new Store({ name: db })
  const wormholes = new Wormholes(store)
  const crypto = new Crypto(store)
  const server = new Server()
  const peers = new Peers(server, crypto)

  /**
   * Peers events
   *****************************/
  // When a new connection with a user is established
  peers.on('connect', peerConnectHandler)
  // When a connection with a user is closed
  peers.on('disconnect', peerDisconnectHandler)
  // When a connection error with a user occurs
  peers.on('error', peerErrorHandler)
  // When a new message from a user is received
  peers.on('drop', peerDropHandler)

  /**
   * IPC events
   *****************************/
  // When a wormhole is created by user
  ipcMain.on('create-wormhole', createWormholeHandler)
  // When a wormhole is selected by user
  ipcMain.on('activate-wormhole', (event, id) =>
    store.set('state.lastActive', id)
  )
  // When a file is sent by user
  ipcMain.on('drop', dropHandler)

  /**
   * Init
   *****************************/
  // Init crypto and main window
  const [identity] = await Promise.all([crypto.init(), windows.main.init()])
  console.log(identity)

  // TODO: remove in prod
  if (secondWin) {
    const displays = screen.getAllDisplays()
    const display = displays[displays.length - 1]
    console.log(display)
    const { x, y, width, height } = display.bounds
    const win = windows.main.win.getBounds()
    windows.main.win.setPosition(
      Math.round(x + (width - win.width) / 2),
      Math.round(y + (height - win.height) / 2)
    )
  }

  // Populate UI
  updateState(true)
  ipcMain.on('do-update-state', () => updateState(true))

  try {
    // Connect to the signal server
    const authRequest = crypto.generateAuthRequest()
    await server.connect(identity.publicKey, authRequest)
    console.info('Connected to server')
  } catch (error) {
    console.error(error)
    // Notify user of it
    windows.main.send(
      'notify',
      'Failed to connect to the server',
      'error',
      true,
      4000
    )
  }

  // Establish connections with all chat peers
  wormholes
    .getList()
    .filter(wormhole => !peers.has(wormhole.id)) // Ignore ones already connecting to
    .forEach(wormhole => peers.connect(wormhole.id))

  /**
   * Handlers
   *****************************/

  /* Peers handlers */
  async function peerConnectHandler (userId) {
    console.log('Connected with', userId)

    // New wormhole
    if (!wormholes.has(userId)) {
      wormholes.add(userId, userId.slice(0, 6) + '...')
    }

    // Set user as online
    wormholes.setOnline(userId)
    // Update UI
    updateState()
  }
  async function peerDisconnectHandler (userId) {
    console.log('Disconnected with', userId)
    wormholes.setOffline(userId)
    // Update UI
    updateState()
  }
  function peerErrorHandler (userId, err) {
    console.log('Error connecting with peer', userId)
    console.error(err)
  }
  async function peerDropHandler (senderId, drop) {
    console.log('Got drop', drop)
    wormholes.addDrop(senderId, drop)
    updateState()
  }

  /* IPC handlers */
  function updateState (init = false, reset = false) {
    let state = { wormholes: wormholes.getList() }
    let lastActive = store.get('state.lastActive', false)

    if (init) {
      state.identity = identity.publicKey
      state.active = lastActive
    }

    if (!lastActive) {
      lastActive = wormholes.getActive()
      store.set('state.lastActive', lastActive)
      state.active = lastActive
    }

    windows.main.send('update-state', state, reset)
  }

  async function createWormholeHandler (event, id, name) {
    wormholes.add(id, name)
    updateState(false, true)
    // Establish wormhole
    peers.connect(id)
  }

  async function dropHandler (id, contentPath) {
    // Construct message
    let message = {
      sender: identity.publicKey,
      name: basename(contentPath),
      hash: await crypto.hashFile(contentPath),
      timestamp: new Date().toISOString()
    }

    // Set the id of the message to its hash
    message.id = crypto.hash(JSON.stringify(message))
    console.log('Dropping ', message)
    // TODO: Copy media to media dir
    // Optimistically update UI
    wormholes.addDrop(id, { ...message })
    updateState()

    // Send the message
    peers.send(message.id, id, message, contentPath)
  }
})()
