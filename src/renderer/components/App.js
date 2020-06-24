import React from 'react'
import { ipcRenderer, remote, clipboard } from 'electron'
import { Container } from 'react-bootstrap'
import { useNotifications } from '../lib/notifications'
import { clone } from '../lib/util'
import Toolbar from './Toolbar'
import Wormholes from './Wormholes'
import WormholeModal from './WormholeModal'
import '../../../static/scss/index.scss'

const { dialog } = remote
// Notification ref
let notifications = null
// Initial modal state used to reset modals
const initModalsState = {
  createWormhole: false,
  editWormhole: false
}
// Root component
export default class App extends React.Component {
  static contextType = useNotifications(true)
  constructor (props) {
    super(props)
    this.state = {
      online: false,
      identity: '',
      wormholes: [],
      active: '',
      ...clone(initModalsState)
    }

    // Bindings
    this.activate = this.activate.bind(this)
    this.updateState = this.updateState.bind(this)
    this.closeModals = this.closeModals.bind(this)
    this.openModal = this.openModal.bind(this)
    this.dropFileHandler = this.dropFileHandler.bind(this)
    this.createWormhole = this.createWormhole.bind(this)
    this.editWormhole = this.editWormhole.bind(this)
    this.copyIdentity = this.copyIdentity.bind(this)

    // Add event listeners
    ipcRenderer.on('open-modal', (event, ...args) => this.openModal(...args))
    ipcRenderer.on('create-drop', this.dropFileHandler)
    ipcRenderer.on('copy-id', this.copyIdentity)
    ipcRenderer.on('update-state', this.updateState)
  }

  componentDidMount () {
    // Init notifications via the context
    notifications = this.context
    // Let main process show notifications
    ipcRenderer.on('notify', (event, ...args) => notifications.show(...args))
    // Load state from main if not already loaded
    ipcRenderer.send('do-update-state')
  }

  activate (active) {
    ipcRenderer.send('activate-wormhole', active)
    this.setState({ active })
  }

  // Updates internal state thereby updating the UI
  updateState (event, state, resetState) {
    let newState = { ...state }
    if (resetState) {
      // Reset state
      Object.assign(newState, clone(initModalsState))
      notifications && notifications.clear()
    }
    console.log('updateState', newState, resetState)
    this.setState(newState, () => console.log('Updated state', this.state))
  }

  // Closes all the modals
  closeModals () {
    this.setState({
      ...clone(initModalsState)
    })
  }

  // Shows the specified modal
  openModal (name, state) {
    console.log('Opening modal ' + name)
    let newModalState = clone(initModalsState)
    newModalState[name] = state ? state : true
    this.setState(newModalState)
  }

  // Handles sending a file
  async dropFileHandler () {
    if (!this.state.wormholes.length)
      return notifications.show('No wormhole', 'error', true, 3000)
    if (!this.state.active)
      return notifications.show('No wormhole selected', 'error', true, 3000)

    const wormhole = this.state.wormholes.find(w => w.id === this.state.active)
    if (!wormhole.online)
      return notifications.show(
        'Wormhole closed (offline)',
        'error',
        true,
        3000
      )
    const title = 'Select the file to send'
    // Filter based on type selected
    const filters = [{ name: 'All Files', extensions: ['*'] }]
    const { canceled, filePaths } = await dialog.showOpenDialog(
      remote.getCurrentWindow(),
      {
        properties: ['openFile'],
        title,
        filters
      }
    )
    // Ignore if user cancelled
    if (canceled || !filePaths) return
    console.log(filePaths)
    ipcRenderer.send('drop', this.state.active, filePaths[0])
  }

  createWormhole ({ id, name }) {
    if (!id || !name)
      return notifications.show('Details missing', 'error', true, 3000)

    const alreadyExists = this.state.wormholes.find(w => w.id === id)
    const isMe = this.state.identity === id
    if (alreadyExists || isMe)
      return notifications.show('Already added', 'error', true, 3000)

    // Show persistent composing notification
    notifications.show('Warping space-time...', null, false)

    ipcRenderer.send('create-wormhole', id, name)
  }

  editWormhole ({ id, name }) {
    if (!name) return notifications.show('Name missing', 'error', true, 3000)

    // Show persistent composing notification
    notifications.show('Rewarping space-time...', null, false)

    ipcRenderer.send('edit-wormhole', id, name)
  }

  copyIdentity (e) {
    clipboard.writeText(this.state.identity)
    notifications.show('Copied Spacedrop ID', null, true, 3000)
    if (e) e.preventDefault()
  }

  // Render the App UI
  render () {
    const activeWormholeOnline = Object.values(this.state.wormholes).find(
      w => w.id === this.state.active && w.online === true
    )
    return (
      <div className='App'>
        <WormholeModal
          type='Create'
          show={this.state.createWormhole}
          onHide={() => this.closeModals()}
          onSubmit={this.createWormhole}
        />
        <WormholeModal
          type='Edit'
          show={!!this.state.editWormhole}
          state={this.state.editWormhole}
          onHide={() => this.closeModals()}
          onSubmit={this.editWormhole}
          disabledId={true}
        />
        <Container>
          <Toolbar
            online={this.state.online}
            sendDisabled={!activeWormholeOnline}
            onCreateWormholeClick={() => this.openModal('createWormhole')}
            onSendClick={this.dropFileHandler}
            onCopyIdentityClick={this.copyIdentity}
          />
          <Wormholes
            active={this.state.active}
            setActive={this.activate}
            wormholes={this.state.wormholes}
            onResumeClick={(...args) =>
              ipcRenderer.send('resume-drop', ...args)
            }
            onPauseClick={(...args) => ipcRenderer.send('pause-drop', ...args)}
            onDeleteClick={(...args) =>
              ipcRenderer.send('delete-drop', ...args)
            }
          />
        </Container>
      </div>
    )
  }
}
