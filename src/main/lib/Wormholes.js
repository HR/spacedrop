'use strict'

const { DROP_STATUS } = require('../../consts'),
  { isEmpty } = require('./util'),
  DB_KEY = 'wormholes'

module.exports = class Wormholes {
  constructor (store) {
    this._store = store
    this._wormholes = this._store.get(DB_KEY, {})
  }

  // Gets the wormhole
  getAll () {
    return this._wormholes
  }

  // Gets the wormhole
  getList () {
    return Object.values(this._wormholes)
  }

  getActive () {
    const arr = Object.values(this._wormholes)
    if (!arr.length) return ''
    const online = arr.find(w => w.online)
    return (online && online.id) || arr[0].id
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
      drops: {}
    }
    this._saveAll()
  }

  // Deletes a wormhole
  delete (id) {
    delete this._wormholes[id]
    this._saveAll()
  }

  // Adds a drop
  addDrop (id, dropId, drop) {
    drop.status = DROP_STATUS.PROGRESSING
    this._wormholes[id].drops[dropId] = drop
    this._saveAll()
  }

  // Deletes a drop
  deleteDrop (id, dropId) {
    delete this._wormholes[id].drops[dropId]
    this._saveAll()
  }

  // Updates a drop
  updateDrop (id, dropId, updates) {
    if (!this._wormholes[id] || isEmpty(updates)) return
    if (updates.eta === 0) updates.status = DROP_STATUS.DONE
    Object.assign(this._wormholes[id].drops[dropId], updates)
    this._saveAll()
  }

  clearDrops () {
    Object.entries(this._wormholes).map(k => (this._wormholes[k].drops = {}))
  }

  // Saves wormhole to the store
  _saveAll () {
    this._store.set(DB_KEY, this._wormholes)
  }
}
