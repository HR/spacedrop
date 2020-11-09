'use strict'
/**
 * Peers class
 * Manages peer connections and communication
 */

const stream = require('stream'),
  EventEmitter = require('events'),
  path = require('path'),
  util = require('util'),
  fs = require('fs'),
  brake = require('brake'),
  wrtc = require('wrtc'),
  moment = require('moment'),
  progress = require('progress-stream'),
  Peer = require('./simple-peer'),
  Queue = require('./Queue'),
  { DROPS_DIR } = require('../../config'),
  // http://viblast.com/blog/2015/2/5/webrtc-data-channel-message-size/
  DROP_CHUNK_SIZE = 16 * 1024, // (16kb)
  DROP_STREAM_RATE = 50, // ms
  DROP_STAT_INTERVAL = 800 // ms

const { mkdir, stat } = fs.promises
const pipeline = util.promisify(stream.pipeline)

module.exports = class Peers extends EventEmitter {
  constructor (signal, crypto) {
    // Ensure singleton
    if (!!Peers.instance) {
      return Peers.instance
    }

    // Call EventEmitter constructor
    super()

    this._peers = {}
    this._requests = {}
    this._transfers = []
    this._signal = signal
    this._crypto = crypto
    this._sendingQueue = new Queue()
    this._receivingQueue = new Queue()

    // Bindings
    this._addPeer = this._addPeer.bind(this)
    this._onSignalRequest = this._onSignalRequest.bind(this)
    this._onSignalAccept = this._onSignalAccept.bind(this)
    this._onSignal = this._onSignal.bind(this)
    this._onSignalReceiverOffline = this._onSignalReceiverOffline.bind(this)

    // Add queue event listeners
    this._sendingQueue.on('error', (...args) =>
      this.emit('send-error', ...args)
    )
    this._receivingQueue.on('error', (...args) =>
      this.emit('receive-error', ...args)
    )

    // Add signal event listeners
    this._signal.on('signal-request', this._onSignalRequest)
    this._signal.on('signal-accept', this._onSignalAccept)
    this._signal.on('signal', this._onSignal)
    this._signal.on('not-found', this._onSignalReceiverOffline)

    Peers.instance = this
  }

  // Connects to given peer
  connect (userId) {
    // Start connection
    const signalRequest = (this._requests[userId] = {
      receiverId: userId,
      timestamp: new Date().toISOString()
    })
    // Send a signal request to peer
    this._signal.send('signal-request', signalRequest)
    console.log('Connecting with', userId)
  }

  // Disconnects from given peer
  disconnect (userId) {
    this._removePeer(userId)
    console.log('Disconnected from', userId)
  }

  // Checks if given peer is connected
  isConnected (id) {
    return this._peers.hasOwnProperty(id)
  }

  // Checks if transfer is in progress
  hasTransfer (id) {
    return this._transfers.includes(id)
  }

  // Queues a chat message to be sent to given peer
  send (dropId, ...args) {
    this._sendingQueue.add(() => this._sendFile(...args), dropId)
  }

  // Handles signal requests
  _onSignalRequest ({ senderId, timestamp }) {
    console.log('Signal request received')

    const request = this._requests[senderId]
    // If a request to the sender has not already been sent then just accept it
    // Add receiver to receive signal
    if (!request) {
      this._addReceiver(senderId)
      this._signal.send('signal-accept', { receiverId: senderId })
      console.log('Signal request not sent to sender so accepted')
      return
    }

    // Parse request times
    const requestTime = moment(request.timestamp)
    const receivedRequestTime = moment(timestamp)

    // If received request was sent before own request then accept it
    // Add receiver to receive signal and forget own request
    // Avoids race condition when both peers send signal-requests
    if (receivedRequestTime.isBefore(requestTime)) {
      this._addReceiver(senderId)
      this._signal.send('signal-accept', { receiverId: senderId })
      delete this._requests[senderId]
      console.log('Signal request sent before own so accepted')
    }

    // Otherwise don't do anything (wait for signal-accept as the sender)
  }

  // Handles accepted signal requests
  _onSignalAccept ({ senderId }) {
    console.log('Signal request accepted')
    // Start signalling
    this._addSender(senderId)
    delete this._requests[senderId]
  }

  // Handles new signals
  _onSignal ({ senderId, data }) {
    // Ensure peer to signal exists
    if (!this._peers[senderId]) {
      throw new Error(`Peer ${senderId} not yet added`)
    }

    this._peers[senderId].signal(data)
  }

  // Handles offline receivers
  _onSignalReceiverOffline ({ receiverId }) {
    if (this._requests[receiverId]) {
      console.log('Signal receiver offline')
      // Delete request to allow offline peer to connect if it comes online
      delete this._requests[receiverId]
    }
  }

  // Removes given peer by id
  _removePeer (id) {
    if (this._peers[id]) {
      this._peers[id].destroy()
      delete this._peers[id]
    }
  }

  _removeDrop (id) {
    this._transfers = this._transfers.filter(t => t !== id)
  }

  // Adds sender to initiate a connection with receiving peer
  _addSender (...args) {
    this._addPeer(true, ...args)
  }

  // Adds a receiver to Initiate a connection with sending peer
  _addReceiver (...args) {
    this._addPeer(false, ...args)
  }

  // Initiates a connection with the given peer and sets up communication
  _addPeer (initiator, userId) {
    const peer = (this._peers[userId] = new Peer({
      initiator,
      wrtc,
      reconnectTimer: 1000
    }))
    const type = initiator ? 'Sender' : 'Receiver'

    peer.on('signal', data => {
      // Trickle signal data to the peer
      this._signal.send('signal', {
        receiverId: userId,
        data
      })
      console.log(type, 'got signal and sent')
    })

    peer.on('connect', async () => {
      // Initialises a chat session
      const keyMessage = await this._crypto.initSession(userId)
      // Send the master secret public key with signature to the user
      this._sendMessage('key', userId, keyMessage, false)

      this.emit('connect', userId, initiator)
    })

    peer.on('close', () => {
      this._removePeer(userId)
      this.emit('disconnect', userId)
    })

    peer.on('error', err => this.emit('error', userId, err))

    peer.on('data', data =>
      // Queue to receive
      this._receivingQueue.add(() =>
        this._onMessage(userId, data.toString('utf8'))
      )
    )

    peer.on('datachannel', (datachannel, id) =>
      // Queue to receive
      this._receivingQueue.add(() =>
        this._onDataChannel(userId, datachannel, id)
      )
    )
  }

  // Handles new messages
  async _onMessage (userId, data) {
    // Try to deserialize message
    console.log('------> Got new message', data)
    const { type, ...message } = JSON.parse(data)

    if (type === 'key') {
      // Start a new crypto session with received key
      this._crypto.startSession(userId, message)
      return
    }
  }

  // Handles new data channels (drops/file streams)
  async _onDataChannel (userId, receivingStream, rawDrop) {
    console.log('------> Received a new drop (datachannel)', rawDrop)
    const encDrop = JSON.parse(rawDrop)
    let { message, decipher } = await this._crypto.decrypt(
      userId,
      encDrop,
      true
    )
    // Ignore if validation failed
    if (!message) return
    const dropDir = path.join(DROPS_DIR, userId)
    // Recursively make media directory
    await mkdir(dropDir, { recursive: true })
    const filePath = path.join(dropDir, message.name)
    console.log('Writing to', filePath)

    this.emit('drop', userId, { path: filePath, ...message })

    const fileWriteStream = fs.createWriteStream(filePath)
    const tracker = progress({
      length: message.size,
      time: DROP_STAT_INTERVAL
    })

    tracker.on('progress', progress =>
      this.emit('progress', userId, message.id, progress)
    )
    // Stream content
    await pipeline(receivingStream, decipher, tracker, fileWriteStream)
  }

  // Sends a message to given peer
  _sendMessage (type, receiverId, message) {
    // TODO: Queue message if not connected / no session for later
    if (!this.isConnected(receiverId)) return false

    const peer = this._peers[receiverId]

    const serializedMessage = JSON.stringify({
      type,
      ...message
    })

    // Simply send message if no file to stream
    peer.write(serializedMessage)
    console.log(type, 'sent', message)
  }

  // Sends a file to given peer
  async _sendFile (receiverId, drop, filePath) {
    // TODO: Queue message if not connected / no session for later
    if (!this.isConnected(receiverId)) return false

    const peer = this._peers[receiverId]

    if (!drop.size) {
      // Add size
      const { size } = await stat(filePath)
      drop.size = size
    }

    // Encrypt message
    const {packet, cipher} = await this._crypto.encrypt(receiverId, drop, true)

    const serializedDrop = JSON.stringify(packet)

    // Stream file
    console.log('Streaming', drop, filePath)
    // Resume transfer is drop already exists
    let opts = drop.transferred ? { start: drop.transferred } : {}
    const fileReadStream = fs.createReadStream(filePath, opts)
    const sendingStream = peer.createDataChannel(serializedDrop)
    const tracker = progress({
      length: drop.size,
      time: DROP_STAT_INTERVAL
    })

    tracker.on('progress', progress =>
      this.emit('progress', receiverId, drop.id, progress)
    )

    this._transfers.push(drop.id)

    const pipe = pipeline(
      fileReadStream,
      cipher,
      // Throttle stream (backpressure)
      brake(DROP_CHUNK_SIZE, { period: DROP_STREAM_RATE }),
      tracker,
      sendingStream
    )

    this.on('pause-drop', dropId => {
      if (dropId === drop.id) {
        console.log('Pausing drop', drop)
        fileReadStream.unpipe(cipher)
        console.log('Stream paused?', fileReadStream.isPaused())
      }
    })

    this.on('resume-drop', dropId => {
      if (dropId === drop.id) {
        console.log('Resuming drop', drop)
        fileReadStream.pipe(cipher)
      }
    })

    this.on('destroy-drop', dropId => {
      if (dropId === drop.id) {
        pipe.destroy()
      }
    })

    await pipe
  }
}
