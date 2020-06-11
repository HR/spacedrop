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

  let identity,
    wormholes = [
      {
        id: 'j9348jr3948rjlknwkendkkmkewdmkd',
        name: 'Alice',
        online: true,
        drops: [
          {
            name: 'lo_fi.mp3',
            type: '↓',
            path: '/tmp/lo_fi.mp3',
            progress: 20040192,
            total: 440401920,
            rate: 2097152,
            done: false
          }
        ]
      },
      {
        id: 'jl348jr3938rjlknwkendkkmkewdmkd',
        name: 'Bob',
        online: true,
        drops: [
          {
            name: 'matrix.exe',
            type: '↑',
            path: '/tmp/lo_fi.mp3',
            progress: 89040192,
            total: 540401920,
            rate: 1097152,
            done: false
          },
          {
            name: 'bro.pdf',
            type: '↓',
            path: '/tmp/lo_fi.mp3',
            progress: 89040192,
            total: 540401920,
            rate: 3097152,
            done: true
          }
        ]
      }
    ]
  wormholes = []
  const store = new Store({ name: db })
  const crypto = new Crypto()
  const server = new Server()
  const peers = new Peers(server, crypto)

  identity = store.get('identity', false)
  if (!identity) {
    identity = crypto.generateIdentity()
    // TODO: Store private key in keychain or encrypt store (with key in keychain)
    store.set('identity', identity)
  }
  console.log('Idenity key:', identity)
  crypto.setIdentity(identity)

  /**
   * Server events
   *****************************/
  // When the formation of new wormhole is requested to another user
  server.on('wormhole-request', wormholeRequestHandler)
  // When the other user accepts a wormhole formation, hence they curve the
  // fabric of space/time to form one!
  server.on('wormhole-accept', wormholeAcceptHandler)
  // When the other user cannot be found, request got lost in space :(
  server.on('lost-in-space', notFoundHandler)

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
  peers.on('message', peerMessageHandler)

  /**
   * IPC events
   *****************************/
  // When a file is sent by the user
  ipcMain.on('send-file', sendFileHandler)

  /**
   * Init
   *****************************/
  // Init main window
  await windows.main.init()
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
  windows.main.send('update-state', {
    wormholes,
    active: (wormholes.length && wormholes[0].id) || '',
    identity: identity.publicKey
  })
  ipcMain.on('do-update-state', async () =>
    windows.main.send('update-state', {
      wormholes,
      active: (wormholes.length && wormholes[0].id) || '',
      identity: identity.publicKey
    })
  )

  try {
    // Connect to the signal server
    const authRequest = crypto.generateAuthRequest()
    console.log('Connecting with', authRequest)
    await server.connect(identity.publicKey, authRequest)
    console.log('Connected to server')
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

  /**
   * Handlers
   *****************************/

  /* Server handlers */
  async function wormholeRequestHandler ({ senderPublicKey: publicKeyArmored }) {
    console.log('Chat request received')
    // TODO: Check id against block/removed list and add to chats
    const { id, address } = await crypto.getPublicKeyInfoOf(publicKeyArmored)
    if (!chats.has(id)) {
      // Add chat if not already added
      await chats.add(id, publicKeyArmored, address)
      await crypto.addKey(id, publicKeyArmored)
      // windows.main.send('update-state', { chats: chats.getAll() })
    }
    // Accept chat request by default
    server.send('womhole-accept', {
      senderPublicKey: crypto.getPublicKey(),
      receiverId: id
    })
    console.log('Chat request accepted')
  }
  async function wormholeAcceptHandler ({ senderId, senderPublicKey }) {
    console.log('Chat request accepted')
    const { address } = await crypto.getPublicKeyInfoOf(senderPublicKey)
    // Add chat
    await chats.add(senderId, senderPublicKey, address)
    await crypto.addKey(senderId, senderPublicKey)
    // Update UI
    // Establish a connection
    peers.connect(senderId)
  }
  function notFoundHandler ({ type }) {
    if (type === 'wormhole-request') {
      windows.main.send(
        'notify',
        'Recipient not on Spacedrop or is offline',
        'error',
        true,
        4000
      )
    }
  }

  /* Peers handlers */
  async function peerConnectHandler (userId) {
    console.log('Connected with', userId)
    // Set user as online
    chats.setOnline(userId)
    // Update UI
    // windows.main.send('update-state', { chats: chats.getAll() })
  }
  async function peerDisconnectHandler (userId) {
    console.log('Disconnected with', userId)
    chats.setOffline(userId)
    // Update UI
    // windows.main.send('update-state', { chats: chats.getAll() })
  }
  function peerErrorHandler (userId, err) {
    console.log('Error connecting with peer', userId)
    console.error(err)
  }
  async function peerMessageHandler (senderId, message) {
    console.log('Got message', message)
    chats.addMessage(senderId, message)
    // windows.main.send('update-state', { chats: chats.getAll() })
  }

  /* IPC handlers */
  async function sendFileHandler (contentType, content, receiverId) {
    // Construct message
    let contentPath
    let message = {
      sender: profile.id,
      content,
      contentType, // mime-type of message
      timestamp: new Date().toISOString()
    }

    // Set the id of the message to its hash
    message.id = crypto.hash(JSON.stringify(message))
    console.log('Adding message', message)
    // TODO: Copy media to media dir
    // Optimistically update UI
    chats.addMessage(receiverId, { ...message })
    // windows.main.send('update-state', { chats: chats.getAll() })

    if (
      contentType === CONTENT_TYPES.IMAGE ||
      contentType === CONTENT_TYPES.FILE
    ) {
      contentPath = content
      // Set to file name
      message.content = basename(contentPath)
      // Hash content for verification
      message.contentHash = await crypto.hashFile(contentPath)
    }

    // Send the message
    peers.send(message.id, receiverId, message, true, contentPath)
  }
})()
