import React, { useEffect, useRef } from 'react'
import { Col, Row, Nav, Tab } from 'react-bootstrap'
import qs from 'querystring'
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

  return (
    <div className='wormholes'>
      {wormholes.length ? (
        <Tab.Container activeKey={props.active} onSelect={props.setActive}>
          <Row>
            <Col sm={12}>
              <Nav variant='pills'>
                {wormholes.map(hole => (
                  <Nav.Item
                    key={hole.id}
                    title={`${hole.name} (${
                      hole.online ? 'online' : 'offline'
                    })`}
                  >
                    <Nav.Link eventKey={hole.id} href={`#wormhole#${hole.id}`}>
                      {hole.name}
                      <div className={classList({ online: hole.online })}></div>
                    </Nav.Link>
                  </Nav.Item>
                ))}
              </Nav>
            </Col>
            <Col sm={12}>
              <Tab.Content>
                {wormholes.map(hole => (
                  <Tab.Pane key={hole.id} eventKey={hole.id}>
                    {Object.values(hole.drops).map(drop => (
                      <Drop
                        key={drop.id}
                        onResumeClick={() =>
                          props.onResumeClick(hole.id, drop.id)
                        }
                        onPauseClick={() =>
                          props.onPauseClick(hole.id, drop.id)
                        }
                        onDeleteClick={() =>
                          props.onDeleteClick(hole.id, drop.id)
                        }
                        {...drop}
                      />
                    ))}
                  </Tab.Pane>
                ))}
              </Tab.Content>
            </Col>
          </Row>
        </Tab.Container>
      ) : (
        <div className='noholes'>
          <img src='../../../static/spacedrop.svg' />
          <br />
          Create a new wormhole to drop files
        </div>
      )}
    </div>
  )
}
