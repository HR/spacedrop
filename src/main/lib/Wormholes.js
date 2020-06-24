'use strict'

const { DROP_STATUS } = require('../../consts'),
  { isEmpty } = require('./util'),
  DB_KEY = 'wormholes'

module.exports = class Wormholes {
  constructor (store) {
    this._store = store
    this._wormholes = this._store.get(DB_KEY, {})
  }

  // Wormhole ops

  getAll () {
    return this._wormholes
  }

  getList () {
    return Object.values(this._wormholes)
  }

  getActive () {
    const arr = Object.values(this._wormholes)
    if (!arr.length) return ''
    const online = arr.find(w => w.online)
    return (online && online.id) || arr[0].id
  }

  get (id) {
    return this._wormholes[id]
  }

  has (id) {
    return !!this._wormholes[id]
  }

  add (id, name) {
    this._wormholes[id] = {
      id,
      name,
      drops: {}
    }
    this._saveAll()
  }

  update (id, state) {
    Object.assign(this._wormholes[id], state)
    this._saveAll()
  }

  delete (id) {
    delete this._wormholes[id]
    this._saveAll()
  }

  getDropList (id) {
    return Object.entries(this._wormholes[id].drops)
  }

  // Gets a drop
  getDrop (id, dropId) {
    return this._wormholes[id].drops[dropId]
  }

  // Adds a drop
  addDrop (id, dropId, drop) {
    drop.status = DROP_STATUS.PENDING
    this._wormholes[id].drops[dropId] = drop
    this._saveAll()
  }

  // Deletes a drop
  deleteDrop (id, dropId) {
    delete this._wormholes[id].drops[dropId]
    this._saveAll()
  }

  // Find the wormhole id of a drop with its id
  findIdByDropId (dropId) {
    return Object.entries(this._wormholes).find(w =>
      Object.entries(w.drops).includes(dropId)
    )
  }

  // Updates a drop
  updateDrop (id, dropId, updates) {
    if (!this._wormholes[id] || isEmpty(updates)) return
    if (updates.eta === 0) updates.status = DROP_STATUS.DONE
    const drop = Object.assign(this._wormholes[id].drops[dropId], updates)
    this._saveAll()
    return drop
  }

  // Pause all pending drops
  pauseDrops () {
    for (var w in this._wormholes) {
      if (!this._wormholes.hasOwnProperty(w)) continue
      for (var d in this._wormholes[w].drops) {
        if (
          !this._wormholes[w].drops.hasOwnProperty(d) ||
          this._wormholes[w].drops[d].status !== DROP_STATUS.PENDING
        )
          continue

        this._wormholes[w].drops[d].status = DROP_STATUS.PAUSED
      }
    }
    console.log('Pausing drops', JSON.stringify(this._wormholes))
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
