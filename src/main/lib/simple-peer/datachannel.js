const debug = require('debug')('simple-peer')
const stream = require('readable-stream')

const MAX_BUFFERED_AMOUNT = 64 * 1024
const CHANNEL_CLOSING_TIMEOUT = 5 * 1000
const CHANNEL_CLOSE_DELAY = 3 * 1000

function makeError(err, code) {
  if (typeof err === 'string') err = new Error(err)
  if (err.error instanceof Error) err = err.error
  err.code = code
  return err
}

class DataChannel extends stream.Duplex {
  constructor(opts) {
    opts = Object.assign({
      allowHalfOpen: false,
    }, opts)

    super(opts)

    this._chunk = null
    this._cb = null
    this._interval = null
    this._channel = null
    this._fresh = true

    this.channelName = null

    // HACK: Chrome will sometimes get stuck in readyState "closing", let's check for this condition
    // https://bugs.chromium.org/p/chromium/issues/detail?id=882743
    let isClosing = false
    this._closingInterval = setInterval(() => { // No "onclosing" event
      if (this._channel && this._channel.readyState === 'closing') {
        if (isClosing) this._onChannelClose() // closing timed out: equivalent to onclose firing
        isClosing = true
      }
      else {
        isClosing = false
      }
    }, CHANNEL_CLOSING_TIMEOUT)
  }

  get bufferSize() {
    return (this._channel && this._channel.bufferedAmount) || 0
  }

  _setDataChannel(channel) {
    this._channel = channel
    this._channel.binaryType = 'arraybuffer'

    if (typeof this._channel.bufferedAmountLowThreshold === 'number') {
      this._channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT
    }

    [this.channelName] = this._channel.label.split('@')


    this._channel.onmessage = (event) => {
      this._onChannelMessage(event)
    }
    this._channel.onbufferedamountlow = () => {
      this._onChannelBufferedAmountLow()
    }
    this._channel.onopen = () => {
      this._onChannelOpen()
    }
    this._channel.onclose = () => {
      this._onChannelClose()
    }
    this._channel.onerror = (err) => {
      this.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
    }
    this._onFinishBound = () => {
      this._onFinish()
    }

    this.once('finish', this._onFinishBound)
  }

  _read() {}

  _write(chunk, encoding, cb) {
    if (this.destroyed) return cb(makeError('cannot write after channel is destroyed', 'ERR_DATA_CHANNEL'))

    if (this._channel && this._channel.readyState === 'open') {
      try {
        this.send(chunk)
      }
      catch (err) {
        return this.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
      }
      if (this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        this._debug('start backpressure: bufferedAmount %d', this._channel.bufferedAmount)
        this._cb = cb
      }
      else {
        cb(null)
      }
    }
    else {
      this._debug('write before connect')
      this._chunk = chunk
      this._cb = cb
    }
  }

  // When stream finishes writing, close socket. Half open connections are not
  // supported.
  _onFinish() {
    if (this.destroyed) return

    // Wait a bit before destroying so the socket flushes.
    // TODO: is there a more reliable way to accomplish this?
    const destroySoon = () => {
      setTimeout(() => this.destroy(), 1000)
    }

    if (!this._channel || this._channel.readyState === 'open') {
      destroySoon()
    }
    else {
      this.once('connect', destroySoon)
    }
  }

  _onInterval() {
    if (!this._cb || !this._channel || this._channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      return
    }
    this._onChannelBufferedAmountLow()
  }

  _onChannelMessage(event) {
    if (this.destroyed) return
    let { data } = event
    if (data instanceof ArrayBuffer) data = Buffer.from(data)
    this.push(data)
  }

  _onChannelBufferedAmountLow() {
    if (this.destroyed || !this._cb) return
    this._debug('ending backpressure: bufferedAmount %d', this._channel.bufferedAmount)
    const cb = this._cb
    this._cb = null
    cb(null)
  }

  _onChannelOpen() {
    this._debug('on channel open', this.channelName)
    this.emit('open')
    this._sendChunk()

    setTimeout(() => {
      this._fresh = false
    }, CHANNEL_CLOSE_DELAY)
  }

  _onChannelClose() {
    if (this.destroyed) return
    this._debug('on channel close')
    this.destroy()
  }

  _sendChunk() { // called when peer connects or self._channel set
    if (this.destroyed) return

    if (this._chunk) {
      try {
        this.send(this._chunk)
      }
      catch (err) {
        return this.destroy(makeError(err, 'ERR_DATA_CHANNEL'))
      }
      this._chunk = null
      this._debug('sent chunk from "write before connect"')

      const cb = this._cb
      this._cb = null
      cb(null)
    }

    // If `bufferedAmountLowThreshold` and 'onbufferedamountlow' are unsupported,
    // fallback to using setInterval to implement backpressure.
    if (!this._interval && typeof this._channel.bufferedAmountLowThreshold !== 'number') {
      this._interval = setInterval(() => this._onInterval(), 150)
      if (this._interval.unref) this._interval.unref()
    }
  }


  /**
 * Send text/binary data to the remote peer.
 * @param {ArrayBufferView|ArrayBuffer|Buffer|string|Blob} chunk
 */
  send(chunk) {
    if (!this._channel) {
      if (this.destroyed) return this.destroy(makeError('cannot send after channel is destroyed', 'ERR_DATA_CHANNEL'))
      return this.destroy(makeError('cannot send before channel is created - use write() to buffer', 'ERR_DATA_CHANNEL'))
    }
    this._channel.send(chunk)
  }

  // TODO: Delete this method once readable-stream is updated to contain a default
  // implementation of destroy() that automatically calls _destroy()
  // See: https://github.com/nodejs/readable-stream/issues/283
  destroy(err) {
    this._destroy(err, () => {})
  }

  _destroy(err, cb) {
    if (this.destroyed) return

    this._debug('destroy (error: %s)', err && (err.message || err))

    if (this._channel) {
      // HACK: Safari sometimes cannot close channels immediately after opening them
      if (this._fresh) {
        setTimeout(this._close, CHANNEL_CLOSE_DELAY)
      }
      else {
        this._close()
      }

      this._channel.onmessage = null
      this._channel.onopen = null
      this._channel.onclose = null
      this._channel.onerror = null
      this._channel = null
    }

    this.readable = this.writable = false

    if (!this._readableState.ended) this.push(null)
    if (!this._writableState.finished) this.end()

    this.destroyed = true

    clearInterval(this._closingInterval)
    this._closingInterval = null

    clearInterval(this._interval)
    this._interval = null
    this._chunk = null
    this._cb = null

    this.channelName = null

    if (this._onFinishBound) this.removeListener('finish', this._onFinishBound)
    this._onFinishBound = null

    if (err) this.emit('error', err)
    this.emit('close')
    cb()
  }

  _close() {
    try {
      this._channel.close()
    }
    catch (err) {}
  }

  _debug() {
    const self = this
    const args = [].slice.call(arguments)
    args[0] = `[${self._id}] ${args[0]}`
    debug.apply(null, args)
  }
}

module.exports = DataChannel
