import React from 'react'
import { Row, Col, Button } from 'react-bootstrap'
import { classList } from '../lib/util'

export default function Toolbar (props) {
  return (
    <div className='toolbar'>
      <Row className='title'>
        <Col>Spacedrop</Col>
      </Row>
      <Row className='actions'>
        <Col>
          <Button
            variant='dark'
            onClick={props.onSendClick}
            disabled={props.sendDisabled}
            title='Send file'
          >
            <i className='ion-ios-send' />
          </Button>
          <Button
            variant='dark'
            onClick={props.onCreateWormholeClick}
            title='Create a wormhole'
          >
            <img src='../../../static/spacedrop.svg' className='icon' />
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
          <Button
            variant='dark'
            onClick={props.onCopyIdentityClick}
            className='profile'
            title={`Spacedrop ID (${props.online ? 'online' : 'offline'})`}
          >
            <i className='ion-ios-contact' />
            <div
              className={classList({
                status: true,
                online: props.online
              })}
            />
          </Button>
        </Col>
      </Row>
    </div>
  )
}
