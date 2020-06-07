import React from 'react'
import { useNotifications } from '../lib/notifications'
import { clone } from '../lib/util'
import { ipcRenderer, remote } from 'electron'
import { Container, Row, Col, Button, ProgressBar, Tabs, Tab } from 'react-bootstrap'
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
      transfers: {},
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
          <div className='header'>
            <Row className='title'>
              <Col>Spacedrop</Col>
            </Row>
            <Row className='actions'>
              <Col>
                <Button variant='dark'>
                  <i className='ion-ios-send' />
                </Button>
                <Button variant='dark'>
                  <i className='ion-ios-add' />
                </Button>
              </Col>
              <Col>
                <Button variant='dark'>
                  <i className='ion-ios-pause' />
                </Button>
                <Button variant='dark'>
                  <i className='ion-ios-close-circle' />
                </Button>
              </Col>
            </Row>
          </div>
          <div className='transfers'>
            <Tabs defaultActiveKey='home' variant="pills">
              <Tab eventKey='home' title='Alice'>
                <Row className='transfer'>
                  {/* <Col className='thumb'>
                <i className='ion-ios-document' />
              </Col> */}
                  <Col className='info'>
                    <Row className='name'>
                      <Col>Slow_fi.mp3</Col>
                      <Col className='text-right actions'>
                        <i className='ion-ios-pause' />
                        <i className='ion-ios-close-circle' />
                      </Col>
                    </Row>
                    <Row className='status'>
                      {/* <Col>Received 1 MB of 420 MB (1%) - 2 mins left</Col>
                  <Col className='text-right'>↓ 1 MB/s</Col> */}
                      <Col>
                        ↓ 1 MB/s - Received 1 MB of 420 MB (1%), 2 mins left
                      </Col>
                    </Row>
                    <Row className='progressbar'>
                      <Col>
                        <ProgressBar animated now={45} />
                      </Col>
                    </Row>
                  </Col>
                </Row>
                <Row className='transfer'>
                  <Col className='info'>
                    <Row className='name'>
                      <Col>Slow_fi.mp3</Col>
                      <Col className='text-right actions'>
                        <i className='ion-ios-pause' />
                        <i className='ion-ios-close-circle' />
                      </Col>
                    </Row>
                    <Row className='status'>
                      {/* <Col>Received 1 MB of 420 MB (1%) - 2 mins left</Col>
                  <Col className='text-right'>↓ 1 MB/s</Col> */}
                      <Col>
                        ↓ 1 MB/s - Received 1 MB of 420 MB (1%), 2 mins left
                      </Col>
                    </Row>
                    <Row className='progressbar'>
                      <Col>
                        <ProgressBar animated now={45} />
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </Tab>
              <Tab eventKey='contact' title='Bob'>
                Hi
              </Tab>
            </Tabs>
          </div>
        </Container>
      </div>
    )
  }
}
