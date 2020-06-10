import React, { useEffect, useState, useRef } from 'react'
import { Tabs, Tab } from 'react-bootstrap'
import Drop from './Drop'

export default function Wormholes (props) {
  const endRef = useRef(null)

  // Scrolls to the bottom
  function scrollToBottom () {
    endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  // Scroll to the bottom
  // useEffect(scrollToBottom)

  const { wormholes } = props

  return (
    <div className='wormholes'>
      {wormholes.length ? (
        <Tabs
          activeKey={props.active}
          onSelect={props.setActive}
          variant='pills'
        >
          {wormholes.map(drop => (
            <Tab key={drop.id} eventKey={drop.id} title={drop.name}>
              {drop.drops.map(drop => (
                <Drop key={drop.name} {...drop} />
              ))}
            </Tab>
          ))}
        </Tabs>
      ) : (
        <div className='noholes'>
          <i className='ion-ios-add-circle' />
          <br />
          Create a new wormhole to drop files
        </div>
      )}
    </div>
  )
}
