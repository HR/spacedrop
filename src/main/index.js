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
  { DROP_TYPE, DROP_STATUS } = require('../consts'),
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
   * App events
   *****************************/
  app.on('delete-drops', () => {
    wormholes.clearDrops()
    updateState()
  })

  /**
   * IPC events
   *****************************/
  // When a wormhole is created by user
  ipcMain.on('create-wormhole', createWormholeHandler)
  // When a wormhole is selected by user
  ipcMain.on('activate-wormhole', (e, id) => store.set('state.lastActive', id))
  // When a file is sent by user
  ipcMain.on('drop', dropHandler)
  ipcMain.on('resume-drop', (e, holeId, dropId) => {
    console.log('ipc: Resuming drop', dropId)
    peers.emit('resume-drop', dropId)
    wormholes.updateDrop(holeId, dropId, { status: DROP_STATUS.PROGRESSING })
    updateState()
  })
  ipcMain.on('pause-drop', (e, holeId, dropId) => {
    console.log('ipc: Pausing drop', dropId)
    peers.emit('pause-drop', dropId)
    wormholes.updateDrop(holeId, dropId, { status: DROP_STATUS.PAUSED })
    updateState()
  })
  ipcMain.on('delete-drop', deleteDropHandler)

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
  // When a new progress update for a drop is received
  peers.on('progress', peerDropProgressHandler)

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
    .filter(wormhole => !peers.isConnected(wormhole.id)) // Ignore ones already connecting to
    .forEach(wormhole => peers.connect(wormhole.id))

  /**
   * Handlers
   *****************************/

  /* IPC handlers */
  function updateState (init = false, reset = false) {
    let state = {
      wormholes: wormholes
        .getList()
        .map(w => Object.assign(w, { online: peers.isConnected(w.id) }))
    }
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

  async function dropHandler (event, id, filePath) {
    // Construct message
    let drop = {
      name: basename(filePath),
      timestamp: Date.now()
    }

    // Set the id of the message to its hash
    drop.id = crypto.hash(JSON.stringify(drop))
    console.log('Dropping ', drop, ' to ', id)
    // TODO: Copy media to media dir
    // Optimistically update UI
    wormholes.addDrop(id, drop.id, {
      type: DROP_TYPE.UPLOAD,
      path: filePath,
      ...drop
    })
    updateState()

    // Send the message
    peers.send(drop.id, id, drop, filePath)
  }

  function deleteDropHandler (e, holeId, dropId) {
    console.log('Deleting', holeId, dropId)
    peers.emit('destroy-drop')
    wormholes.deleteDrop(holeId, dropId)
    updateState()
  }

  /* Peers handlers */
  async function peerConnectHandler (userId) {
    console.log('Connected with', userId)

    // New wormhole
    if (!wormholes.has(userId)) {
      wormholes.add(userId, userId.slice(0, 6) + '...')
    }

    // Update UI
    updateState()
  }
  async function peerDisconnectHandler (userId) {
    console.log('Disconnected with', userId)
    // Update UI
    updateState()
  }
  function peerErrorHandler (userId, err) {
    console.log('Error connecting with peer', userId)
    console.error(err)
  }
  async function peerDropHandler (senderId, drop) {
    console.log('Got drop', drop)
    wormholes.addDrop(senderId, drop.id, {
      type: DROP_TYPE.DOWNLOAD,
      ...drop
    })
    updateState()
  }

  function peerDropProgressHandler (receiverId, dropId, progress) {
    // console.log('Got progress', receiverId, dropId, progress)
    wormholes.updateDrop(receiverId, dropId, progress)
    updateState()
  }
})()
