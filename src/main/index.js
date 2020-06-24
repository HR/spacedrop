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
let db = 'launch',
  secondWin = false

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
app.setAppUserModelId(packageJson.build.appId)

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
  const crypto = new Crypto(store)
  const server = new Server()
  const peers = new Peers(server, crypto)
  const wormholes = new Wormholes(store)

  initContextMenu()

  /**
   * App events
   *****************************/
  app.on('will-quit', () => {
    console.log('Clnosing Spacedrop...')
    wormholes.pauseDrops()
  })

  app.on('delete-drops', () => {
    wormholes.clearDrops()
    updateState()
  })

  app.on('create-wormhole', () =>
    windows.main.send('open-modal', 'createWormhole')
  )
  app.on('render-event', event => {
    windows.main.send(event)
  })

  /**
   * Server events
   *****************************/
  server.on('connect', () => {
    openWormholes()
    updateState()
  })
  server.on('disconnect', connected => {
    if (connected === null) {
      notifyError('Failed to connect to the Mothership')
    } else {
      notifyError('Disconnected from the Mothership')
    }
    updateState()
  })
  server.on('error', err => {
    if (err.code !== 'ECONNREFUSED')
      notifyError(`Connection error: ${err.message}`)
  })

  /**
   * IPC events
   *****************************/
  // When a wormhole is created by user
  ipcMain.on('create-wormhole', createWormholeHandler)
  ipcMain.on('edit-wormhole', editWormholeHandler)
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

  let lastActive = store.get('state.lastActive', false)

  if (!lastActive) {
    lastActive = wormholes.getActive()
    store.set('state.lastActive', lastActive)
  }

  // Populate UI
  updateState({ identity: identity.publicKey, active: lastActive })
  ipcMain.on('do-update-state', () =>
    updateState({
      identity: identity.publicKey,
      active: store.get('state.lastActive', '')
    })
  )

  // Establish connection with the Mothership (signalling server)
  connectToMothership()

  /**
   * Handlers
   *****************************/

  function initContextMenu () {
    contextMenu({
      menu: actions => [],
      prepend: (defaultActions, params, browserWindow) => {
        console.log('Params:', params)
        const wormholeId =
          params.linkURL.includes('#wormhole') &&
          params.linkURL.split('#').pop()
        return [
          {
            label: 'Edit wormhole',
            // Only show it when right-clicking text
            visible: wormholeId,
            click: () =>
              windows.main.send(
                'open-modal',
                'editWormhole',
                wormholes.get(wormholeId)
              )
          },
          {
            label: 'Delete wormhole',
            // Only show it when right-clicking text
            visible: wormholeId,
            click: () => {
              // Cancel all pending drops
              wormholes
                .getDropList(wormholeId)
                .filter(drop => drop.status === DROP_STATUS.PENDING)
                .forEach(drop => peers.emit('destroy-drop', drop.id))
              wormholes.delete(wormholeId)
              updateState()
              console.log('Deleted wormhole', wormholeId)
            }
          }
        ]
      }
    })
  }

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
  function updateState (extraState, reset = false) {
    let state = {
      wormholes: wormholes
        .getList()
        .map(w => Object.assign(w, { online: peers.isConnected(w.id) }))
    }
    if (extraState) Object.assign(state, extraState)
    console.log(state)
    windows.main.send('update-state', state, reset)
  }

  function createWormholeHandler (event, id, name) {
    wormholes.add(id, name)
    updateState(null, true)
    // Open wormhole
    peers.connect(id)
  }

  function editWormholeHandler (event, id, name) {
    wormholes.update(id, { name })
    updateState(null, true)
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

    if (!peers.hasTransfer(dropId)) {
      // Re-initiate transfer
      const drop = wormholes.getDrop(holeId, dropId)
      peers.send(dropId, holeId, drop, drop.path)
    } else {
      peers.emit('resume-drop', dropId)
    }

    wormholes.updateDrop(holeId, dropId, { status: DROP_STATUS.PENDING })
    updateState()
  }

  function deleteDropHandler (e, holeId, dropId) {
    console.log('Deleting', holeId, dropId)
    peers.emit('destroy-drop', dropId)
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
