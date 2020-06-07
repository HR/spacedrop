'use strict'
/**
 * Main App
 *****************************/
const { app, Menu, ipcMain } = require('electron'),
  { basename } = require('path'),
  { is } = require('electron-util'),
  unhandled = require('electron-unhandled'),
  contextMenu = require('electron-context-menu'),
  packageJson = require('../../package.json'),
  Crypto = require('./lib/Crypto'),
  Server = require('./lib/Server'),
  Peers = require('./lib/Peers'),
  menu = require('./menu'),
  windows = require('./windows')

unhandled()
// debug()
contextMenu()

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

  let transfers = {}
  const crypto = new Crypto()
  const server = new Server()
  const peers = new Peers(server, crypto)

  /**
   * Server events
   *****************************/
  // When a new file is offered by user
  server.on('file-offer', chatRequestHandler)
  // When the file offer is answered by another user
  server.on('file-answer', chatAcceptHandler)
  // When the user for a message cannot be found
  server.on('unknown-receiver', receiverNotFoundHandler)

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

  // Populate UI
  windows.main.send('update-state', {
    transfers
  })
  ipcMain.on('do-update-state', async () =>
    windows.main.send('update-state', {
      transfers
    })
  )

  try {
    // Connect to the signal server
    await server.connect()
    console.log('Connected to server')
  } catch (error) {
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
  async function chatRequestHandler ({ senderPublicKey: publicKeyArmored }) {
    console.log('Chat request received')
    // TODO: Check id against block/removed list and add to chats
    const { id, address } = await crypto.getPublicKeyInfoOf(publicKeyArmored)
    if (!chats.has(id)) {
      // Add chat if not already added
      await chats.add(id, publicKeyArmored, address)
      await crypto.addKey(id, publicKeyArmored)
      windows.main.send('update-state', { chats: chats.getAll() })
    }
    // Accept chat request by default
    server.send('chat-accept', {
      senderPublicKey: crypto.getPublicKey(),
      receiverId: id
    })
    console.log('Chat request accepted')
  }
  async function chatAcceptHandler ({ senderId, senderPublicKey }) {
    console.log('Chat request accepted')
    const { address } = await crypto.getPublicKeyInfoOf(senderPublicKey)
    // Add chat
    await chats.add(senderId, senderPublicKey, address)
    await crypto.addKey(senderId, senderPublicKey)
    // Update UI
    windows.main.send(
      'update-state',
      { chats: chats.getAll(), activeChatId: senderId },
      true
    )
    // Establish a connection
    peers.connect(senderId)
  }
  function receiverNotFoundHandler ({ type }) {
    if (type === 'chat-request') {
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
    windows.main.send('update-state', { chats: chats.getAll() })
  }
  async function peerDisconnectHandler (userId) {
    console.log('Disconnected with', userId)
    chats.setOffline(userId)
    // Update UI
    windows.main.send('update-state', { chats: chats.getAll() })
  }
  function peerErrorHandler (userId, err) {
    console.log('Error connecting with peer', userId)
    console.error(err)
  }
  async function peerMessageHandler (senderId, message) {
    console.log('Got message', message)
    chats.addMessage(senderId, message)
    windows.main.send('update-state', { chats: chats.getAll() })
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
    windows.main.send('update-state', { chats: chats.getAll() })

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
