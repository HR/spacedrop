'use strict'

const DB_KEY = 'wormholes'

module.exports = class Wormholes {
  constructor (store) {
    this._store = store
    this._wormholes = this._store.get(DB_KEY, [])
  }

  // Gets the wormhole
  getAll () {
    return this._wormholes
  }

  // Checks if a wormhole exist
  exist () {
    return Object.keys(this._wormholes).length > 0
  }

  // Checks if a wormhole exists
  has (id) {
    return !!this._wormholes[id]
  }

  // Adds a wormhole
  add (id, name) {
    this._wormholes[id] = {
      id,
      name,
      online: false,
      drops: []
    }
    this._saveAll()
  }

  // Deletes a wormhole
  delete (id) {
    delete this._wormholes[id]
    this._saveAll()
  }

  // Adds a drop
  addDrop (id, drop) {
    this._wormholes[id].drops.push(drop)
    this._saveAll()
  }

  // Set a wormhole as online
  setOnline (id) {
    return (this._wormholes[id].online = true)
  }

  // Set a wormhole as offline
  setOffline (id) {
    return this.has(id) && (this._wormholes[id].online = false)
  }

  // Deletes all the wormhole messages
  deleteAllMessages () {
    for (const wormhole in this._wormholes) {
      if (!this._wormholes.hasOwnProperty(wormhole)) continue
      this._wormholes[wormhole].messages = []
    }
    this._saveAll()
  }

  // Saves wormhole to the store
  _saveAll () {
    this._store.set(DB_KEY, this._wormholes)
    console.log('Saved wormhole')
  }
}
