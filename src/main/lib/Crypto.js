'use strict'
/**
 * Crypto class
 * Manages all keys and provides all crypto functionality
 */

const E2EE = require('./e2ee/src'),
  keytar = require('keytar'),
  SERVICE = 'spacedrop'

module.exports = class Crypto extends E2EE {
  constructor (store) {
    const getSecretIdentity = publicKey =>
      keytar.getPassword(SERVICE, publicKey)
    const setSecretIdentity = (publicKey, secretKey) =>
      keytar.setPassword(SERVICE, publicKey, secretKey)

    super({ store, getSecretIdentity, setSecretIdentity })
  }
}
