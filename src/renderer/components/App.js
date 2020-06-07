import React from 'react'
import { ipcRenderer, remote } from 'electron'
import { Container } from 'react-bootstrap'
import { useNotifications } from '../lib/notifications'
import { clone } from '../lib/util'
import Toolbar from './Toolbar'
import Drops from './Drops'
import '../../../static/scss/index.scss'

const { dialog } = remote
// Notification ref
let notifications = null
// Initial modal state used to reset modals
const initModalsState = {
  modalMessage: {
    text: '',
    error: false
  }
}
// Root component
export default class App extends React.Component {
  static contextType = useNotifications(true)
  constructor (props) {
    super(props)
    this.state = {
      drops: [
        {
          id: 'j9348jr3948rjlknwkendkkmkewdmkd',
          name: 'Alice',
          drops: [
            {
              name: 'lo_fi.mp3',
              type: '↓',
              path: '/tmp/lo_fi.mp3',
              progress: 20040192,
              total: 440401920,
              rate: 2097152,
              done: false
            }
          ]
        },
        {
          id: 'jl348jr3938rjlknwkendkkmkewdmkd',
          name: 'Bob',
          drops: [
            {
              name: 'matrix.exe',
              type: '↑',
              path: '/tmp/lo_fi.mp3',
              progress: 89040192,
              total: 540401920,
              rate: 1097152,
              done: false
            },
            {
              name: 'bro.pdf',
              type: '↓',
              path: '/tmp/lo_fi.mp3',
              progress: 89040192,
              total: 540401920,
              rate: 3097152,
              done: true
            }
          ]
        }
      ],
      ...clone(initModalsState)
    }

    // Bindings
    this.closeModals = this.closeModals.bind(this)
    this.openModal = this.openModal.bind(this)
    this.updateState = this.updateState.bind(this)
    this.showModalMessage = this.showModalMessage.bind(this)
    this.showModalError = this.showModalError.bind(this)
    this.sendFileHandler = this.sendFileHandler.bind(this)

    // Add event listeners
    ipcRenderer.on('open-modal', (event, modal) => this.openModal(modal))
    ipcRenderer.on('modal-error', (event, err) => this.showModalError(err))
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

  // Updates internal state thereby updating the UI
  updateState (state, resetState) {
    let newState = { ...state }
    if (resetState) {
      // Reset state
      this.closeModals()
      notifications.clear()
    }
    this.setState(newState)
  }

  // Closes all the modals
  closeModals () {
    this.setState({
      ...clone(initModalsState)
    })
  }

  // Shows the specified modal
  openModal (name) {
    let newModalState = clone(initModalsState)
    newModalState[name] = true
    this.setState(newModalState)
  }

  showModalError (text) {
    this.showModalMessage(text, true)
  }

  showModalMessage (text, error = false) {
    this.setState({
      modalMessage: { text, error }
    })
  }

  // Handles sending a file
  async sendFileHandler (type) {
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
    ipcRenderer.send('send-file', type, filePaths[0])
  }

  // Render the App UI
  render () {
    return (
      <div className='App'>
        <Container>
          <Toolbar />
          <Drops drops={this.state.drops} />
        </Container>
      </div>
    )
  }
}
