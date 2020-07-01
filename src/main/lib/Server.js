'use strict'
/**
 * Signal class
 * Sends and receives signals from peers and signal events from server
 */

const WebSocket = require('ws'),
  EventEmitter = require('events'),
  { encode } = require('querystring'),
  { WS_URI } = require('../../config'),
  CONNECTED_STATE = 1

module.exports = class Server extends EventEmitter {
  constructor () {
    // Ensure singleton
    if (!!Server.instance) {
      return Server.instance
    }

    // Call EventEmitter constructor
    super()

    this._id = null
    this._ws = null

    // Bindings
    this.connect = this.connect.bind(this)
    this._emit = this._emit.bind(this)
    this.send = this.send.bind(this)

    Server.instance = this
  }

  isConnected () {
    return this._ws.readyState === CONNECTED_STATE
  }

  setId(userId) {
    this._id = userId
  }

  // Connects to signal server
  connect (authRequest) {
    // Build ws uri with authentication querystring data
    const wsAuthURI = WS_URI + '?' + encode(authRequest)

    this._ws = new WebSocket(wsAuthURI)
    // Add event listeners
    this._ws.on('message', this._emit)
    this._ws.on('open', () => {
      this.emit('connect')
    })
    this._ws.on('close', () => {
      this.emit('disconnect')
    })
    this._ws.on('error', err => this.emit('error', err))
  }

  // Sends signal to a peer (via server)
  send (type, extras = {}, cb) {
    const msg = JSON.stringify({ type, senderId: this._id, ...extras })
    if (!cb) {
      return new Promise(resolve => this._ws.send(msg, null, resolve))
    }
    this._ws.send(msg, null, cb)
  }

  // Emits a received signal event
  _emit (msg) {
    const { event, data } = JSON.parse(msg)
    console.log(`Signal event: ${event}`)
    this.emit(event, data)
  }
}
