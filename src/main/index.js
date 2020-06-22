'use strict'
/**
 * Main App
 *****************************/
const { app, Menu, ipcMain, screen } = require('electron'),
  { basename } = require('path'),
  { is, openNewGitHubIssue, debugInfo } = require('electron-util'),
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

unhandled({
  reportButton: error => {
    openNewGitHubIssue({
      user: 'hr',
      repo: 'spacedrop',
      body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`
    })
  }
})
debug()
contextMenu()

app.setAppUserModelId(packageJson.build.appId)
let db = 'launch',
  secondWin = false,
  wormholes

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

app.on('will-quit', () => {
  console.log('Closing Spacedrop...')
  wormholes.pauseDrops()
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
  const crypto = new Crypto(store)
  const server = new Server()
  const peers = new Peers(server, crypto)
  wormholes = new Wormholes(store)

  /**
   * App events
   *****************************/
  app.on('delete-drops', () => {
    wormholes.clearDrops()
    updateState()
  })

  /**
   * Server events
   *****************************/
  server.on('connect', () => {
    openWormholes()
    updateState()
  })
  server.on('disconnect', () => {
    notifyError('Disconnected from the Mothership')
    updateState()
  })
  server.on('error', () => {
    notifyError('Failed to connect to the Mothership')
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
  ipcMain.on('resume-drop', resumeDropHandler)
  ipcMain.on('pause-drop', pauseDropHandler)
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
  // Failed to send a drop
  peers.on('send-error', peerDropSendFailHandler)
  // Failed to receive a drop
  peers.on('receive-error', peerDropReceiveFailHandler)

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

  // Establish connection with the Mothership (signalling server)
  connectToMothership()

  /**
   * Handlers
   *****************************/

  function notifyError (message) {
    windows.main.send('notify', message, 'error', true, 4000)
  }

  async function connectToMothership () {
    const authRequest = crypto.generateAuthRequest()
    server.connect(identity.publicKey, authRequest)
    console.info('Connected to server')
  }

  function openWormholes () {
    wormholes
      .getList()
      .filter(wormhole => !peers.isConnected(wormhole.id)) // Ignore ones already connecting to
      .forEach(wormhole => peers.connect(wormhole.id))
  }

  /* IPC handlers */
  function updateState (init = false, reset = false) {
    let state = {
      online: server.isConnected(),
      wormholes: wormholes
        .getList()
        .map(w => Object.assign(w, { online: peers.isConnected(w.id) }))
    }
    let lastActive = store.get('state.lastActive', false)

    console.log(state)
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

  function createWormholeHandler (event, id, name) {
    wormholes.add(id, name)
    updateState(false, true)
    // Establish wormhole
    peers.connect(id)
  }

  async function dropHandler (event, id, filePath) {
    if (!peers.isConnected(id)) return notifyError('Wormhole closed (offline)')
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

  function peerDropSendFailHandler (dropId) {
    const wId = wormholes.findIdByDropId(dropId)
    const drop = wormholes.updateDrop(wId, dropId, {
      status: DROP_STATUS.FAILED
    })
    notifyError(`Failed to send ${drop.name} :(`)
    updateState()
  }

  function peerDropReceiveFailHandler (dropId) {
    const wId = wormholes.findIdByDropId(dropId)
    const drop = wormholes.updateDrop(wId, dropId, {
      status: DROP_STATUS.FAILED
    })
    notifyError(`Failed to receive ${drop.name} :(`)
    updateState()
  }

  function pauseDropHandler (e, holeId, dropId) {
    peers.emit('pause-drop', dropId)
    wormholes.updateDrop(holeId, dropId, { status: DROP_STATUS.PAUSED })
    updateState()
  }

  function resumeDropHandler (e, holeId, dropId) {
    if (!peers.isConnected(holeId))
      return notifyError('Wormhole closed (offline)')
    peers.emit('resume-drop', dropId)
    wormholes.updateDrop(holeId, dropId, { status: DROP_STATUS.PENDING })
    updateState()
  }

  function deleteDropHandler (e, holeId, dropId) {
    console.log('Deleting', holeId, dropId)
    peers.emit('destroy-drop')
    wormholes.deleteDrop(holeId, dropId)
    updateState()
  }

  /* Peers handlers */
  function peerConnectHandler (userId) {
    console.log('Connected with', userId)

    // New wormhole
    if (!wormholes.has(userId)) {
      wormholes.add(userId, userId.slice(0, 6) + '...')
    }

    // Update UI
    updateState()
  }
  function peerDisconnectHandler (userId) {
    console.log('Disconnected with', userId)
    // Update UI
    updateState()
  }
  function peerErrorHandler (userId, err) {
    console.log('Error connecting with peer', userId)
    console.error(err)
  }
  function peerDropHandler (senderId, drop) {
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
