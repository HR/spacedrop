import React, { useEffect, useState, useRef } from 'react'
import { Tabs, Tab } from 'react-bootstrap'
import Drop from './Drop'

export default function Drops (props) {
  const endRef = useRef(null)

  // Scrolls to the bottom
  function scrollToBottom () {
    endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  // Scroll to the bottom
  // useEffect(scrollToBottom)

  const { drops } = props

  return (
    <div className='drops'>
      <Tabs defaultActiveKey={drops[0].id} variant='pills'>
        {drops.map(drop => (
          <Tab eventKey={drop.id} title={drop.name}>
            {drop.drops.map(drop => (
              <Drop key={drop.name} {...drop} />
            ))}
          </Tab>
        ))}
      </Tabs>
    </div>
  )
}
