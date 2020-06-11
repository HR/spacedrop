import React from 'react'
import { Row, Col, Button } from 'react-bootstrap'

export default function Toolbar (props) {
  return (
    <div className='toolbar'>
      <Row className='title'>
        <Col>Spacedrop</Col>
      </Row>
      <Row className='actions'>
        <Col>
          <Button variant='dark'>
            <i className='ion-ios-send' onClick={props.onSendClick} />
          </Button>
          <Button variant='dark'>
            <img src='../../../static/spacedrop.svg' className='icon' onClick={props.onCreateWormholeClick} />
            {/* <i className='ion-ios-add-circle'  /> */}
          </Button>
        </Col>
        <Col>
          {/* <Button variant='dark'>
            <i className='ion-ios-pause' onClick={props.onPauseClick} />
          </Button>
          <Button variant='dark'>
            <i className='ion-ios-close-circle' onClick={props.onCancelClick} />
          </Button> */}
          <Button variant='dark'>
            <i className='ion-ios-contact' onClick={props.onCopyIdentityClick} />
          </Button>
        </Col>
      </Row>
    </div>
  )
}
