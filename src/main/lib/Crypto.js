'use strict'
/**
 * Crypto class
 * Manages all keys and provides all crypto functionality
 */

const crypto = require('crypto'),
  fs = require('fs'),
  keytar = require('keytar'),
  hkdf = require('futoin-hkdf'),
  // TODO: Replace with crypto.diffieHellman once nodejs#26626 lands on v12 LTS
  { box, sign } = require('tweetnacl'),
  { chunk, hexToUint8, strToUint8, Uint8ToHex } = require('./util'),
  SERVICE = 'spacedrop',
  DB_KEY = 'publicKey',
  CIPHER = 'aes-256-cbc',
  RATCHET_KEYS_LEN = 64,
  RATCHET_KEYS_HASH = 'SHA-256',
  MESSAGE_KEY_LEN = 80,
  MESSAGE_CHUNK_LEN = 32,
  MESSAGE_KEY_SEED = 1, // 0x01
  CHAIN_KEY_SEED = 2, // 0x02
  RACHET_MESSAGE_COUNT = 10 // Rachet after this no of messages sent

module.exports = class Crypto {
  constructor (store) {
    this._store = store
    this._sessions = {}
    this._identity
    // Bindings
    this.init = this.init.bind(this)
  }

  async init () {
    const publicKey = this._store.get(DB_KEY, false)
    const secretKey =
      publicKey && (await keytar.getPassword(SERVICE, publicKey))
    // Restore keys if they exist
    if (publicKey && secretKey) {
      this._identity = { publicKey, secretKey: hexToUint8(secretKey) }
      return this._identity
    }
    // Generate new ones otherwise
    await this._generateIdentityKeyPair()
    return this._identity
  }

  async _saveIdentity () {
    this._store.set(DB_KEY, this._identity.publicKey)
    // Save the private key in the OS's keychain under public key
    await keytar.setPassword(
      SERVICE,
      this._identity.publicKey,
      Uint8ToHex(this._identity.secretKey)
    )
  }

  // Generates a new Curve25519 key pair
  async _generateIdentityKeyPair () {
    let keyPair = sign.keyPair()
    // Encode in hex for easier handling
    keyPair.publicKey = Uint8ToHex(keyPair.publicKey)

    this._identity = keyPair
    await this._saveIdentity()
  }

  sign (data) {
    return Uint8ToHex(sign.detached(strToUint8(data), this._identity.secretKey))
  }

  verify (publicKey, data, signature) {
    return sign.detached.verify(
      strToUint8(data),
      hexToUint8(signature),
      hexToUint8(publicKey)
    )
  }

  // Generates a server connection authentication request
  generateAuthRequest () {
    const timestamp = new Date().toISOString()
    const signature = this.sign(timestamp)
    const { publicKey } = this._identity
    return { publicKey, timestamp, signature }
  }

  // Returns a hash digest of the given data
  hash (data, enc = 'hex', alg = 'sha256') {
    return crypto
      .createHash(alg)
      .update(data)
      .digest(enc)
  }

  // Returns a hash digest of the given file
  hashFile (path, enc = 'hex', alg = 'sha256') {
    return new Promise((resolve, reject) =>
      fs
        .createReadStream(path)
        .on('error', reject)
        .pipe(crypto.createHash(alg).setEncoding(enc))
        .once('finish', function () {
          resolve(this.read())
        })
    )
  }

  // Hash Key Derivation Function (based on HMAC)
  _HKDF (input, salt, info, length = RATCHET_KEYS_LEN) {
    // input = input instanceof Uint8Array ? Buffer.from(input) : input
    // salt = salt instanceof Uint8Array ? Buffer.from(salt) : salt
    return hkdf(input, length, {
      salt,
      info,
      hash: RATCHET_KEYS_HASH
    })
  }

  // Hash-based Message Authentication Code
  _HMAC (key, data, enc = 'utf8', algo = 'sha256') {
    return crypto
      .createHmac(algo, key)
      .update(data)
      .digest(enc)
  }

  // Generates a new Curve25519 key pair
  _generateRatchetKeyPair () {
    let keyPair = box.keyPair()
    // Encode in hex for easier handling
    keyPair.publicKey = Buffer.from(keyPair.publicKey).toString('hex')
    return keyPair
  }

  // Initialises an end-to-end encryption session
  async initSession (id) {
    // Generates a new ephemeral ratchet Curve25519 key pair for chat
    let { publicKey, secretKey } = this._generateRatchetKeyPair()
    // Initialise session object
    this._sessions[id] = {
      currentRatchet: {
        sendingKeys: {
          publicKey,
          secretKey
        },
        previousCounter: 0
      },
      sending: {},
      receiving: {}
    }
    // Sign public key
    const timestamp = new Date().toISOString()
    const signature = await this.sign(publicKey + timestamp)
    console.log('Initialised new session', this._sessions[id])
    return { publicKey, timestamp, signature }
  }

  // Starts the session
  async startSession (id, keyMessage) {
    const { publicKey, timestamp, signature } = keyMessage
    // Validate sender public key
    const sigValid = await this.verify(id, publicKey + timestamp, signature)
    // Ignore if new encryption session if signature not valid
    if (!sigValid) return console.log('PubKey sig invalid', publicKey)

    const ratchet = this._sessions[id].currentRatchet
    const { secretKey } = ratchet.sendingKeys
    ratchet.receivingKey = publicKey
    // Derive shared master secret and root key
    const [rootKey] = this._calcRatchetKeys(
      'SpacedropSecret',
      secretKey,
      publicKey
    )
    ratchet.rootKey = rootKey
    console.log(
      'Initialised Session',
      rootKey.toString('hex'),
      this._sessions[id]
    )
  }

  // Calculates the ratchet keys (root and chain key)
  _calcRatchetKeys (oldRootKey, sendingSecretKey, receivingKey) {
    // Convert receivingKey to a Uint8Array if it isn't already
    if (typeof receivingKey === 'string')
      receivingKey = hexToUint8(receivingKey)
    // Derive shared ephemeral secret
    const sharedSecret = box.before(receivingKey, sendingSecretKey)
    // Derive the new ratchet keys
    const ratchetKeys = this._HKDF(sharedSecret, oldRootKey, 'SpacedropRatchet')
    console.log('Derived ratchet keys', ratchetKeys.toString('hex'))
    // Chunk ratchetKeys output into its parts: root key and chain key
    return chunk(ratchetKeys, RATCHET_KEYS_LEN / 2)
  }

  // Calculates the next receiving or sending ratchet
  _calcRatchet (session, sending, receivingKey) {
    let ratchet = session.currentRatchet
    let ratchetChains, publicKey, previousChain

    if (sending) {
      ratchetChains = session.sending
      previousChain = ratchetChains[ratchet.sendingKeys.publicKey]
      // Replace ephemeral ratchet sending keys with new ones
      ratchet.sendingKeys = this._generateRatchetKeyPair()
      publicKey = ratchet.sendingKeys.publicKey
      console.log('New sending keys generated', publicKey)
    } else {
      // TODO: Check counters to pre-compute skipped keys
      ratchetChains = session.receiving
      previousChain = ratchetChains[ratchet.receivingKey]
      publicKey = ratchet.receivingKey = receivingKey
    }

    if (previousChain) {
      // Update the previousCounter with the previous chain counter
      ratchet.previousCounter = previousChain.chain.counter
    }
    // Derive new ratchet keys
    const [rootKey, chainKey] = this._calcRatchetKeys(
      ratchet.rootKey,
      ratchet.sendingKeys.secretKey,
      ratchet.receivingKey
    )
    // Update root key
    ratchet.rootKey = rootKey
    // Initialise new chain
    ratchetChains[publicKey] = {
      messageKeys: {},
      chain: {
        counter: -1,
        key: chainKey
      }
    }
    return ratchetChains[publicKey]
  }

  // Calculates the next message key for the ratchet and updates it
  // TODO: Try to get messagekey with message counter otherwise calculate all
  // message keys up to it and return it (instead of pre-comp on ratchet)
  _calcMessageKey (ratchet) {
    let chain = ratchet.chain
    // Calculate next message key
    const messageKey = this._HMAC(chain.key, Buffer.alloc(1, MESSAGE_KEY_SEED))
    // Calculate next ratchet chain key
    chain.key = this._HMAC(chain.key, Buffer.alloc(1, CHAIN_KEY_SEED))
    // Increment the chain counter
    chain.counter++
    // Save the message key
    ratchet.messageKeys[chain.counter] = messageKey
    console.log('Calculated next messageKey', ratchet)
    // Derive encryption key, mac key and iv
    return chunk(
      this._HKDF(messageKey, 'SpacedropCrypt', null, MESSAGE_KEY_LEN),
      MESSAGE_CHUNK_LEN
    )
  }

  // Encrypts a message
  async encrypt (id, drop) {
    let session = this._sessions[id]
    let ratchet = session.currentRatchet
    let sendingChain = session.sending[ratchet.sendingKeys.publicKey]
    // Ratchet after every RACHET_MESSAGE_COUNT of messages
    let shouldRatchet =
      sendingChain && sendingChain.chain.counter >= RACHET_MESSAGE_COUNT
    if (!sendingChain || shouldRatchet) {
      sendingChain = this._calcRatchet(session, true)
      console.log('Calculated new sending ratchet', session)
    }
    const { previousCounter } = ratchet
    const { publicKey } = ratchet.sendingKeys
    const [encryptKey, hmac, iv] = this._calcMessageKey(sendingChain)
    console.log(
      'Calculated encryption creds',
      encryptKey.toString('hex'),
      iv.toString('hex')
    )
    const { counter } = sendingChain.chain
    // Encrypt message contents
    const nameCipher = crypto.createCipheriv(CIPHER, encryptKey, iv)
    const name =
      nameCipher.update(drop.name, 'utf8', 'hex') +
      nameCipher.final('hex')

    // Construct full message
    let encDrop = {
      ...drop,
      publicKey,
      previousCounter,
      counter,
      name
    }
    
    // Sign message with PGP
    encDrop.signature = await this.sign(
      JSON.stringify(encDrop)
    )

    console.log('Encrypted', encDrop)

    // Return cipher
    const fileCipher = crypto.createCipheriv(CIPHER, encryptKey, iv)
    return [encDrop, fileCipher]
  }

  // Decrypts a message
  async decrypt (id, signedDrop) {
    const { signature, ...fullDrop } = signedDrop
    const sigValid = await this.verify(
      id,
      JSON.stringify(fullDrop),
      signature
    )
    // Ignore message if signature invalid
    if (!sigValid) {
      console.log('Message signature invalid!')
      return false
    }
    const { publicKey, counter, previousCounter, ...drop } = fullDrop
    let session = this._sessions[id]
    let receivingChain = session.receiving[publicKey]
    if (!receivingChain) {
      // Receiving ratchet for key does not exist so create one
      receivingChain = this._calcRatchet(session, false, publicKey)
      console.log('Calculated new receiving ratchet', receivingChain)
    }
    // Derive decryption credentials
    const [decryptKey, hmac, iv] = this._calcMessageKey(receivingChain)
    console.log(
      'Calculated decryption creds',
      decryptKey.toString('hex'),
      iv.toString('hex')
    )
    // Decrypt the message contents
    const nameDecipher = crypto.createDecipheriv(CIPHER, decryptKey, iv)
    const name =
      nameDecipher.update(drop.name, 'hex', 'utf8') +
      nameDecipher.final('utf8')
    console.log('--> Decrypted content', name)

    const decDrop = { ...drop, name }

    // Return Decipher
    const fileDecipher = crypto.createDecipheriv(CIPHER, decryptKey, iv)
    return [decDrop, fileDecipher]
  }
}
