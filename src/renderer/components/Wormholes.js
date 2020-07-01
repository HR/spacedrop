import React, { useEffect, useRef } from 'react'
import { Col, Row, Nav, Tab } from 'react-bootstrap'
import { classList } from '../lib/util'
import Drop from './Drop'

export default function Wormholes (props) {
  const endRef = useRef(null)

  // Scrolls to the bottom
  function scrollToBottom () {
    endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  // Scroll to the bottom
  // useEffect(scrollToBottom)

  // useEffect(() => )

  const { wormholes } = props

  const tabs = wormholes.map(hole => (
    <Nav.Item
      key={hole.id}
      title={`${hole.name} (${hole.online ? 'online' : 'offline'})`}
    >
      <Nav.Link eventKey={hole.id} href={`#wormhole#${hole.id}`}>
        {hole.name}
        <div className={classList({ online: hole.online })}></div>
      </Nav.Link>
    </Nav.Item>
  ))

  const tabContent = wormholes.map(hole => {
    const drops = Object.values(hole.drops)
    return (
      <Tab.Pane key={hole.id} eventKey={hole.id}>
        {drops.length ? (
          drops.map(drop => (
            <Drop
              key={drop.id}
              onResumeClick={() => props.onResumeClick(hole.id, drop.id)}
              onPauseClick={() => props.onPauseClick(hole.id, drop.id)}
              onDeleteClick={() => props.onDeleteClick(hole.id, drop.id)}
              {...drop}
            />
          ))
        ) : (
          <div className='noholes'>
            <i className='ion-ios-send' />
            <br />
            Create a drop to send a file
          </div>
        )}
      </Tab.Pane>
    )
  })

  const tabContainer = (
    <Tab.Container activeKey={props.active} onSelect={props.setActive}>
      <Row>
        <Col sm={12}>
          <Nav variant='pills'>{tabs}</Nav>
        </Col>
        <Col sm={12}>
          <Tab.Content>{tabContent}</Tab.Content>
        </Col>
      </Row>
    </Tab.Container>
  )

  return (
    <div className='wormholes'>
      {wormholes.length ? (
        tabContainer
      ) : (
        <div className='noholes'>
          <img src='../../../static/spacedrop.svg' />
          <br />
          Create a new wormhole to send files
        </div>
      )}
    </div>
  )
}
